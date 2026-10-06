import { Injectable } from '@nestjs/common';
import type {
  ActionType,
  DispositionType,
  ExecutionMethod,
  InspectionOutcome,
  InspectionResultType,
  NonconformanceStatus,
  ProcessExecutionStatus,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TraceableUnitNotFoundError } from './traceability.errors.js';
import {
  NONCONFORMANCE_NESTED_MAX_ITEMS,
  type NonconformanceHistoryQuery,
  type ProcessHistoryQuery,
  type QualityHistoryQuery,
  type StoredInspectionEvidence,
} from './traceability-history.types.js';

export interface ProcessHistoryRow {
  id: string;
  processCode: string;
  processName: string;
  route: { code: string; version: number; stepOrder: number } | null;
  attemptNumber: number;
  status: ProcessExecutionStatus;
  executionMethod: ExecutionMethod;
  startedAt: Date;
  finishedAt: Date | null;
}

export interface QualityHistoryRow {
  id: string;
  specificationCode: string;
  specificationVersion: number;
  unitCode: string | null;
  processCode: string;
  processExecutionId: string | null;
  resultType: InspectionResultType;
  attemptNumber: number;
  outcome: InspectionOutcome;
  inspectedAt: Date;
  result: StoredInspectionEvidence | null;
}

interface NestedCount {
  abnormalCases: number;
  actions: number;
  verifications: number;
  dispositions: number;
}

export interface NonconformanceHistoryRow {
  code: string;
  status: NonconformanceStatus;
  defectCategory: { code: string; name: string };
  description: string | null;
  detectedAt: Date;
  resolvedAt: Date | null;
  closedAt: Date | null;
  sourceInspectionId: string | null;
  sourceProcessExecutionId: string | null;
  abnormalCases: Array<{
    code: string;
    reason: string | null;
    openedAt: Date;
    closedAt: Date | null;
  }>;
  actions: Array<{
    id: string;
    actionType: ActionType;
    abnormalCaseCode: string | null;
    note: string | null;
    occurredAt: Date;
    resultingInspectionId: string | null;
    relatedUnitTraceCode: string | null;
  }>;
  verifications: Array<{
    id: string;
    inspectionId: string;
    actionHistoryId: string | null;
    note: string | null;
    verifiedAt: Date;
  }>;
  dispositions: Array<{
    id: string;
    dispositionType: DispositionType;
    note: string | null;
    decidedAt: Date;
  }>;
  nestedCount: NestedCount;
}

export interface HistoryPage<T> {
  rows: T[];
  totalItems: number;
}

