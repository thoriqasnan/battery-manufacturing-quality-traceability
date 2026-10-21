import { createHash } from 'node:crypto';
import { normalizeSpecificationCode } from './inspection-specification-query.js';
import { advisoryLockKey } from './inspection-specification-mutation.js';
import { normalizeRequiredTraceCode } from '../traceability/traceability-detail-query.js';

export const INSPECTION_OPERATION = 'inspection.submit';
export const INSPECTION_OPERATION_VERSION = 1;
export const INSPECTION_RESPONSE_CONTRACT_VERSION = 1;
export const INSPECTION_REQUEST_CONTRACT_VERSION = 1;
export const INSPECTION_LOCK_ORDER = [
  'idempotency',
  'exact-specification',
  'attempt',
] as const;

type RawObject = Record<string, unknown>;
export type InspectionOutcome = 'PASS' | 'NG';
export type InspectionEvidence =
  | { type: 'NUMERIC'; value: string }
  | { type: 'BOOLEAN'; value: boolean }
  | { type: 'CATEGORICAL' | 'VISUAL'; optionCode: string }
  | { type: 'TEXT'; value: string; outcome: InspectionOutcome };

export type ParsedInspectionRequest = {
  traceCode: string;
  specification: { code: string; version: number };
  execution: { processCode: string; attempt: number } | null;
  inspectedAt: { instant: Date; canonical: string };
  evidence: InspectionEvidence;
};

export class InspectionTypedResultError extends Error {
  readonly code = 'INVALID_TYPED_RESULT';
  constructor() {
    super('The inspection evidence is invalid for the specification.');
    this.name = 'InspectionTypedResultError';
  }
}

function invalidRequest(field: string, reason: string): never {
  const error = new Error('The request is invalid.') as Error & {
    code: string;
    details: Array<{ field: string; code: string }>;
  };
  error.name = 'InspectionRequestError';
  error.code = 'INVALID_REQUEST';
  error.details = [{ field, code: reason }];
  throw error;
}

function object(raw: unknown, field: string): RawObject {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return invalidRequest(field, 'INVALID_TYPE');
  return raw as RawObject;
}

function exactKeys(
  value: RawObject,
  allowed: readonly string[],
  field: string,
) {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown)
    invalidRequest(field ? `${field}.${unknown}` : unknown, 'UNKNOWN_FIELD');
}

function positiveInteger(raw: unknown, field: string): number {
  if (!Number.isSafeInteger(raw) || (raw as number) < 1)
    invalidRequest(field, 'INVALID_POSITIVE_INTEGER');
  return raw as number;
}

export function parseIdempotencyKey(raw: unknown): string {
  if (typeof raw !== 'string' || !/^[A-Za-z0-9._:-]{16,128}$/.test(raw))
    invalidRequest('Idempotency-Key', 'INVALID_IDEMPOTENCY_KEY');
  return raw;
}

const DECIMAL_PATTERN = /^[+-]?\d+(?:\.\d+)?$/;
export function parseInspectionDecimal(
  raw: unknown,
  field = 'evidence.value',
): string {
  if (typeof raw !== 'string' || !DECIMAL_PATTERN.test(raw))
    invalidRequest(field, 'INVALID_DECIMAL');
  const negative = raw.startsWith('-');
  const unsigned = raw.replace(/^[+-]/, '');
  const [rawInteger, rawFraction = ''] = unsigned.split('.');
  const integer = rawInteger.replace(/^0+/, '') || '0';
  const fraction = rawFraction.replace(/0+$/, '');
  const integerDigits = integer === '0' ? 0 : integer.length;
  if (
    integerDigits > 12 ||
    fraction.length > 6 ||
    integerDigits + fraction.length > 18
  )
    invalidRequest(field, 'DECIMAL_OUT_OF_RANGE');
  if (integer === '0' && fraction.length === 0) return '0';
  return `${negative ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`;
}

function decimalScaled(value: string): bigint {
  const negative = value.startsWith('-');
  const [integer, fraction = ''] = value.replace(/^-/, '').split('.');
  const scaled = BigInt(integer) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
  return negative ? -scaled : scaled;
}

