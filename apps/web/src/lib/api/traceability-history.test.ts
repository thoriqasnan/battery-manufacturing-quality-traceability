import { afterEach, describe, expect, it, vi } from "vitest";
import { TraceabilityApiError } from "./traceability";
import {
  fetchNonconformanceHistory,
  fetchProcessHistory,
  fetchQualityHistory,
  type QualityEvidence,
} from "./traceability-history";

const page = { number: 1, size: 25, totalItems: 1, totalPages: 1 };
const emptyPage = (size: number) => ({ items: [], page: { number: 1, size, totalItems: 0, totalPages: 0 } });
const processItem = {
  recordId: "exec_public-reference",
  process: { code: "DEMO_ASSEMBLY", name: "Demo Assembly" },
  route: { code: "DEMO_ROUTE", version: 1, stepOrder: 2 },
  attemptNumber: 1,
  status: "COMPLETED",
  executionMethod: "AUTOMATED",
  startedAt: "2026-01-11T01:00:00.000Z",
  finishedAt: "2026-01-11T01:05:00.000Z",
};

function qualityItem(evidence: QualityEvidence, outcome: "PASS" | "NG" = "PASS") {
  return {
    recordId: "insp_public-reference",
    specification: { code: "DEMO_SPEC", version: 1 },
    processCode: "DEMO_VERIFY",
    processExecutionRecordId: "exec_public-reference",
    resultType: evidence.type,
    attemptNumber: 1,
    outcome,
    inspectedAt: "2026-01-11T02:00:00.000Z",
    evidence,
  };
}

const ncItem = {
  code: "NC-DEMO-001",
  status: "CLOSED",
  defectCategory: { code: "DEMO_DEFECT", name: "Demo Defect" },
  description: null,
  detectedAt: "2026-01-11T03:00:00.000Z",
  resolvedAt: "2026-01-11T04:00:00.000Z",
  closedAt: "2026-01-11T05:00:00.000Z",
  source: { inspectionRecordId: "insp_public-reference", processExecutionRecordId: "exec_public-reference" },
  abnormalCases: [{ code: "AB-DEMO-1", reason: null, openedAt: "2026-01-11T03:10:00.000Z", closedAt: null }],
  actions: [{ recordId: "act_public-reference", actionType: "RETEST", abnormalCaseCode: "AB-DEMO-1", note: null, occurredAt: "2026-01-11T03:20:00.000Z", resultingInspectionRecordId: "insp_result-reference", relatedUnitTraceCode: "COMP-DEMO-01" }],
  verifications: [{ recordId: "ver_public-reference", inspectionRecordId: "insp_result-reference", actionRecordId: "act_public-reference", note: null, verifiedAt: "2026-01-11T04:10:00.000Z" }],
  dispositions: [{ recordId: "disp_public-reference", dispositionType: "CONTINUE", note: null, decidedAt: "2026-01-11T04:20:00.000Z" }],
  nestedPageInfo: {
    abnormalCases: { returnedCount: 1, totalCount: 1, isPartial: false },
    actions: { returnedCount: 1, totalCount: 1, isPartial: false },
    verifications: { returnedCount: 1, totalCount: 1, isPartial: false },
    dispositions: { returnedCount: 1, totalCount: 1, isPartial: false },
  },
};

function response(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  });
}

function successful(body: unknown) {
  const mock = vi.fn().mockResolvedValue(response(200, body));
  vi.stubGlobal("fetch", mock);
  return mock;
}

async function rejectsUnexpected(operation: () => Promise<unknown>) {
  await expect(operation()).rejects.toMatchObject({ name: "TraceabilityApiError", kind: "unexpected" });
}

afterEach(() => vi.unstubAllGlobals());

