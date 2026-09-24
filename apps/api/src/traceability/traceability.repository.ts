import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TraceableUnitNotFoundError } from './traceability.errors.js';
import type {
  GenealogyEdge,
  GenealogyResult,
  GenealogyScope,
  ProcessHistoryEntry,
  QualityHistoryEntry,
  TraceableIdentity,
  TypedInspectionEvidence,
} from './traceability.types.js';

type GenealogyRow = Omit<GenealogyEdge, 'isCurrent'> & { isCurrent: boolean };

@Injectable()
export class TraceabilityRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getIdentity(traceCode: string): Promise<TraceableIdentity> {
    const unit = await this.prisma.client.traceableUnit.findUnique({
      where: { traceCode },
      include: { productModel: { select: { code: true, name: true } } },
    });
    if (!unit) throw new TraceableUnitNotFoundError(traceCode);
    return {
      id: unit.id,
      traceCode: unit.traceCode,
      unitType: unit.unitType,
      productModel: unit.productModel,
    };
  }

  async getForwardGenealogy(
    traceCode: string,
    scope: GenealogyScope = { mode: 'current' },
  ): Promise<GenealogyResult> {
    const root = await this.getIdentity(traceCode);
    const predicate = this.relationshipPredicate(scope);
    const edges = await this.prisma.client.$queryRaw<GenealogyRow[]>(Prisma.sql`
      WITH RECURSIVE genealogy AS (
        SELECT
          g.id AS "relationId", 1 AS depth,
          parent.id AS "parentUnitId", parent."traceCode" AS "parentTraceCode", parent."unitType" AS "parentUnitType",
          child.id AS "childUnitId", child."traceCode" AS "childTraceCode", child."unitType" AS "childUnitType",
          g."positionCode", g."installedAt", g."removedAt", (g."removedAt" IS NULL) AS "isCurrent",
          ARRAY[parent.id, child.id]::uuid[] AS path
        FROM "GenealogyRelation" g
        JOIN "TraceableUnit" parent ON parent.id = g."parentUnitId"
        JOIN "TraceableUnit" child ON child.id = g."childUnitId"
        WHERE g."parentUnitId" = ${root.id}::uuid AND ${predicate}
        UNION ALL
        SELECT
          g.id, tree.depth + 1,
          parent.id, parent."traceCode", parent."unitType",
          child.id, child."traceCode", child."unitType",
          g."positionCode", g."installedAt", g."removedAt", (g."removedAt" IS NULL),
          tree.path || child.id
        FROM genealogy tree
        JOIN "GenealogyRelation" g ON g."parentUnitId" = tree."childUnitId"
        JOIN "TraceableUnit" parent ON parent.id = g."parentUnitId"
        JOIN "TraceableUnit" child ON child.id = g."childUnitId"
        WHERE ${predicate} AND NOT child.id = ANY(tree.path)
      )
      SELECT "relationId", depth, "parentUnitId", "parentTraceCode", "parentUnitType",
             "childUnitId", "childTraceCode", "childUnitType", "positionCode",
             "installedAt", "removedAt", "isCurrent"
      FROM genealogy
      ORDER BY depth, "installedAt", "childTraceCode"
    `);
    return { root, scope, edges };
  }

  async getReverseGenealogy(
    traceCode: string,
    scope: GenealogyScope = { mode: 'current' },
  ): Promise<GenealogyResult> {
    const root = await this.getIdentity(traceCode);
    const predicate = this.relationshipPredicate(scope);
    const edges = await this.prisma.client.$queryRaw<GenealogyRow[]>(Prisma.sql`
      WITH RECURSIVE genealogy AS (
        SELECT
          g.id AS "relationId", 1 AS depth,
          parent.id AS "parentUnitId", parent."traceCode" AS "parentTraceCode", parent."unitType" AS "parentUnitType",
          child.id AS "childUnitId", child."traceCode" AS "childTraceCode", child."unitType" AS "childUnitType",
          g."positionCode", g."installedAt", g."removedAt", (g."removedAt" IS NULL) AS "isCurrent",
          ARRAY[child.id, parent.id]::uuid[] AS path
        FROM "GenealogyRelation" g
        JOIN "TraceableUnit" parent ON parent.id = g."parentUnitId"
        JOIN "TraceableUnit" child ON child.id = g."childUnitId"
        WHERE g."childUnitId" = ${root.id}::uuid AND ${predicate}
        UNION ALL
        SELECT
          g.id, tree.depth + 1,
          parent.id, parent."traceCode", parent."unitType",
          child.id, child."traceCode", child."unitType",
          g."positionCode", g."installedAt", g."removedAt", (g."removedAt" IS NULL),
          tree.path || parent.id
        FROM genealogy tree
        JOIN "GenealogyRelation" g ON g."childUnitId" = tree."parentUnitId"
        JOIN "TraceableUnit" parent ON parent.id = g."parentUnitId"
        JOIN "TraceableUnit" child ON child.id = g."childUnitId"
        WHERE ${predicate} AND NOT parent.id = ANY(tree.path)
      )
      SELECT "relationId", depth, "parentUnitId", "parentTraceCode", "parentUnitType",
             "childUnitId", "childTraceCode", "childUnitType", "positionCode",
             "installedAt", "removedAt", "isCurrent"
      FROM genealogy
      ORDER BY depth, "installedAt", "parentTraceCode"
    `);
    return { root, scope, edges };
  }

  async getPositionHistory(
    parentTraceCode: string,
    positionCode: string,
  ): Promise<GenealogyEdge[]> {
    const parent = await this.getIdentity(parentTraceCode);
    const relations = await this.prisma.client.genealogyRelation.findMany({
      where: { parentUnitId: parent.id, positionCode },
      include: { parentUnit: true, childUnit: true },
      orderBy: [{ installedAt: 'asc' }, { childUnit: { traceCode: 'asc' } }],
    });
    return relations.map((relation) => ({
      relationId: relation.id,
      depth: 1,
      parentUnitId: relation.parentUnit.id,
      parentTraceCode: relation.parentUnit.traceCode,
      parentUnitType: relation.parentUnit.unitType,
      childUnitId: relation.childUnit.id,
      childTraceCode: relation.childUnit.traceCode,
      childUnitType: relation.childUnit.unitType,
      positionCode: relation.positionCode,
      installedAt: relation.installedAt,
      removedAt: relation.removedAt,
      isCurrent: relation.removedAt === null,
    }));
  }

  async getProcessHistory(traceCode: string): Promise<ProcessHistoryEntry[]> {
    const unit = await this.getIdentity(traceCode);
    const executions = await this.prisma.client.processExecution.findMany({
      where: { traceableUnitId: unit.id },
      include: {
        processDefinition: true,
        processRouteStep: { include: { processRoute: true } },
      },
      orderBy: [{ startedAt: 'asc' }, { attemptNumber: 'asc' }],
    });
    return executions.map((execution) => ({
      id: execution.id,
      processCode: execution.processDefinition.code,
      processName: execution.processDefinition.name,
      routeCode: execution.processRouteStep?.processRoute.code ?? null,
      routeVersion: execution.processRouteStep?.processRoute.version ?? null,
      stepOrder: execution.processRouteStep?.stepOrder ?? null,
      attemptNumber: execution.attemptNumber,
      status: execution.status,
      executionMethod: execution.executionMethod,
      startedAt: execution.startedAt,
      finishedAt: execution.finishedAt,
    }));
  }

  async getQualityHistory(traceCode: string): Promise<QualityHistoryEntry[]> {
    const unit = await this.getIdentity(traceCode);
    const inspections = await this.prisma.client.inspection.findMany({
      where: { traceableUnitId: unit.id },
      include: {
        specification: { include: { processDefinition: true } },
        processExecution: true,
        result: { include: { selectedOption: true } },
      },
      orderBy: [{ inspectedAt: 'asc' }, { attemptNumber: 'asc' }],
    });
    return inspections.map((inspection) => ({
      id: inspection.id,
      specificationCode: inspection.specification.code,
      specificationVersion: inspection.specification.version,
      resultType: inspection.resultType,
      attemptNumber: inspection.attemptNumber,
      outcome: inspection.outcome,
      inspectedAt: inspection.inspectedAt,
      processCode: inspection.specification.processDefinition.code,
      processExecutionId: inspection.processExecution?.id ?? null,
      evidence: this.toEvidence(
        inspection.resultType,
        inspection.result,
        inspection.specification.unitCode,
      ),
    }));
  }

  async getNonconformanceHistory(traceCode: string) {
    const unit = await this.getIdentity(traceCode);
    return this.prisma.client.nonconformance.findMany({
      where: { traceableUnitId: unit.id },
      include: {
        defectCategory: true,
        sourceInspection: {
          include: {
            specification: true,
            result: { include: { selectedOption: true } },
          },
        },
        sourceProcessExecution: { include: { processDefinition: true } },
        abnormalCases: { orderBy: { openedAt: 'asc' } },
        actions: {
          include: {
            resultingInspection: {
              include: {
                specification: true,
                result: { include: { selectedOption: true } },
              },
            },
            relatedUnit: true,
          },
          orderBy: { occurredAt: 'asc' },
        },
        verifications: {
          include: {
            inspection: {
              include: {
                specification: true,
                result: { include: { selectedOption: true } },
              },
            },
          },
          orderBy: { verifiedAt: 'asc' },
        },
        dispositions: { orderBy: { decidedAt: 'asc' } },
      },
      orderBy: { detectedAt: 'asc' },
    });
  }

  private relationshipPredicate(scope: GenealogyScope): Prisma.Sql {
    if (scope.mode === 'current') return Prisma.sql`g."removedAt" IS NULL`;
    if (scope.mode === 'historical') return Prisma.sql`TRUE`;
    return Prisma.sql`g."installedAt" <= ${scope.at} AND (g."removedAt" IS NULL OR g."removedAt" > ${scope.at})`;
  }

  private toEvidence(
    resultType: string,
    result: {
      numericValue: { toString(): string } | null;
      booleanValue: boolean | null;
      textValue: string | null;
      selectedOption: { code: string; isAcceptable: boolean } | null;
    } | null,
    unitCode: string | null,
  ): TypedInspectionEvidence {
    if (!result) throw new Error('Inspection result is incomplete.');
    switch (resultType) {
      case 'NUMERIC':
        return {
          type: 'NUMERIC',
          value: result.numericValue?.toString() ?? '',
          unitCode,
        };
      case 'BOOLEAN':
        return { type: 'BOOLEAN', value: result.booleanValue ?? false };
      case 'CATEGORICAL':
      case 'VISUAL':
        return {
          type: resultType,
          optionCode: result.selectedOption?.code ?? '',
          isAcceptable: result.selectedOption?.isAcceptable ?? false,
        };
      case 'TEXT':
        return { type: 'TEXT', value: result.textValue ?? '' };
      default:
        throw new Error(`Unsupported inspection result type: ${resultType}`);
    }
  }
}
