import type {
  InspectionApiError,
  InspectionSubmissionRequest,
  InspectionSubmissionResponse,
} from "./api/inspection-entry";
import {
  isInspectionSubmissionRequest,
  isValidInspectionIdempotencyKey,
} from "./api/inspection-entry";

export const INSPECTION_RECOVERY_STORAGE_KEY = "bmqt.inspection-entry.recovery.v1";
export const INSPECTION_RECOVERY_SCHEMA_VERSION = 1;
const MAX_RECOVERY_BYTES = 16_384;
const MAX_RECOVERY_AGE_MS = 24 * 60 * 60 * 1_000;

export type FrozenInspectionSubmission = Readonly<{
  request: Readonly<InspectionSubmissionRequest>;
  idempotencyKey: string;
}>;

export type InspectionRecoveryDisposition = "uncertain" | "retry_same_key" | "deterministic_rejection";

export function inspectionRecoveryDisposition(error: InspectionApiError): InspectionRecoveryDisposition {
  if (error.kind === "network" || error.kind === "malformed-response") return "uncertain";
  if (error.code === "INSPECTION_WRITE_CONFLICT") return "retry_same_key";
  if (error.status !== null && error.status >= 500 && error.code === null) return "uncertain";
  return "deterministic_rejection";
}

export type InspectionEntryState =
  | { status: "draft"; draft: InspectionSubmissionRequest | null }
  | { status: "reviewing"; draft: InspectionSubmissionRequest }
  | { status: "submitting"; submission: FrozenInspectionSubmission }
  | { status: "outcome_uncertain"; submission: FrozenInspectionSubmission }
  | { status: "succeeded"; response: InspectionSubmissionResponse }
  | {
      status: "failed";
      submission: FrozenInspectionSubmission;
      error: InspectionApiError;
    };

export type InspectionEntryEvent =
  | { type: "EDIT"; draft: InspectionSubmissionRequest }
  | { type: "REVIEW" }
  | { type: "SUBMIT"; keyFactory?: () => string }
  | { type: "OUTCOME_UNCERTAIN" }
  | { type: "SUCCEEDED"; response: InspectionSubmissionResponse }
  | { type: "FAILED"; error: InspectionApiError }
  | { type: "RETRY" }
  | { type: "ABANDON" };

function cloneRequest(request: InspectionSubmissionRequest): InspectionSubmissionRequest {
  return structuredClone(request);
}

function freezeRequest(request: InspectionSubmissionRequest): Readonly<InspectionSubmissionRequest> {
  const cloned = cloneRequest(request);
  Object.freeze(cloned.specification);
  if (cloned.execution) Object.freeze(cloned.execution);
  Object.freeze(cloned.evidence);
  return Object.freeze(cloned);
}

export function createInspectionSubmission(
  request: InspectionSubmissionRequest,
  keyFactory: () => string = () => crypto.randomUUID(),
): FrozenInspectionSubmission {
  if (!isInspectionSubmissionRequest(request)) throw new Error("Invalid inspection submission request.");
  const idempotencyKey = keyFactory();
  if (!isValidInspectionIdempotencyKey(idempotencyKey)) throw new Error("Invalid inspection idempotency key.");
  return Object.freeze({ request: freezeRequest(request), idempotencyKey });
}

export function inspectionEntryReducer(
  state: InspectionEntryState,
  event: InspectionEntryEvent,
): InspectionEntryState {
  switch (event.type) {
    case "EDIT":
      if (state.status === "submitting" || state.status === "outcome_uncertain") return state;
      return { status: "draft", draft: cloneRequest(event.draft) };
    case "REVIEW":
      return state.status === "draft" && state.draft
        ? { status: "reviewing", draft: cloneRequest(state.draft) }
        : state;
    case "SUBMIT":
      return state.status === "reviewing"
        ? { status: "submitting", submission: createInspectionSubmission(state.draft, event.keyFactory) }
        : state;
    case "OUTCOME_UNCERTAIN":
      return state.status === "submitting"
        ? { status: "outcome_uncertain", submission: state.submission }
        : state;
    case "SUCCEEDED":
      return state.status === "submitting" || state.status === "outcome_uncertain"
        ? { status: "succeeded", response: event.response }
        : state;
    case "FAILED":
      return state.status === "submitting"
        ? { status: "failed", submission: state.submission, error: event.error }
        : state;
    case "RETRY":
      return state.status === "failed" || state.status === "outcome_uncertain"
        ? { status: "submitting", submission: state.submission }
        : state;
    case "ABANDON":
      return state.status === "outcome_uncertain" || state.status === "failed"
        ? { status: "draft", draft: null }
        : state;
  }
}

