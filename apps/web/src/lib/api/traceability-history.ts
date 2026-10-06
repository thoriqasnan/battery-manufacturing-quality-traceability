import { getApiBaseUrl } from "./config";
import { TraceabilityApiError } from "./traceability";

export type Page = { number: number; size: number; totalItems: number; totalPages: number };
export type ProcessHistoryRequest = { page?: number; pageSize?: number };
export type QualityHistoryRequest = ProcessHistoryRequest & { outcome?: "PASS" | "NG" };
export type NonconformanceHistoryRequest = ProcessHistoryRequest & {
  status?: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
};

export type ProcessHistoryResponse = {
  items: Array<{
    recordId: string;
    process: { code: string; name: string };
    route: { code: string; version: number; stepOrder: number } | null;
    attemptNumber: number;
    status: "IN_PROGRESS" | "COMPLETED" | "ABORTED";
    executionMethod: "MANUAL" | "AUTOMATED" | "HYBRID";
    startedAt: string;
    finishedAt: string | null;
  }>;
  page: Page;
};

export type QualityEvidence =
  | { type: "NUMERIC"; value: string; unitCode: string | null }
  | { type: "BOOLEAN"; value: boolean }
  | { type: "CATEGORICAL" | "VISUAL"; optionCode: string; isAcceptable: boolean }
  | { type: "TEXT"; value: string };

export type QualityHistoryResponse = {
  items: Array<{
    recordId: string;
    specification: { code: string; version: number };
    processCode: string;
    processExecutionRecordId: string | null;
    resultType: QualityEvidence["type"];
    attemptNumber: number;
    outcome: "PASS" | "NG";
    inspectedAt: string;
    evidence: QualityEvidence;
  }>;
  page: Page;
};

type NestedMetadata = { returnedCount: number; totalCount: number; isPartial: boolean };
export type NonconformanceHistoryResponse = {
  items: Array<{
    code: string;
    status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
    defectCategory: { code: string; name: string };
    description: string | null;
    detectedAt: string;
    resolvedAt: string | null;
    closedAt: string | null;
    source: { inspectionRecordId: string | null; processExecutionRecordId: string | null };
    abnormalCases: Array<{ code: string; reason: string | null; openedAt: string; closedAt: string | null }>;
    actions: Array<{
      recordId: string;
      actionType: "CORRECTION" | "REWORK" | "REPLACEMENT" | "RETEST" | "BALANCING" | "ESCALATION";
      abnormalCaseCode: string | null;
      note: string | null;
      occurredAt: string;
      resultingInspectionRecordId: string | null;
      relatedUnitTraceCode: string | null;
    }>;
    verifications: Array<{
      recordId: string;
      inspectionRecordId: string;
      actionRecordId: string | null;
      note: string | null;
      verifiedAt: string;
    }>;
    dispositions: Array<{
      recordId: string;
      dispositionType: "CONTINUE" | "CONCESSION" | "RETURN_IQC" | "SCRAP";
      note: string | null;
      decidedAt: string;
    }>;
    nestedPageInfo: {
      abnormalCases: NestedMetadata;
      actions: NestedMetadata;
      verifications: NestedMetadata;
      dispositions: NestedMetadata;
    };
  }>;
  page: Page;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key)) && keys.every((key) => key in value);
}

function isInteger(value: unknown, minimum = 0): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum;
}

function isNonblank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isNullableDate(value: unknown): value is string | null {
  return value === null || isDate(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isReference(value: unknown, namespace: "exec" | "insp" | "act" | "ver" | "disp"): value is string {
  return typeof value === "string" && new RegExp(`^${namespace}_[A-Za-z0-9_-]+$`).test(value);
}

function isPage(value: unknown): value is Page {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["number", "size", "totalItems", "totalPages"]) ||
    !isInteger(value.number, 1) ||
    !isInteger(value.size, 1) ||
    !isInteger(value.totalItems) ||
    !isInteger(value.totalPages)
  ) return false;
  return value.totalPages === Math.ceil(value.totalItems / value.size);
}

