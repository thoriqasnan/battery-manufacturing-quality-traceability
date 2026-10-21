import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  discoverInspectionSpecifications,
  getInspectionSpecificationDetail,
  InspectionApiError,
  isInspectionSubmissionRequest,
  isInspectionSubmissionResponse,
  submitInspection,
  type InspectionSubmissionRequest,
} from "./inspection-entry";

const summary = {
  code: "QC_VOLTAGE",
  version: 1,
  name: "Pack voltage",
  resultType: "NUMERIC",
  targetUnitType: "PACK",
  process: { code: "EOL_TEST", name: "End of line test" },
  routeStep: null,
  createdAt: "2026-10-08T01:00:00.000Z",
  updatedAt: "2026-10-08T01:00:00.000Z",
} as const;

const detail = {
  code: summary.code,
  version: summary.version,
  name: summary.name,
  targetUnitType: summary.targetUnitType,
  process: summary.process,
  routeStep: summary.routeStep,
  createdAt: summary.createdAt,
  updatedAt: summary.updatedAt,
  description: null,
  configuration: { type: "NUMERIC", lowerBound: "10", upperBound: "15.5", unitCode: "V" },
} as const;

const request: InspectionSubmissionRequest = {
  traceCode: "PACK-DEMO-001",
  specification: { code: "QC_VOLTAGE", version: 1 },
  execution: null,
  inspectedAt: "2026-10-08T01:30:00.000Z",
  evidence: { type: "NUMERIC", value: "12.500000" },
};

