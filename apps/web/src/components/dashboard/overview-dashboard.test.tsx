import { NextIntlClientProvider } from "next-intl";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import englishMessages from "../../../messages/en.json";
import indonesianMessages from "../../../messages/id.json";
import { getLocaleDirection, type AppLocale } from "@/i18n/routing";
import { OverviewDashboard } from "./overview-dashboard";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push }) }));

const overview = {
  generatedAt: "2026-09-26T05:00:00.000Z",
  inventory: {
    totalUnits: 15,
    byType: [
      { unitType: "PACK", count: 1 },
      { unitType: "MODULE", count: 2 },
      { unitType: "CELL", count: 8 },
      { unitType: "COMPONENT", count: 3 },
      { unitType: "MATERIAL", count: 1 },
    ],
  },
  productModels: [{ code: "DEMO_ALPHA", name: "Demo Alpha", packCount: 1 }],
  process: {
    inProgressCount: 2,
    recentLimit: 10,
    recent: [{
      traceCode: "PACK-ALPHA-0001",
      unitType: "PACK",
      productModel: { code: "DEMO_ALPHA", name: "Demo Alpha" },
      process: { code: "PACK_ASSEMBLY", name: "Pack Assembly" },
      attemptNumber: 1,
      status: "IN_PROGRESS",
      startedAt: "2026-09-26T04:00:00.000Z",
      finishedAt: null,
    }],
  },
  quality: {
    scope: { mode: "ALL_RECORDS", from: null, to: null },
    inspectionCount: 7,
    byOutcome: [{ outcome: "PASS", count: 6 }, { outcome: "NG", count: 1 }],
    available: true,
  },
  nonconformance: { openCount: 1, inProgressCount: 2 },
} as const;

function response(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  });
}

function renderDashboard(locale = "en", onUnauthenticated = vi.fn()) {
  const messages = locale === "id" ? indonesianMessages : englishMessages;
  return {
    onUnauthenticated,
    ...render(
      <div data-testid="locale-root" dir={getLocaleDirection(locale as AppLocale)}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <OverviewDashboard onUnauthenticated={onUnauthenticated} />
        </NextIntlClientProvider>
      </div>,
    ),
  };
}

