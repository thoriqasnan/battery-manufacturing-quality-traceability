import type { ComponentProps } from "react";
import { NextIntlClientProvider } from "next-intl";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import englishMessages from "../../../messages/en.json";
import indonesianMessages from "../../../messages/id.json";
import { TraceabilityDetail } from "./traceability-detail";

const { push, replace } = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
let currentSearch = "";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: ComponentProps<"a">) => <a href={String(href)} {...props}>{children}</a>,
  useRouter: () => ({ push, replace }),
}));

const baseUnit = {
  traceCode: "PACK-DEMO-ALPHA-PASS",
  unitType: "PACK",
  productModel: { code: "DEMO_ALPHA", name: "Demo Alpha Product" },
  createdAt: "2026-09-23T01:00:00.000Z",
  updatedAt: "2026-09-24T02:00:00.000Z",
} as const;

function detailResponse(unit: Record<string, unknown> = baseUnit) {
  return {
    unit,
    sections: {
      genealogy: { hasRecords: true, directRelationCount: 2 },
      processHistory: { hasRecords: true, recordCount: 4 },
      qualityHistory: { hasRecords: true, recordCount: 3 },
      nonconformance: { hasRecords: false, recordCount: 0 },
    },
  };
}

const root = {
  traceCode: baseUnit.traceCode,
  unitType: "PACK",
  directParentCount: 1,
  directChildCount: 1,
  selected: true,
} as const;

function genealogyResponse(direction: "ancestors" | "descendants", overrides: Record<string, unknown> = {}) {
  const related = direction === "ancestors"
    ? { traceCode: "PACK-DEMO-PARENT", unitType: "PACK", directParentCount: 0, directChildCount: 1, selected: false }
    : { traceCode: "MODULE-DEMO-ALPHA-01", unitType: "MODULE", directParentCount: 1, directChildCount: 2, selected: false };
  const edge = {
    relationId: `rel_${direction}`,
    depth: 1,
    parent: direction === "ancestors" ? related : root,
    child: direction === "ancestors" ? root : related,
    positionCode: direction === "descendants" ? "MODULE-01" : null,
    installedAt: "2026-09-23T03:00:00.000Z",
    removedAt: null,
    relationshipState: "CURRENT",
  };
  return {
    root,
    direction,
    scope: { mode: "current", at: null },
    edges: [edge],
    pageInfo: { hasNextPage: false, endCursor: null, returnedEdgeCount: 1, requestedDepth: direction === "ancestors" ? 8 : 1, reachedDepth: 1, isPartial: false, partialReasons: [] },
    integrityWarnings: [],
    ...overrides,
  };
}

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  });
}

function successfulFetch(detail = detailResponse()) {
  return vi.fn((input: URL | RequestInfo) => {
    const url = input instanceof URL ? input : new URL(String(input));
    if (url.pathname.endsWith("/process-history") || url.pathname.endsWith("/quality-history") || url.pathname.endsWith("/nonconformances")) {
      const size = url.pathname.endsWith("/nonconformances") ? 10 : 25;
      return Promise.resolve(json(200, { items: [], page: { number: 1, size, totalItems: 0, totalPages: 0 } }));
    }
    if (url.pathname.endsWith("/genealogy")) {
      const direction = url.searchParams.get("direction") as "ancestors" | "descendants";
      return Promise.resolve(json(200, genealogyResponse(direction)));
    }
    return Promise.resolve(json(200, detail));
  });
}

function renderDetail(rawTraceCode: string = baseUnit.traceCode, locale = "en", onUnauthenticated = vi.fn()) {
  return {
    onUnauthenticated,
    ...render(
      <div data-testid="locale-root" dir={locale === "ar" ? "rtl" : "ltr"}>
        <NextIntlClientProvider locale={locale} messages={locale === "id" ? indonesianMessages : englishMessages}>
          <TraceabilityDetail rawTraceCode={rawTraceCode} onUnauthenticated={onUnauthenticated} />
        </NextIntlClientProvider>
      </div>,
    ),
  };
}