const submissionResponse = {
  traceCode: "PACK-DEMO-001",
  specification: { code: "QC_VOLTAGE", version: 1 },
  processCode: "EOL_TEST",
  execution: null,
  attemptNumber: 1,
  inspectedAt: "2026-10-08T01:30:00.000Z",
  createdAt: "2026-10-08T01:31:00.000Z",
  evidence: { type: "NUMERIC", value: "12.5", unitCode: "V" },
  outcome: "PASS",
} as const;

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("inspection entry API contracts", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("constructs only approved discovery filters and preserves pagination and versions", async () => {
    fetchMock.mockResolvedValueOnce(response(200, {
      items: [summary, { ...summary, version: 2 }],
      page: { number: 2, size: 10, totalItems: 12, totalPages: 2 },
    }));
    const result = await discoverInspectionSpecifications({
      query: "voltage",
      resultType: "NUMERIC",
      targetUnitType: "PACK",
      processCode: "EOL_TEST",
      page: 2,
      pageSize: 10,
    });
    const url = fetchMock.mock.calls[0][0] as URL;
    expect(Object.fromEntries(url.searchParams)).toEqual({
      query: "voltage",
      resultType: "NUMERIC",
      targetUnitType: "PACK",
      processCode: "EOL_TEST",
      page: "2",
      pageSize: "10",
    });
    expect(result.page).toEqual({ number: 2, size: 10, totalItems: 12, totalPages: 2 });
    expect(result.items.map(({ version }) => version)).toEqual([1, 2]);
  });

  it("loads and validates exact-version detail", async () => {
    fetchMock.mockResolvedValueOnce(response(200, detail));
    await expect(getInspectionSpecificationDetail("QC_VOLTAGE", 1)).resolves.toEqual(detail);
    expect((fetchMock.mock.calls[0][0] as URL).pathname).toBe(
      "/inspection-specifications/discovery/QC_VOLTAGE/versions/1",
    );
  });

  it("rejects malformed successful discovery, detail, and submission bodies", async () => {
    fetchMock
      .mockResolvedValueOnce(response(200, { items: [{ ...summary, internalId: "secret" }], page: { number: 1, size: 25, totalItems: 1, totalPages: 1 } }))
      .mockResolvedValueOnce(response(200, { ...detail, lifecycle: "PUBLISHED" }))
      .mockResolvedValueOnce(response(201, { ...submissionResponse, inspectionId: "secret" }));
    await expect(discoverInspectionSpecifications()).rejects.toMatchObject({ kind: "malformed-response" });
    await expect(getInspectionSpecificationDetail("QC_VOLTAGE", 1)).rejects.toMatchObject({ kind: "malformed-response" });
    await expect(submitInspection(request, { csrfToken: "csrf", idempotencyKey: "0123456789abcdef" })).rejects.toMatchObject({ kind: "malformed-response" });
  });

  it("validates all five strict request evidence discriminators without non-TEXT outcomes", () => {
    const evidence = [
      { type: "NUMERIC", value: "0012.500000" },
      { type: "BOOLEAN", value: true },
      { type: "CATEGORICAL", optionCode: "ACCEPT" },
      { type: "VISUAL", optionCode: "CLEAR" },
      { type: "TEXT", value: "Inspector observation", outcome: "NG" },
    ] as const;
    evidence.forEach((value) => expect(isInspectionSubmissionRequest({ ...request, evidence: value })).toBe(true));
    expect(isInspectionSubmissionRequest({ ...request, evidence: { type: "NUMERIC", value: "12.5", outcome: "PASS" } })).toBe(false);
    expect(isInspectionSubmissionRequest({ ...request, evidence: { type: "BOOLEAN", value: true, outcome: "PASS" } })).toBe(false);
    expect(isInspectionSubmissionRequest({ ...request, evidence: { type: "CATEGORICAL", optionCode: "ACCEPT", outcome: "PASS" } })).toBe(false);
    expect(isInspectionSubmissionRequest({ ...request, evidence: { type: "VISUAL", optionCode: "CLEAR", outcome: "PASS" } })).toBe(false);
    expect(isInspectionSubmissionRequest({ ...request, evidence: { type: "NUMERIC", value: 12.5 } })).toBe(false);
  });

  it("preserves the numeric string, CSRF token, and caller-owned idempotency key", async () => {
    fetchMock.mockResolvedValueOnce(response(201, submissionResponse));
    await expect(submitInspection(request, {
      csrfToken: "csrf-in-memory",
      idempotencyKey: "CaseSensitive.Key:01",
    })).resolves.toEqual(submissionResponse);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Headers;
    expect(init).toMatchObject({ method: "POST", credentials: "include", cache: "no-store" });
    expect(headers.get("X-CSRF-Token")).toBe("csrf-in-memory");
    expect(headers.get("Idempotency-Key")).toBe("CaseSensitive.Key:01");
    expect(JSON.parse(init.body as string).evidence.value).toBe("12.500000");
  });

  it("accepts the five strict public response evidence variants", () => {
    const evidence = [
      { type: "NUMERIC", value: "12.5", unitCode: "V" },
      { type: "BOOLEAN", value: false },
      { type: "CATEGORICAL", optionCode: "ACCEPT" },
      { type: "VISUAL", optionCode: "CLEAR" },
      { type: "TEXT", value: "Observed scratch" },
    ];
    evidence.forEach((value) => expect(isInspectionSubmissionResponse({ ...submissionResponse, evidence: value })).toBe(true));
  });

  it("maps only approved public errors and invalidates the session on 401", async () => {
    const invalidate = vi.fn();
    fetchMock
      .mockResolvedValueOnce(response(409, { code: "IDEMPOTENCY_CONFLICT", message: "safe" }))
      .mockResolvedValueOnce(response(401, { code: "UNAUTHENTICATED" }))
      .mockResolvedValueOnce(response(500, { code: "PRISMA_P2002", sql: "private" }));
    await expect(submitInspection(request, { csrfToken: "csrf", idempotencyKey: "0123456789abcdef" })).rejects.toEqual(
      expect.objectContaining({ status: 409, code: "IDEMPOTENCY_CONFLICT", kind: "public" }),
    );
    await expect(submitInspection(request, { csrfToken: "csrf", idempotencyKey: "0123456789abcdef", onUnauthenticated: invalidate })).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    expect(invalidate).toHaveBeenCalledOnce();
    try {
      await submitInspection(request, { csrfToken: "csrf", idempotencyKey: "0123456789abcdef" });
    } catch (error) {
      expect(error).toBeInstanceOf(InspectionApiError);
      expect(error).toMatchObject({ status: 500, code: null });
      expect(String(error)).not.toContain("PRISMA");
      expect(String(error)).not.toContain("sql");
    }
  });

  it("distinguishes transport failure from a known backend failure", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    await expect(discoverInspectionSpecifications()).rejects.toMatchObject({ kind: "network", status: null, code: null });
  });
});