describe("traceability history process client", () => {
  it("accepts valid and empty bounded pages", async () => {
    successful({ items: [processItem], page });
    await expect(fetchProcessHistory("PACK-DEMO")).resolves.toMatchObject({ items: [processItem] });
    successful(emptyPage(25));
    await expect(fetchProcessHistory("PACK-DEMO")).resolves.toEqual(emptyPage(25));
  });

  it.each([
    [{ ...processItem, status: "PASS" }],
    [{ ...processItem, executionMethod: "ROBOT" }],
    [{ ...processItem, route: { code: "R", version: null, stepOrder: 1 } }],
    [{ ...processItem, finishedAt: 42 }],
  ])("rejects malformed process evidence %#", async (item) => {
    successful({ items: [item], page });
    await rejectsUnexpected(() => fetchProcessHistory("PACK-DEMO"));
  });

  it("rejects malformed pagination and unexpected structures", async () => {
    successful({ items: [processItem], page: { ...page, totalPages: 0 } });
    await rejectsUnexpected(() => fetchProcessHistory("PACK-DEMO"));
    successful({ records: [processItem] });
    await rejectsUnexpected(() => fetchProcessHistory("PACK-DEMO"));
    successful({ items: [{ ...processItem, id: "raw-internal-id" }], page });
    await rejectsUnexpected(() => fetchProcessHistory("PACK-DEMO"));
  });
});

describe("traceability history quality client", () => {
  it.each([
    [{ type: "NUMERIC", value: "16.25", unitCode: "DEMO_UNIT" } as const, "PASS" as const],
    [{ type: "BOOLEAN", value: true } as const, "PASS" as const],
    [{ type: "CATEGORICAL", optionCode: "READY", isAcceptable: true } as const, "PASS" as const],
    [{ type: "VISUAL", optionCode: "DEMO_MARK", isAcceptable: false } as const, "NG" as const],
    [{ type: "TEXT", value: "Persisted demo observation" } as const, "PASS" as const],
  ])("accepts %s evidence with %s outcome", async (evidence, outcome) => {
    successful({ items: [qualityItem(evidence, outcome)], page });
    await expect(fetchQualityHistory("PACK-DEMO")).resolves.toMatchObject({ items: [{ evidence, outcome }] });
  });

  it.each([
    ["unknown outcome", { ...qualityItem({ type: "BOOLEAN", value: true }), outcome: "UNKNOWN" }],
    ["unknown result type", { ...qualityItem({ type: "BOOLEAN", value: true }), resultType: "BINARY" }],
    ["missing Boolean", { ...qualityItem({ type: "BOOLEAN", value: true }), evidence: { type: "BOOLEAN" } }],
    ["wrong discriminator", { ...qualityItem({ type: "BOOLEAN", value: true }), evidence: { type: "NUMERIC", value: "1", unitCode: null } }],
    ["malformed numeric", qualityItem({ type: "NUMERIC", value: "NaN", unitCode: null })],
    ["blank text", qualityItem({ type: "TEXT", value: "  " })],
    ["malformed option", qualityItem({ type: "VISUAL", optionCode: "", isAcceptable: false })],
    ["extra incompatible value", { ...qualityItem({ type: "BOOLEAN", value: true }), evidence: { type: "BOOLEAN", value: true, numericValue: "1" } }],
  ])("rejects %s", async (_case, item) => {
    successful({ items: [item], page });
    await rejectsUnexpected(() => fetchQualityHistory("PACK-DEMO"));
  });
});

