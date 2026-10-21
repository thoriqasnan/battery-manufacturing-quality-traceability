import { withCsrfHeader } from "./auth";
import { getApiBaseUrl } from "./config";

export const inspectionResultTypes = [
  "NUMERIC",
  "BOOLEAN",
  "CATEGORICAL",
  "VISUAL",
  "TEXT",
] as const;
export type InspectionResultType = (typeof inspectionResultTypes)[number];

export const traceableUnitTypes = [
  "PACK",
  "MODULE",
  "CELL",
  "COMPONENT",
  "MATERIAL",
] as const;
export type TraceableUnitType = (typeof traceableUnitTypes)[number];
export type InspectionOutcome = "PASS" | "NG";

export type InspectionSpecificationSummary = {
  code: string;
  version: number;
  name: string;
  resultType: InspectionResultType;
  targetUnitType: TraceableUnitType;
  process: { code: string; name: string };
  routeStep: {
    productModelCode: string;
    routeCode: string;
    routeVersion: number;
    stepOrder: number;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type InspectionSpecificationConfiguration =
  | {
      type: "NUMERIC";
      lowerBound: string | null;
      upperBound: string | null;
      unitCode: string | null;
    }
  | { type: "BOOLEAN"; expectedValue: boolean }
  | {
      type: "CATEGORICAL" | "VISUAL";
      options: Array<{
        code: string;
        description: string | null;
        isAcceptable: boolean;
      }>;
    }
  | { type: "TEXT" };

export type InspectionSpecificationDetail = Omit<
  InspectionSpecificationSummary,
  "resultType"
> & {
  description: string | null;
  configuration: InspectionSpecificationConfiguration;
};

export type InspectionSpecificationDiscoveryPage = {
  items: InspectionSpecificationSummary[];
  page: {
    number: number;
    size: number;
    totalItems: number;
    totalPages: number;
  };
};

export type InspectionEvidence =
  | { type: "NUMERIC"; value: string }
  | { type: "BOOLEAN"; value: boolean }
  | { type: "CATEGORICAL"; optionCode: string }
  | { type: "VISUAL"; optionCode: string }
  | { type: "TEXT"; value: string; outcome: InspectionOutcome };

export type InspectionSubmissionRequest = {
  traceCode: string;
  specification: { code: string; version: number };
  execution?: { processCode: string; attempt: number } | null;
  inspectedAt: string;
  evidence: InspectionEvidence;
};

export type InspectionSubmissionResponse = {
  traceCode: string;
  specification: { code: string; version: number };
  processCode: string;
  execution: { processCode: string; attempt: number } | null;
  attemptNumber: number;
  inspectedAt: string;
  createdAt: string;
  evidence:
    | { type: "NUMERIC"; value: string; unitCode: string | null }
    | { type: "BOOLEAN"; value: boolean }
    | { type: "CATEGORICAL"; optionCode: string }
    | { type: "VISUAL"; optionCode: string }
    | { type: "TEXT"; value: string };
  outcome: InspectionOutcome;
};

export const inspectionPublicErrorCodes = [
  "INVALID_REQUEST",
  "INVALID_TYPED_RESULT",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "TRACE_UNIT_NOT_FOUND",
  "INSPECTION_SPECIFICATION_NOT_FOUND",
  "INSPECTION_SPECIFICATION_NOT_PUBLISHED",
  "INCOMPATIBLE_INSPECTION_CONTEXT",
  "IDEMPOTENCY_CONFLICT",
  "INSPECTION_WRITE_CONFLICT",
  "INSPECTION_PERSISTENCE_ERROR",
] as const;
export type InspectionPublicError = (typeof inspectionPublicErrorCodes)[number];
export type InspectionApiErrorKind = "public" | "network" | "malformed-response";

export class InspectionApiError extends Error {
  constructor(
    public readonly kind: InspectionApiErrorKind,
    public readonly status: number | null = null,
    public readonly code: InspectionPublicError | null = null,
  ) {
    super(code ?? kind);
    this.name = "InspectionApiError";
  }
}

export type InspectionDiscoveryRequest = {
  query?: string;
  resultType?: InspectionResultType;
  targetUnitType?: TraceableUnitType;
  processCode?: string;
  page?: number;
  pageSize?: number;
};

type RecordValue = Record<string, unknown>;
const DECIMAL = /^[+-]?\d+(?:\.\d+)?$/;
const TECHNICAL_CODE = /^[A-Z0-9_-]{1,64}$/;
const TRACE_CODE = /^[A-Z0-9_-]{1,128}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{16,128}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: RecordValue, required: readonly string[], optional: readonly string[] = []): boolean {
  const allowed = [...required, ...optional];
  return required.every((key) => key in value) && Object.keys(value).every((key) => allowed.includes(key));
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isNonnegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isNonblank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isInstant(value: unknown): value is string {
  return typeof value === "string" && ISO_INSTANT.test(value) && !Number.isNaN(Date.parse(value));
}

function isTechnicalCode(value: unknown): value is string {
  return typeof value === "string" && TECHNICAL_CODE.test(value);
}

function isProcess(value: unknown): value is InspectionSpecificationSummary["process"] {
  return isRecord(value) && hasExactKeys(value, ["code", "name"]) && isTechnicalCode(value.code) && isNonblank(value.name);
}

function isRouteStep(value: unknown): value is InspectionSpecificationSummary["routeStep"] {
  return value === null || (
    isRecord(value) &&
    hasExactKeys(value, ["productModelCode", "routeCode", "routeVersion", "stepOrder"]) &&
    isTechnicalCode(value.productModelCode) &&
    isTechnicalCode(value.routeCode) &&
    isPositiveInteger(value.routeVersion) &&
    isPositiveInteger(value.stepOrder)
  );
}

function isSummary(value: unknown): value is InspectionSpecificationSummary {
  return isRecord(value) &&
    hasExactKeys(value, ["code", "version", "name", "resultType", "targetUnitType", "process", "routeStep", "createdAt", "updatedAt"]) &&
    isTechnicalCode(value.code) && isPositiveInteger(value.version) && isNonblank(value.name) &&
    inspectionResultTypes.includes(value.resultType as InspectionResultType) &&
    traceableUnitTypes.includes(value.targetUnitType as TraceableUnitType) &&
    isProcess(value.process) && isRouteStep(value.routeStep) && isInstant(value.createdAt) && isInstant(value.updatedAt);
}

function isOption(value: unknown): boolean {
  return isRecord(value) && hasExactKeys(value, ["code", "description", "isAcceptable"]) &&
    isTechnicalCode(value.code) && isNullableString(value.description) && typeof value.isAcceptable === "boolean";
}

function isConfiguration(value: unknown): value is InspectionSpecificationConfiguration {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  switch (value.type) {
    case "NUMERIC":
      return hasExactKeys(value, ["type", "lowerBound", "upperBound", "unitCode"]) &&
        (value.lowerBound === null || (typeof value.lowerBound === "string" && DECIMAL.test(value.lowerBound))) &&
        (value.upperBound === null || (typeof value.upperBound === "string" && DECIMAL.test(value.upperBound))) &&
        (value.unitCode === null || isTechnicalCode(value.unitCode));
    case "BOOLEAN":
      return hasExactKeys(value, ["type", "expectedValue"]) && typeof value.expectedValue === "boolean";
    case "CATEGORICAL":
    case "VISUAL":
      return hasExactKeys(value, ["type", "options"]) && Array.isArray(value.options) && value.options.every(isOption);
    case "TEXT":
      return hasExactKeys(value, ["type"]);
    default:
      return false;
  }
}

function isPage(value: unknown): value is InspectionSpecificationDiscoveryPage["page"] {
  return isRecord(value) && hasExactKeys(value, ["number", "size", "totalItems", "totalPages"]) &&
    isPositiveInteger(value.number) && isPositiveInteger(value.size) &&
    isNonnegativeInteger(value.totalItems) && isNonnegativeInteger(value.totalPages) &&
    value.totalPages === Math.ceil(value.totalItems / value.size);
}

export function isInspectionSpecificationDiscoveryPage(value: unknown): value is InspectionSpecificationDiscoveryPage {
  return isRecord(value) && hasExactKeys(value, ["items", "page"]) && Array.isArray(value.items) &&
    value.items.every(isSummary) && isPage(value.page);
}

export function isInspectionSpecificationDetail(value: unknown): value is InspectionSpecificationDetail {
  if (!isRecord(value) || !hasExactKeys(value, ["code", "version", "name", "targetUnitType", "process", "routeStep", "createdAt", "updatedAt", "description", "configuration"])) return false;
  const summary = {
    code: value.code,
    version: value.version,
    name: value.name,
    resultType: isRecord(value.configuration) ? value.configuration.type : undefined,
    targetUnitType: value.targetUnitType,
    process: value.process,
    routeStep: value.routeStep,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
  return isSummary(summary) && isNullableString(value.description) && isConfiguration(value.configuration);
}

function isRequestEvidence(value: unknown): value is InspectionEvidence {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  switch (value.type) {
    case "NUMERIC":
      return hasExactKeys(value, ["type", "value"]) && typeof value.value === "string" && DECIMAL.test(value.value);
    case "BOOLEAN":
      return hasExactKeys(value, ["type", "value"]) && typeof value.value === "boolean";
    case "CATEGORICAL":
    case "VISUAL":
      return hasExactKeys(value, ["type", "optionCode"]) && isTechnicalCode(value.optionCode);
    case "TEXT":
      return hasExactKeys(value, ["type", "value", "outcome"]) && isNonblank(value.value) &&
        Array.from(value.value as string).length <= 4_000 && (value.outcome === "PASS" || value.outcome === "NG");
    default:
      return false;
  }
}

export function isInspectionSubmissionRequest(value: unknown): value is InspectionSubmissionRequest {
  if (!isRecord(value) || !hasExactKeys(value, ["traceCode", "specification", "inspectedAt", "evidence"], ["execution"])) return false;
  const execution = value.execution;
  return typeof value.traceCode === "string" && TRACE_CODE.test(value.traceCode) &&
    isRecord(value.specification) && hasExactKeys(value.specification, ["code", "version"]) &&
    isTechnicalCode(value.specification.code) && isPositiveInteger(value.specification.version) &&
    (execution === undefined || execution === null || (isRecord(execution) && hasExactKeys(execution, ["processCode", "attempt"]) && isTechnicalCode(execution.processCode) && isPositiveInteger(execution.attempt))) &&
    isInstant(value.inspectedAt) && isRequestEvidence(value.evidence);
}

function isResponseEvidence(value: unknown): value is InspectionSubmissionResponse["evidence"] {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  switch (value.type) {
    case "NUMERIC":
      return hasExactKeys(value, ["type", "value", "unitCode"]) && typeof value.value === "string" && DECIMAL.test(value.value) && (value.unitCode === null || isTechnicalCode(value.unitCode));
    case "BOOLEAN":
      return hasExactKeys(value, ["type", "value"]) && typeof value.value === "boolean";
    case "CATEGORICAL":
    case "VISUAL":
      return hasExactKeys(value, ["type", "optionCode"]) && isTechnicalCode(value.optionCode);
    case "TEXT":
      return hasExactKeys(value, ["type", "value"]) && isNonblank(value.value);
    default:
      return false;
  }
}

export function isInspectionSubmissionResponse(value: unknown): value is InspectionSubmissionResponse {
  if (!isRecord(value) || !hasExactKeys(value, ["traceCode", "specification", "processCode", "execution", "attemptNumber", "inspectedAt", "createdAt", "evidence", "outcome"])) return false;
  return typeof value.traceCode === "string" && TRACE_CODE.test(value.traceCode) &&
    isRecord(value.specification) && hasExactKeys(value.specification, ["code", "version"]) && isTechnicalCode(value.specification.code) && isPositiveInteger(value.specification.version) &&
    isTechnicalCode(value.processCode) &&
    (value.execution === null || (isRecord(value.execution) && hasExactKeys(value.execution, ["processCode", "attempt"]) && isTechnicalCode(value.execution.processCode) && isPositiveInteger(value.execution.attempt))) &&
    isPositiveInteger(value.attemptNumber) && isInstant(value.inspectedAt) && isInstant(value.createdAt) &&
    isResponseEvidence(value.evidence) && (value.outcome === "PASS" || value.outcome === "NG");
}

export function isValidInspectionIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && IDEMPOTENCY_KEY.test(value);
}

async function safeResponseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

async function checkedFetch(
  path: string,
  init: RequestInit,
  onUnauthenticated?: () => void,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(new URL(path, getApiBaseUrl()), {
      ...init,
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    throw new InspectionApiError("network");
  }
  const body = await safeResponseJson(response);
  if (!response.ok) {
    const code = isRecord(body) && inspectionPublicErrorCodes.includes(body.code as InspectionPublicError)
      ? body.code as InspectionPublicError
      : null;
    if (response.status === 401) onUnauthenticated?.();
    throw new InspectionApiError("public", response.status, code);
  }
  return body;
}

export async function discoverInspectionSpecifications(
  request: InspectionDiscoveryRequest = {},
  signal?: AbortSignal,
): Promise<InspectionSpecificationDiscoveryPage> {
  const parameters = new URLSearchParams();
  if (request.query !== undefined) parameters.set("query", request.query);
  if (request.resultType !== undefined) parameters.set("resultType", request.resultType);
  if (request.targetUnitType !== undefined) parameters.set("targetUnitType", request.targetUnitType);
  if (request.processCode !== undefined) parameters.set("processCode", request.processCode);
  if (request.page !== undefined) parameters.set("page", String(request.page));
  if (request.pageSize !== undefined) parameters.set("pageSize", String(request.pageSize));
  const query = parameters.size ? `?${parameters.toString()}` : "";
  const value = await checkedFetch(`inspection-specifications/discovery${query}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!isInspectionSpecificationDiscoveryPage(value)) throw new InspectionApiError("malformed-response");
  return value;
}

export async function getInspectionSpecificationDetail(
  code: string,
  version: number,
  signal?: AbortSignal,
): Promise<InspectionSpecificationDetail> {
  const value = await checkedFetch(
    `inspection-specifications/discovery/${encodeURIComponent(code)}/versions/${encodeURIComponent(String(version))}`,
    { method: "GET", headers: { Accept: "application/json" }, signal },
  );
  if (!isInspectionSpecificationDetail(value)) throw new InspectionApiError("malformed-response");
  return value;
}

export async function submitInspection(
  request: InspectionSubmissionRequest,
  options: {
    csrfToken: string;
    idempotencyKey: string;
    signal?: AbortSignal;
    onUnauthenticated?: () => void;
  },
): Promise<InspectionSubmissionResponse> {
  if (!isInspectionSubmissionRequest(request) || !isValidInspectionIdempotencyKey(options.idempotencyKey)) {
    throw new InspectionApiError("public", 400, "INVALID_REQUEST");
  }
  const value = await checkedFetch("inspections", {
    method: "POST",
    headers: withCsrfHeader(options.csrfToken, {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Idempotency-Key": options.idempotencyKey,
    }),
    body: JSON.stringify(request),
    signal: options.signal,
  }, options.onUnauthenticated);
  if (!isInspectionSubmissionResponse(value)) throw new InspectionApiError("malformed-response");
  return value;
}