describe("overview dashboard", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    push.mockReset();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("announces loading without presenting fabricated values", () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
    renderDashboard();
    expect(screen.getByRole("status")).toHaveTextContent("Loading operational overview");
    expect(screen.queryByText("Traceable units")).not.toBeInTheDocument();
  });

  it("renders every evidence-backed dashboard section from the authenticated API contract", async () => {
    fetchMock.mockResolvedValueOnce(response(200, overview));
    renderDashboard();

    expect(await screen.findByRole("heading", { name: "Trace a unit" })).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/dashboard/overview" }),
      expect.objectContaining({ method: "GET", credentials: "include", cache: "no-store" }),
    );
    expect(screen.getByText("Traceable units").parentElement).toHaveTextContent("Traceable units15");
    expect(screen.getByText("Processes in progress").parentElement).toHaveTextContent("Processes in progress2");
    expect(screen.getByText("Inspection records").parentElement).toHaveTextContent("Inspection records7");
    expect(screen.getByRole("heading", { name: "Traceable units by type" }).parentElement?.parentElement).toHaveTextContent("PACK1MODULE2CELL8COMPONENT3MATERIAL1");
    expect(screen.getByRole("heading", { name: "Packs by product model" }).parentElement?.parentElement).toHaveTextContent("Demo AlphaDEMO_ALPHA1 packs");
    expect(screen.getByRole("heading", { name: "Inspection outcomes" }).parentElement?.parentElement).toHaveTextContent("PASS6NG1");
    expect(screen.getByRole("heading", { name: "Active case context" }).parentElement?.parentElement).toHaveTextContent("Open cases1In-progress cases2");
    const activity = screen.getByRole("heading", { name: "Recent manufacturing activity" }).parentElement?.parentElement;
    expect(activity).toHaveTextContent("PACK-ALPHA-0001");
    expect(activity).toHaveTextContent("Pack Assembly");
    expect(activity).toHaveTextContent("In progress");
  });

  it("keeps completed process lifecycle evidence visible and semantically neutral", async () => {
    fetchMock.mockResolvedValueOnce(response(200, {
      ...overview,
      process: {
        ...overview.process,
        recent: [{
          ...overview.process.recent[0],
          status: "COMPLETED",
          finishedAt: "2026-09-26T04:30:00.000Z",
        }],
      },
    }));
    renderDashboard();

    const completed = await screen.findByText("Completed");
    expect(completed).toHaveClass("bg-slate-100", "text-slate-700");
    expect(completed.className).not.toMatch(/emerald|green/);
    expect(screen.getByText("PASS").parentElement).toHaveClass("border-emerald-200", "bg-emerald-50", "text-emerald-800");
  });

  it("normalizes a trace code and navigates without implementing search results", async () => {
    fetchMock.mockResolvedValueOnce(response(200, overview));
    renderDashboard();
    const user = userEvent.setup();
    const input = await screen.findByRole("textbox", { name: "Trace code" });
    await user.type(input, "  pack-alpha-0001  ");
    expect(input).toHaveValue("  PACK-ALPHA-0001  ");
    await user.click(screen.getByRole("button", { name: "Trace unit" }));
    expect(push).toHaveBeenCalledWith("/traceability?query=PACK-ALPHA-0001");
  });

  it.each([
    ["lowercase", "pack-alpha-0001"],
    ["mixed-case", "Pack-Alpha-0001"],
    ["uppercase", "PACK-ALPHA-0001"],
  ])("stores %s typed trace codes in uppercase", async (_case, enteredValue) => {
    fetchMock.mockResolvedValueOnce(response(200, overview));
    renderDashboard();
    const user = userEvent.setup();
    const input = await screen.findByRole("textbox", { name: "Trace code" });
    await user.type(input, enteredValue);
    expect(input).toHaveValue("PACK-ALPHA-0001");
  });

  it.each([
    ["lowercase", "pack-alpha-0001"],
    ["mixed-case", "Pack-Alpha-0001"],
  ])("stores %s pasted trace codes in uppercase", async (_case, pastedValue) => {
    fetchMock.mockResolvedValueOnce(response(200, overview));
    renderDashboard();
    const user = userEvent.setup();
    const input = await screen.findByRole("textbox", { name: "Trace code" });
    await user.click(input);
    await user.paste(pastedValue);
    expect(input).toHaveValue("PACK-ALPHA-0001");
  });

  it("rejects empty or malformed trace input without fabricating a lookup", async () => {
    fetchMock.mockResolvedValueOnce(response(200, overview));
    renderDashboard();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Trace unit" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter 1–128");
    expect(push).not.toHaveBeenCalled();
  });

  it("preserves invalid-character validation after normalizing the stored value", async () => {
    fetchMock.mockResolvedValueOnce(response(200, overview));
    renderDashboard();
    const user = userEvent.setup();
    const input = await screen.findByRole("textbox", { name: "Trace code" });
    await user.type(input, "pack.alpha");
    expect(input).toHaveValue("PACK.ALPHA");
    await user.click(screen.getByRole("button", { name: "Trace unit" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter 1–128");
    expect(push).not.toHaveBeenCalled();
  });

  it("shows a recoverable error and retries current evidence", async () => {
    fetchMock.mockResolvedValueOnce(response(503)).mockResolvedValueOnce(response(200, overview));
    renderDashboard();
    const user = userEvent.setup();
    expect(await screen.findByRole("heading", { name: "Unable to load the operational overview" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Manufacturing overview" })).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("renders valid zero counts and intentional empty states", async () => {
    fetchMock.mockResolvedValueOnce(response(200, {
      ...overview,
      inventory: { totalUnits: 0, byType: overview.inventory.byType.map((item) => ({ ...item, count: 0 })) },
      productModels: [],
      process: { ...overview.process, inProgressCount: 0, recent: [] },
      quality: { ...overview.quality, inspectionCount: 0, byOutcome: [{ outcome: "PASS", count: 0 }, { outcome: "NG", count: 0 }] },
      nonconformance: { openCount: 0, inProgressCount: 0 },
    }));
    renderDashboard();
    expect(await screen.findByText("No persisted product-model pack evidence is available.")).toBeVisible();
    expect(screen.getByText("No process execution activity is available.")).toBeVisible();
    expect(screen.getByText("Traceable units").parentElement).toHaveTextContent("Traceable units0");
  });

  it("distinguishes unavailable inspection evidence from zero", async () => {
    fetchMock.mockResolvedValueOnce(response(200, { ...overview, quality: { ...overview.quality, available: false } }));
    renderDashboard();
    expect(await screen.findByText(/Inspection evidence is currently unavailable/)).toBeVisible();
    expect(screen.queryByText("PASS")).not.toBeInTheDocument();
  });

  it("invalidates the existing in-memory session on a dashboard 401", async () => {
    const onUnauthenticated = vi.fn();
    fetchMock.mockResolvedValueOnce(response(401));
    renderDashboard("en", onUnauthenticated);
    await vi.waitFor(() => expect(onUnauthenticated).toHaveBeenCalledOnce());
  });

  it("renders a non-retryable forbidden state on 403", async () => {
    fetchMock.mockResolvedValueOnce(response(403));
    renderDashboard();
    expect(await screen.findByRole("heading", { name: "Dashboard access is not available" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("renders complete Indonesian copy", async () => {
    fetchMock.mockResolvedValueOnce(response(200, overview));
    renderDashboard("id");
    expect(await screen.findByRole("heading", { name: "Lacak unit" })).toBeVisible();
    expect(screen.getByTestId("locale-root")).toHaveAttribute("dir", "ltr");
    expect(screen.getByRole("heading", { name: "Ikhtisar manufaktur" })).toBeVisible();
    expect(screen.getByText("Sedang berjalan")).toBeVisible();
  });

  it("keeps the Arabic page RTL while giving English fallback copy and technical values safe bidi semantics", async () => {
    fetchMock.mockResolvedValueOnce(response(200, overview));
    renderDashboard("ar");

    expect(screen.getByTestId("locale-root")).toHaveAttribute("dir", "rtl");
    const description = await screen.findByText("Enter one synthetic trace code to continue into the traceability workspace.");
    expect(description).toHaveAttribute("dir", "auto");
    expect(description.textContent).toBe("Enter one synthetic trace code to continue into the traceability workspace.");
    expect(description.textContent?.endsWith(".")).toBe(true);
    expect(screen.getByText("Trace codes are normalized to uppercase.")).toHaveAttribute("dir", "auto");
    expect(screen.getByRole("textbox", { name: "Trace code" })).toHaveAttribute("dir", "ltr");
    expect(screen.getByText("PACK-ALPHA-0001", { selector: "bdi" })).toHaveAttribute("dir", "ltr");
    expect(screen.getAllByText("DEMO_ALPHA", { selector: "bdi" })).toSatisfy(
      (codes: HTMLElement[]) => codes.every((code) => code.getAttribute("dir") === "ltr"),
    );
    const expectedTimestamp = new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" })
      .format(new Date(overview.generatedAt));
    const generatedLabel = screen.getByText("Generated", { selector: "span" });
    const generatedMessage = generatedLabel.parentElement;
    expect(generatedMessage).toHaveAttribute("dir", "auto");
    expect(within(generatedMessage as HTMLElement).getByText(expectedTimestamp, { selector: "bdi" })).toHaveAttribute("dir", "auto");
    expect(generatedMessage).toHaveTextContent(`Generated ${expectedTimestamp}`);
  });

  it("keeps the English locale LTR with unchanged copy", async () => {
    fetchMock.mockResolvedValueOnce(response(200, overview));
    renderDashboard("en");
    expect(screen.getByTestId("locale-root")).toHaveAttribute("dir", "ltr");
    expect(await screen.findByText("Enter one synthetic trace code to continue into the traceability workspace.")).toHaveTextContent(/workspace\.$/);
    const expectedTimestamp = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" })
      .format(new Date(overview.generatedAt));
    expect(screen.getByText(expectedTimestamp, { selector: "bdi" })).toHaveAttribute("dir", "auto");
  });

  it("supports registered-locale English fallback messages", async () => {
    fetchMock.mockResolvedValueOnce(response(200, overview));
    render(
      <NextIntlClientProvider locale="ja" messages={englishMessages}>
        <OverviewDashboard onUnauthenticated={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(await screen.findByRole("heading", { name: "Trace a unit" })).toBeVisible();
    const expectedTimestamp = new Intl.DateTimeFormat("ja", { dateStyle: "medium", timeStyle: "short" })
      .format(new Date(overview.generatedAt));
    expect(screen.getByText(expectedTimestamp, { selector: "bdi" })).toHaveAttribute("dir", "auto");
  });
});
