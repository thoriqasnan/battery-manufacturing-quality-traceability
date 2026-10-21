import { BadRequestException } from '@nestjs/common';
import {
  InspectionResultType,
  InspectionSpecificationLifecycle,
  TraceableUnitType,
} from '../generated/prisma/enums.js';
import {
  SPECIFICATION_DEFAULT_PAGE,
  SPECIFICATION_DEFAULT_PAGE_SIZE,
  SPECIFICATION_MAX_PAGE_SIZE,
  type SpecificationDiscoveryQuery,
  type SpecificationListQuery,
} from './inspection-specification.types.js';

type RawQuery = Record<string, unknown>;
const TECHNICAL_CODE_PATTERN = /^[A-Z0-9_-]+$/;

export function invalidSpecificationRequest(field: string, code: string) {
  return new BadRequestException({
    code: 'INVALID_REQUEST',
    message: 'The request is invalid.',
    details: [{ field, code }],
  });
}

function optionalString(raw: unknown, field: string): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string')
    throw invalidSpecificationRequest(field, 'INVALID_TYPE');
  return raw;
}

export function normalizeSpecificationCode(
  raw: string,
  field = 'code',
): string {
  const normalized = raw.trim().toUpperCase();
  if (
    normalized.length < 1 ||
    normalized.length > 64 ||
    !TECHNICAL_CODE_PATTERN.test(normalized)
  ) {
    throw invalidSpecificationRequest(field, 'INVALID_SPECIFICATION_CODE');
  }
  return normalized;
}

export function parsePositiveSpecificationVersion(raw: string): number {
  if (!/^[1-9][0-9]*$/.test(raw))
    throw invalidSpecificationRequest('version', 'INVALID_POSITIVE_INTEGER');
  const version = Number(raw);
  if (!Number.isSafeInteger(version))
    throw invalidSpecificationRequest('version', 'OUT_OF_RANGE');
  return version;
}

function positiveInteger(
  raw: unknown,
  field: string,
  fallback: number,
  maximum?: number,
): number {
  if (raw === undefined) return fallback;
  if (typeof raw !== 'string' || !/^[1-9][0-9]*$/.test(raw))
    throw invalidSpecificationRequest(field, 'INVALID_POSITIVE_INTEGER');
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || (maximum && parsed > maximum))
    throw invalidSpecificationRequest(field, 'OUT_OF_RANGE');
  return parsed;
}

function enumValue<T extends string>(
  raw: unknown,
  field: string,
  values: readonly T[],
): T | null {
  const value = optionalString(raw, field);
  if (value === undefined) return null;
  const normalized = value.trim().toUpperCase() as T;
  if (!values.includes(normalized))
    throw invalidSpecificationRequest(field, 'UNSUPPORTED_VALUE');
  return normalized;
}

function commonQuery(raw: RawQuery) {
  const rawSearch = optionalString(raw.query, 'query');
  const query = rawSearch?.trim() ?? '';
  if (query.length > 160)
    throw invalidSpecificationRequest('query', 'OUT_OF_RANGE');
  const normalizedCodeQuery = query.toUpperCase();

  const rawProcessCode = optionalString(raw.processCode, 'processCode');
  const processCode = rawProcessCode
    ? normalizeSpecificationCode(rawProcessCode, 'processCode')
    : null;

  return {
    query: query || null,
    normalizedCodeQuery:
      query && TECHNICAL_CODE_PATTERN.test(normalizedCodeQuery)
        ? normalizedCodeQuery
        : null,
    resultType: enumValue(
      raw.resultType,
      'resultType',
      Object.values(InspectionResultType),
    ),
    targetUnitType: enumValue(
      raw.targetUnitType,
      'targetUnitType',
      Object.values(TraceableUnitType),
    ),
    processCode,
    page: positiveInteger(raw.page, 'page', SPECIFICATION_DEFAULT_PAGE),
    pageSize: positiveInteger(
      raw.pageSize,
      'pageSize',
      SPECIFICATION_DEFAULT_PAGE_SIZE,
      SPECIFICATION_MAX_PAGE_SIZE,
    ),
  };
}

export function parseManagementSpecificationQuery(
  raw: RawQuery,
): SpecificationListQuery {
  return {
    ...commonQuery(raw),
    lifecycle: enumValue(
      raw.lifecycle,
      'lifecycle',
      Object.values(InspectionSpecificationLifecycle),
    ),
  };
}

export function parseDiscoverySpecificationQuery(
  raw: RawQuery,
): SpecificationDiscoveryQuery {
  return commonQuery(raw);
}