describe("traceability history nonconformance client", () => {
  it("accepts empty and nested aggregate pages", async () => {
    successful(emptyPage(10));
    await expect(fetchNonconformanceHistory("PACK-DEMO")).resolves.toEqual(emptyPage(10));
    successful({ items: [ncItem], page: { ...page, size: 10 } });
    await expect(fetchNonconformanceHistory("PACK-DEMO")).resolves.toMatchObject({ items: [{ code: "NC-DEMO-001" }] });
  });

  it.each([
    ["lifecycle", { ...ncItem, status: "PASS" }],
    ["source reference", { ...ncItem, source: { ...ncItem.source, inspectionRecordId: "raw-uuid" } }],
    ["returned count", { ...ncItem, nestedPageInfo: { ...ncItem.nestedPageInfo, actions: { returnedCount: 0, totalCount: 1, isPartial: true } } }],
    ["total count", { ...ncItem, nestedPageInfo: { ...ncItem.nestedPageInfo, actions: { returnedCount: 1, totalCount: 0, isPartial: false } } }],
    ["partial flag", { ...ncItem, nestedPageInfo: { ...ncItem.nestedPageInfo, actions: { returnedCount: 1, totalCount: 2, isPartial: false } } }],
  ])("rejects malformed NC %s", async (_case, item) => {
    successful({ items: [item], page: { ...page, size: 10 } });
    await rejectsUnexpected(() => fetchNonconformanceHistory("PACK-DEMO"));
  });
});

describe("traceability history request and error behavior", () => {
  it("constructs bounded encoded URLs and forwards authenticated fetch options", async () => {
    const controller = new AbortController();
    const mock = successful(emptyPage(5));
    await fetchProcessHistory("PACK/DEMO", { page: 2, pageSize: 5 }, controller.signal);
    const [url, options] = mock.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/traceability/PACK%2FDEMO/process-history");
    expect(url.search).toBe("?page=2&pageSize=5");
    expect(options).toMatchObject({ method: "GET", credentials: "include", cache: "no-store", signal: controller.signal });
  });

  it("adds approved filters and omits defaults/optional filters", async () => {
    const mock = successful(emptyPage(25));
    await fetchQualityHistory("PACK-DEMO", { outcome: "NG" });
    expect((mock.mock.calls[0][0] as URL).search).toBe("?outcome=NG");
    successful(emptyPage(10));
    const ncMock = vi.mocked(fetch);
    await fetchNonconformanceHistory("PACK-DEMO", { status: "IN_PROGRESS" });
    expect((ncMock.mock.calls[0][0] as URL).search).toBe("?status=IN_PROGRESS");
  });

  it("rejects invalid frontend bounds before fetching", async () => {
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);
    await expect(fetchProcessHistory("PACK-DEMO", { page: 0 })).rejects.toMatchObject({ kind: "invalid", code: "INVALID_REQUEST" });
    await expect(fetchNonconformanceHistory("PACK-DEMO", { pageSize: 51 })).rejects.toMatchObject({ kind: "invalid" });
    expect(mock).not.toHaveBeenCalled();
  });

  it("normalizes non-2xx errors and preserves the integrity code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(500, { code: "TRACEABILITY_HISTORY_INTEGRITY_ERROR" })));
    await expect(fetchQualityHistory("PACK-DEMO")).rejects.toMatchObject({
      name: "TraceabilityApiError", kind: "server", code: "TRACEABILITY_HISTORY_INTEGRITY_ERROR",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(404, { code: "TRACE_UNIT_NOT_FOUND" })));
    await expect(fetchProcessHistory("PACK-DEMO")).rejects.toMatchObject({ kind: "notFound", code: "TRACE_UNIT_NOT_FOUND" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(500, { code: "INTERNAL_DATABASE_DETAIL" })));
    const error = await fetchProcessHistory("PACK-DEMO").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TraceabilityApiError);
    expect(error).toMatchObject({ kind: "server" });
    expect(error).not.toHaveProperty("code", "INTERNAL_DATABASE_DETAIL");
  });

  it("treats malformed 200 JSON as unexpected and aborts as the existing network kind", async () => {
    successful({ items: [], page: "bad" });
    await rejectsUnexpected(() => fetchProcessHistory("PACK-DEMO"));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError")));
    await expect(fetchProcessHistory("PACK-DEMO", {}, new AbortController().signal)).rejects.toEqual(new TraceabilityApiError("network"));
  });
});
