import type {
  NonconformanceStatus,
  InspectionOutcome,
} from '../generated/prisma/enums.js';
import { invalidTraceabilityRequest } from './traceability-detail-query.js';
import {
  NONCONFORMANCE_HISTORY_DEFAULT_PAGE_SIZE,
  NONCONFORMANCE_HISTORY_MAX_PAGE_SIZE,
  PROCESS_HISTORY_DEFAULT_PAGE_SIZE,
  PROCESS_HISTORY_MAX_PAGE_SIZE,
  QUALITY_HISTORY_DEFAULT_PAGE_SIZE,
  QUALITY_HISTORY_MAX_PAGE_SIZE,
  type NonconformanceHistoryQuery,
  type ProcessHistoryQuery,
  type QualityHistoryQuery,
} from './traceability-history.types.js';

type RawQuery = Record<string, unknown>;

function optionalString(raw: unknown, field: string): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string')
    throw invalidTraceabilityRequest(field, 'INVALID_TYPE');
  return raw;
}

function boundedPositiveInteger(
  raw: unknown,
  field: string,
  fallback: number,
  maximum?: number,
): number {
  if (raw === undefined) return fallback;
  if (typeof raw !== 'string' || !/^[1-9][0-9]*$/.test(raw))
    throw invalidTraceabilityRequest(field, 'INVALID_POSITIVE_INTEGER');
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || (maximum !== undefined && parsed > maximum))
    throw invalidTraceabilityRequest(field, 'OUT_OF_RANGE');
  return parsed;
}

function pagination(raw: RawQuery, defaultPageSize: number, maximumPageSize: number) {
  return {
    page: boundedPositiveInteger(raw.page, 'page', 1),
    pageSize: boundedPositiveInteger(
      raw.pageSize,
      'pageSize',
      defaultPageSize,
      maximumPageSize,
    ),
  };
}

function optionalEnum<T extends string>(
  raw: unknown,
  field: string,
  supported: readonly T[],
): T | null {
  const value = optionalString(raw, field);
  if (value === undefined) return null;
  const normalized = value.trim().toUpperCase() as T;
  if (!supported.includes(normalized))
    throw invalidTraceabilityRequest(field, 'UNSUPPORTED_VALUE');
  return normalized;
}

export function parseProcessHistoryQuery(raw: RawQuery): ProcessHistoryQuery {
  return pagination(
    raw,
    PROCESS_HISTORY_DEFAULT_PAGE_SIZE,
    PROCESS_HISTORY_MAX_PAGE_SIZE,
  );
}

export function parseQualityHistoryQuery(raw: RawQuery): QualityHistoryQuery {
  return {
    ...pagination(
      raw,
      QUALITY_HISTORY_DEFAULT_PAGE_SIZE,
      QUALITY_HISTORY_MAX_PAGE_SIZE,
    ),
    outcome: optionalEnum<InspectionOutcome>(raw.outcome, 'outcome', [
      'PASS',
      'NG',
    ]),
  };
}

export function parseNonconformanceHistoryQuery(
  raw: RawQuery,
): NonconformanceHistoryQuery {
  return {
    ...pagination(
      raw,
      NONCONFORMANCE_HISTORY_DEFAULT_PAGE_SIZE,
      NONCONFORMANCE_HISTORY_MAX_PAGE_SIZE,
    ),
    status: optionalEnum<NonconformanceStatus>(raw.status, 'status', [
      'OPEN',
      'IN_PROGRESS',
      'RESOLVED',
      'CLOSED',
    ]),
  };
}