export function compareInspectionDecimals(left: string, right: string): number {
  const a = decimalScaled(parseInspectionDecimal(left, 'left'));
  const b = decimalScaled(parseInspectionDecimal(right, 'right'));
  return a < b ? -1 : a > b ? 1 : 0;
}

const ISO_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/;
export function parseInspectionTimestamp(raw: unknown): {
  instant: Date;
  canonical: string;
} {
  if (typeof raw !== 'string')
    return invalidRequest('inspectedAt', 'INVALID_TIMESTAMP');
  const match = ISO_INSTANT.exec(raw);
  if (!match) return invalidRequest('inspectedAt', 'INVALID_TIMESTAMP');
  const [
    ,
    year,
    month,
    day,
    hour,
    minute,
    second,
    fraction = '',
    zone,
    sign,
    offsetHour = '00',
    offsetMinute = '00',
  ] = match;
  const values = [
    year,
    month,
    day,
    hour,
    minute,
    second,
    offsetHour,
    offsetMinute,
  ].map(Number);
  const [y, mo, d, h, mi, s, oh, om] = values;
  if (h > 23 || mi > 59 || s > 59 || oh > 23 || om > 59)
    return invalidRequest('inspectedAt', 'INVALID_TIMESTAMP');
  const local = Date.UTC(
    y,
    mo - 1,
    d,
    h,
    mi,
    s,
    Number(fraction.padEnd(3, '0')),
  );
  const check = new Date(local);
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== mo - 1 ||
    check.getUTCDate() !== d
  )
    return invalidRequest('inspectedAt', 'INVALID_TIMESTAMP');
  const offset =
    zone === 'Z' ? 0 : (sign === '-' ? -1 : 1) * (oh * 60 + om) * 60_000;
  const instant = new Date(local - offset);
  if (Number.isNaN(instant.getTime()))
    return invalidRequest('inspectedAt', 'INVALID_TIMESTAMP');
  return { instant, canonical: instant.toISOString() };
}

function parseOutcome(raw: unknown, field: string): InspectionOutcome {
  if (raw !== 'PASS' && raw !== 'NG')
    invalidRequest(field, 'UNSUPPORTED_VALUE');
  return raw;
}

function parseEvidence(raw: unknown): InspectionEvidence {
  const value = object(raw, 'evidence');
  if (typeof value.type !== 'string')
    invalidRequest('evidence.type', 'INVALID_TYPE');
  switch (value.type) {
    case 'NUMERIC':
      exactKeys(value, ['type', 'value'], 'evidence');
      return { type: 'NUMERIC', value: parseInspectionDecimal(value.value) };
    case 'BOOLEAN':
      exactKeys(value, ['type', 'value'], 'evidence');
      if (typeof value.value !== 'boolean')
        invalidRequest('evidence.value', 'INVALID_TYPE');
      return { type: 'BOOLEAN', value: value.value };
    case 'CATEGORICAL':
    case 'VISUAL':
      exactKeys(value, ['type', 'optionCode'], 'evidence');
      if (typeof value.optionCode !== 'string')
        invalidRequest('evidence.optionCode', 'INVALID_TYPE');
      return {
        type: value.type,
        optionCode: normalizeSpecificationCode(
          value.optionCode,
          'evidence.optionCode',
        ),
      };
    case 'TEXT': {
      exactKeys(value, ['type', 'value', 'outcome'], 'evidence');
      if (typeof value.value !== 'string')
        invalidRequest('evidence.value', 'INVALID_TYPE');
      const text = value.value.trim();
      if (!text || Array.from(text).length > 4_000)
        invalidRequest('evidence.value', 'OUT_OF_RANGE');
      return {
        type: 'TEXT',
        value: text,
        outcome: parseOutcome(value.outcome, 'evidence.outcome'),
      };
    }
    default:
      return invalidRequest('evidence.type', 'UNSUPPORTED_VALUE');
  }
}

