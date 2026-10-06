import {
  Controller,
  Get,
  InternalServerErrorException,
  Param,
  Query,
} from '@nestjs/common';
import { RequirePermissions } from '../auth/auth.metadata.js';
import { Permission } from '../auth/permissions.js';
import { parseTraceabilitySearchQuery } from './traceability-search-query.js';
import { TraceabilitySearchService } from './traceability-search.service.js';
import type { TraceabilitySearchResponse } from './traceability-search.types.js';
import {
  normalizeRequiredTraceCode,
  parseGenealogyRequest,
} from './traceability-detail-query.js';
import { TraceabilityDetailService } from './traceability-detail.service.js';
import type {
  GenealogyResponse,
  UnitDetailResponse,
} from './traceability-detail.types.js';
import {
  parseNonconformanceHistoryQuery,
  parseProcessHistoryQuery,
  parseQualityHistoryQuery,
} from './traceability-history-query.js';
import { TraceabilityHistoryService } from './traceability-history.service.js';
import {
  TraceabilityHistoryIntegrityError,
  type NonconformanceHistoryResponse,
  type ProcessHistoryResponse,
  type QualityHistoryResponse,
} from './traceability-history.types.js';

@Controller('traceability')
export class TraceabilityController {
  constructor(
    private readonly searchService: TraceabilitySearchService,
    private readonly detailService: TraceabilityDetailService,
    private readonly historyService: TraceabilityHistoryService,
  ) {}

  @Get()
  @RequirePermissions(Permission.TraceabilityView)
  search(
    @Query() rawQuery: Record<string, unknown>,
  ): Promise<TraceabilitySearchResponse> {
    return this.searchService.search(parseTraceabilitySearchQuery(rawQuery));
  }

  @Get(':traceCode/genealogy')
  @RequirePermissions(Permission.TraceabilityView)
  genealogy(
    @Param('traceCode') rawTraceCode: string,
    @Query() rawQuery: Record<string, unknown>,
  ): Promise<GenealogyResponse> {
    return this.detailService.getGenealogy(
      normalizeRequiredTraceCode(rawTraceCode),
      parseGenealogyRequest(rawQuery),
    );
  }

  @Get(':traceCode/process-history')
  @RequirePermissions(Permission.TraceabilityView)
  processHistory(
    @Param('traceCode') rawTraceCode: string,
    @Query() rawQuery: Record<string, unknown>,
  ): Promise<ProcessHistoryResponse> {
    return this.withSafeHistoryIntegrityHandling(() =>
      this.historyService.getProcessHistory(
        rawTraceCode,
        parseProcessHistoryQuery(rawQuery),
      ),
    );
  }

  @Get(':traceCode/quality-history')
  @RequirePermissions(Permission.TraceabilityView)
  qualityHistory(
    @Param('traceCode') rawTraceCode: string,
    @Query() rawQuery: Record<string, unknown>,
  ): Promise<QualityHistoryResponse> {
    return this.withSafeHistoryIntegrityHandling(() =>
      this.historyService.getQualityHistory(
        rawTraceCode,
        parseQualityHistoryQuery(rawQuery),
      ),
    );
  }

  @Get(':traceCode/nonconformances')
  @RequirePermissions(Permission.TraceabilityView)
  nonconformanceHistory(
    @Param('traceCode') rawTraceCode: string,
    @Query() rawQuery: Record<string, unknown>,
  ): Promise<NonconformanceHistoryResponse> {
    return this.withSafeHistoryIntegrityHandling(() =>
      this.historyService.getNonconformanceHistory(
        rawTraceCode,
        parseNonconformanceHistoryQuery(rawQuery),
      ),
    );
  }

  @Get(':traceCode')
  @RequirePermissions(Permission.TraceabilityView)
  detail(
    @Param('traceCode') rawTraceCode: string,
  ): Promise<UnitDetailResponse> {
    return this.detailService.getUnitDetail(
      normalizeRequiredTraceCode(rawTraceCode),
    );
  }

  private async withSafeHistoryIntegrityHandling<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof TraceabilityHistoryIntegrityError) {
        throw new InternalServerErrorException({
          code: 'TRACEABILITY_HISTORY_INTEGRITY_ERROR',
          message: 'Stored traceability history could not be read safely.',
        });
      }
      throw error;
    }
  }
}
