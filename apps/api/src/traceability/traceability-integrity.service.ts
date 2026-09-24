import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { findGenealogyCycles } from './graph-integrity.js';
import type { IntegrityCheck, IntegrityReport } from './traceability.types.js';

@Injectable()
export class TraceabilityIntegrityService {
  constructor(private readonly prisma: PrismaService) {}

  async validateSeedDataset(): Promise<IntegrityReport> {
    const units = await this.prisma.client.traceableUnit.findMany({
      where: { traceCode: { contains: '-DEMO-' } },
      select: { id: true, traceCode: true },
    });
    const unitIds = units.map((unit) => unit.id);
    const relations = await this.prisma.client.genealogyRelation.findMany({
      where: { parentUnitId: { in: unitIds }, childUnitId: { in: unitIds } },
      include: { parentUnit: true, childUnit: true },
      orderBy: { installedAt: 'asc' },
    });
    const executions = await this.prisma.client.processExecution.findMany({
      where: { traceableUnitId: { in: unitIds } },
      include: { processRouteStep: true },
    });
    const inspections = await this.prisma.client.inspection.findMany({
      where: { traceableUnitId: { in: unitIds } },
      include: { result: true },
    });
    const nonconformances = await this.prisma.client.nonconformance.findMany({
      where: { traceableUnitId: { in: unitIds } },
      include: {
        sourceInspection: true,
        abnormalCases: true,
        actions: { include: { resultingInspection: true } },
        verifications: { include: { inspection: true, actionHistory: true } },
        dispositions: true,
      },
    });

    const checks: IntegrityCheck[] = [];
    const cycles = findGenealogyCycles(relations);
    checks.push({
      code: 'NO_GENEALOGY_CYCLES',
      passed: cycles.length === 0,
      detail:
        cycles.length === 0
          ? 'No cycle found.'
          : `${cycles.length} cycle(s) found.`,
    });

    const active = relations.filter((relation) => relation.removedAt === null);
    const activeParentCounts = this.countBy(
      active,
      (relation) => relation.childUnitId,
    );
    checks.push({
      code: 'ACTIVE_HIERARCHY',
      passed: [...activeParentCounts.values()].every((count) => count === 1),
      detail: 'Every active child has at most one active parent.',
    });

    const activePositions = this.countBy(
      active.filter((relation) => relation.positionCode !== null),
      (relation) => `${relation.parentUnitId}:${relation.positionCode}`,
    );
    checks.push({
      code: 'ACTIVE_POSITION_UNIQUENESS',
      passed: [...activePositions.values()].every((count) => count === 1),
      detail: 'No active logical position has conflicting occupants.',
    });

    const coherentExecutions = executions.every(
      (execution) =>
        !execution.processRouteStep ||
        execution.processRouteStep.processDefinitionId ===
          execution.processDefinitionId,
    );
    checks.push({
      code: 'ROUTE_PROCESS_COHERENCE',
      passed: coherentExecutions,
      detail: `${executions.length} execution route/process links inspected.`,
    });

    const completeResults = inspections.every(
      (inspection) =>
        inspection.result &&
        inspection.result.specificationId === inspection.specificationId &&
        inspection.result.resultType === inspection.resultType,
    );
    checks.push({
      code: 'INSPECTION_RESULT_COMPLETENESS',
      passed: completeResults,
      detail: `${inspections.length} inspections have matching typed results.`,
    });

    const retestsPreserveNg = nonconformances.every((nc) => {
      if (!nc.sourceInspection) return true;
      return (
        nc.sourceInspection.outcome === 'NG' &&
        nc.actions
          .filter((action) => action.actionType === 'RETEST')
          .every(
            (action) =>
              action.resultingInspection?.outcome === 'PASS' &&
              action.resultingInspection.id !== nc.sourceInspection?.id,
          )
      );
    });
    checks.push({
      code: 'RETEST_HISTORY_PRESERVED',
      passed: retestsPreserveNg,
      detail: 'Original NG and separate PASS retest evidence remain linked.',
    });

    const verificationContext = nonconformances.every((nc) =>
      nc.verifications.every(
        (verification) =>
          verification.traceableUnitId === nc.traceableUnitId &&
          verification.inspection.traceableUnitId === nc.traceableUnitId &&
          (!verification.actionHistory ||
            verification.actionHistory.nonconformanceId === nc.id),
      ),
    );
    checks.push({
      code: 'VERIFICATION_CONTEXT',
      passed: verificationContext,
      detail:
        'Verification evidence resolves to the NC unit and action context.',
    });

    const ncHistoryCoherent = nonconformances.every(
      (nc) =>
        nc.actions.every(
          (action) => action.traceableUnitId === nc.traceableUnitId,
        ) &&
        nc.verifications.every(
          (verification) => verification.nonconformanceId === nc.id,
        ) &&
        nc.abnormalCases.every(
          (abnormalCase) => abnormalCase.nonconformanceId === nc.id,
        ) &&
        nc.dispositions.every(
          (disposition) => disposition.nonconformanceId === nc.id,
        ),
    );
    checks.push({
      code: 'NC_HISTORY_COHERENCE',
      passed: ncHistoryCoherent,
      detail: `${nonconformances.length} NC histories inspected.`,
    });

    const replacement = relations.filter(
      (relation) => relation.positionCode === 'SENSOR-01',
    );
    const oldRelation = replacement.find(
      (relation) => relation.childUnit.traceCode === 'COMP-DEMO-OLD',
    );
    const newRelation = replacement.find(
      (relation) => relation.childUnit.traceCode === 'COMP-DEMO-NEW',
    );
    const replacementValid = Boolean(
      oldRelation?.removedAt &&
      newRelation &&
      newRelation.removedAt === null &&
      oldRelation.installedAt < newRelation.installedAt &&
      replacement.filter((relation) => relation.removedAt === null).length ===
        1,
    );
    checks.push({
      code: 'REPLACEMENT_HISTORY',
      passed: replacementValid,
      detail:
        'SENSOR-01 retains one removed old occupant and one active new occupant.',
    });

    return { valid: checks.every((check) => check.passed), checks };
  }

  private countBy<T>(
    values: T[],
    key: (value: T) => string,
  ): Map<string, number> {
    const counts = new Map<string, number>();
    for (const value of values)
      counts.set(key(value), (counts.get(key(value)) ?? 0) + 1);
    return counts;
  }
}
