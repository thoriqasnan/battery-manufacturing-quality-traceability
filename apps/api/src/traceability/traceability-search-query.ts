import { BadRequestException } from '@nestjs/common';
import { TraceableUnitType } from '../generated/prisma/enums.js';
import {
  TRACEABILITY_DEFAULT_PAGE,
  TRACEABILITY_DEFAULT_PAGE_SIZE,
  TRACEABILITY_MAX_PAGE_SIZE,
  type TraceabilitySearchQuery,
} from './traceability-search.types.js';

type RawQuery = Record<string, unknown>;

const TRACE_CODE_PATTERN = /^[A-Z0-9_-]+$/;
const PRODUCT_MODEL_PATTERN = /^[A-Z0-9_-]+$/;

const invalidRequest = (field: string, code: string) =>
  new BadRequestException({
    code: 'INVALID_REQUEST',
    message: 'The request is invalid.',
    details: [{ field, code }],
  });

function optionalString(raw: unknown, field: string): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string') throw invalidRequest(field, 'INVALID_TYPE');
  return raw;
}

function positiveInteger(
  raw: unknown,
  field: string,
  fallback: number,
  maximum?: number,
): number {
  if (raw === undefined) return fallback;
  if (typeof raw !== 'string' || !/^[1-9][0-9]*$/.test(raw))
    throw invalidRequest(field, 'INVALID_POSITIVE_INTEGER');
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed))
    throw invalidRequest(field, 'OUT_OF_RANGE');
  if (maximum !== undefined && parsed > maximum)
    throw invalidRequest(field, 'OUT_OF_RANGE');
  return parsed;
}

export function parseTraceabilitySearchQuery(
  raw: RawQuery,
): TraceabilitySearchQuery {
  const rawSearch = optionalString(raw.query, 'query');
  const normalizedSearch = rawSearch?.trim().toUpperCase() ?? '';
  if (
    normalizedSearch.length > 128 ||
    (normalizedSearch.length > 0 && !TRACE_CODE_PATTERN.test(normalizedSearch))
  ) {
    throw invalidRequest('query', 'INVALID_TRACE_CODE');
  }

  const rawUnitType = optionalString(raw.unitType, 'unitType');
  const normalizedUnitType = rawUnitType?.trim().toUpperCase();
  if (
    normalizedUnitType !== undefined &&
    !Object.values(TraceableUnitType).includes(
      normalizedUnitType as TraceableUnitType,
    )
  ) {
    throw invalidRequest('unitType', 'UNSUPPORTED_VALUE');
  }

  const rawProductModel = optionalString(raw.productModel, 'productModel');
  const normalizedProductModel = rawProductModel?.trim().toUpperCase();
  if (
    normalizedProductModel !== undefined &&
    (normalizedProductModel.length === 0 ||
      normalizedProductModel.length > 64 ||
      !PRODUCT_MODEL_PATTERN.test(normalizedProductModel))
  ) {
    throw invalidRequest('productModel', 'INVALID_CODE');
  }

  return {
    query: normalizedSearch || null,
    unitType: (normalizedUnitType as TraceableUnitType | undefined) ?? null,
    productModel: normalizedProductModel ?? null,
    page: positiveInteger(raw.page, 'page', TRACEABILITY_DEFAULT_PAGE),
    pageSize: positiveInteger(
      raw.pageSize,
      'pageSize',
      TRACEABILITY_DEFAULT_PAGE_SIZE,
      TRACEABILITY_MAX_PAGE_SIZE,
    ),
  };
}
