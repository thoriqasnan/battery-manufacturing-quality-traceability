import type { InspectionEvidence, InspectionSpecificationDetail } from "./api/inspection-entry";

export type InspectionEvidenceDraft =
  | { type: "NUMERIC"; value: string }
  | { type: "BOOLEAN"; value: boolean | null }
  | { type: "CATEGORICAL" | "VISUAL"; optionCode: string }
  | { type: "TEXT"; value: string; outcome: "PASS" | "NG" | null };

export type EvidenceValidationCode = "REQUIRED" | "INVALID_DECIMAL" | "DECIMAL_OUT_OF_RANGE" | "INVALID_OPTION" | "TEXT_TOO_LONG" | "OUTCOME_REQUIRED" | "TYPE_MISMATCH";

export function emptyEvidence(configuration: InspectionSpecificationDetail["configuration"]): InspectionEvidenceDraft {
  switch (configuration.type) {
    case "NUMERIC": return { type: "NUMERIC", value: "" };
    case "BOOLEAN": return { type: "BOOLEAN", value: null };
    case "CATEGORICAL": return { type: "CATEGORICAL", optionCode: "" };
    case "VISUAL": return { type: "VISUAL", optionCode: "" };
    case "TEXT": return { type: "TEXT", value: "", outcome: null };
  }
}

export function validateDecimal(value: string): EvidenceValidationCode | null {
  if (!value) return "REQUIRED";
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(value)) return "INVALID_DECIMAL";
  const unsigned = value.replace(/^[+-]/, "");
  const [rawInteger, rawFraction = ""] = unsigned.split(".");
  const integer = rawInteger.replace(/^0+/, "");
  const fraction = rawFraction.replace(/0+$/, "");
  const integerDigits = integer.length;
  if (integerDigits > 12 || fraction.length > 6 || integerDigits + fraction.length > 18) return "DECIMAL_OUT_OF_RANGE";
  return null;
}

export function validateEvidence(
  draft: InspectionEvidenceDraft,
  configuration: InspectionSpecificationDetail["configuration"],
): { evidence: InspectionEvidence | null; errors: EvidenceValidationCode[] } {
  if (draft.type !== configuration.type) return { evidence: null, errors: ["TYPE_MISMATCH"] };
  switch (draft.type) {
    case "NUMERIC": {
      const error = validateDecimal(draft.value);
      return error ? { evidence: null, errors: [error] } : { evidence: { type: "NUMERIC", value: draft.value }, errors: [] };
    }
    case "BOOLEAN":
      return draft.value === null ? { evidence: null, errors: ["REQUIRED"] } : { evidence: { type: "BOOLEAN", value: draft.value }, errors: [] };
    case "CATEGORICAL":
    case "VISUAL": {
      const valid = configuration.type === draft.type && configuration.options.some(({ code }) => code === draft.optionCode);
      return valid ? { evidence: { type: draft.type, optionCode: draft.optionCode }, errors: [] } : { evidence: null, errors: [draft.optionCode ? "INVALID_OPTION" : "REQUIRED"] };
    }
    case "TEXT": {
      const value = draft.value.trim();
      const errors: EvidenceValidationCode[] = [];
      if (!value) errors.push("REQUIRED");
      else if (Array.from(value).length > 4_000) errors.push("TEXT_TOO_LONG");
      if (draft.outcome === null) errors.push("OUTCOME_REQUIRED");
      return errors.length ? { evidence: null, errors } : { evidence: { type: "TEXT", value, outcome: draft.outcome as "PASS" | "NG" }, errors: [] };
    }
  }
}

const LOCAL_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;
export function serializeLocalInspectionTimestamp(value: string): string | null {
  const match = LOCAL_TIMESTAMP.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "0"] = match;
  const parts = [year, month, day, hour, minute, second].map(Number);
  const [y, mo, d, h, mi, s] = parts;
  if (h > 23 || mi > 59 || s > 59) return null;
  const date = new Date(y, mo - 1, d, h, mi, s, 0);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d || date.getHours() !== h || date.getMinutes() !== mi || date.getSeconds() !== s) return null;
  return date.toISOString();
}
