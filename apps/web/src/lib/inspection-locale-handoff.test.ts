import { beforeEach, describe, expect, it } from "vitest";
import { consumeInspectionLocaleHandoff, prepareInspectionLocaleHandoff, registerInspectionLocaleHandoffProvider, type InspectionDraftHandoff } from "./inspection-locale-handoff";

const draft: InspectionDraftHandoff = {
  accountBinding: "a".repeat(64),
  traceCode: "PACK-DEMO-001",
  specification: { code: "QC_TEXT", version: 2 },
  execution: { processCode: "EOL_TEST", attempt: 3 },
  evidence: { type: "TEXT", value: "Unsent observation", outcome: "NG" },
  inspectedAtLocal: "2026-01-11T15:30:00",
  reviewed: true,
};

describe("inspection locale handoff", () => {
  beforeEach(() => consumeInspectionLocaleHandoff(draft.accountBinding));

  it("captures one transient public draft and restores it only once", () => {
    const unregister = registerInspectionLocaleHandoffProvider(() => draft);
    prepareInspectionLocaleHandoff();
    unregister();
    expect(consumeInspectionLocaleHandoff(draft.accountBinding)).toEqual(draft);
    expect(consumeInspectionLocaleHandoff(draft.accountBinding)).toBeNull();
  });

  it("rejects a different authenticated account without exposing recovery state", () => {
    registerInspectionLocaleHandoffProvider(() => draft);
    prepareInspectionLocaleHandoff();
    expect(consumeInspectionLocaleHandoff("b".repeat(64))).toBeNull();
    expect(consumeInspectionLocaleHandoff(draft.accountBinding)).toBeNull();
  });

  it("does not read or overwrite uncertain-submission recovery", () => {
    sessionStorage.setItem("bmqt.inspection-entry.recovery.v1", "durable-uncertain-recovery");
    registerInspectionLocaleHandoffProvider(() => draft);
    prepareInspectionLocaleHandoff();
    consumeInspectionLocaleHandoff(draft.accountBinding);
    expect(sessionStorage.getItem("bmqt.inspection-entry.recovery.v1")).toBe("durable-uncertain-recovery");
  });
});
