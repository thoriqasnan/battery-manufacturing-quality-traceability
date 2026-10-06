import { createHash } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { TraceabilityDetailRepository } from './traceability-detail.repository.js';
import type {
  GenealogyNode,
  GenealogyRequest,
  GenealogyResponse,
  UnitDetailResponse,
} from './traceability-detail.types.js';
import { invalidTraceabilityRequest } from './traceability-detail-query.js';
import { TraceableUnitNotFoundError } from './traceability.errors.js';

type CursorPayload = { v: 1; offset: number; signature: string };

@Injectable()
export class TraceabilityDetailService {
  constructor(private readonly repository: TraceabilityDetailRepository) {}

  async getUnitDetail(traceCode: string): Promise<UnitDetailResponse> {
    try {
      const unit = await this.repository.getUnitWithSectionCounts(traceCode);
      const directRelationCount =
        unit._count.parentRelations + unit._count.childRelations;
      return {
        unit: {
          traceCode: unit.traceCode,
          unitType: unit.unitType,
          productModel: unit.productModel,
          createdAt: unit.createdAt.toISOString(),
          updatedAt: unit.updatedAt.toISOString(),
        },
        sections: {
          genealogy: {
            hasRecords: directRelationCount > 0,
            directRelationCount,
          },
          processHistory: {
            hasRecords: unit._count.executions > 0,
            recordCount: unit._count.executions,
          },
          qualityHistory: {
            hasRecords: unit._count.inspections > 0,
            recordCount: unit._count.inspections,
          },
          nonconformance: {
            hasRecords: unit._count.nonconformances > 0,
            recordCount: unit._count.nonconformances,
          },
        },
      };
    } catch (error) {
      this.rethrowNotFound(error);
    }
  }

  async getGenealogy(
    traceCode: string,
    request: GenealogyRequest,
  ): Promise<GenealogyResponse> {
    try {
      const root = await this.repository.getIdentity(traceCode);
      const offset = this.decodeCursor(request.cursor, traceCode, request);
      const rowsWithLookahead = await this.repository.getBoundedEdges(
        root.id,
        request.direction,
        request.scope,
        request.depth,
        offset,
        request.limit,
      );
      const hasNextPage = rowsWithLookahead.length > request.limit;
      const rows = rowsWithLookahead.slice(0, request.limit);
      const unitIds = [...new Set([
        root.id,
        ...rows.flatMap((row) => [row.parentUnitId, row.childUnitId]),
      ])];
      const counts = await this.repository.getDirectCounts(
        unitIds,
        request.scope,
      );
      const node = (
        id: string,
        code: string,
        unitType: typeof root.unitType,
      ): GenealogyNode => ({
        traceCode: code,
        unitType,
        directParentCount: counts.get(id)?.parents ?? 0,
        directChildCount: counts.get(id)?.children ?? 0,
        selected: id === root.id,
      });
      const reachedDepth = rows.reduce(
        (maximum, row) => Math.max(maximum, row.depth),
        0,
      );
      const boundaryHasMore = rows.some((row) => {
        if (row.depth !== request.depth) return false;
        const boundaryId =
          request.direction === 'descendants'
            ? row.childUnitId
            : row.parentUnitId;
        const count = counts.get(boundaryId);
        return request.direction === 'descendants'
          ? (count?.children ?? 0) > 0
          : (count?.parents ?? 0) > 0;
      });
      const cycleDetected = rowsWithLookahead.some(
        (row) => row.cycleDetected,
      );
      const partialReasons: GenealogyResponse['pageInfo']['partialReasons'] = [];
      if (hasNextPage) partialReasons.push('EDGE_LIMIT');
      if (boundaryHasMore) partialReasons.push('DEPTH_LIMIT');
      if (cycleDetected) partialReasons.push('CYCLE_PATH_SKIPPED');

      return {
        root: node(root.id, root.traceCode, root.unitType),
        direction: request.direction,
        scope: {
          mode: request.scope.mode,
          at:
            request.scope.mode === 'asOf'
              ? request.scope.at.toISOString()
              : null,
        },
        edges: rows.map((row) => ({
          relationId: this.publicRelationId(row.relationId),
          depth: row.depth,
          parent: node(
            row.parentUnitId,
            row.parentTraceCode,
            row.parentUnitType,
          ),
          child: node(
            row.childUnitId,
            row.childTraceCode,
            row.childUnitType,
          ),
          positionCode: row.positionCode,
          installedAt: row.installedAt.toISOString(),
          removedAt: row.removedAt?.toISOString() ?? null,
          relationshipState:
            row.removedAt === null ? 'CURRENT' : 'HISTORICAL',
        })),
        pageInfo: {
          hasNextPage,
          endCursor: hasNextPage
            ? this.encodeCursor(offset + request.limit, traceCode, request)
            : null,
          returnedEdgeCount: rows.length,
          requestedDepth: request.depth,
          reachedDepth,
          isPartial: partialReasons.length > 0,
          partialReasons,
        },
        integrityWarnings: cycleDetected
          ? [{ code: 'CYCLE_PATH_SKIPPED' }]
          : [],
      };
    } catch (error) {
      this.rethrowNotFound(error);
    }
  }

  private cursorSignature(traceCode: string, request: GenealogyRequest) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          traceCode,
          direction: request.direction,
          scope: request.scope.mode,
          at:
            request.scope.mode === 'asOf'
              ? request.scope.at.toISOString()
              : null,
          depth: request.depth,
          limit: request.limit,
        }),
      )
      .digest('base64url')
      .slice(0, 24);
  }

  private encodeCursor(
    offset: number,
    traceCode: string,
    request: GenealogyRequest,
  ) {
    const payload: CursorPayload = {
      v: 1,
      offset,
      signature: this.cursorSignature(traceCode, request),
    };
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
  }

  private decodeCursor(
    cursor: string | null,
    traceCode: string,
    request: GenealogyRequest,
  ): number {
    if (!cursor) return 0;
    try {
      const payload = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      ) as Partial<CursorPayload>;
      if (
        payload.v !== 1 ||
        !Number.isSafeInteger(payload.offset) ||
        (payload.offset ?? -1) < 0 ||
        payload.signature !== this.cursorSignature(traceCode, request)
      ) {
        throw new Error('Invalid cursor payload.');
      }
      return payload.offset!;
    } catch {
      throw invalidTraceabilityRequest('cursor', 'INVALID_CURSOR');
    }
  }

  private publicRelationId(id: string): string {
    return `rel_${createHash('sha256').update(id).digest('hex').slice(0, 24)}`;
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
