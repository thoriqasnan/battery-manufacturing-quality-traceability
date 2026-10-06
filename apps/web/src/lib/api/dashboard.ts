import { getApiBaseUrl } from "./config";

const unitTypes = ["PACK", "MODULE", "CELL", "COMPONENT", "MATERIAL"] as const;
const processStatuses = ["IN_PROGRESS", "COMPLETED", "ABORTED"] as const;

export type DashboardOverview = {
  generatedAt: string;
  inventory: {
    totalUnits: number;
    byType: Array<{ unitType: (typeof unitTypes)[number]; count: number }>;
  };
  productModels: Array<{ code: string; name: string; packCount: number }>;
  process: {
    inProgressCount: number;
    recentLimit: number;
    recent: Array<{
      traceCode: string;
      unitType: (typeof unitTypes)[number];
      productModel: { code: string; name: string } | null;
      process: { code: string; name: string };
      attemptNumber: number;
      status: (typeof processStatuses)[number];
      startedAt: string;
      finishedAt: string | null;
    }>;
  };
  quality: {
    scope: { mode: "ALL_RECORDS"; from: null; to: null };
    inspectionCount: number;
    byOutcome: Array<{ outcome: "PASS" | "NG"; count: number }>;
    available: boolean;
  };
  nonconformance: { openCount: number; inProgressCount: number };
};

export type DashboardErrorKind =
  | "unauthenticated"
  | "forbidden"
  | "server"
  | "network"
  | "unexpected";

export class DashboardApiError extends Error {
  constructor(public readonly kind: DashboardErrorKind) {
    super(kind);
    this.name = "DashboardApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isModel(value: unknown): value is { code: string; name: string } {
  return isRecord(value) && typeof value.code === "string" && typeof value.name === "string";
}

function isOverview(value: unknown): value is DashboardOverview {
  if (
    !isRecord(value) ||
    !isDate(value.generatedAt) ||
    !isRecord(value.inventory) ||
    !isCount(value.inventory.totalUnits) ||
    !Array.isArray(value.inventory.byType) ||
    !Array.isArray(value.productModels) ||
    !isRecord(value.process) ||
    !isRecord(value.quality) ||
    !isRecord(value.nonconformance)
  ) return false;

  return (
    value.inventory.byType.every(
      (item) => isRecord(item) && unitTypes.includes(item.unitType as (typeof unitTypes)[number]) && isCount(item.count),
    ) &&
    value.productModels.every(
      (item) => isRecord(item) && isCount(item.packCount) && isModel(item),
    ) &&
    isCount(value.process.inProgressCount) &&
    isCount(value.process.recentLimit) &&
    Array.isArray(value.process.recent) &&
    value.process.recent.every(
      (item) =>
        isRecord(item) &&
        typeof item.traceCode === "string" &&
        unitTypes.includes(item.unitType as (typeof unitTypes)[number]) &&
        (item.productModel === null || isModel(item.productModel)) &&
        isModel(item.process) &&
        Number.isSafeInteger(item.attemptNumber) &&
        (item.attemptNumber as number) > 0 &&
        processStatuses.includes(item.status as (typeof processStatuses)[number]) &&
        isDate(item.startedAt) &&
        (item.finishedAt === null || isDate(item.finishedAt)),
    ) &&
    (value.quality.available === true || value.quality.available === false)
  ) &&
    isRecord(value.quality.scope) &&
    value.quality.scope.mode === "ALL_RECORDS" &&
    value.quality.scope.from === null &&
    value.quality.scope.to === null &&
    isCount(value.quality.inspectionCount) &&
    Array.isArray(value.quality.byOutcome) &&
    value.quality.byOutcome.every(
      (item) => isRecord(item) && (item.outcome === "PASS" || item.outcome === "NG") && isCount(item.count),
    ) &&
    isCount(value.nonconformance.openCount) &&
    isCount(value.nonconformance.inProgressCount);
}

export async function getDashboardOverview(signal?: AbortSignal): Promise<DashboardOverview> {
  let response: Response;
  try {
    response = await fetch(new URL("dashboard/overview", getApiBaseUrl()), {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
      cache: "no-store",
      signal,
    });
  } catch {
    throw new DashboardApiError("network");
  }

  if (response.status === 401) throw new DashboardApiError("unauthenticated");
  if (response.status === 403) throw new DashboardApiError("forbidden");
  if (!response.ok) throw new DashboardApiError(response.status >= 500 ? "server" : "unexpected");

  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new DashboardApiError("unexpected");
  }
  if (!isOverview(value)) throw new DashboardApiError("unexpected");
  return value;
}
