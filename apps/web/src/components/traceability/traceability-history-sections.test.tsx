import { NextIntlClientProvider } from "next-intl";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import englishMessages from "../../../messages/en.json";
import indonesianMessages from "../../../messages/id.json";
import { TraceabilityHistorySections } from "./traceability-history-sections";
import { prepareTraceabilityDisclosureLocaleHandoff } from "@/lib/traceability-disclosure-state";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => <a href={String(href)} {...props}>{children}</a>,
}));

const traceCode = "PACK-DEMO-ALPHA-RETEST";
const processItem = {
  recordId: "exec_demo",
  process: { code: "DEMO_VERIFY", name: "Demo verification" },
  route: { code: "DEMO_ROUTE", version: 2, stepOrder: 4 },
  attemptNumber: 2,
  status: "COMPLETED",
  executionMethod: "HYBRID",
  startedAt: "2026-01-11T01:00:00.000Z",
  finishedAt: "2026-01-11T01:05:00.000Z",
};
const qualityItems = [
  quality("insp_num", "PASS", { type: "NUMERIC", value: "16", unitCode: "DEMO_UNIT" }),
  quality("insp_bool", "NG", { type: "BOOLEAN", value: false }),
  quality("insp_cat", "PASS", { type: "CATEGORICAL", optionCode: "READY", isAcceptable: true }),
  quality("insp_visual", "NG", { type: "VISUAL", optionCode: "DEMO_MARK", isAcceptable: false }),
  quality("insp_text", "PASS", { type: "TEXT", value: "Synthetic persisted note" }),
];
const ncItem = {
  code: "NC-DEMO-ESCALATED-001", status: "CLOSED", defectCategory: { code: "DEMO_VISUAL_NG", name: "Visual defect" }, description: "Persisted defect description",
  detectedAt: "2026-01-11T02:05:00.000Z", resolvedAt: "2026-01-11T03:00:00.000Z", closedAt: "2026-01-11T04:00:00.000Z",
  source: { inspectionRecordId: "insp_source", processExecutionRecordId: "exec_source" },
  abnormalCases: [{ code: "ABNORMAL-DEMO-001", reason: "Escalated evidence", openedAt: "2026-01-11T02:10:00.000Z", closedAt: "2026-01-11T03:50:00.000Z" }],
  actions: [
    { recordId: "act_escalate", actionType: "ESCALATION", abnormalCaseCode: "ABNORMAL-DEMO-001", note: "Escalated", occurredAt: "2026-01-11T02:20:00.000Z", resultingInspectionRecordId: null, relatedUnitTraceCode: null },
    { recordId: "act_replace", actionType: "REPLACEMENT", abnormalCaseCode: "ABNORMAL-DEMO-001", note: "Replaced component", occurredAt: "2026-01-11T02:30:00.000Z", resultingInspectionRecordId: "insp_result", relatedUnitTraceCode: "COMP-DEMO-BETA-01" },
    { recordId: "act_retest", actionType: "RETEST", abnormalCaseCode: null, note: "Retested", occurredAt: "2026-01-11T02:40:00.000Z", resultingInspectionRecordId: "insp_retest", relatedUnitTraceCode: null },
  ],
  verifications: [{ recordId: "ver_demo", inspectionRecordId: "insp_retest", actionRecordId: "act_retest", note: "Neutral verification note", verifiedAt: "2026-01-11T02:50:00.000Z" }],
  dispositions: [
    { recordId: "disp_return", dispositionType: "RETURN_IQC", note: "Returned", decidedAt: "2026-01-11T03:10:00.000Z" },
    { recordId: "disp_continue", dispositionType: "CONTINUE", note: "Continue recorded", decidedAt: "2026-01-11T03:20:00.000Z" },
  ],
  nestedPageInfo: {
    abnormalCases: { returnedCount: 1, totalCount: 1, isPartial: false }, actions: { returnedCount: 3, totalCount: 3, isPartial: false },
    verifications: { returnedCount: 1, totalCount: 1, isPartial: false }, dispositions: { returnedCount: 2, totalCount: 2, isPartial: false },
  },
} as const;

