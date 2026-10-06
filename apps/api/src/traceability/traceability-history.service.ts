import { Injectable, NotFoundException } from '@nestjs/common';
import { normalizeRequiredTraceCode } from './traceability-detail-query.js';
import { TraceableUnitNotFoundError } from './traceability.errors.js';
import {
  TraceabilityHistoryRepository,
  type NonconformanceHistoryRow,
} from './traceability-history.repository.js';
import {
  toPublicQualityEvidence,
  type NestedCollectionMetadata,
  type NonconformanceHistoryQuery,
  type NonconformanceHistoryResponse,
  type PageMetadata,
  type PageQuery,
  type ProcessHistoryQuery,
  type ProcessHistoryResponse,
  type QualityHistoryQuery,
  type QualityHistoryResponse,
} from './traceability-history.types.js';
import { traceabilityPublicReference } from './traceability-public-reference.js';

@Injectable()
export class TraceabilityHistoryService {
  constructor(private readonly repository: TraceabilityHistoryRepository) {}

  async getProcessHistory(
    rawTraceCode: unknown,
    query: ProcessHistoryQuery,
  ): Promise<ProcessHistoryResponse> {
    const traceCode = normalizeRequiredTraceCode(rawTraceCode);
    try {
      const result = await this.repository.getProcessHistory(traceCode, query);
      return {
        items: result.rows.map((row) => ({
          recordId: traceabilityPublicReference('execution', row.id),
          process: { code: row.processCode, name: row.processName },
          route: row.route,
          attemptNumber: row.attemptNumber,
          status: row.status,
          executionMethod: row.executionMethod,
          startedAt: row.startedAt.toISOString(),
          finishedAt: row.finishedAt?.toISOString() ?? null,
        })),
        page: this.page(query, result.totalItems),
      };
    } catch (error) {
      this.rethrowNotFound(error);
    }
  }

  async getQualityHistory(
    rawTraceCode: unknown,
    query: QualityHistoryQuery,
  ): Promise<QualityHistoryResponse> {
    const traceCode = normalizeRequiredTraceCode(rawTraceCode);
    try {
      const result = await this.repository.getQualityHistory(traceCode, query);
      return {
        items: result.rows.map((row) => ({
          recordId: traceabilityPublicReference('inspection', row.id),
          specification: {
            code: row.specificationCode,
            version: row.specificationVersion,
          },
          processCode: row.processCode,
          processExecutionRecordId: row.processExecutionId
            ? traceabilityPublicReference('execution', row.processExecutionId)
            : null,
          resultType: row.resultType,
          attemptNumber: row.attemptNumber,
          outcome: row.outcome,
          inspectedAt: row.inspectedAt.toISOString(),
          evidence: toPublicQualityEvidence(
            row.resultType,
            row.result,
            row.unitCode,
          ),
        })),
        page: this.page(query, result.totalItems),
      };
    } catch (error) {
      this.rethrowNotFound(error);
    }
  }

  async getNonconformanceHistory(
    rawTraceCode: unknown,
    query: NonconformanceHistoryQuery,
  ): Promise<NonconformanceHistoryResponse> {
    const traceCode = normalizeRequiredTraceCode(rawTraceCode);
    try {
      const result = await this.repository.getNonconformanceHistory(
        traceCode,
        query,
      );
      return {
        items: result.rows.map((row) => this.nonconformance(row)),
        page: this.page(query, result.totalItems),
      };
    } catch (error) {
      this.rethrowNotFound(error);
    }
  }

  private nonconformance(
    row: NonconformanceHistoryRow,
  ): NonconformanceHistoryResponse['items'][number] {
    return {
      code: row.code,
      status: row.status,
      defectCategory: row.defectCategory,
      description: row.description,
      detectedAt: row.detectedAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      closedAt: row.closedAt?.toISOString() ?? null,
      source: {
        inspectionRecordId: row.sourceInspectionId
          ? traceabilityPublicReference('inspection', row.sourceInspectionId)
          : null,
        processExecutionRecordId: row.sourceProcessExecutionId
          ? traceabilityPublicReference('execution', row.sourceProcessExecutionId)
          : null,
      },
      abnormalCases: row.abnormalCases.map((item) => ({
        code: item.code,
        reason: item.reason,
        openedAt: item.openedAt.toISOString(),
        closedAt: item.closedAt?.toISOString() ?? null,
      })),
      actions: row.actions.map((item) => ({
        recordId: traceabilityPublicReference('action', item.id),
        actionType: item.actionType,
        abnormalCaseCode: item.abnormalCaseCode,
        note: item.note,
        occurredAt: item.occurredAt.toISOString(),
        resultingInspectionRecordId: item.resultingInspectionId
          ? traceabilityPublicReference('inspection', item.resultingInspectionId)
          : null,
        relatedUnitTraceCode: item.relatedUnitTraceCode,
      })),
      verifications: row.verifications.map((item) => ({
        recordId: traceabilityPublicReference('verification', item.id),
        inspectionRecordId: traceabilityPublicReference(
          'inspection',
          item.inspectionId,
        ),
        actionRecordId: item.actionHistoryId
          ? traceabilityPublicReference('action', item.actionHistoryId)
          : null,
        note: item.note,
        verifiedAt: item.verifiedAt.toISOString(),
      })),
      dispositions: row.dispositions.map((item) => ({
        recordId: traceabilityPublicReference('disposition', item.id),
        dispositionType: item.dispositionType,
        note: item.note,
        decidedAt: item.decidedAt.toISOString(),
      })),
      nestedPageInfo: {
        abnormalCases: this.nestedPage(
          row.abnormalCases.length,
          row.nestedCount.abnormalCases,
        ),
        actions: this.nestedPage(row.actions.length, row.nestedCount.actions),
        verifications: this.nestedPage(
          row.verifications.length,
          row.nestedCount.verifications,
        ),
        dispositions: this.nestedPage(
          row.dispositions.length,
          row.nestedCount.dispositions,
        ),
      },
    };
  }

  private nestedPage(
    returnedCount: number,
    totalCount: number,
  ): NestedCollectionMetadata {
    return {
      returnedCount,
      totalCount,
      isPartial: returnedCount < totalCount,
    };
  }

  private page(query: PageQuery, totalItems: number): PageMetadata {
    return {
      number: query.page,
      size: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    };
  }

  private rethrowNotFound(error: unknown): never {
    if (error instanceof TraceableUnitNotFoundError) {
      throw new NotFoundException({
        code: 'TRACE_UNIT_NOT_FOUND',
        message: 'Traceable unit not found.',
      });
    }
    throw error;
  }
}