describe("traceability unit detail and genealogy", () => {
  beforeEach(() => {
    currentSearch = "";
    push.mockReset();
    replace.mockReset();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("renders persisted PACK identity, direct model, counts, current parent and child evidence", async () => {
    const fetchMock = successfulFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderDetail();
    expect(screen.getByRole("status")).toHaveTextContent("Loading persisted unit identity");
    expect(await screen.findByRole("heading", { name: baseUnit.traceCode })).toBeVisible();
    expect(screen.getByText("DEMO_ALPHA", { selector: "bdi" })).toHaveAttribute("dir", "ltr");
    expect(screen.getByText("4")).toBeVisible();
    expect(screen.getByText("3")).toBeVisible();
    expect(await screen.findByRole("link", { name: "PACK-DEMO-PARENT" })).toHaveAttribute("href", "/traceability/PACK-DEMO-PARENT");
    expect(await screen.findByRole("link", { name: "MODULE-DEMO-ALPHA-01" })).toHaveAttribute("href", "/traceability/MODULE-DEMO-ALPHA-01");
    expect(screen.getByText("MODULE-01", { selector: "bdi" })).toHaveAttribute("dir", "ltr");
    expect(screen.queryByText("Overall status")).not.toBeInTheDocument();
    const genealogyUrls = fetchMock.mock.calls.map(([input]) => input as URL).filter((url) => url.pathname.endsWith("/genealogy"));
    expect(genealogyUrls.find((url) => url.searchParams.get("direction") === "ancestors")?.searchParams.get("depth")).toBe("8");
    expect(genealogyUrls.find((url) => url.searchParams.get("direction") === "descendants")?.searchParams.get("depth")).toBe("1");
  });

  it.each(["process", "quality"] as const)("keeps genealogy, identity, and the sibling section visible when %s history fails", async (failedHistory) => {
    vi.stubGlobal("fetch", vi.fn((input: URL | RequestInfo) => {
      const url = input instanceof URL ? input : new URL(String(input));
      if (url.pathname.endsWith(`/${failedHistory}-history`)) return Promise.resolve(json(503));
      if (url.pathname.endsWith("/process-history")) {
        return Promise.resolve(json(200, { items: [], page: { number: 1, size: 25, totalItems: 0, totalPages: 0 } }));
      }
      if (url.pathname.endsWith("/quality-history")) {
        return Promise.resolve(json(200, { items: [], page: { number: 1, size: 25, totalItems: 0, totalPages: 0 } }));
      }
      if (url.pathname.endsWith("/genealogy")) {
        return Promise.resolve(json(200, genealogyResponse(url.searchParams.get("direction") as "ancestors" | "descendants")));
      }
      return Promise.resolve(json(200, detailResponse()));
    }));
    renderDetail();
    expect(await screen.findByRole("heading", { name: baseUnit.traceCode })).toBeVisible();
    expect(await screen.findByRole("link", { name: "MODULE-DEMO-ALPHA-01" })).toBeVisible();
    expect(screen.getByText("History is temporarily unavailable")).toBeVisible();
    expect(screen.getByText(failedHistory === "process"
      ? "No quality inspection evidence is recorded directly for this unit."
      : "No process execution evidence is recorded directly for this unit.")).toBeVisible();
  });

  it.each(["MODULE", "CELL", "COMPONENT", "MATERIAL"] as const)("renders %s identity with no inferred product model", async (unitType) => {
    vi.stubGlobal("fetch", successfulFetch(detailResponse({ ...baseUnit, traceCode: `${unitType}-DEMO-01`, unitType, productModel: null })));
    renderDetail(`${unitType}-DEMO-01`);
    expect(await screen.findByRole("heading", { name: `${unitType}-DEMO-01` })).toBeVisible();
    expect(screen.getByText("Not directly assigned")).toBeVisible();
  });

  it("canonicalizes a valid mixed-case route and rejects invalid grammar without an API request", async () => {
    const fetchMock = successfulFetch();
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = renderDetail("Pack-Demo-Alpha-Pass");
    await screen.findByRole("heading", { name: baseUnit.traceCode });
    expect(replace).toHaveBeenCalledWith(`/traceability/${baseUnit.traceCode}`);
    unmount();
    fetchMock.mockClear();
    renderDetail("PACK.BAD");
    expect(screen.getByRole("heading", { name: "The trace code is invalid" })).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [404, "Traceable unit not found"],
    [403, "Unit detail access is not available"],
  ] as const)("renders the non-retryable %s detail state", async (status, heading) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(status)));
    renderDetail();
    expect(await screen.findByRole("heading", { name: heading })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("invalidates the existing session on a detail 401", async () => {
    const onUnauthenticated = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(401)));
    renderDetail(baseUnit.traceCode, "en", onUnauthenticated);
    await vi.waitFor(() => expect(onUnauthenticated).toHaveBeenCalledOnce());
  });

  it("recovers a failed detail request and rejects malformed successful responses", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(503))
      .mockResolvedValueOnce(json(200, detailResponse()))
      .mockImplementation((input: URL) => input.pathname.endsWith("/genealogy")
        ? Promise.resolve(json(200, genealogyResponse(input.searchParams.get("direction") as "ancestors" | "descendants")))
        : Promise.resolve(json(200, { items: [], page: { number: 1, size: 25, totalItems: 0, totalPages: 0 } })));
    vi.stubGlobal("fetch", fetchMock);
    renderDetail();
    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: baseUnit.traceCode })).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  it.each([
    ["network", () => Promise.reject(new Error("offline")), "Unable to reach traceability"],
    ["unexpected", () => Promise.resolve(json(200, { unit: { traceCode: baseUnit.traceCode } })), "Unexpected unit detail response"],
  ] as const)("renders a recoverable %s detail state", async (_case, result, heading) => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(result));
    renderDetail();
    expect(await screen.findByRole("heading", { name: heading })).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("does not request genealogy until a valid as-of time exists, then constructs the bounded request", async () => {
    currentSearch = "scope=asOf";
    const fetchMock = successfulFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderDetail();
    await screen.findByRole("heading", { name: baseUnit.traceCode });
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a complete date and time as DD/MM/YYYY, HH:mm");
    expect(screen.getByRole("alert")).not.toHaveTextContent("YYYY-MM-DD HH:mm");
    expect(fetchMock.mock.calls.filter(([input]) => (input as URL).pathname.endsWith("/genealogy"))).toHaveLength(0);
    const yearSegment = screen.getByRole("textbox", { name: "Year" });
    const monthSegment = screen.getByRole("textbox", { name: "Month" });
    const daySegment = screen.getByRole("textbox", { name: "Day" });
    const hourSegment = screen.getByRole("textbox", { name: "Hour" });
    const minuteSegment = screen.getByRole("textbox", { name: "Minute" });
    [yearSegment, monthSegment, daySegment, hourSegment, minuteSegment].forEach((segment) => {
      expect(segment).toHaveAttribute("type", "text");
      expect(segment).toHaveAttribute("inputmode", "numeric");
      expect(segment).not.toHaveAttribute("type", "datetime-local");
    });
    await userEvent.type(yearSegment, "2026");
    await userEvent.type(monthSegment, "02");
    await userEvent.type(daySegment, "04");
    await userEvent.type(hourSegment, "10");
    await userEvent.type(minuteSegment, "30");
    await userEvent.click(screen.getByRole("button", { name: "Choose date and time" }));
    expect(screen.getByRole("combobox", { name: "Year" })).toHaveValue("2026");
    expect(screen.getByRole("combobox", { name: "Month" })).toHaveValue("2");
    expect(screen.getByRole("combobox", { name: "Day" })).toHaveValue("4");
    expect(screen.getByLabelText("Time")).toHaveValue("10:30");
    await userEvent.click(screen.getByRole("button", { name: "Apply time" }));
    const pushed = push.mock.calls[0][0] as string;
    expect(pushed).toMatch(/^\/traceability\/PACK-DEMO-ALPHA-PASS\?scope=asOf&at=/);
    expect(decodeURIComponent(pushed)).toContain("2026-02-04T");
    expect(push.mock.calls[0][1]).toEqual({ scroll: false });
  });

  it.each([
    ["", "historical", "/traceability/PACK-DEMO-ALPHA-PASS?scope=historical"],
    ["scope=historical", "asOf", "/traceability/PACK-DEMO-ALPHA-PASS?scope=asOf"],
    ["scope=asOf&at=2026-01-11T03%3A00%3A00.000Z", "current", "/traceability/PACK-DEMO-ALPHA-PASS"],
  ])("preserves viewport and push-history semantics when changing scope from %s", async (search, nextScope, expectedHref) => {
    currentSearch = search;
    vi.stubGlobal("fetch", successfulFetch());
    renderDetail();
    await screen.findByRole("heading", { name: baseUnit.traceCode });
    await userEvent.selectOptions(screen.getByLabelText("Genealogy scope"), nextScope);
    expect(push).toHaveBeenCalledWith(expectedHref, { scroll: false });
  });

  it("offers an application-controlled year/month/day/time chooser synchronized with manual input", async () => {
    currentSearch = "scope=asOf";
    const fetchMock = successfulFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderDetail();
    await screen.findByRole("heading", { name: baseUnit.traceCode });
    const chooser = screen.getByRole("button", { name: "Choose date and time" });
    expect(chooser).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(chooser);
    expect(chooser).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("group", { name: "Choose date and time" })).toBeVisible();
    const year = screen.getByRole("combobox", { name: "Year" });
    expect(year).toHaveFocus();
    await userEvent.selectOptions(year, "2026");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Month" }), "1");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Day" }), "11");
    const time = screen.getByLabelText("Time");
    await userEvent.clear(time);
    await userEvent.type(time, "10:30");
    expect(screen.getByRole("textbox", { name: "Year" })).toHaveValue("2026");
    expect(screen.getByRole("textbox", { name: "Month" })).toHaveValue("01");
    expect(screen.getByRole("textbox", { name: "Day" })).toHaveValue("11");
    expect(screen.getByRole("textbox", { name: "Hour" })).toHaveValue("10");
    expect(screen.getByRole("textbox", { name: "Minute" })).toHaveValue("30");
    const pickerControls = [
      screen.getByRole("combobox", { name: "Year" }),
      screen.getByRole("combobox", { name: "Month" }),
      screen.getByRole("combobox", { name: "Day" }),
      time,
    ];
    pickerControls.forEach((control) => expect(control).toHaveClass("h-11", "min-h-11", "max-h-11", "box-border", "rounded-lg", "text-sm"));
    expect(pickerControls.every((control) => control.className === pickerControls[0].className)).toBe(true);
    expect(screen.getByRole("button", { name: "Apply time" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Apply time" }));
    expect(decodeURIComponent(push.mock.calls.at(-1)?.[0] as string)).toContain("scope=asOf&at=2026-01-11T");
    expect(fetchMock.mock.calls.filter(([input]) => (input as URL).pathname.endsWith("/genealogy"))).toHaveLength(0);
  });

  it("edits each manual segment independently and clamps impossible calendar combinations", async () => {
    currentSearch = "scope=asOf&at=2026-01-31T03%3A45%3A00.000Z";
    vi.stubGlobal("fetch", successfulFetch());
    renderDetail();
    await screen.findByRole("heading", { name: baseUnit.traceCode });
    const dateTimeGroup = screen.getByRole("group", { name: "Selected date and time" });
    expect(dateTimeGroup).toHaveAttribute("dir", "ltr");
    expect(document.querySelector('input[type="datetime-local"]')).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Selected date and time" })).not.toBeInTheDocument();

    const year = screen.getByRole("textbox", { name: "Year" });
    const month = screen.getByRole("textbox", { name: "Month" });
    const day = screen.getByRole("textbox", { name: "Day" });
    const hour = screen.getByRole("textbox", { name: "Hour" });
    const minute = screen.getByRole("textbox", { name: "Minute" });
    expect(within(dateTimeGroup).getAllByRole("textbox").map((segment) => segment.getAttribute("aria-label"))).toEqual(["Day", "Month", "Year", "Hour", "Minute"]);
    expect(dateTimeGroup.textContent).toBe("//,:");
    [day, month, hour, minute].forEach((segment) => expect(segment).toHaveClass("w-[3.5ch]"));
    expect(day).toHaveClass("rounded-sm", "border", "border-transparent", "px-0.5", "py-0", "leading-5", "focus:border-blue-500", "focus:bg-blue-50", "focus:text-slate-950");
    expect(day).not.toHaveClass("h-7", "h-10", "min-h-7", "max-h-7", "focus:bg-blue-600", "focus:text-white", "focus:ring-2");
    expect(year).toHaveClass("w-[5ch]");
    expect(day).not.toHaveClass("rounded-md", "focus:ring-2");
    await userEvent.clear(year);
    await userEvent.type(year, "2027");
    expect(year).toHaveValue("2027");
    await userEvent.clear(month);
    await userEvent.type(month, "02");
    expect(month).toHaveValue("02");
    expect(day).toHaveValue("28");
    await userEvent.clear(day);
    await userEvent.type(day, "14");
    await userEvent.clear(hour);
    await userEvent.type(hour, "09");
    await userEvent.clear(minute);
    await userEvent.type(minute, "05");
    expect(day).toHaveValue("14");
    expect(hour).toHaveValue("09");
    expect(minute).toHaveValue("05");

    await userEvent.click(screen.getByRole("button", { name: "Choose date and time" }));
    expect(screen.getByRole("combobox", { name: "Year" })).toHaveValue("2027");
    expect(screen.getByRole("combobox", { name: "Month" })).toHaveValue("2");
    expect(screen.getByRole("combobox", { name: "Day" })).toHaveValue("14");
    expect(screen.getByLabelText("Time")).toHaveValue("09:05");
  });

  it("auto-advances through valid completed segments without trapping the final segment", async () => {
    currentSearch = "scope=asOf";
    vi.stubGlobal("fetch", successfulFetch());
    renderDetail();
    await screen.findByRole("heading", { name: baseUnit.traceCode });
    const day = screen.getByRole("textbox", { name: "Day" });
    const month = screen.getByRole("textbox", { name: "Month" });
    const year = screen.getByRole("textbox", { name: "Year" });
    const hour = screen.getByRole("textbox", { name: "Hour" });
    const minute = screen.getByRole("textbox", { name: "Minute" });

    await userEvent.click(day);
    await userEvent.keyboard("2");
    expect(day).toHaveFocus();
    await userEvent.keyboard("5");
    expect(month).toHaveFocus();
    await userEvent.keyboard("12");
    expect(year).toHaveFocus();
    await userEvent.keyboard("2026");
    expect(hour).toHaveFocus();
    await userEvent.keyboard("10");
    expect(minute).toHaveFocus();
    await userEvent.keyboard("30");
    expect(minute).toHaveFocus();

    expect(day).toHaveValue("25");
    expect(month).toHaveValue("12");
    expect(year).toHaveValue("2026");
    expect(hour).toHaveValue("10");
    expect(minute).toHaveValue("30");
    await userEvent.click(screen.getByRole("button", { name: "Apply time" }));
    expect(decodeURIComponent(push.mock.calls.at(-1)?.[0] as string)).toContain("scope=asOf&at=2026-12-25T");
    expect(push.mock.calls.at(-1)?.[1]).toEqual({ scroll: false });
  });

  it("does not auto-advance incomplete or invalid segments and retains direct and Tab navigation", async () => {
    currentSearch = "scope=asOf";
    vi.stubGlobal("fetch", successfulFetch());
    renderDetail();
    await screen.findByRole("heading", { name: baseUnit.traceCode });
    const day = screen.getByRole("textbox", { name: "Day" });
    const month = screen.getByRole("textbox", { name: "Month" });

    await userEvent.click(day);
    await userEvent.keyboard("9");
    expect(day).toHaveFocus();
    await userEvent.keyboard("9");
    expect(day).toHaveValue("31");
    expect(day).toHaveFocus();
    await userEvent.click(month);
    expect(month).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(day).toHaveFocus();
    await userEvent.tab();
    expect(month).toHaveFocus();
  });

  it("keeps invalid as-of input blocked from genealogy requests", async () => {
    currentSearch = "scope=asOf";
    const fetchMock = successfulFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderDetail();
    await screen.findByRole("heading", { name: baseUnit.traceCode });
    const dateTimeGroup = screen.getByRole("group", { name: "Selected date and time" });
    expect(dateTimeGroup).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Year" })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Apply time" })).toBeDisabled();
    await userEvent.type(screen.getByRole("textbox", { name: "Year" }), "2026");
    await userEvent.type(screen.getByRole("textbox", { name: "Month" }), "01");
    expect(screen.getByRole("textbox", { name: "Day" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "Apply time" })).toBeDisabled();
    expect(fetchMock.mock.calls.filter(([input]) => (input as URL).pathname.endsWith("/genealogy"))).toHaveLength(0);
  });

  it("normalizes and submits a lightweight search through the existing Traceability query route", async () => {
    vi.stubGlobal("fetch", successfulFetch());
    const { unmount } = renderDetail();
    const input = await screen.findByRole("textbox", { name: "Trace code" });
    await userEvent.type(input, "Pack-Demo-Alpha-Retest");
    expect(input).toHaveValue("PACK-DEMO-ALPHA-RETEST");
    expect(input).toHaveAttribute("dir", "ltr");
    await userEvent.click(screen.getByRole("button", { name: "Search units" }));
    expect(push).toHaveBeenCalledWith("/traceability?query=PACK-DEMO-ALPHA-RETEST");
    unmount();

    push.mockClear();
    vi.stubGlobal("fetch", successfulFetch());
    renderDetail();
    const invalidInput = await screen.findByRole("textbox", { name: "Trace code" });
    await userEvent.type(invalidInput, "PACK.BAD");
    await userEvent.click(screen.getByRole("button", { name: "Search units" }));
    expect(screen.getByRole("alert")).toHaveTextContent("1–128 letters");
    expect(push).not.toHaveBeenCalled();
  });

  it("keeps Quick Search stacked through lg and preserves its accepted wide-layout typography", async () => {
    vi.stubGlobal("fetch", successfulFetch());
    renderDetail();
    const title = await screen.findByRole("heading", { name: "Search another traceable unit" });
    const layout = title.closest("section")!.firstElementChild as HTMLElement;
    expect(title).toHaveClass("text-xl", "sm:text-2xl", "leading-tight");
    const description = screen.getByText("Start a new trace-code search without leaving the traceability workflow.");
    expect(description).toHaveClass("text-sm", "sm:text-base");
    expect(description).not.toHaveClass("max-w-lg");
    expect(description).not.toHaveClass("whitespace-nowrap");
    expect(layout).toHaveClass("flex-col", "xl:flex-row", "xl:items-end", "xl:justify-between");
    expect(layout).not.toHaveClass("lg:flex-row", "lg:items-end", "lg:justify-between");
    expect(description.parentElement).toHaveClass("min-w-0", "xl:max-w-md", "xl:flex-1");
    expect(description.parentElement).not.toHaveClass("lg:max-w-md", "lg:flex-1");
    const input = screen.getByRole("textbox", { name: "Trace code" });
    const form = input.closest("form")!;
    expect(form).toHaveClass("flex-col", "sm:flex-row", "xl:w-[36rem]");
    expect(form).not.toHaveClass("lg:w-[36rem]");
    expect(input).toHaveClass("min-h-11", "w-full");
    expect(screen.getByRole("button", { name: "Search units" })).toHaveClass("min-h-11");
  });

  it("renders historical removed evidence without implying simultaneous activity", async () => {
    currentSearch = "scope=historical";
    const fetchMock = vi.fn((input: URL) => {
      const url = input instanceof URL ? input : new URL(String(input));
      if (!url.pathname.endsWith("/genealogy")) return Promise.resolve(json(200, detailResponse()));
      const direction = url.searchParams.get("direction") as "ancestors" | "descendants";
      const base = genealogyResponse(direction);
      const historicalEdge = { ...base.edges[0], removedAt: "2026-02-05T00:00:00.000Z", relationshipState: "HISTORICAL" };
      return Promise.resolve(json(200, { ...base, scope: { mode: "historical", at: null }, edges: [historicalEdge], pageInfo: { ...base.pageInfo, requestedDepth: Number(url.searchParams.get("depth")) } }));
    });
    vi.stubGlobal("fetch", fetchMock);
    renderDetail();
    expect((await screen.findAllByText("Removed / historical"))[0]).toBeVisible();
    expect(screen.getByText(/do not imply that every relationship was active/)).toBeVisible();
    expect(screen.getAllByText("Removed")[0]).toBeVisible();
    const genealogyUrls = fetchMock.mock.calls.map(([input]) => input as URL).filter((url) => url.pathname.endsWith("/genealogy"));
    expect(genealogyUrls.every((url) => url.searchParams.get("scope") === "historical")).toBe(true);
  });

  it("describes as-of evidence that was active then and removed later", async () => {
    currentSearch = "scope=asOf&at=2026-02-04T00%3A00%3A00.000Z";
    const fetchMock = vi.fn((input: URL) => {
      const url = input instanceof URL ? input : new URL(String(input));
      if (!url.pathname.endsWith("/genealogy")) return Promise.resolve(json(200, detailResponse()));
      const direction = url.searchParams.get("direction") as "ancestors" | "descendants";
      const base = genealogyResponse(direction);
      return Promise.resolve(json(200, { ...base, scope: { mode: "asOf", at: "2026-02-04T00:00:00.000Z" }, edges: [{ ...base.edges[0], removedAt: "2026-02-05T00:00:00.000Z", relationshipState: "HISTORICAL" }] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    renderDetail();
    expect((await screen.findAllByText("Active then; subsequently removed"))[0]).toBeVisible();
    expect(screen.getAllByText("This relationship was active at the selected instant and was removed later.")[0]).toBeVisible();
    const genealogyUrl = fetchMock.mock.calls.map(([input]) => input as URL).find((url) => url.pathname.endsWith("/genealogy"));
    expect(genealogyUrl?.searchParams.get("at")).toBe("2026-02-04T00:00:00.000Z");
  });

  it("keeps a successful direction visible when the other fails and retries only that direction", async () => {
    let ancestorAttempts = 0;
    const fetchMock = vi.fn((input: URL) => {
      const url = input instanceof URL ? input : new URL(String(input));
      if (!url.pathname.endsWith("/genealogy")) return Promise.resolve(json(200, detailResponse()));
      const direction = url.searchParams.get("direction") as "ancestors" | "descendants";
      if (direction === "ancestors" && ancestorAttempts++ === 0) return Promise.resolve(json(503));
      return Promise.resolve(json(200, genealogyResponse(direction)));
    });
    vi.stubGlobal("fetch", fetchMock);
    renderDetail();
    expect(await screen.findByRole("link", { name: "MODULE-DEMO-ALPHA-01" })).toBeVisible();
    const ancestorSection = screen.getByRole("heading", { name: "Parent and ancestor context" }).closest("section") as HTMLElement;
    await userEvent.click(within(ancestorSection).getByRole("button", { name: "Try again" }));
    expect(await within(ancestorSection).findByRole("link", { name: "PACK-DEMO-PARENT" })).toBeVisible();
    expect(screen.getByRole("link", { name: "MODULE-DEMO-ALPHA-01" })).toBeVisible();
  });

  it("renders empty directions, partial notices, cycle warning, and appends cursor evidence", async () => {
    const fetchMock = vi.fn((input: URL) => {
      const url = input instanceof URL ? input : new URL(String(input));
      if (!url.pathname.endsWith("/genealogy")) return Promise.resolve(json(200, detailResponse()));
      const direction = url.searchParams.get("direction") as "ancestors" | "descendants";
      if (direction === "ancestors") return Promise.resolve(json(200, genealogyResponse(direction, { edges: [], pageInfo: { hasNextPage: false, endCursor: null, returnedEdgeCount: 0, requestedDepth: 8, reachedDepth: 0, isPartial: false, partialReasons: [] } })));
      if (url.searchParams.has("cursor")) {
        const next = genealogyResponse(direction);
        return Promise.resolve(json(200, { ...next, edges: [{ ...next.edges[0], relationId: "rel_second", child: { ...next.edges[0].child, traceCode: "MODULE-DEMO-ALPHA-02" } }] }));
      }
      return Promise.resolve(json(200, genealogyResponse(direction, {
        pageInfo: { hasNextPage: true, endCursor: "opaque-cursor", returnedEdgeCount: 1, requestedDepth: 1, reachedDepth: 1, isPartial: true, partialReasons: ["EDGE_LIMIT", "DEPTH_LIMIT", "CYCLE_PATH_SKIPPED"] },
        integrityWarnings: [{ code: "CYCLE_PATH_SKIPPED" }],
      })));
    });
    vi.stubGlobal("fetch", fetchMock);
    renderDetail();
    expect(await screen.findByText("No parent relationship evidence exists in the selected scope.")).toBeVisible();
    expect(screen.getByText("More relationships are available. Use Load more to continue.")).toBeVisible();
    expect(screen.getByText(/cyclic relationship path was detected/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Load more relationships" }));
    expect(await screen.findByRole("link", { name: "MODULE-DEMO-ALPHA-02" })).toBeVisible();
    expect(screen.getByRole("link", { name: "MODULE-DEMO-ALPHA-01" })).toBeVisible();
    const cursorUrl = fetchMock.mock.calls.map(([input]) => input as URL).find((url) => url.searchParams.get("cursor") === "opaque-cursor");
    expect(cursorUrl).toBeDefined();
  });

  it("renders a valid no-genealogy state without fabricating relationships", async () => {
    const noGenealogyDetail = detailResponse();
    noGenealogyDetail.sections.genealogy = { hasRecords: false, directRelationCount: 0 };
    const fetchMock = vi.fn((input: URL) => {
      const url = input instanceof URL ? input : new URL(String(input));
      if (!url.pathname.endsWith("/genealogy")) return Promise.resolve(json(200, noGenealogyDetail));
      const direction = url.searchParams.get("direction") as "ancestors" | "descendants";
      return Promise.resolve(json(200, genealogyResponse(direction, { edges: [], pageInfo: { hasNextPage: false, endCursor: null, returnedEdgeCount: 0, requestedDepth: direction === "ancestors" ? 8 : 1, reachedDepth: 0, isPartial: false, partialReasons: [] } })));
    });
    vi.stubGlobal("fetch", fetchMock);
    renderDetail();
    expect(await screen.findByText("No parent relationship evidence exists in the selected scope.")).toBeVisible();
    expect(screen.getByText("No child relationship evidence exists in the selected scope.")).toBeVisible();
    expect(screen.queryByRole("link", { name: /DEMO-PARENT|MODULE-DEMO/ })).not.toBeInTheDocument();
  });

  it("renders complete Indonesian copy and preserves fallback RTL bidi semantics", async () => {
    currentSearch = "scope=asOf";
    vi.stubGlobal("fetch", successfulFetch());
    const { unmount } = renderDetail(baseUnit.traceCode, "id");
    expect(await screen.findByRole("heading", { name: "Catatan tersedia" })).toBeVisible();
    expect(screen.getByLabelText("Cakupan genealogi")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("DD/MM/YYYY, HH:mm");
    expect(screen.getByRole("alert")).not.toHaveTextContent("TTTT-BB-HH JJ:mm");
    unmount();
    currentSearch = "";
    vi.stubGlobal("fetch", successfulFetch());
    renderDetail(baseUnit.traceCode, "ar");
    expect(screen.getByTestId("locale-root")).toHaveAttribute("dir", "rtl");
    expect(await screen.findByText(baseUnit.traceCode, { selector: "bdi" })).toHaveAttribute("dir", "ltr");
    expect(screen.getByRole("textbox", { name: "Trace code" })).toHaveAttribute("dir", "ltr");
    const timestamps = screen.getAllByRole("time");
    timestamps.forEach((time) => {
      const isolated = within(time).getByText(/.+/, { selector: "bdi" });
      expect(isolated).toHaveAttribute("dir", "auto");
      expect(isolated).toHaveClass("inline-block", "whitespace-nowrap");
    });
    expect(screen.getByRole("heading", { name: "Available records" })).toHaveAttribute("dir", "auto");
  });

  it("uses intentional English fallback for a registered LTR locale", async () => {
    vi.stubGlobal("fetch", successfulFetch());
    renderDetail(baseUnit.traceCode, "ja");
    expect(await screen.findByRole("heading", { name: "Available records" })).toBeVisible();
  });
});