function isProcessItem(value: unknown): value is ProcessHistoryResponse["items"][number] {
  if (!isRecord(value) || !isRecord(value.process)) return false;
  const route = value.route;
  return (
    hasOnlyKeys(value, ["recordId", "process", "route", "attemptNumber", "status", "executionMethod", "startedAt", "finishedAt"]) &&
    hasOnlyKeys(value.process, ["code", "name"]) &&
    isReference(value.recordId, "exec") &&
    isNonblank(value.process.code) && isNonblank(value.process.name) &&
    (route === null || (
      isRecord(route) && hasOnlyKeys(route, ["code", "version", "stepOrder"]) && isNonblank(route.code) && isInteger(route.version, 1) && isInteger(route.stepOrder, 1)
    )) &&
    isInteger(value.attemptNumber, 1) &&
    ["IN_PROGRESS", "COMPLETED", "ABORTED"].includes(value.status as string) &&
    ["MANUAL", "AUTOMATED", "HYBRID"].includes(value.executionMethod as string) &&
    isDate(value.startedAt) && isNullableDate(value.finishedAt)
  );
}

function isQualityEvidence(value: unknown, resultType: unknown): value is QualityEvidence {
  if (!isRecord(value) || value.type !== resultType) return false;
  switch (resultType) {
    case "NUMERIC":
      return (
        Object.keys(value).every((key) => ["type", "value", "unitCode"].includes(key)) &&
        typeof value.value === "string" && /^-?(?:\d+|\d*\.\d+)$/.test(value.value) &&
        (value.unitCode === null || isNonblank(value.unitCode))
      );
    case "BOOLEAN":
      return Object.keys(value).every((key) => ["type", "value"].includes(key)) && typeof value.value === "boolean";
    case "CATEGORICAL":
    case "VISUAL":
      return (
        Object.keys(value).every((key) => ["type", "optionCode", "isAcceptable"].includes(key)) &&
        isNonblank(value.optionCode) && typeof value.isAcceptable === "boolean"
      );
    case "TEXT":
      return Object.keys(value).every((key) => ["type", "value"].includes(key)) && isNonblank(value.value);
    default:
      return false;
  }
}

function isQualityItem(value: unknown): value is QualityHistoryResponse["items"][number] {
  return (
    isRecord(value) && isRecord(value.specification) &&
    hasOnlyKeys(value, ["recordId", "specification", "processCode", "processExecutionRecordId", "resultType", "attemptNumber", "outcome", "inspectedAt", "evidence"]) &&
    hasOnlyKeys(value.specification, ["code", "version"]) &&
    isReference(value.recordId, "insp") &&
    isNonblank(value.specification.code) && isInteger(value.specification.version, 1) &&
    isNonblank(value.processCode) &&
    (value.processExecutionRecordId === null || isReference(value.processExecutionRecordId, "exec")) &&
    ["NUMERIC", "BOOLEAN", "CATEGORICAL", "VISUAL", "TEXT"].includes(value.resultType as string) &&
    isInteger(value.attemptNumber, 1) &&
    (value.outcome === "PASS" || value.outcome === "NG") &&
    isDate(value.inspectedAt) && isQualityEvidence(value.evidence, value.resultType)
  );
}

function isNestedMetadata(value: unknown, returnedLength: number): value is NestedMetadata {
  return (
    isRecord(value) && hasOnlyKeys(value, ["returnedCount", "totalCount", "isPartial"]) && isInteger(value.returnedCount) && isInteger(value.totalCount) &&
    typeof value.isPartial === "boolean" && value.returnedCount === returnedLength &&
    value.totalCount >= value.returnedCount && value.isPartial === (value.returnedCount < value.totalCount)
  );
}

