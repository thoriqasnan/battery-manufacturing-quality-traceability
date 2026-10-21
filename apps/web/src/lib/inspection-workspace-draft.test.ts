import { beforeEach, describe, expect, it } from "vitest";
import { INSPECTION_RECOVERY_STORAGE_KEY } from "./inspection-entry-state";
import { clearInspectionWorkspaceDraft, INSPECTION_WORKSPACE_DRAFT_KEY, restoreInspectionWorkspaceDraft, saveInspectionWorkspaceDraft, type InspectionWorkspaceDraft } from "./inspection-workspace-draft";

const binding = "a".repeat(64);
const draft: InspectionWorkspaceDraft = {
  traceCodeInput: "PACK-DEMO-001", confirmedTraceCode: "PACK-DEMO-001",
  filters: { query: "QC", resultType: "TEXT", processCode: "EOL_TEST" },
  specification: { code: "QC_TEXT", version: 1 }, execution: { processCode: "EOL_TEST", attempt: 2 },
  evidence: { type: "TEXT", value: "Unsent observation", outcome: "NG" },
  inspectedAtLocal: "2026-01-11 15:30", reviewed: false,
};

describe("inspection workspace draft storage", () => {
  beforeEach(() => sessionStorage.clear());

  it("round-trips a bounded account-bound public draft without recovery data", () => {
    sessionStorage.setItem(INSPECTION_RECOVERY_STORAGE_KEY, "unresolved-submission");
    saveInspectionWorkspaceDraft(draft, binding);
    expect(sessionStorage.getItem(INSPECTION_WORKSPACE_DRAFT_KEY)).not.toContain("private-user-id");
    expect(restoreInspectionWorkspaceDraft(binding)).toEqual(draft);
    expect(sessionStorage.getItem(INSPECTION_RECOVERY_STORAGE_KEY)).toBe("unresolved-submission");
  });

  it("rejects another account and malformed or incompatible public state", () => {
    saveInspectionWorkspaceDraft(draft, binding);
    expect(restoreInspectionWorkspaceDraft("b".repeat(64))).toBeNull();
    sessionStorage.setItem(INSPECTION_WORKSPACE_DRAFT_KEY, JSON.stringify({ schemaVersion: 1, accountBinding: binding, draft: { ...draft, specification: { code: "bad code", version: 0 } } }));
    expect(restoreInspectionWorkspaceDraft(binding)).toBeNull();
  });

  it("clears only the ordinary workspace draft", () => {
    saveInspectionWorkspaceDraft(draft, binding);
    sessionStorage.setItem(INSPECTION_RECOVERY_STORAGE_KEY, "unresolved-submission");
    clearInspectionWorkspaceDraft();
    expect(sessionStorage.getItem(INSPECTION_WORKSPACE_DRAFT_KEY)).toBeNull();
    expect(sessionStorage.getItem(INSPECTION_RECOVERY_STORAGE_KEY)).toBe("unresolved-submission");
  });
});
