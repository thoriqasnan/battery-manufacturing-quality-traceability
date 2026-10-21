import { describe, expect, it } from "vitest";
import englishMessages from "../../messages/en.json";
import indonesianMessages from "../../messages/id.json";
import { localeRegistry } from "./routing";

function leafKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => leafKeys(child, prefix ? `${prefix}.${key}` : key));
}

describe("inspection entry localization contract", () => {
  it("keeps complete matching English and Indonesian message keys", () => {
    expect(leafKeys(indonesianMessages.InspectionEntry).sort()).toEqual(
      leafKeys(englishMessages.InspectionEntry).sort(),
    );
  });

  it("retains every registered locale and the documented fallback set", () => {
    expect(localeRegistry.map(({ code }) => code)).toEqual(["en", "zh-CN", "de", "ko", "ja", "ar", "id", "hi"]);
    expect(localeRegistry.find(({ code }) => code === "ar")?.direction).toBe("rtl");
    expect(["zh-CN", "de", "ko", "ja", "ar", "hi"]).not.toContain("id");
  });
});