function quality(recordId: string, outcome: "PASS" | "NG", evidence: Record<string, unknown>) {
  return { recordId, specification: { code: `SPEC_${recordId.toUpperCase()}`, version: 1 }, processCode: "DEMO_VERIFY", processExecutionRecordId: "exec_demo", resultType: evidence.type, attemptNumber: 1, outcome, inspectedAt: "2026-01-11T02:00:00.000Z", evidence };
}

function page(items: unknown[], number = 1, totalPages = 1, size = 25) {
  return { items, page: { number, size, totalItems: totalPages === 0 ? 0 : Math.max(items.length, totalPages * size), totalPages } };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function renderSections(locale = "en", onUnauthenticated = vi.fn(), selectedTraceCode = traceCode) {
  const messages = locale === "id" ? indonesianMessages : englishMessages;
  return { onUnauthenticated, ...render(<div dir={locale === "ar" ? "rtl" : "ltr"}><NextIntlClientProvider locale={locale} messages={messages}><TraceabilityHistorySections traceCode={selectedTraceCode} locale={locale} onUnauthenticated={onUnauthenticated} /></NextIntlClientProvider></div>) };
}

function historyFetch(processBody: unknown = page([processItem]), qualityBody: unknown = page(qualityItems), ncBody: unknown = page([], 1, 0, 10)) {
  return vi.fn((input: URL | RequestInfo) => {
    const url = input instanceof URL ? input : new URL(String(input));
    return Promise.resolve(json(200, url.pathname.endsWith("/process-history") ? processBody : url.pathname.endsWith("/quality-history") ? qualityBody : ncBody));
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("Phase 4H-5 process and quality history UI", () => {
  it("loads both sections independently and renders persisted process/typed quality evidence", async () => {
    vi.stubGlobal("fetch", historyFetch());
    renderSections();
    expect(screen.getByText("Loading directly recorded process history…")).toBeVisible();
    expect(screen.getByText("Loading directly recorded quality history…")).toBeVisible();
    const process = await screen.findByRole("heading", { name: "Demo verification" });
    const processCard = process.closest("article")!;
    expect(within(processCard).getByText("DEMO_VERIFY")).toHaveAttribute("dir", "ltr");
    expect(within(processCard).getByText("Completed")).toHaveClass("text-slate-700");
    expect(within(processCard).queryByText("PASS")).not.toBeInTheDocument();
    expect(within(processCard).getByText("DEMO_ROUTE")).toBeVisible();
    expect(await screen.findByText("16")).toBeVisible();
    expect(screen.getByText("DEMO_UNIT")).toBeVisible();
    expect(screen.getByText("False")).toBeVisible();
    expect(screen.getByText("READY")).toBeVisible();
    expect(screen.getByText("Acceptable")).toBeVisible();
    expect(screen.getByText("DEMO_MARK")).toBeVisible();
    expect(screen.getByText("Not acceptable")).toBeVisible();
    expect(screen.getByText("Synthetic persisted note")).toBeVisible();
    expect(screen.getAllByText("PASS").length).toBeGreaterThan(0);
    expect(screen.getAllByText("NG").length).toBeGreaterThan(0);
  });

  it("renders truthful direct-unit empty states without zero-result pagination", async () => {
    vi.stubGlobal("fetch", historyFetch(page([], 1, 0), page([], 1, 0)));
    renderSections();
    expect(await screen.findByText("No process execution evidence is recorded directly for this unit.")).toBeVisible();
    expect(screen.getByText("No quality inspection evidence is recorded directly for this unit.")).toBeVisible();
    expect(screen.queryByText("Page 1 of 0")).not.toBeInTheDocument();
    expect(screen.queryByText(/parent/i)).not.toBeInTheDocument();
  });

  it("renders a process record with nullable route and finish context without inventing evidence", async () => {
    vi.stubGlobal("fetch", historyFetch(page([{ ...processItem, route: null, finishedAt: null }]), page([], 1, 0)));
    renderSections();
    const process = await screen.findByRole("heading", { name: "Demo verification" });
    const processCard = process.closest("article")!;
    expect(within(processCard).queryByText("Route context")).not.toBeInTheDocument();
    expect(within(processCard).getByText("Not recorded")).toBeVisible();
    expect(within(processCard).queryByText("PASS")).not.toBeInTheDocument();
  });

  it("paginates each section independently with correct boundary states", async () => {
    const mock = vi.fn((input: URL | RequestInfo) => {
      const url = input instanceof URL ? input : new URL(String(input));
      const number = Number(url.searchParams.get("page") ?? "1");
      if (url.pathname.endsWith("/nonconformances")) return Promise.resolve(json(200, page([], 1, 0, 10)));
      return Promise.resolve(json(200, page(url.pathname.endsWith("/process-history") ? [processItem] : [qualityItems[0]], number, 2)));
    });
    vi.stubGlobal("fetch", mock);
    renderSections();
    const processNav = await screen.findByRole("navigation", { name: "Manufacturing history pages" });
    const qualityNav = await screen.findByRole("navigation", { name: "Quality history pages" });
    expect(within(processNav).getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(within(qualityNav).getByRole("button", { name: "Previous" })).toBeDisabled();
    await userEvent.click(within(processNav).getByRole("button", { name: "Next" }));
    await screen.findByText("Page 2 of 2");
    expect(within(await screen.findByRole("navigation", { name: "Manufacturing history pages" })).getByRole("button", { name: "Next" })).toBeDisabled();
    const historyUrls = mock.mock.calls.map(([input]) => input as URL);
    expect(historyUrls.filter((url) => url.pathname.endsWith("/process-history")).at(-1)?.searchParams.get("page")).toBe("2");
    expect(historyUrls.filter((url) => url.pathname.endsWith("/quality-history")).at(-1)?.searchParams.get("page")).toBeNull();
  });

  it("maps All/PASS/NG filters only to quality and resets its page", async () => {
    const mock = historyFetch(page([processItem]), page([qualityItems[0]], 1, 2));
    vi.stubGlobal("fetch", mock);
    renderSections();
    const qualityNav = await screen.findByRole("navigation", { name: "Quality history pages" });
    await userEvent.click(within(qualityNav).getByRole("button", { name: "Next" }));
    await userEvent.click(screen.getByRole("button", { name: "NG" }));
    await vi.waitFor(() => {
      const qualityUrls = mock.mock.calls.map(([input]) => input as URL).filter((url) => url.pathname.endsWith("/quality-history"));
      expect(qualityUrls.at(-1)?.searchParams.get("outcome")).toBe("NG");
      expect(qualityUrls.at(-1)?.searchParams.get("page")).toBeNull();
    });
    const processUrls = mock.mock.calls.map(([input]) => input as URL).filter((url) => url.pathname.endsWith("/process-history"));
    expect(processUrls).toHaveLength(1);
    expect(screen.getByRole("button", { name: "NG" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows filter-specific empty copy", async () => {
    vi.stubGlobal("fetch", historyFetch(page([processItem]), page([], 1, 0)));
    renderSections();
    await userEvent.click(await screen.findByRole("button", { name: "NG" }));
    expect(await screen.findByText("No directly recorded inspections match the selected NG filter.")).toBeVisible();
  });

  it("keeps successful quality visible when process fails and retries only process", async () => {
    let processAttempts = 0;
    const mock = vi.fn((input: URL | RequestInfo) => {
      const url = input instanceof URL ? input : new URL(String(input));
      if (url.pathname.endsWith("/process-history")) {
        processAttempts += 1;
        return Promise.resolve(processAttempts === 1 ? json(503, {}) : json(200, page([processItem])));
      }
      if (url.pathname.endsWith("/nonconformances")) return Promise.resolve(json(200, page([], 1, 0, 10)));
      return Promise.resolve(json(200, page([qualityItems[0]])));
    });
    vi.stubGlobal("fetch", mock);
    renderSections();
    expect(await screen.findByText("History is temporarily unavailable")).toBeVisible();
    expect(screen.getByText("SPEC_INSP_NUM")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Demo verification" })).toBeVisible();
    expect(mock.mock.calls.filter(([input]) => (input as URL).pathname.endsWith("/quality-history"))).toHaveLength(1);
  });

  it("keeps successful process visible when quality fails and handles integrity safely", async () => {
    vi.stubGlobal("fetch", vi.fn((input: URL | RequestInfo) => {
      const url = input instanceof URL ? input : new URL(String(input));
      if (url.pathname.endsWith("/process-history")) return Promise.resolve(json(200, page([processItem])));
      if (url.pathname.endsWith("/nonconformances")) return Promise.resolve(json(200, page([], 1, 0, 10)));
      return Promise.resolve(json(500, { code: "TRACEABILITY_HISTORY_INTEGRITY_ERROR" }));
    }));
    renderSections();
    expect(await screen.findByRole("heading", { name: "Demo verification" })).toBeVisible();
    expect(screen.getByText("Stored history could not be displayed safely.")).toBeVisible();
    expect(screen.queryByText("TRACEABILITY_HISTORY_INTEGRITY_ERROR")).not.toBeInTheDocument();
    expect(screen.queryByText("No quality inspection evidence is recorded directly for this unit.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("retries only Quality History after a section-level request failure", async () => {
    let qualityAttempts = 0;
    const mock = vi.fn((input: URL | RequestInfo) => {
      const url = input instanceof URL ? input : new URL(String(input));
      if (url.pathname.endsWith("/quality-history")) {
        qualityAttempts += 1;
        return Promise.resolve(qualityAttempts === 1 ? json(503, {}) : json(200, page([qualityItems[0]])));
      }
      if (url.pathname.endsWith("/nonconformances")) return Promise.resolve(json(200, page([], 1, 0, 10)));
      return Promise.resolve(json(200, page([processItem])));
    });
    vi.stubGlobal("fetch", mock);
    renderSections();
    expect(await screen.findByRole("heading", { name: "Demo verification" })).toBeVisible();
    expect(screen.getByText("History is temporarily unavailable")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("SPEC_INSP_NUM")).toBeVisible();
    expect(mock.mock.calls.filter(([input]) => (input as URL).pathname.endsWith("/process-history"))).toHaveLength(1);
  });

  it("uses Indonesian copy and stable LTR technical values under RTL fallback", async () => {
    vi.stubGlobal("fetch", historyFetch());
    const { unmount } = renderSections("id");
    expect(await screen.findByRole("heading", { name: "Riwayat manufaktur" })).toBeVisible();
    expect(screen.getByText("Riwayat kualitas")).toBeVisible();
    unmount();
    renderSections("ar");
    expect(await screen.findByRole("heading", { name: "Manufacturing history" })).toBeVisible();
    expect(screen.getAllByText("DEMO_VERIFY")[0]).toHaveAttribute("dir", "ltr");
    expect(screen.getByText("SPEC_INSP_NUM")).toHaveAttribute("dir", "ltr");
  });
});

describe("Phase 4H-6 nonconformance history UI", () => {
  it("preserves the exact native disclosure combination across locale remounts and isolates it by unit and NC", async () => {
    vi.stubGlobal("fetch", historyFetch(undefined, undefined, page([ncItem], 1, 1, 10)));
    const english = renderSections();
    const card = (await screen.findByRole("heading", { name: ncItem.code })).closest("article")!;
    const abnormalCases = within(card).getByText("Abnormal cases (1)").closest("details")!;
    const actionsSummary = within(card).getByText("Actions (3)");
    const actions = actionsSummary.closest("details")!;
    const verifications = within(card).getByText("Verifications (1)").closest("details")!;
    const dispositions = within(card).getByText("Dispositions (2)").closest("details")!;

    expect(actionsSummary.tagName).toBe("SUMMARY");
    expect(abnormalCases).not.toHaveAttribute("open");
    expect(verifications).not.toHaveAttribute("open");
    actionsSummary.focus();
    expect(fireEvent.keyDown(actionsSummary, { key: "Enter" })).toBe(true);
    await userEvent.click(actionsSummary);
    expect(actions).toHaveAttribute("open");
    await userEvent.click(within(card).getByText("Dispositions (2)"));
    expect(actions).toHaveAttribute("open");
    expect(dispositions).toHaveAttribute("open");

    prepareTraceabilityDisclosureLocaleHandoff();
    english.unmount();
    const indonesian = renderSections("id");
    const indonesianCard = (await screen.findByRole("heading", { name: ncItem.code })).closest("article")!;
    expect(within(indonesianCard).getByText("Kasus abnormal (1)").closest("details")).not.toHaveAttribute("open");
    expect(within(indonesianCard).getByText("Tindakan (3)").closest("details")).toHaveAttribute("open");
    expect(within(indonesianCard).getByText("Verifikasi (1)").closest("details")).not.toHaveAttribute("open");
    expect(within(indonesianCard).getByText("Disposisi (2)").closest("details")).toHaveAttribute("open");

    await userEvent.click(within(indonesianCard).getByText("Tindakan (3)"));
    expect(within(indonesianCard).getByText("Tindakan (3)").closest("details")).not.toHaveAttribute("open");
    prepareTraceabilityDisclosureLocaleHandoff();
    indonesian.unmount();
    const arabic = renderSections("ar");
    const arabicCard = (await screen.findByRole("heading", { name: ncItem.code })).closest("article")!;
    expect(within(arabicCard).getByText("Actions (3)").closest("details")).not.toHaveAttribute("open");
    expect(within(arabicCard).getByText("Dispositions (2)").closest("details")).toHaveAttribute("open");

    prepareTraceabilityDisclosureLocaleHandoff();
    arabic.unmount();
    const otherUnit = renderSections("ar", vi.fn(), "PACK-DEMO-OTHER");
    const otherUnitCard = (await screen.findByRole("heading", { name: ncItem.code })).closest("article")!;
    expect(within(otherUnitCard).getByText("Dispositions (2)").closest("details")).not.toHaveAttribute("open");
    otherUnit.unmount();

    const otherNc = { ...ncItem, code: "NC-DEMO-OTHER-001" };
    vi.stubGlobal("fetch", historyFetch(undefined, undefined, page([otherNc], 1, 1, 10)));
    const otherNonconformance = renderSections("ar");
    const otherNcCard = (await screen.findByRole("heading", { name: otherNc.code })).closest("article")!;
    expect(within(otherNcCard).getByText("Dispositions (2)").closest("details")).not.toHaveAttribute("open");
    otherNonconformance.unmount();

    vi.stubGlobal("fetch", historyFetch(undefined, undefined, page([ncItem], 1, 1, 10)));
    renderSections("ar");
    const restoredCard = (await screen.findByRole("heading", { name: ncItem.code })).closest("article")!;
    expect(within(restoredCard).getByText("Actions (3)").closest("details")).not.toHaveAttribute("open");
    expect(within(restoredCard).getByText("Dispositions (2)").closest("details")).toHaveAttribute("open");
  });

  it("loads and renders separate persisted NC evidence without fabricating verification outcomes", async () => {
    vi.stubGlobal("fetch", historyFetch(undefined, undefined, page([ncItem], 1, 1, 10)));
    renderSections();
    expect(screen.getByText("Loading directly recorded nonconformance history…")).toBeVisible();
    const heading = await screen.findByRole("heading", { name: ncItem.code });
    const card = heading.closest("article")!;
    expect(within(card).getByText("Current status: Closed")).not.toHaveClass("text-emerald-900");
    expect(within(card).getByText("Visual defect")).toBeVisible();
    expect(within(card).getByText("DEMO_VISUAL_NG")).toHaveAttribute("dir", "ltr");
    expect(within(card).getByText("Persisted defect description")).toBeVisible();
    expect(within(card).getByText("insp_source")).toHaveAttribute("dir", "ltr");
    expect(within(card).getByText("exec_source")).toHaveAttribute("dir", "ltr");
    await userEvent.click(within(card).getByText("Abnormal cases (1)"));
    await userEvent.click(within(card).getByText("Actions (3)"));
    await userEvent.click(within(card).getByText("Verifications (1)"));
    await userEvent.click(within(card).getByText("Dispositions (2)"));
    expect(within(card).getAllByText("ABNORMAL-DEMO-001")[0]).toHaveAttribute("dir", "ltr");
    expect(within(card).getByText("Escalation")).toBeVisible();
    expect(within(card).getByText("Replacement")).toBeVisible();
    expect(within(card).getByText("Retest")).toBeVisible();
    expect(within(card).getByText("Neutral verification note")).toBeVisible();
    expect(within(card).queryByText("PASS")).not.toBeInTheDocument();
    expect(within(card).queryByText("NG", { exact: true })).not.toBeInTheDocument();
    expect(within(card).getByText("Return to IQC")).toBeVisible();
    expect(within(card).getByText("Continue")).toBeVisible();
    expect(within(card).getByRole("link", { name: "View related traceable unit COMP-DEMO-BETA-01" })).toHaveAttribute("href", "/traceability/COMP-DEMO-BETA-01");
  });

  it("keeps populated Process and Quality visible when NC fails and retries only NC", async () => {
    let nonconformanceAttempts = 0;
    const mock = vi.fn((input: URL | RequestInfo) => {
      const url = input instanceof URL ? input : new URL(String(input));
      if (url.pathname.endsWith("/process-history")) return Promise.resolve(json(200, page([processItem])));
      if (url.pathname.endsWith("/quality-history")) return Promise.resolve(json(200, page([qualityItems[0]])));
      nonconformanceAttempts += 1;
      return Promise.resolve(nonconformanceAttempts === 1
        ? json(503, {})
        : json(200, page([ncItem], 1, 1, 10)));
    });
    vi.stubGlobal("fetch", mock);
    renderSections();

    expect(await screen.findByRole("heading", { name: "Demo verification" })).toBeVisible();
    expect(screen.getByText("SPEC_INSP_NUM")).toBeVisible();
    const ncSection = screen.getByRole("heading", { name: "Nonconformance history" }).closest("section")!;
    expect(within(ncSection).getByText("History is temporarily unavailable")).toBeVisible();
    expect(within(ncSection).queryByText("No nonconformance evidence is recorded directly for this unit.")).not.toBeInTheDocument();

    await userEvent.click(within(ncSection).getByRole("button", { name: "Try again" }));
    expect(await within(ncSection).findByRole("heading", { name: ncItem.code })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Demo verification" })).toBeVisible();
    expect(screen.getByText("SPEC_INSP_NUM")).toBeVisible();
    expect(mock.mock.calls.filter(([input]) => (input as URL).pathname.endsWith("/process-history"))).toHaveLength(1);
    expect(mock.mock.calls.filter(([input]) => (input as URL).pathname.endsWith("/quality-history"))).toHaveLength(1);
    expect(mock.mock.calls.filter(([input]) => (input as URL).pathname.endsWith("/nonconformances"))).toHaveLength(2);
  });

  it("keeps NC integrity failure explicit and safe while populated siblings remain visible", async () => {
    vi.stubGlobal("fetch", vi.fn((input: URL | RequestInfo) => {
      const url = input instanceof URL ? input : new URL(String(input));
      if (url.pathname.endsWith("/process-history")) return Promise.resolve(json(200, page([processItem])));
      if (url.pathname.endsWith("/quality-history")) return Promise.resolve(json(200, page([qualityItems[0]])));
      return Promise.resolve(json(500, {
        code: "TRACEABILITY_HISTORY_INTEGRITY_ERROR",
        message: "Unsafe internal Prisma detail must not be shown.",
      }));
    }));
    renderSections();

    expect(await screen.findByRole("heading", { name: "Demo verification" })).toBeVisible();
    expect(screen.getByText("SPEC_INSP_NUM")).toBeVisible();
    const ncSection = screen.getByRole("heading", { name: "Nonconformance history" }).closest("section")!;
    expect(within(ncSection).getByText("Stored history could not be displayed safely.")).toBeVisible();
    expect(within(ncSection).queryByText("No nonconformance evidence is recorded directly for this unit.")).not.toBeInTheDocument();
    expect(within(ncSection).queryByText("No directly recorded nonconformances match the selected status.")).not.toBeInTheDocument();
    expect(screen.queryByText("TRACEABILITY_HISTORY_INTEGRITY_ERROR")).not.toBeInTheDocument();
    expect(screen.queryByText("Unsafe internal Prisma detail must not be shown.")).not.toBeInTheDocument();
  });

  it.each(["process", "quality"] as const)("keeps populated NC and the successful sibling visible when %s fails", async (failedHistory) => {
    vi.stubGlobal("fetch", vi.fn((input: URL | RequestInfo) => {
      const url = input instanceof URL ? input : new URL(String(input));
      if (url.pathname.endsWith("/process-history")) {
        return Promise.resolve(failedHistory === "process" ? json(503, {}) : json(200, page([processItem])));
      }
      if (url.pathname.endsWith("/quality-history")) {
        return Promise.resolve(failedHistory === "quality" ? json(503, {}) : json(200, page([qualityItems[0]])));
      }
      return Promise.resolve(json(200, page([ncItem], 1, 1, 10)));
    }));
    renderSections();

    expect(await screen.findByRole("heading", { name: ncItem.code })).toBeVisible();
    const failedTitle = failedHistory === "process" ? "Manufacturing history" : "Quality history";
    const failedSection = screen.getByRole("heading", { name: failedTitle }).closest("section")!;
    expect(within(failedSection).getByText("History is temporarily unavailable")).toBeVisible();
    if (failedHistory === "process") {
      expect(screen.getByText("SPEC_INSP_NUM")).toBeVisible();
    } else {
      expect(screen.getByRole("heading", { name: "Demo verification" })).toBeVisible();
    }
    const ncSection = screen.getByRole("heading", { name: "Nonconformance history" }).closest("section")!;
    expect(within(ncSection).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("maps every lifecycle filter, resets NC page, and does not affect sibling requests", async () => {
    const mock = vi.fn((input: URL | RequestInfo) => {
      const url = input instanceof URL ? input : new URL(String(input));
      if (url.pathname.endsWith("/nonconformances")) return Promise.resolve(json(200, page([ncItem], Number(url.searchParams.get("page") ?? 1), 2, 10)));
      return Promise.resolve(json(200, page(url.pathname.endsWith("/process-history") ? [processItem] : [qualityItems[0]])));
    });
    vi.stubGlobal("fetch", mock);
    renderSections();
    const nav = await screen.findByRole("navigation", { name: "Nonconformance history pages" });
    expect(within(nav).getByRole("button", { name: "Previous" })).toBeDisabled();
    await userEvent.click(within(nav).getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Page 2 of 2")).toBeVisible();
    expect(within(await screen.findByRole("navigation", { name: "Nonconformance history pages" })).getByRole("button", { name: "Next" })).toBeDisabled();
    const ncSection = screen.getByRole("heading", { name: "Nonconformance history" }).closest("section")!;
    for (const [label, status] of [["Open", "OPEN"], ["In progress", "IN_PROGRESS"], ["Resolved", "RESOLVED"], ["Closed", "CLOSED"], ["All", null]] as const) {
      await userEvent.click(within(ncSection).getByRole("button", { name: label }));
      await vi.waitFor(() => {
        const url = mock.mock.calls.map(([input]) => input as URL).filter((value) => value.pathname.endsWith("/nonconformances")).at(-1)!;
        expect(url.searchParams.get("status")).toBe(status);
        expect(url.searchParams.get("page")).toBeNull();
        expect(url.searchParams.get("pageSize")).toBeNull();
      });
    }
    expect(mock.mock.calls.filter(([input]) => (input as URL).pathname.endsWith("/process-history"))).toHaveLength(1);
    expect(mock.mock.calls.filter(([input]) => (input as URL).pathname.endsWith("/quality-history"))).toHaveLength(1);
  });

  it("renders direct-unit empty states and bounded nested metadata without fake continuation", async () => {
    const partial = { ...ncItem, actions: ncItem.actions.slice(0, 1), nestedPageInfo: { ...ncItem.nestedPageInfo, actions: { returnedCount: 1, totalCount: 125, isPartial: true } } };
    vi.stubGlobal("fetch", historyFetch(undefined, undefined, page([partial], 1, 1, 10)));
    const { unmount } = renderSections();
    const heading = await screen.findByRole("heading", { name: ncItem.code });
    await userEvent.click(within(heading.closest("article")!).getByText("Actions (1)"));
    expect(screen.getByText("1 of 125 records shown.", { exact: false })).toBeVisible();
    expect(screen.getByText(/Only a bounded portion/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
    unmount();
    vi.stubGlobal("fetch", historyFetch(undefined, undefined, page([], 1, 0, 10)));
    renderSections();
    expect(await screen.findByText("No nonconformance evidence is recorded directly for this unit.")).toBeVisible();
    expect(screen.queryByText("Page 1 of 0")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(await screen.findByText("No directly recorded nonconformances match the selected status.")).toBeVisible();
  });
});
