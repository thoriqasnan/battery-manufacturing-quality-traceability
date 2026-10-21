import { createHash } from 'node:crypto';
import {
  InspectionResultType,
  TraceableUnitType,
} from '../generated/prisma/enums.js';
import {
  invalidSpecificationRequest,
  normalizeSpecificationCode,
} from './inspection-specification-query.js';
import type {
  PublicRouteStepIdentity,
  PublicSpecificationOption,
} from './inspection-specification.types.js';

type RawObject = Record<string, unknown>;

export type SpecificationDraftInput = {
  name: string;
  description: string | null;
  targetUnitType: TraceableUnitType;
  processCode: string;
  routeStep: PublicRouteStepIdentity | null;
  configuration:
    | {
        type: 'NUMERIC';
        lowerBound: string | null;
        upperBound: string | null;
        unitCode: string | null;
      }
    | { type: 'BOOLEAN'; expectedValue: boolean }
    | { type: 'CATEGORICAL' | 'VISUAL'; options: PublicSpecificationOption[] }
    | { type: 'TEXT' };
};

export type CreateSpecificationInput = SpecificationDraftInput & {
  code: string;
};

export type CreateSpecificationVersionInput = { sourceVersion: number };

function object(raw: unknown, field: string): RawObject {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw invalidSpecificationRequest(field, 'INVALID_TYPE');
  return raw as RawObject;
}

function exactKeys(
  value: RawObject,
  allowed: readonly string[],
  field: string,
) {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown)
    throw invalidSpecificationRequest(
      field ? `${field}.${unknown}` : unknown,
      'UNKNOWN_FIELD',
    );
}

function requiredTrimmed(raw: unknown, field: string, max = 160): string {
  if (typeof raw !== 'string')
    throw invalidSpecificationRequest(field, 'INVALID_TYPE');
  const value = raw.trim();
  if (!value || Array.from(value).length > max)
    throw invalidSpecificationRequest(field, 'OUT_OF_RANGE');
  return value;
}

function nullableString(
  raw: unknown,
  field: string,
  max?: number,
): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string')
    throw invalidSpecificationRequest(field, 'INVALID_TYPE');
  const value = raw.trim();
  if (max && Array.from(value).length > max)
    throw invalidSpecificationRequest(field, 'OUT_OF_RANGE');
  return value || null;
}

function enumValue<T extends string>(
  raw: unknown,
  field: string,
  values: readonly T[],
): T {
  if (typeof raw !== 'string' || !values.includes(raw.toUpperCase() as T))
    throw invalidSpecificationRequest(field, 'UNSUPPORTED_VALUE');
  return raw.toUpperCase() as T;
}

const DECIMAL = /^([+-]?)(\d+)(?:\.(\d+))?$/;
export function parseSpecificationDecimal(
  raw: unknown,
  field: string,
): string | null {
  if (raw === null) return null;
  if (typeof raw !== 'string')
    throw invalidSpecificationRequest(field, 'INVALID_DECIMAL');
  const value = raw.trim();
  const match = DECIMAL.exec(value);
  if (!match) throw invalidSpecificationRequest(field, 'INVALID_DECIMAL');
  const integer = match[2].replace(/^0+(?=\d)/, '');
  const fraction = match[3] ?? '';
  if (fraction.length > 6 || integer.length + fraction.length > 18)
    throw invalidSpecificationRequest(field, 'DECIMAL_OUT_OF_RANGE');
  return `${match[1] === '-' ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`;
}

function compareDecimals(left: string, right: string): number {
  const scale = 6n;
  const scaled = (value: string) => {
    const negative = value.startsWith('-');
    const [whole, fraction = ''] = value.replace(/^[+-]/, '').split('.');
    const result =
      BigInt(whole) * 10n ** scale +
      BigInt(fraction.padEnd(Number(scale), '0'));
    return negative ? -result : result;
  };
  return scaled(left) < scaled(right)
    ? -1
    : scaled(left) > scaled(right)
      ? 1
      : 0;
}

function routeStep(raw: unknown): PublicRouteStepIdentity | null {
  if (raw === undefined || raw === null) return null;
  const value = object(raw, 'routeStep');
  exactKeys(
    value,
    ['productModelCode', 'routeCode', 'routeVersion', 'stepOrder'],
    'routeStep',
  );
  const positive = (item: unknown, field: string) => {
    if (!Number.isSafeInteger(item) || (item as number) < 1)
      throw invalidSpecificationRequest(field, 'INVALID_POSITIVE_INTEGER');
    return item as number;
  };
  return {
    productModelCode: normalizeSpecificationCode(
      requiredTrimmed(value.productModelCode, 'routeStep.productModelCode', 64),
      'routeStep.productModelCode',
    ),
    routeCode: normalizeSpecificationCode(
      requiredTrimmed(value.routeCode, 'routeStep.routeCode', 64),
      'routeStep.routeCode',
    ),
    routeVersion: positive(value.routeVersion, 'routeStep.routeVersion'),
    stepOrder: positive(value.stepOrder, 'routeStep.stepOrder'),
  };
}

