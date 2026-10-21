import { webcrypto } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { InspectionApiError, type InspectionSubmissionRequest } from "./api/inspection-entry";
import {
  clearInspectionRecovery,
  consumeInspectionDraftLocaleHandoff,
  createInspectionSubmission,
  inspectionEntryReducer,
  inspectionRecoveryDisposition,
  inspectionRecoveryAccountBinding,
  INSPECTION_RECOVERY_STORAGE_KEY,
  prepareInspectionDraftLocaleHandoff,
  restoreUncertainInspectionRecovery,
  saveUncertainInspectionRecovery,
} from "./inspection-entry-state";

const request: InspectionSubmissionRequest = {
  traceCode: "PACK-DEMO-001",
  specification: { code: "QC_VOLTAGE", version: 1 },
  execution: null,
  inspectedAt: "2026-10-08T01:30:00.000Z",
  evidence: { type: "NUMERIC", value: "12.500000" },
};

beforeAll(() => {
  Object.defineProperty(globalThis.crypto, "subtle", { configurable: true, value: webcrypto.subtle });
});

beforeEach(() => {
  sessionStorage.clear();
  consumeInspectionDraftLocaleHandoff();
});

describe("inspection entry idempotency state", () => {
  it("classifies recovery without discarding potentially committed submissions", () => {
    expect(inspectionRecoveryDisposition(new InspectionApiError("network"))).toBe("uncertain");
    expect(inspectionRecoveryDisposition(new InspectionApiError("malformed-response"))).toBe("uncertain");
    expect(inspectionRecoveryDisposition(new InspectionApiError("public", 503, null))).toBe("uncertain");
    expect(inspectionRecoveryDisposition(new InspectionApiError("public", 409, "INSPECTION_WRITE_CONFLICT"))).toBe("retry_same_key");
    expect(inspectionRecoveryDisposition(new InspectionApiError("public", 500, "INSPECTION_PERSISTENCE_ERROR"))).toBe("deterministic_rejection");
    expect(inspectionRecoveryDisposition(new InspectionApiError("public", 409, "IDEMPOTENCY_CONFLICT"))).toBe("deterministic_rejection");
    expect(inspectionRecoveryDisposition(new InspectionApiError("public", 409, "INSPECTION_SPECIFICATION_NOT_PUBLISHED"))).toBe("deterministic_rejection");
    expect(inspectionRecoveryDisposition(new InspectionApiError("public", 401, "UNAUTHENTICATED"))).toBe("deterministic_rejection");
  });

  it("creates a key only when finalized and reuses it for retry", () => {
    let state = inspectionEntryReducer({ status: "draft", draft: request }, { type: "REVIEW" });
    expect(state.status).toBe("reviewing");
    state = inspectionEntryReducer(state, { type: "SUBMIT", keyFactory: () => "0123456789abcdef" });
    expect(state.status).toBe("submitting");
    if (state.status !== "submitting") throw new Error("unexpected state");
    const submission = state.submission;
    state = inspectionEntryReducer(state, { type: "FAILED", error: new InspectionApiError("network") });
    state = inspectionEntryReducer(state, { type: "RETRY" });
    expect(state).toEqual({ status: "submitting", submission });
  });

  it("rotates the key for a semantic change and prevents pending duplicate/edit", () => {
    let state = inspectionEntryReducer({ status: "reviewing", draft: request }, { type: "SUBMIT", keyFactory: () => "0123456789abcdef" });
    const duplicate = inspectionEntryReducer(state, { type: "SUBMIT", keyFactory: () => "fedcba9876543210" });
    const edited = inspectionEntryReducer(state, { type: "EDIT", draft: { ...request, inspectedAt: "2026-10-08T02:00:00.000Z" } });
    expect(duplicate).toBe(state);
    expect(edited).toBe(state);
    state = { status: "reviewing", draft: { ...request, inspectedAt: "2026-10-08T02:00:00.000Z" } };
    state = inspectionEntryReducer(state, { type: "SUBMIT", keyFactory: () => "fedcba9876543210" });
    expect(state.status === "submitting" && state.submission.idempotencyKey).toBe("fedcba9876543210");
  });

  it("freezes the finalized public envelope", () => {
    const submission = createInspectionSubmission(request, () => "0123456789abcdef");
    expect(Object.isFrozen(submission.request)).toBe(true);
    expect(Object.isFrozen(submission.request.evidence)).toBe(true);
  });
});

describe("uncertain submission recovery", () => {
  it("restores only the matching account binding and keeps no raw user identifier", async () => {
    const binding = await inspectionRecoveryAccountBinding("private-user-uuid-a");
    const other = await inspectionRecoveryAccountBinding("private-user-uuid-b");
    const submission = createInspectionSubmission(request, () => "0123456789abcdef");
    saveUncertainInspectionRecovery(submission, binding, sessionStorage, new Date("2026-10-08T02:00:00Z"));
    expect(sessionStorage.getItem(INSPECTION_RECOVERY_STORAGE_KEY)).not.toContain("private-user-uuid-a");
    expect(restoreUncertainInspectionRecovery(other, sessionStorage, new Date("2026-10-08T02:01:00Z"))).toBeNull();
    expect(sessionStorage.getItem(INSPECTION_RECOVERY_STORAGE_KEY)).toBeNull();

    saveUncertainInspectionRecovery(submission, binding, sessionStorage, new Date("2026-10-08T02:00:00Z"));
    expect(restoreUncertainInspectionRecovery(binding, sessionStorage, new Date("2026-10-08T02:01:00Z"))).toEqual(submission);
  });

  it("rejects malformed, unknown-version, and expired storage and supports cleanup", async () => {
    const binding = await inspectionRecoveryAccountBinding("private-user-uuid-a");
    sessionStorage.setItem(INSPECTION_RECOVERY_STORAGE_KEY, JSON.stringify({ schemaVersion: 2 }));
    expect(restoreUncertainInspectionRecovery(binding)).toBeNull();
    const submission = createInspectionSubmission(request, () => "0123456789abcdef");
    saveUncertainInspectionRecovery(submission, binding, sessionStorage, new Date("2026-10-01T00:00:00Z"));
    expect(restoreUncertainInspectionRecovery(binding, sessionStorage, new Date("2026-10-08T02:01:00Z"))).toBeNull();
    saveUncertainInspectionRecovery(submission, binding);
    clearInspectionRecovery();
    expect(sessionStorage.getItem(INSPECTION_RECOVERY_STORAGE_KEY)).toBeNull();
  });
});

describe("locale draft handoff", () => {
  it("keeps ordinary draft handoff separate, transient, and one-use", () => {
    prepareInspectionDraftLocaleHandoff(request);
    expect(sessionStorage.getItem(INSPECTION_RECOVERY_STORAGE_KEY)).toBeNull();
    expect(consumeInspectionDraftLocaleHandoff()).toEqual(request);
    expect(consumeInspectionDraftLocaleHandoff()).toBeNull();
  });
});
