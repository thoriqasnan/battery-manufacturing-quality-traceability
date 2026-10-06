import { getApiBaseUrl } from "./config";

export const traceableUnitTypes = ["PACK", "MODULE", "CELL", "COMPONENT", "MATERIAL"] as const;
export type TraceableUnitType = (typeof traceableUnitTypes)[number];

export type TraceabilitySearchRequest = {
  query?: string;
  unitType?: TraceableUnitType;
  productModel?: string;
  page?: number;
  pageSize?: number;
};

export type TraceabilitySearchItem = {
  traceCode: string;
  unitType: TraceableUnitType;
  productModel: { code: string; name: string } | null;
  createdAt: string;
  lastActivityAt: string | null;
  match: "EXACT" | "PREFIX" | null;
};

export type TraceabilitySearchResponse = {
  items: TraceabilitySearchItem[];
  page: { number: number; size: number; totalItems: number; totalPages: number };
};

export type TraceabilityErrorKind =
  | "unauthenticated"
  | "forbidden"
  | "invalid"
  | "notFound"
  | "server"
  | "network"
  | "unexpected";

export class TraceabilityApiError extends Error {
  constructor(
    public readonly kind: TraceabilityErrorKind,
    public readonly code?: string,
  ) {
    super(kind);
    this.name = "TraceabilityApiError";
  }
}

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

function isModel(value: unknown): value is { code: string; name: string } {
  return isRecord(value) && typeof value.code === "string" && typeof value.name === "string";
}

function isSearchItem(value: unknown): value is TraceabilitySearchItem {
  return (
    isRecord(value) &&
    typeof value.traceCode === "string" &&
    traceableUnitTypes.includes(value.unitType as TraceableUnitType) &&
    (value.productModel === null || isModel(value.productModel)) &&
    isDate(value.createdAt) &&
    (value.lastActivityAt === null || isDate(value.lastActivityAt)) &&
    (value.match === null || value.match === "EXACT" || value.match === "PREFIX")
  );
}

function isSearchResponse(value: unknown): value is TraceabilitySearchResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(isSearchItem) &&
    isRecord(value.page) &&
    isPositiveInteger(value.page.number) &&
    isPositiveInteger(value.page.size) &&
    isNonnegativeInteger(value.page.totalItems) &&
    isNonnegativeInteger(value.page.totalPages)
  );
}

export async function searchTraceability(
  request: TraceabilitySearchRequest,
  signal?: AbortSignal,
): Promise<TraceabilitySearchResponse> {
  const url = new URL("traceability", getApiBaseUrl());
  if (request.query) url.searchParams.set("query", request.query);
  if (request.unitType) url.searchParams.set("unitType", request.unitType);
  if (request.productModel) url.searchParams.set("productModel", request.productModel);
  if (request.page && request.page !== 1) url.searchParams.set("page", String(request.page));
  if (request.pageSize && request.pageSize !== 25) url.searchParams.set("pageSize", String(request.pageSize));

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
  if (!response.ok) throw new TraceabilityApiError(response.status >= 500 ? "server" : "unexpected");

  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new TraceabilityApiError("unexpected");
  }
  if (!isSearchResponse(value)) throw new TraceabilityApiError("unexpected");
  return value;
}
