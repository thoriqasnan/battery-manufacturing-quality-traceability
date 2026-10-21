import { describe, expect, it } from "vitest";
import type { InspectionSpecificationDetail } from "./api/inspection-entry";
import { emptyEvidence, serializeLocalInspectionTimestamp, validateDecimal, validateEvidence } from "./inspection-evidence";

const config = <T extends InspectionSpecificationDetail["configuration"]>(configuration: T) => configuration;

describe("inspection evidence validation", () => {
  it("preserves valid exact decimal strings and rejects grammar, empty, scale, and precision failures", () => {
    const numeric = config({ type: "NUMERIC", lowerBound: "0", upperBound: "20", unitCode: "V" });
    expect(validateEvidence({ type: "NUMERIC", value: "+0012.500000" }, numeric)).toEqual({ evidence: { type: "NUMERIC", value: "+0012.500000" }, errors: [] });
    expect(validateDecimal("")).toBe("REQUIRED");
    expect(validateDecimal("1e2")).toBe("INVALID_DECIMAL");
    expect(validateDecimal("1.0000001")).toBe("DECIMAL_OUT_OF_RANGE");
    expect(validateDecimal("1234567890123")).toBe("DECIMAL_OUT_OF_RANGE");
  });

  it("requires an explicit Boolean and exact-version configured options", () => {
    expect(validateEvidence({ type: "BOOLEAN", value: null }, config({ type: "BOOLEAN", expectedValue: true })).errors).toEqual(["REQUIRED"]);
    expect(validateEvidence({ type: "BOOLEAN", value: false }, config({ type: "BOOLEAN", expectedValue: true })).evidence).toEqual({ type: "BOOLEAN", value: false });
    const options = config({ type: "CATEGORICAL", options: [{ code: "PASSABLE", description: null, isAcceptable: true }] });
    expect(validateEvidence({ type: "CATEGORICAL", optionCode: "PASSABLE" }, options).evidence).toEqual({ type: "CATEGORICAL", optionCode: "PASSABLE" });
    expect(validateEvidence({ type: "CATEGORICAL", optionCode: "OTHER" }, options).errors).toEqual(["INVALID_OPTION"]);
  });

  it("trims TEXT by Unicode rules, requires outcome, and counts code points", () => {
    const text = config({ type: "TEXT" });
    expect(validateEvidence({ type: "TEXT", value: "  visual note  ", outcome: "NG" }, text).evidence).toEqual({ type: "TEXT", value: "visual note", outcome: "NG" });
    expect(validateEvidence({ type: "TEXT", value: "  ", outcome: null }, text).errors).toEqual(["REQUIRED", "OUTCOME_REQUIRED"]);
    expect(validateEvidence({ type: "TEXT", value: "😀".repeat(4_000), outcome: "PASS" }, text).errors).toEqual([]);
    expect(validateEvidence({ type: "TEXT", value: "😀".repeat(4_001), outcome: "PASS" }, text).errors).toEqual(["TEXT_TOO_LONG"]);
  });

  it("creates an unselected draft for every discriminator", () => {
    expect(emptyEvidence(config({ type: "BOOLEAN", expectedValue: false }))).toEqual({ type: "BOOLEAN", value: null });
    expect(emptyEvidence(config({ type: "VISUAL", options: [] }))).toEqual({ type: "VISUAL", optionCode: "" });
  });
});

describe("inspection occurrence timestamp", () => {
  it("validates local calendar fields and serializes with an explicit UTC timezone", () => {
    const expected = new Date(2026, 0, 11, 15, 30, 45).toISOString();
    expect(serializeLocalInspectionTimestamp("2026-01-11T15:30:45")).toBe(expected);
    expect(serializeLocalInspectionTimestamp("2026-01-11 15:30:45")).toBe(expected);
    expect(serializeLocalInspectionTimestamp("2026-02-30T10:00")).toBeNull();
    expect(serializeLocalInspectionTimestamp("2026-01-11")).toBeNull();
    expect(expected.endsWith("Z")).toBe(true);
  });
});
