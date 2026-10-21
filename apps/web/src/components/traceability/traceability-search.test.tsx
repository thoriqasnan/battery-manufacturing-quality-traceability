import type { ComponentProps } from "react";
import { NextIntlClientProvider } from "next-intl";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import englishMessages from "../../../messages/en.json";
import indonesianMessages from "../../../messages/id.json";
import { TraceabilitySearch } from "./traceability-search";

const { push, replace } = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
let currentSearch = "";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: ComponentProps<"a">) => <a href={String(href)} {...props}>{children}</a>,
  useRouter: () => ({ push, replace }),
}));

const item = {
  traceCode: "PACK-DEMO-ALPHA-PASS",
  unitType: "PACK",
  productModel: { code: "DEMO_ALPHA", name: "Demo Alpha Product" },
  createdAt: "2026-09-23T00:00:00.000Z",
  lastActivityAt: "2026-09-26T04:00:00.000Z",
  match: "EXACT",
} as const;

function searchResponse(overrides: Record<string, unknown> = {}) {
  return {
    items: [item],
    page: { number: 1, size: 25, totalItems: 1, totalPages: 1 },
    ...overrides,
  };
}

function response(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  });
}

function renderSearch(locale = "en", onUnauthenticated = vi.fn()) {
  const messages = locale === "id" ? indonesianMessages : englishMessages;
  return {
    onUnauthenticated,
    ...render(
      <div data-testid="locale-root" dir={locale === "ar" ? "rtl" : "ltr"}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <TraceabilitySearch onUnauthenticated={onUnauthenticated} />
        </NextIntlClientProvider>
      </div>,
    ),
  };
}

