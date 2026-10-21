import { inspectionResultTypes, type InspectionResultType } from "./api/inspection-entry";
import type { InspectionEvidenceDraft } from "./inspection-evidence";
import { isValidTraceCode } from "./trace-code";

export const INSPECTION_WORKSPACE_DRAFT_KEY = "bmqt.inspection-entry.draft.v1";
const MAX_BYTES = 16_384;

export type InspectionWorkspaceDraft = {
  traceCodeInput: string;
  confirmedTraceCode: string | null;
  filters: { query: string; resultType: InspectionResultType | ""; processCode: string };
  specification: { code: string; version: number } | null;
  execution: { processCode: string; attempt: number } | null;
  evidence: InspectionEvidenceDraft | null;
  inspectedAtLocal: string;
  reviewed: boolean;
};

type StoredDraft = { schemaVersion: 1; accountBinding: string; draft: InspectionWorkspaceDraft };
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every((key) => key in value);
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const technical = (value: unknown, maximum = 128): value is string => typeof value === "string" && value.length <= maximum && (value === "" || /^[A-Z0-9_-]+$/.test(value));

function validEvidence(value: unknown): value is InspectionEvidenceDraft {
  if (!record(value) || typeof value.type !== "string") return false;
  if (value.type === "NUMERIC") return exact(value, ["type", "value"]) && typeof value.value === "string";
  if (value.type === "BOOLEAN") return exact(value, ["type", "value"]) && (typeof value.value === "boolean" || value.value === null);
  if (value.type === "CATEGORICAL" || value.type === "VISUAL") return exact(value, ["type", "optionCode"]) && technical(value.optionCode, 64);
  return value.type === "TEXT" && exact(value, ["type", "value", "outcome"]) && typeof value.value === "string" && Array.from(value.value).length <= 4_000 && (value.outcome === "PASS" || value.outcome === "NG" || value.outcome === null);
}

function validDraft(value: unknown): value is InspectionWorkspaceDraft {
  if (!record(value) || !exact(value, ["traceCodeInput", "confirmedTraceCode", "filters", "specification", "execution", "evidence", "inspectedAtLocal", "reviewed"])) return false;
  if (typeof value.traceCodeInput !== "string" || value.traceCodeInput.length > 128 || (value.confirmedTraceCode !== null && (typeof value.confirmedTraceCode !== "string" || !isValidTraceCode(value.confirmedTraceCode)))) return false;
  if (!record(value.filters) || !exact(value.filters, ["query", "resultType", "processCode"]) || typeof value.filters.query !== "string" || value.filters.query.length > 128 || !technical(value.filters.processCode, 64) || !(value.filters.resultType === "" || inspectionResultTypes.includes(value.filters.resultType as InspectionResultType))) return false;
  if (value.specification !== null && (!record(value.specification) || !exact(value.specification, ["code", "version"]) || !technical(value.specification.code, 64) || !positive(value.specification.version))) return false;
  if (value.execution !== null && (!record(value.execution) || !exact(value.execution, ["processCode", "attempt"]) || !technical(value.execution.processCode, 64) || !positive(value.execution.attempt))) return false;
  return (value.evidence === null || validEvidence(value.evidence)) && typeof value.inspectedAtLocal === "string" && value.inspectedAtLocal.length <= 32 && typeof value.reviewed === "boolean";
}

export function saveInspectionWorkspaceDraft(draft: InspectionWorkspaceDraft, accountBinding: string, storage: Storage = sessionStorage): void {
  const value: StoredDraft = { schemaVersion: 1, accountBinding, draft: structuredClone(draft) };
  const serialized = JSON.stringify(value);
  if (!/^[a-f0-9]{64}$/.test(accountBinding) || !validDraft(draft) || serialized.length > MAX_BYTES) throw new Error("Invalid inspection workspace draft.");
  storage.setItem(INSPECTION_WORKSPACE_DRAFT_KEY, serialized);
}

export function restoreInspectionWorkspaceDraft(accountBinding: string, storage: Storage = sessionStorage): InspectionWorkspaceDraft | null {
  const serialized = storage.getItem(INSPECTION_WORKSPACE_DRAFT_KEY);
  if (!serialized || serialized.length > MAX_BYTES) { if (serialized) storage.removeItem(INSPECTION_WORKSPACE_DRAFT_KEY); return null; }
  try {
    const value: unknown = JSON.parse(serialized);
    if (!record(value) || !exact(value, ["schemaVersion", "accountBinding", "draft"]) || value.schemaVersion !== 1 || value.accountBinding !== accountBinding || !validDraft(value.draft)) { storage.removeItem(INSPECTION_WORKSPACE_DRAFT_KEY); return null; }
    return structuredClone(value.draft);
  } catch { storage.removeItem(INSPECTION_WORKSPACE_DRAFT_KEY); return null; }
}

export function clearInspectionWorkspaceDraft(storage: Storage = sessionStorage): void { storage.removeItem(INSPECTION_WORKSPACE_DRAFT_KEY); }
