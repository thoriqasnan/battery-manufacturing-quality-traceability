import { getApiBaseUrl } from "./config";
import {
  TraceabilityApiError,
  traceableUnitTypes,
  type TraceableUnitType,
} from "./traceability";

export type UnitDetailResponse = {
  unit: {
    traceCode: string;
    unitType: TraceableUnitType;
    productModel: { code: string; name: string } | null;
    createdAt: string;
    updatedAt: string;
  };
  sections: {
    genealogy: { hasRecords: boolean; directRelationCount: number };
    processHistory: { hasRecords: boolean; recordCount: number };
    qualityHistory: { hasRecords: boolean; recordCount: number };
    nonconformance: { hasRecords: boolean; recordCount: number };
  };
};

export type GenealogyDirection = "ancestors" | "descendants";
export type GenealogyScope = "current" | "historical" | "asOf";
export type GenealogyPartialReason =
  | "EDGE_LIMIT"
  | "DEPTH_LIMIT"
  | "CYCLE_PATH_SKIPPED";

export type GenealogyNode = {
  traceCode: string;
  unitType: TraceableUnitType;
  directParentCount: number;
  directChildCount: number;
  selected: boolean;
};

export type GenealogyEdge = {
  relationId: string;
  depth: number;
  parent: GenealogyNode;
  child: GenealogyNode;
  positionCode: string | null;
  installedAt: string;
  removedAt: string | null;
  relationshipState: "CURRENT" | "HISTORICAL";
};

export type GenealogyResponse = {
  root: GenealogyNode;
  direction: GenealogyDirection;
  scope: { mode: GenealogyScope; at: string | null };
  edges: GenealogyEdge[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
    returnedEdgeCount: number;
    requestedDepth: number;
    reachedDepth: number;
    isPartial: boolean;
    partialReasons: GenealogyPartialReason[];
  };
  integrityWarnings: Array<{ code: "CYCLE_PATH_SKIPPED" }>;
};