@Injectable()
export class TraceabilityHistoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getProcessHistory(
    traceCode: string,
    query: ProcessHistoryQuery,
  ): Promise<HistoryPage<ProcessHistoryRow>> {
    const unitId = await this.resolveUnitId(traceCode);
    const where = { traceableUnitId: unitId };
    const [totalItems, rows] = await Promise.all([
      this.prisma.client.processExecution.count({ where }),
      this.prisma.client.processExecution.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [
          { startedAt: 'desc' },
          { attemptNumber: 'desc' },
          { id: 'desc' },
        ],
        select: {
          id: true,
          attemptNumber: true,
          status: true,
          executionMethod: true,
          startedAt: true,
          finishedAt: true,
          processDefinition: { select: { code: true, name: true } },
          processRouteStep: {
            select: {
              stepOrder: true,
              processRoute: { select: { code: true, version: true } },
            },
          },
        },
      }),
    ]);
    return {
      totalItems,
      rows: rows.map((row) => ({
        id: row.id,
        processCode: row.processDefinition.code,
        processName: row.processDefinition.name,
        route: row.processRouteStep
          ? {
              code: row.processRouteStep.processRoute.code,
              version: row.processRouteStep.processRoute.version,
              stepOrder: row.processRouteStep.stepOrder,
            }
          : null,
        attemptNumber: row.attemptNumber,
        status: row.status,
        executionMethod: row.executionMethod,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt,
      })),
    };
  }

  async getQualityHistory(
    traceCode: string,
    query: QualityHistoryQuery,
  ): Promise<HistoryPage<QualityHistoryRow>> {
    const unitId = await this.resolveUnitId(traceCode);
    const where = {
      traceableUnitId: unitId,
      ...(query.outcome ? { outcome: query.outcome } : {}),
    };
    const [totalItems, rows] = await Promise.all([
      this.prisma.client.inspection.count({ where }),
      this.prisma.client.inspection.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [
          { inspectedAt: 'desc' },
          { attemptNumber: 'desc' },
          { id: 'desc' },
        ],
        select: {
          id: true,
          processExecutionId: true,
          resultType: true,
          attemptNumber: true,
          outcome: true,
          inspectedAt: true,
          specification: {
            select: {
              code: true,
              version: true,
              unitCode: true,
              processDefinition: { select: { code: true } },
            },
          },
          result: {
            select: {
              numericValue: true,
              booleanValue: true,
              textValue: true,
              selectedOption: {
                select: {
                  resultType: true,
                  code: true,
                  isAcceptable: true,
                },
              },
            },
          },
        },
      }),
    ]);
    return {
      totalItems,
      rows: rows.map((row) => ({
        id: row.id,
        specificationCode: row.specification.code,
        specificationVersion: row.specification.version,
        unitCode: row.specification.unitCode,
        processCode: row.specification.processDefinition.code,
        processExecutionId: row.processExecutionId,
        resultType: row.resultType,
        attemptNumber: row.attemptNumber,
        outcome: row.outcome,
        inspectedAt: row.inspectedAt,
        result: row.result,
      })),
    };
  }

  async getNonconformanceHistory(
    traceCode: string,
    query: NonconformanceHistoryQuery,
  ): Promise<HistoryPage<NonconformanceHistoryRow>> {
    const unitId = await this.resolveUnitId(traceCode);
    const where = {
      traceableUnitId: unitId,
      ...(query.status ? { status: query.status } : {}),
    };
    const [totalItems, rows] = await Promise.all([
      this.prisma.client.nonconformance.count({ where }),
      this.prisma.client.nonconformance.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [
          { detectedAt: 'desc' },
          { code: 'asc' },
          { id: 'desc' },
        ],
        select: {
          code: true,
          status: true,
          description: true,
          detectedAt: true,
          resolvedAt: true,
          closedAt: true,
          sourceInspectionId: true,
          sourceProcessExecutionId: true,
          defectCategory: { select: { code: true, name: true } },
          _count: {
            select: {
              abnormalCases: true,
              actions: true,
              verifications: true,
              dispositions: true,
            },
          },
          abnormalCases: {
            take: NONCONFORMANCE_NESTED_MAX_ITEMS,
            orderBy: [{ openedAt: 'asc' }, { id: 'asc' }],
            select: {
              code: true,
              reason: true,
              openedAt: true,
              closedAt: true,
            },
          },
          actions: {
            take: NONCONFORMANCE_NESTED_MAX_ITEMS,
            orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              actionType: true,
              note: true,
              occurredAt: true,
              resultingInspectionId: true,
              abnormalCase: { select: { code: true } },
              relatedUnit: { select: { traceCode: true } },
            },
          },
          verifications: {
            take: NONCONFORMANCE_NESTED_MAX_ITEMS,
            orderBy: [{ verifiedAt: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              inspectionId: true,
              actionHistoryId: true,
              note: true,
              verifiedAt: true,
            },
          },
          dispositions: {
            take: NONCONFORMANCE_NESTED_MAX_ITEMS,
            orderBy: [{ decidedAt: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              dispositionType: true,
              note: true,
              decidedAt: true,
            },
          },
        },
      }),
    ]);
    return {
      totalItems,
      rows: rows.map((row) => ({
        code: row.code,
        status: row.status,
        defectCategory: row.defectCategory,
        description: row.description,
        detectedAt: row.detectedAt,
        resolvedAt: row.resolvedAt,
        closedAt: row.closedAt,
        sourceInspectionId: row.sourceInspectionId,
        sourceProcessExecutionId: row.sourceProcessExecutionId,
        abnormalCases: row.abnormalCases,
        actions: row.actions.map((action) => ({
          id: action.id,
          actionType: action.actionType,
          abnormalCaseCode: action.abnormalCase?.code ?? null,
          note: action.note,
          occurredAt: action.occurredAt,
          resultingInspectionId: action.resultingInspectionId,
          relatedUnitTraceCode: action.relatedUnit?.traceCode ?? null,
        })),
        verifications: row.verifications,
        dispositions: row.dispositions,
        nestedCount: row._count,
      })),
    };
  }

  private async resolveUnitId(traceCode: string): Promise<string> {
    const unit = await this.prisma.client.traceableUnit.findUnique({
      where: { traceCode },
      select: { id: true },
    });
    if (!unit) throw new TraceableUnitNotFoundError(traceCode);
    return unit.id;
  }
}