const actionTypes = ["CORRECTION", "REWORK", "REPLACEMENT", "RETEST", "BALANCING", "ESCALATION"];
const dispositionTypes = ["CONTINUE", "CONCESSION", "RETURN_IQC", "SCRAP"];
const safePublicErrorCodes = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "INVALID_REQUEST",
  "TRACE_UNIT_NOT_FOUND",
  "TRACEABILITY_HISTORY_INTEGRITY_ERROR",
] as const;

function isNonconformanceItem(value: unknown): value is NonconformanceHistoryResponse["items"][number] {
  if (
    !isRecord(value) || !isRecord(value.defectCategory) || !isRecord(value.source) ||
    !Array.isArray(value.abnormalCases) || !Array.isArray(value.actions) ||
    !Array.isArray(value.verifications) || !Array.isArray(value.dispositions) || !isRecord(value.nestedPageInfo)
  ) return false;
  const abnormalCasesValid = value.abnormalCases.every((item) => isRecord(item) && hasOnlyKeys(item, ["code", "reason", "openedAt", "closedAt"]) && isNonblank(item.code) && isNullableString(item.reason) && isDate(item.openedAt) && isNullableDate(item.closedAt));
  const actionsValid = value.actions.every((item) => isRecord(item) && hasOnlyKeys(item, ["recordId", "actionType", "abnormalCaseCode", "note", "occurredAt", "resultingInspectionRecordId", "relatedUnitTraceCode"]) && isReference(item.recordId, "act") && actionTypes.includes(item.actionType as string) && isNullableString(item.abnormalCaseCode) && isNullableString(item.note) && isDate(item.occurredAt) && (item.resultingInspectionRecordId === null || isReference(item.resultingInspectionRecordId, "insp")) && isNullableString(item.relatedUnitTraceCode));
  const verificationsValid = value.verifications.every((item) => isRecord(item) && hasOnlyKeys(item, ["recordId", "inspectionRecordId", "actionRecordId", "note", "verifiedAt"]) && isReference(item.recordId, "ver") && isReference(item.inspectionRecordId, "insp") && (item.actionRecordId === null || isReference(item.actionRecordId, "act")) && isNullableString(item.note) && isDate(item.verifiedAt));
  const dispositionsValid = value.dispositions.every((item) => isRecord(item) && hasOnlyKeys(item, ["recordId", "dispositionType", "note", "decidedAt"]) && isReference(item.recordId, "disp") && dispositionTypes.includes(item.dispositionType as string) && isNullableString(item.note) && isDate(item.decidedAt));
  return (
    hasOnlyKeys(value, ["code", "status", "defectCategory", "description", "detectedAt", "resolvedAt", "closedAt", "source", "abnormalCases", "actions", "verifications", "dispositions", "nestedPageInfo"]) &&
    hasOnlyKeys(value.defectCategory, ["code", "name"]) &&
    hasOnlyKeys(value.source, ["inspectionRecordId", "processExecutionRecordId"]) &&
    hasOnlyKeys(value.nestedPageInfo, ["abnormalCases", "actions", "verifications", "dispositions"]) &&
    isNonblank(value.code) && ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].includes(value.status as string) &&
    isNonblank(value.defectCategory.code) && isNonblank(value.defectCategory.name) && isNullableString(value.description) &&
    isDate(value.detectedAt) && isNullableDate(value.resolvedAt) && isNullableDate(value.closedAt) &&
    (value.source.inspectionRecordId === null || isReference(value.source.inspectionRecordId, "insp")) &&
    (value.source.processExecutionRecordId === null || isReference(value.source.processExecutionRecordId, "exec")) &&
    abnormalCasesValid && actionsValid && verificationsValid && dispositionsValid &&
    isNestedMetadata(value.nestedPageInfo.abnormalCases, value.abnormalCases.length) &&
    isNestedMetadata(value.nestedPageInfo.actions, value.actions.length) &&
    isNestedMetadata(value.nestedPageInfo.verifications, value.verifications.length) &&
    isNestedMetadata(value.nestedPageInfo.dispositions, value.dispositions.length)
  );
}

