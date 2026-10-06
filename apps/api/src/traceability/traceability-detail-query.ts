import { BadRequestException } from '@nestjs/common';
import {
  GENEALOGY_DEFAULT_DEPTH,
  GENEALOGY_DEFAULT_LIMIT,
  GENEALOGY_MAX_DEPTH,
  GENEALOGY_MAX_LIMIT,
  type GenealogyDirection,
  type GenealogyRequest,
} from './traceability-detail.types.js';

const TRACE_CODE_PATTERN = /^[A-Z0-9_-]+$/;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export const invalidTraceabilityRequest = (field: string, code: string) =>
  new BadRequestException({
    code: 'INVALID_REQUEST',
    message: 'The request is invalid.',
    details: [{ field, code }],
  });

export function normalizeRequiredTraceCode(raw: unknown): string {
  if (typeof raw !== 'string')
    throw invalidTraceabilityRequest('traceCode', 'INVALID_TYPE');
  const normalized = raw.trim().toUpperCase();
  if (
    normalized.length < 1 ||
    normalized.length > 128 ||
    !TRACE_CODE_PATTERN.test(normalized)
  ) {
    throw invalidTraceabilityRequest('traceCode', 'INVALID_TRACE_CODE');
  }
  return normalized;
}

function optionalString(raw: unknown, field: string): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string')
    throw invalidTraceabilityRequest(field, 'INVALID_TYPE');
  return raw;
}

function boundedInteger(
  raw: unknown,
  field: string,
  fallback: number,
  maximum: number,
): number {
  if (raw === undefined) return fallback;
  if (typeof raw !== 'string' || !/^[1-9][0-9]*$/.test(raw))
    throw invalidTraceabilityRequest(field, 'INVALID_POSITIVE_INTEGER');
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed > maximum)
    throw invalidTraceabilityRequest(field, 'OUT_OF_RANGE');
  return parsed;
}

export function parseGenealogyRequest(
  raw: Record<string, unknown>,
): GenealogyRequest {
  const rawDirection = optionalString(raw.direction, 'direction');
  const direction = (rawDirection?.trim().toLowerCase() ??
    'descendants') as GenealogyDirection;
  if (direction !== 'descendants' && direction !== 'ancestors')
    throw invalidTraceabilityRequest('direction', 'UNSUPPORTED_VALUE');

  const rawScope = optionalString(raw.scope, 'scope');
  const scopeKey = rawScope?.trim().toLowerCase() ?? 'current';
  const mode =
    scopeKey === 'asof'
      ? 'asOf'
      : scopeKey === 'current' || scopeKey === 'historical'
        ? scopeKey
        : null;
  if (!mode) throw invalidTraceabilityRequest('scope', 'UNSUPPORTED_VALUE');

  const rawAt = optionalString(raw.at, 'at');
  let at: Date | null = null;
  if (mode === 'asOf') {
    if (!rawAt || !ISO_TIMESTAMP_PATTERN.test(rawAt))
      throw invalidTraceabilityRequest('at', 'INVALID_TIMESTAMP');
    at = new Date(rawAt);
    if (Number.isNaN(at.getTime()))
      throw invalidTraceabilityRequest('at', 'INVALID_TIMESTAMP');
  } else if (rawAt !== undefined) {
    throw invalidTraceabilityRequest('at', 'NOT_ALLOWED');
  }

  return {
    direction,
    scope:
      mode === 'asOf'
        ? { mode, at: at! }
        : { mode, at: null },
    depth: boundedInteger(
      raw.depth,
      'depth',
      GENEALOGY_DEFAULT_DEPTH,
      GENEALOGY_MAX_DEPTH,
    ),
    limit: boundedInteger(
      raw.limit,
      'limit',
      GENEALOGY_DEFAULT_LIMIT,
      GENEALOGY_MAX_LIMIT,
    ),
    cursor: optionalString(raw.cursor, 'cursor') ?? null,
  };
}