function configuration(raw: unknown): SpecificationDraftInput['configuration'] {
  const value = object(raw, 'configuration');
  const type = enumValue(
    value.type,
    'configuration.type',
    Object.values(InspectionResultType),
  );
  if (type === 'NUMERIC') {
    exactKeys(
      value,
      ['type', 'lowerBound', 'upperBound', 'unitCode'],
      'configuration',
    );
    const lowerBound = parseSpecificationDecimal(
      value.lowerBound ?? null,
      'configuration.lowerBound',
    );
    const upperBound = parseSpecificationDecimal(
      value.upperBound ?? null,
      'configuration.upperBound',
    );
    if (
      lowerBound !== null &&
      upperBound !== null &&
      compareDecimals(lowerBound, upperBound) > 0
    )
      throw invalidSpecificationRequest('configuration', 'INVALID_BOUND_ORDER');
    return {
      type,
      lowerBound,
      upperBound,
      unitCode: nullableString(value.unitCode, 'configuration.unitCode', 32),
    };
  }
  if (type === 'BOOLEAN') {
    exactKeys(value, ['type', 'expectedValue'], 'configuration');
    if (typeof value.expectedValue !== 'boolean')
      throw invalidSpecificationRequest(
        'configuration.expectedValue',
        'INVALID_TYPE',
      );
    return { type, expectedValue: value.expectedValue };
  }
  if (type === 'CATEGORICAL' || type === 'VISUAL') {
    exactKeys(value, ['type', 'options'], 'configuration');
    if (!Array.isArray(value.options))
      throw invalidSpecificationRequest(
        'configuration.options',
        'INVALID_TYPE',
      );
    const seen = new Set<string>();
    const options = value.options.map((rawOption, index) => {
      const option = object(rawOption, `configuration.options.${index}`);
      exactKeys(
        option,
        ['code', 'description', 'isAcceptable'],
        `configuration.options.${index}`,
      );
      const code = normalizeSpecificationCode(
        requiredTrimmed(option.code, `configuration.options.${index}.code`, 64),
        `configuration.options.${index}.code`,
      );
      if (seen.has(code))
        throw invalidSpecificationRequest(
          'configuration.options',
          'DUPLICATE_OPTION_CODE',
        );
      seen.add(code);
      if (typeof option.isAcceptable !== 'boolean')
        throw invalidSpecificationRequest(
          `configuration.options.${index}.isAcceptable`,
          'INVALID_TYPE',
        );
      return {
        code,
        description: nullableString(
          option.description,
          `configuration.options.${index}.description`,
        ),
        isAcceptable: option.isAcceptable,
      };
    });
    return { type, options };
  }
  exactKeys(value, ['type'], 'configuration');
  return { type: 'TEXT' };
}

function common(raw: RawObject): SpecificationDraftInput {
  return {
    name: requiredTrimmed(raw.name, 'name'),
    description: nullableString(raw.description, 'description'),
    targetUnitType: enumValue(
      raw.targetUnitType,
      'targetUnitType',
      Object.values(TraceableUnitType),
    ),
    processCode: normalizeSpecificationCode(
      requiredTrimmed(raw.processCode, 'processCode', 64),
      'processCode',
    ),
    routeStep: routeStep(raw.routeStep),
    configuration: configuration(raw.configuration),
  };
}

export function parseCreateSpecification(
  raw: unknown,
): CreateSpecificationInput {
  const value = object(raw, 'body');
  exactKeys(
    value,
    [
      'code',
      'name',
      'description',
      'targetUnitType',
      'processCode',
      'routeStep',
      'configuration',
    ],
    '',
  );
  return {
    code: normalizeSpecificationCode(requiredTrimmed(value.code, 'code', 64)),
    ...common(value),
  };
}

export function parseReplaceSpecification(
  raw: unknown,
): SpecificationDraftInput {
  const value = object(raw, 'body');
  exactKeys(
    value,
    [
      'name',
      'description',
      'targetUnitType',
      'processCode',
      'routeStep',
      'configuration',
    ],
    '',
  );
  return common(value);
}

export function parseCreateSpecificationVersion(
  raw: unknown,
): CreateSpecificationVersionInput {
  const value = object(raw, 'body');
  exactKeys(value, ['sourceVersion'], '');
  if (
    !Number.isSafeInteger(value.sourceVersion) ||
    (value.sourceVersion as number) < 1
  )
    throw invalidSpecificationRequest(
      'sourceVersion',
      'INVALID_POSITIVE_INTEGER',
    );
  return { sourceVersion: value.sourceVersion as number };
}

export function nextSpecificationVersion(maxVersion: number): number {
  const next = maxVersion + 1;
  if (
    !Number.isSafeInteger(maxVersion) ||
    maxVersion < 1 ||
    next > 2_147_483_647
  )
    throw invalidSpecificationRequest('version', 'OUT_OF_RANGE');
  return next;
}

export function parseRequiredIfMatch(raw: unknown): string {
  if (typeof raw !== 'string' || !/^"spec-v1-[A-Za-z0-9_-]{43}"$/.test(raw))
    throw invalidSpecificationRequest('If-Match', 'INVALID_IF_MATCH');
  return raw;
}

export function assertPublishable(input: SpecificationDraftInput) {
  const config = input.configuration;
  if (
    config.type === 'NUMERIC' &&
    config.lowerBound === null &&
    config.upperBound === null
  )
    throw invalidSpecificationRequest(
      'configuration',
      'INCOMPLETE_SPECIFICATION',
    );
  if (
    (config.type === 'CATEGORICAL' || config.type === 'VISUAL') &&
    config.options.length === 0
  )
    throw invalidSpecificationRequest(
      'configuration.options',
      'INCOMPLETE_SPECIFICATION',
    );
}

export function advisoryLockKey(namespaceInput: string): bigint {
  return createHash('sha256').update(namespaceInput).digest().readBigInt64BE(0);
}

export const exactVersionLockInput = (code: string, version: number) =>
  `inspection-specification-mutation:v1:${code}:${version}`;
export const familyLockInput = (code: string) =>
  `inspection-specification-version:v1:${code}`;