function isResponse<T>(value: unknown, itemValidator: (item: unknown) => item is T): value is { items: T[]; page: Page } {
  return isRecord(value) && hasOnlyKeys(value, ["items", "page"]) && Array.isArray(value.items) && value.items.every(itemValidator) && isPage(value.page);
}

function boundedPage(request: ProcessHistoryRequest, defaultSize: number, maximumSize: number): URLSearchParams {
  const page = request.page ?? 1;
  const pageSize = request.pageSize ?? defaultSize;
  if (!isInteger(page, 1) || !isInteger(pageSize, 1) || pageSize > maximumSize) {
    throw new TraceabilityApiError("invalid", "INVALID_REQUEST");
  }
  const params = new URLSearchParams();
  if (page !== 1) params.set("page", String(page));
  if (pageSize !== defaultSize) params.set("pageSize", String(pageSize));
  return params;
}

async function readHistory(url: URL, signal?: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { method: "GET", headers: { Accept: "application/json" }, credentials: "include", cache: "no-store", signal });
  } catch {
    throw new TraceabilityApiError("network");
  }
  if (!response.ok) {
    let code: string | undefined;
    try {
      const error = await response.json() as unknown;
      if (
        isRecord(error) &&
        typeof error.code === "string" &&
        safePublicErrorCodes.includes(error.code as (typeof safePublicErrorCodes)[number])
      ) code = error.code;
    } catch {
      // Status remains authoritative when an error body is absent or malformed.
    }
    if (response.status === 401) throw new TraceabilityApiError("unauthenticated", code);
    if (response.status === 403) throw new TraceabilityApiError("forbidden", code);
    if (response.status === 400) throw new TraceabilityApiError("invalid", code);
    if (response.status === 404) throw new TraceabilityApiError("notFound", code);
    throw new TraceabilityApiError(response.status >= 500 ? "server" : "unexpected", code);
  }
  try {
    return await response.json();
  } catch {
    throw new TraceabilityApiError("unexpected");
  }
}

function historyUrl(traceCode: string, resource: string, params: URLSearchParams): URL {
  const url = new URL(`traceability/${encodeURIComponent(traceCode)}/${resource}`, getApiBaseUrl());
  url.search = params.toString();
  return url;
}

export async function fetchProcessHistory(traceCode: string, request: ProcessHistoryRequest = {}, signal?: AbortSignal): Promise<ProcessHistoryResponse> {
  const value = await readHistory(historyUrl(traceCode, "process-history", boundedPage(request, 25, 100)), signal);
  if (!isResponse(value, isProcessItem)) throw new TraceabilityApiError("unexpected");
  return value;
}

export async function fetchQualityHistory(traceCode: string, request: QualityHistoryRequest = {}, signal?: AbortSignal): Promise<QualityHistoryResponse> {
  const params = boundedPage(request, 25, 100);
  if (request.outcome && !["PASS", "NG"].includes(request.outcome)) {
    throw new TraceabilityApiError("invalid", "INVALID_REQUEST");
  }
  if (request.outcome) params.set("outcome", request.outcome);
  const value = await readHistory(historyUrl(traceCode, "quality-history", params), signal);
  if (!isResponse(value, isQualityItem)) throw new TraceabilityApiError("unexpected");
  return value;
}

export async function fetchNonconformanceHistory(traceCode: string, request: NonconformanceHistoryRequest = {}, signal?: AbortSignal): Promise<NonconformanceHistoryResponse> {
  const params = boundedPage(request, 10, 50);
  if (request.status && !["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].includes(request.status)) {
    throw new TraceabilityApiError("invalid", "INVALID_REQUEST");
  }
  if (request.status) params.set("status", request.status);
  const value = await readHistory(historyUrl(traceCode, "nonconformances", params), signal);
  if (!isResponse(value, isNonconformanceItem)) throw new TraceabilityApiError("unexpected");
  return value;
}