export type GenealogyRequest = {
  direction: GenealogyDirection;
  scope: GenealogyScope;
  at?: string;
  depth: number;
  limit?: number;
  cursor?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isNonnegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isUnitType(value: unknown): value is TraceableUnitType {
  return traceableUnitTypes.includes(value as TraceableUnitType);
}

function isModel(value: unknown): value is { code: string; name: string } {
  return isRecord(value) && typeof value.code === "string" && typeof value.name === "string";
}

function isRecordCount(value: unknown): value is { hasRecords: boolean; recordCount: number } {
  return isRecord(value) && typeof value.hasRecords === "boolean" && isNonnegativeInteger(value.recordCount);
}

function isUnitDetail(value: unknown): value is UnitDetailResponse {
  if (!isRecord(value) || !isRecord(value.unit) || !isRecord(value.sections)) return false;
  const { unit, sections } = value;
  return (
    typeof unit.traceCode === "string" &&
    isUnitType(unit.unitType) &&
    (unit.productModel === null || isModel(unit.productModel)) &&
    isDate(unit.createdAt) &&
    isDate(unit.updatedAt) &&
    isRecord(sections.genealogy) &&
    typeof sections.genealogy.hasRecords === "boolean" &&
    isNonnegativeInteger(sections.genealogy.directRelationCount) &&
    isRecordCount(sections.processHistory) &&
    isRecordCount(sections.qualityHistory) &&
    isRecordCount(sections.nonconformance)
  );
}

function isNode(value: unknown): value is GenealogyNode {
  return (
    isRecord(value) &&
    typeof value.traceCode === "string" &&
    isUnitType(value.unitType) &&
    isNonnegativeInteger(value.directParentCount) &&
    isNonnegativeInteger(value.directChildCount) &&
    typeof value.selected === "boolean"
  );
}

function isEdge(value: unknown): value is GenealogyEdge {
  return (
    isRecord(value) &&
    typeof value.relationId === "string" &&
    isPositiveInteger(value.depth) &&
    isNode(value.parent) &&
    isNode(value.child) &&
    (value.positionCode === null || typeof value.positionCode === "string") &&
    isDate(value.installedAt) &&
    (value.removedAt === null || isDate(value.removedAt)) &&
    (value.relationshipState === "CURRENT" || value.relationshipState === "HISTORICAL")
  );
}

const partialReasons = ["EDGE_LIMIT", "DEPTH_LIMIT", "CYCLE_PATH_SKIPPED"] as const;

function isGenealogy(value: unknown): value is GenealogyResponse {
  if (!isRecord(value) || !isNode(value.root) || !isRecord(value.scope) || !isRecord(value.pageInfo)) return false;
  const scopeMode = value.scope.mode;
  const pageInfo = value.pageInfo;
  return (
    (value.direction === "ancestors" || value.direction === "descendants") &&
    (scopeMode === "current" || scopeMode === "historical" || scopeMode === "asOf") &&
    (value.scope.at === null || isDate(value.scope.at)) &&
    (scopeMode === "asOf" ? isDate(value.scope.at) : value.scope.at === null) &&
    Array.isArray(value.edges) && value.edges.every(isEdge) &&
    typeof pageInfo.hasNextPage === "boolean" &&
    (pageInfo.endCursor === null || typeof pageInfo.endCursor === "string") &&
    isNonnegativeInteger(pageInfo.returnedEdgeCount) &&
    pageInfo.returnedEdgeCount === value.edges.length &&
    isPositiveInteger(pageInfo.requestedDepth) && pageInfo.requestedDepth <= 8 &&
    isNonnegativeInteger(pageInfo.reachedDepth) && pageInfo.reachedDepth <= pageInfo.requestedDepth &&
    typeof pageInfo.isPartial === "boolean" &&
    Array.isArray(pageInfo.partialReasons) &&
    pageInfo.partialReasons.every((reason) => partialReasons.includes(reason as GenealogyPartialReason)) &&
    Array.isArray(value.integrityWarnings) &&
    value.integrityWarnings.every((warning) => isRecord(warning) && warning.code === "CYCLE_PATH_SKIPPED") &&
    (!pageInfo.hasNextPage || typeof pageInfo.endCursor === "string")
  );
}

async function readJson(url: URL, signal: AbortSignal | undefined): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
      cache: "no-store",
      signal,
    });
  } catch {
    throw new TraceabilityApiError("network");
  }

  if (response.status === 401) throw new TraceabilityApiError("unauthenticated");
  if (response.status === 403) throw new TraceabilityApiError("forbidden");
  if (response.status === 400) throw new TraceabilityApiError("invalid");
  if (response.status === 404) throw new TraceabilityApiError("notFound");
  if (!response.ok) throw new TraceabilityApiError(response.status >= 500 ? "server" : "unexpected");

  try {
    return await response.json();
  } catch {
    throw new TraceabilityApiError("unexpected");
  }
}

export async function getTraceableUnitDetail(
  traceCode: string,
  signal?: AbortSignal,
): Promise<UnitDetailResponse> {
  const url = new URL(`traceability/${encodeURIComponent(traceCode)}`, getApiBaseUrl());
  const value = await readJson(url, signal);
  if (!isUnitDetail(value)) throw new TraceabilityApiError("unexpected");
  if (value.unit.traceCode !== traceCode) throw new TraceabilityApiError("unexpected");
  return value;
}

export async function getTraceableUnitGenealogy(
  traceCode: string,
  request: GenealogyRequest,
  signal?: AbortSignal,
): Promise<GenealogyResponse> {
  const url = new URL(`traceability/${encodeURIComponent(traceCode)}/genealogy`, getApiBaseUrl());
  url.searchParams.set("direction", request.direction);
  url.searchParams.set("scope", request.scope);
  if (request.at) url.searchParams.set("at", request.at);
  url.searchParams.set("depth", String(request.depth));
  if (request.limit && request.limit !== 50) url.searchParams.set("limit", String(request.limit));
  if (request.cursor) url.searchParams.set("cursor", request.cursor);
  const value = await readJson(url, signal);
  if (!isGenealogy(value)) throw new TraceabilityApiError("unexpected");
  if (
    value.root.traceCode !== traceCode ||
    value.direction !== request.direction ||
    value.scope.mode !== request.scope ||
    value.pageInfo.requestedDepth !== request.depth ||
    (request.scope === "asOf" && value.scope.at !== request.at)
  ) {
    throw new TraceabilityApiError("unexpected");
  }
  return value;
}