export function parseInspectionRequest(raw: unknown): ParsedInspectionRequest {
  const value = object(raw, 'body');
  exactKeys(
    value,
    ['traceCode', 'specification', 'execution', 'inspectedAt', 'evidence'],
    '',
  );
  const specification = object(value.specification, 'specification');
  exactKeys(specification, ['code', 'version'], 'specification');
  if (typeof specification.code !== 'string')
    invalidRequest('specification.code', 'INVALID_TYPE');
  const executionValue =
    value.execution === undefined || value.execution === null
      ? null
      : object(value.execution, 'execution');
  if (executionValue)
    exactKeys(executionValue, ['processCode', 'attempt'], 'execution');
  if (executionValue && typeof executionValue.processCode !== 'string')
    invalidRequest('execution.processCode', 'INVALID_TYPE');
  return {
    traceCode: normalizeRequiredTraceCode(value.traceCode),
    specification: {
      code: normalizeSpecificationCode(specification.code),
      version: positiveInteger(specification.version, 'specification.version'),
    },
    execution: executionValue
      ? {
          processCode: normalizeSpecificationCode(
            executionValue.processCode as string,
            'execution.processCode',
          ),
          attempt: positiveInteger(executionValue.attempt, 'execution.attempt'),
        }
      : null,
    inspectedAt: parseInspectionTimestamp(value.inspectedAt),
    evidence: parseEvidence(value.evidence),
  };
}

export type ResolvedEvaluation =
  | { type: 'NUMERIC'; lowerBound: string | null; upperBound: string | null }
  | { type: 'BOOLEAN'; expectedValue: boolean }
  | { type: 'CATEGORICAL' | 'VISUAL'; isAcceptable: boolean }
  | { type: 'TEXT' };

export function evaluateInspection(
  evidence: InspectionEvidence,
  resolved: ResolvedEvaluation,
): InspectionOutcome {
  if (evidence.type !== resolved.type) throw new InspectionTypedResultError();
  switch (evidence.type) {
    case 'NUMERIC': {
      const config = resolved as Extract<
        ResolvedEvaluation,
        { type: 'NUMERIC' }
      >;
      if (config.lowerBound === null && config.upperBound === null)
        throw new InspectionTypedResultError();
      if (
        config.lowerBound !== null &&
        compareInspectionDecimals(evidence.value, config.lowerBound) < 0
      )
        return 'NG';
      if (
        config.upperBound !== null &&
        compareInspectionDecimals(evidence.value, config.upperBound) > 0
      )
        return 'NG';
      return 'PASS';
    }
    case 'BOOLEAN':
      return evidence.value ===
        (resolved as Extract<ResolvedEvaluation, { type: 'BOOLEAN' }>)
          .expectedValue
        ? 'PASS'
        : 'NG';
    case 'CATEGORICAL':
    case 'VISUAL':
      return (
        resolved as Extract<
          ResolvedEvaluation,
          { type: 'CATEGORICAL' | 'VISUAL' }
        >
      ).isAcceptable
        ? 'PASS'
        : 'NG';
    case 'TEXT':
      return evidence.outcome;
  }
}

function canonicalRequest(request: ParsedInspectionRequest) {
  return {
    contractVersion: INSPECTION_REQUEST_CONTRACT_VERSION,
    traceCode: request.traceCode,
    specification: {
      code: request.specification.code,
      version: request.specification.version,
    },
    execution: request.execution
      ? {
          processCode: request.execution.processCode,
          attempt: request.execution.attempt,
        }
      : null,
    inspectedAt: request.inspectedAt.canonical,
    evidence: request.evidence,
  };
}

export function inspectionRequestFingerprint(
  request: ParsedInspectionRequest,
): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalRequest(request)))
    .digest('hex');
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function canonicalUuid(value: string): string {
  if (!UUID.test(value)) throw new Error('Invalid internal UUID.');
  return value.toLowerCase();
}

export const inspectionAttemptLockInput = (
  unitId: string,
  specificationId: string,
) =>
  `inspection-attempt:v1:${canonicalUuid(unitId)}:${canonicalUuid(specificationId)}`;
export const inspectionAttemptLockKey = (
  unitId: string,
  specificationId: string,
) => advisoryLockKey(inspectionAttemptLockInput(unitId, specificationId));

export const inspectionIdempotencyLockInput = (userId: string, key: string) =>
  `inspection-submission:v1:${canonicalUuid(userId)}:${INSPECTION_OPERATION}:${INSPECTION_OPERATION_VERSION}:${parseIdempotencyKey(key)}`;
export const inspectionIdempotencyLockKey = (userId: string, key: string) =>
  advisoryLockKey(inspectionIdempotencyLockInput(userId, key));