type StoredRecovery = {
  schemaVersion: 1;
  accountBinding: string;
  savedAt: string;
  request: InspectionSubmissionRequest;
  idempotencyKey: string;
};

function isStoredRecovery(value: unknown): value is StoredRecovery {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 5 &&
    record.schemaVersion === INSPECTION_RECOVERY_SCHEMA_VERSION &&
    typeof record.accountBinding === "string" && /^[a-f0-9]{64}$/.test(record.accountBinding) &&
    typeof record.savedAt === "string" && !Number.isNaN(Date.parse(record.savedAt)) &&
    isInspectionSubmissionRequest(record.request) &&
    isValidInspectionIdempotencyKey(record.idempotencyKey);
}

export async function inspectionRecoveryAccountBinding(sessionUserId: string): Promise<string> {
  const bytes = new TextEncoder().encode(`inspection-recovery:v1:${sessionUserId}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function saveUncertainInspectionRecovery(
  submission: FrozenInspectionSubmission,
  accountBinding: string,
  storage: Storage = sessionStorage,
  now: Date = new Date(),
): void {
  const recovery: StoredRecovery = {
    schemaVersion: INSPECTION_RECOVERY_SCHEMA_VERSION,
    accountBinding,
    savedAt: now.toISOString(),
    request: cloneRequest(submission.request as InspectionSubmissionRequest),
    idempotencyKey: submission.idempotencyKey,
  };
  const serialized = JSON.stringify(recovery);
  if (!isStoredRecovery(recovery) || serialized.length > MAX_RECOVERY_BYTES) {
    throw new Error("Inspection recovery data is invalid.");
  }
  storage.setItem(INSPECTION_RECOVERY_STORAGE_KEY, serialized);
}

export function restoreUncertainInspectionRecovery(
  accountBinding: string,
  storage: Storage = sessionStorage,
  now: Date = new Date(),
): FrozenInspectionSubmission | null {
  const serialized = storage.getItem(INSPECTION_RECOVERY_STORAGE_KEY);
  if (!serialized || serialized.length > MAX_RECOVERY_BYTES) {
    if (serialized) storage.removeItem(INSPECTION_RECOVERY_STORAGE_KEY);
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    storage.removeItem(INSPECTION_RECOVERY_STORAGE_KEY);
    return null;
  }
  if (!isStoredRecovery(parsed) || parsed.accountBinding !== accountBinding ||
      now.getTime() - Date.parse(parsed.savedAt) < 0 ||
      now.getTime() - Date.parse(parsed.savedAt) > MAX_RECOVERY_AGE_MS) {
    storage.removeItem(INSPECTION_RECOVERY_STORAGE_KEY);
    return null;
  }
  return Object.freeze({
    request: freezeRequest(parsed.request),
    idempotencyKey: parsed.idempotencyKey,
  });
}

export function clearInspectionRecovery(storage: Storage = sessionStorage): void {
  storage.removeItem(INSPECTION_RECOVERY_STORAGE_KEY);
}

let localeDraftHandoff: InspectionSubmissionRequest | null = null;

export function prepareInspectionDraftLocaleHandoff(draft: InspectionSubmissionRequest): void {
  if (!isInspectionSubmissionRequest(draft)) throw new Error("Invalid inspection draft.");
  localeDraftHandoff = cloneRequest(draft);
}

export function consumeInspectionDraftLocaleHandoff(): InspectionSubmissionRequest | null {
  const draft = localeDraftHandoff ? cloneRequest(localeDraftHandoff) : null;
  localeDraftHandoff = null;
  return draft;
}