describe("traceability search", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    currentSearch = "";
    push.mockReset();
    replace.mockReset();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("loads the bounded browse state initially without fabricating a query", async () => {
    fetchMock.mockResolvedValueOnce(response(200, searchResponse()));
    renderSearch();
    expect(screen.getByRole("status")).toHaveTextContent("Loading persisted traceability evidence");
    expect(await screen.findByRole("heading", { name: "Traceable units" })).toBeVisible();
    expect(screen.getByText("Page 1 of 1")).toBeVisible();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    const requestedUrl = fetchMock.mock.calls[0][0] as URL;
    expect(requestedUrl.pathname).toBe("/traceability");
    expect(requestedUrl.search).toBe("");
  });

  it("keeps the filter form stacked through lg and activates its bounded columns at xl", async () => {
    fetchMock.mockResolvedValueOnce(response(200, searchResponse()));
    renderSearch();

    const searchButton = await screen.findByRole("button", { name: "Search" });
    const clearButton = screen.getByRole("button", { name: "Clear" });
    const form = searchButton.closest("form")!;
    const actions = searchButton.parentElement!;

    expect(form).toHaveClass("xl:grid-cols-[minmax(16rem,1.5fr)_minmax(11rem,0.7fr)_minmax(13rem,0.8fr)_auto]", "xl:items-end");
    expect(form.className).not.toContain("lg:grid-cols-");
    expect(form).not.toHaveClass("lg:items-end");
    expect(actions).toHaveClass("xl:pb-8");
    expect(actions).not.toHaveClass("lg:pb-8");
    expect(searchButton).toHaveClass("xl:flex-none");
    expect(clearButton).toHaveClass("xl:flex-none");
    expect(searchButton).not.toHaveClass("lg:flex-none");
    expect(clearButton).not.toHaveClass("lg:flex-none");
  });

  it("shows three fictional reviewer samples in a compact responsive disclosure", async () => {
    fetchMock.mockResolvedValueOnce(response(200, searchResponse()));
    renderSearch();
    const user = userEvent.setup();

    await user.click(await screen.findByText("Try a fictional sample"));
    expect(screen.getByText("These curated portfolio records demonstrate distinct traceability and quality histories.")).toBeVisible();
    expect(screen.getAllByRole("button", { name: /^Use sample / })).toHaveLength(3);
    expect(screen.getByRole("button", { name: /PACK-DEMO-ALPHA-PASS: Clean PASS/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /PACK-DEMO-ALPHA-RETEST: NG followed by PASS retest/ })).toBeVisible();
    const escalated = screen.getByRole("button", { name: /PACK-DEMO-BETA-ESCALATED: Escalated NC and rework/ });
    expect(escalated).toBeVisible();
    expect(escalated.closest("ul")).toHaveClass("grid", "min-w-0", "lg:grid-cols-3");
  });

  it("fills only the trace input and preserves filters until the user submits", async () => {
    fetchMock.mockResolvedValueOnce(response(200, searchResponse())).mockResolvedValueOnce(response(200, searchResponse()));
    renderSearch();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Traceable units" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Unit type" }), "PACK");
    await user.type(screen.getByRole("textbox", { name: "Product model code" }), "demo_alpha");
    await user.click(screen.getByText("Try a fictional sample"));
    await user.click(screen.getByRole("button", { name: /PACK-DEMO-ALPHA-RETEST: NG followed by PASS retest/ }));

    expect(screen.getByRole("textbox", { name: "Trace code" })).toHaveValue("PACK-DEMO-ALPHA-RETEST");
    expect(screen.getByRole("combobox", { name: "Unit type" })).toHaveValue("PACK");
    expect(screen.getByRole("textbox", { name: "Product model code" })).toHaveValue("DEMO_ALPHA");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(push).toHaveBeenCalledWith("/traceability?query=PACK-DEMO-ALPHA-RETEST&unitType=PACK&productModel=DEMO_ALPHA");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("supports keyboard sample selection with a visible focus contract", async () => {
    fetchMock.mockResolvedValueOnce(response(200, searchResponse()));
    renderSearch();
    const user = userEvent.setup();
    await user.click(await screen.findByText("Try a fictional sample"));
    const sample = screen.getByRole("button", { name: /PACK-DEMO-BETA-ESCALATED: Escalated NC and rework/ });
    sample.focus();
    expect(sample).toHaveFocus();
    expect(sample).toHaveClass("focus-visible:ring-2", "focus-visible:ring-blue-300");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("textbox", { name: "Trace code" })).toHaveValue("PACK-DEMO-BETA-ESCALATED");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("consumes and canonicalizes a query-param initialized search", async () => {
    currentSearch = "query=pack-demo-alpha&unitType=pack&productModel=demo_alpha";
    fetchMock.mockResolvedValueOnce(response(200, searchResponse()));
    renderSearch();
    expect(await screen.findByRole("textbox", { name: "Trace code" })).toHaveValue("PACK-DEMO-ALPHA");
    expect(screen.getByRole("combobox", { name: "Unit type" })).toHaveValue("PACK");
    expect(screen.getByRole("textbox", { name: "Product model code" })).toHaveValue("DEMO_ALPHA");
    expect(replace).toHaveBeenCalledWith("/traceability?query=PACK-DEMO-ALPHA&unitType=PACK&productModel=DEMO_ALPHA");
    expect((fetchMock.mock.calls[0][0] as URL).searchParams.get("query")).toBe("PACK-DEMO-ALPHA");
  });

  it.each([
    ["lowercase typing", "pack-alpha-0001"],
    ["mixed-case typing", "Pack-Alpha-0001"],
  ])("stores %s as an uppercase controlled trace code", async (_case, value) => {
    fetchMock.mockResolvedValueOnce(response(200, searchResponse()));
    renderSearch();
    const user = userEvent.setup();
    const input = await screen.findByRole("textbox", { name: "Trace code" });
    await user.type(input, value);
    expect(input).toHaveValue("PACK-ALPHA-0001");
  });

  it.each([
    ["lowercase paste", "pack-alpha-0001"],
    ["mixed-case paste", "Pack-Alpha-0001"],
  ])("stores %s as an uppercase controlled trace code", async (_case, value) => {
    fetchMock.mockResolvedValueOnce(response(200, searchResponse()));
    renderSearch();
    const user = userEvent.setup();
    const input = await screen.findByRole("textbox", { name: "Trace code" });
    await user.click(input);
    await user.paste(value);
    expect(input).toHaveValue("PACK-ALPHA-0001");
  });

  it("submits supported filters and renders persisted evidence with future-detail links", async () => {
    fetchMock.mockResolvedValueOnce(response(200, searchResponse())).mockResolvedValueOnce(response(200, searchResponse()));
    renderSearch();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Traceable units" });
    await user.type(screen.getByRole("textbox", { name: "Trace code" }), "pack-demo");
    await user.selectOptions(screen.getByRole("combobox", { name: "Unit type" }), "PACK");
    await user.type(screen.getByRole("textbox", { name: "Product model code" }), "demo_alpha");
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(push).toHaveBeenCalledWith("/traceability?query=PACK-DEMO&unitType=PACK&productModel=DEMO_ALPHA");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const requestUrl = fetchMock.mock.calls[1][0] as URL;
    expect(Object.fromEntries(requestUrl.searchParams)).toEqual({ query: "PACK-DEMO", unitType: "PACK", productModel: "DEMO_ALPHA" });
    const links = await screen.findAllByRole("link", { name: /PACK-DEMO-ALPHA-PASS|Open traceable unit/ });
    expect(links.every((link) => link.getAttribute("href") === "/traceability/PACK-DEMO-ALPHA-PASS")).toBe(true);
    expect(screen.getByText("DEMO_ALPHA", { selector: "bdi" })).toHaveAttribute("dir", "ltr");
    expect(screen.queryByText(/status/i)).not.toBeInTheDocument();
  });

  it("rejects invalid trace characters without making a search request", async () => {
    fetchMock.mockResolvedValueOnce(response(200, searchResponse()));
    renderSearch();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Traceable units" });
    await user.type(screen.getByRole("textbox", { name: "Trace code" }), "PACK.BAD");
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.getByRole("alert")).toHaveTextContent("128 letters");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("renders a distinct empty result while preserving the submitted context", async () => {
    currentSearch = "query=UNKNOWN";
    fetchMock.mockResolvedValueOnce(response(200, searchResponse({ items: [], page: { number: 1, size: 25, totalItems: 0, totalPages: 0 } })));
    renderSearch();
    expect(await screen.findByRole("heading", { name: "No traceable units matched" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Trace code" })).toHaveValue("UNKNOWN");
    expect(screen.getByRole("button", { name: "Clear" })).toBeEnabled();
    expect(screen.queryByRole("navigation", { name: "Traceability search pages" })).not.toBeInTheDocument();
    expect(screen.queryByText("Page 1 of 0")).not.toBeInTheDocument();
  });

  it("shows a recoverable API error and retries the same search", async () => {
    fetchMock.mockResolvedValueOnce(response(503)).mockResolvedValueOnce(response(200, searchResponse()));
    renderSearch();
    const user = userEvent.setup();
    expect(await screen.findByRole("heading", { name: "Unable to load traceability evidence" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Traceable units" })).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("renders a non-retryable forbidden state", async () => {
    fetchMock.mockResolvedValueOnce(response(403));
    renderSearch();
    expect(await screen.findByRole("heading", { name: "Traceability access is not available" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("invalidates the session on a search 401", async () => {
    const onUnauthenticated = vi.fn();
    fetchMock.mockResolvedValueOnce(response(401));
    renderSearch("en", onUnauthenticated);
    await vi.waitFor(() => expect(onUnauthenticated).toHaveBeenCalledOnce());
  });

  it("uses bounded URL-driven pagination", async () => {
    fetchMock.mockResolvedValueOnce(response(200, searchResponse({ page: { number: 1, size: 25, totalItems: 26, totalPages: 2 } })))
      .mockResolvedValueOnce(response(200, searchResponse({ page: { number: 2, size: 25, totalItems: 26, totalPages: 2 } })));
    renderSearch();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Next" }));
    expect(push).toHaveBeenCalledWith("/traceability?page=2");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect((fetchMock.mock.calls[1][0] as URL).searchParams.get("page")).toBe("2");
  });

  it("renders complete Indonesian search copy", async () => {
    fetchMock.mockResolvedValueOnce(response(200, searchResponse()));
    renderSearch("id");
    expect(await screen.findByRole("heading", { name: "Temukan unit tertelusur" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Cari" })).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Halaman pencarian ketertelusuran" })).toBeVisible();
    const user = userEvent.setup();
    await user.click(screen.getByText("Coba sampel fiktif"));
    expect(screen.getByRole("button", { name: /PACK-DEMO-ALPHA-RETEST: NG diikuti uji ulang PASS/ })).toBeVisible();
  });

  it("uses English fallback with RTL-safe technical values for Arabic", async () => {
    fetchMock.mockResolvedValueOnce(response(200, searchResponse()));
    renderSearch("ar");
    expect(screen.getByTestId("locale-root")).toHaveAttribute("dir", "rtl");
    expect(await screen.findByRole("heading", { name: "Find a traceable unit" })).toHaveAttribute("dir", "auto");
    expect(screen.getByRole("textbox", { name: "Trace code" })).toHaveAttribute("dir", "ltr");
    expect(screen.getByText("PACK-DEMO-ALPHA-PASS", { selector: "bdi" })).toHaveAttribute("dir", "ltr");
    const user = userEvent.setup();
    await user.click(screen.getByText("Try a fictional sample"));
    const sampleCodes = screen.getAllByLabelText(/^PACK-DEMO-/);
    expect(sampleCodes).toHaveLength(3);
    sampleCodes.forEach((code) => {
      expect(code).toHaveAttribute("dir", "ltr");
      expect(code).toHaveClass("max-w-full", "break-words", "[word-break:normal]");
    });
    const timestamps = screen.getAllByRole("time");
    timestamps.forEach((time) => {
      const isolatedTimestamp = within(time).getByText(/.+/, { selector: "bdi" });
      expect(isolatedTimestamp).toHaveAttribute("dir", "auto");
      expect(isolatedTimestamp).toHaveClass("inline-block", "whitespace-nowrap");
    });
  });

  it("keeps registered Japanese locale fallback behavior", async () => {
    fetchMock.mockResolvedValueOnce(response(200, searchResponse()));
    renderSearch("ja");
    expect(await screen.findByRole("heading", { name: "Find a traceable unit" })).toBeVisible();
  });
});
