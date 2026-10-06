import type { ComponentProps } from "react";
import { NextIntlClientProvider } from "next-intl";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import englishMessages from "../../../messages/en.json";
import indonesianMessages from "../../../messages/id.json";
import type { UserRole } from "@/lib/api/auth";
import { getLocaleDirection, type AppLocale } from "@/i18n/routing";
import { ApplicationShell } from "./application-shell";

let testPathname = "/";
const replace = vi.fn();

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: ComponentProps<"a">) => <a href={String(href)} {...props}>{children}</a>,
  usePathname: () => testPathname,
  useRouter: () => ({ replace }),
}));

vi.mock("@/components/dashboard/overview-dashboard", () => ({
  OverviewDashboard: () => <section>Dashboard overview</section>,
}));

vi.mock("@/components/traceability/traceability-search", () => ({
  TraceabilitySearch: () => <section>Traceability search</section>,
}));

vi.mock("@/components/traceability/traceability-detail", () => ({
  TraceabilityDetail: ({ rawTraceCode }: { rawTraceCode: string }) => <section>Unit detail {rawTraceCode}</section>,
}));

function renderShell(role: UserRole, locale = "en") {
  return render(
    <div data-testid="locale-root" dir={getLocaleDirection(locale as AppLocale)}>
      <NextIntlClientProvider locale={locale} messages={locale === "id" ? indonesianMessages : englishMessages}>
        <ApplicationShell
          user={{ id: "server-user-id", username: "synthetic.user", role, isActive: true }}
          isLoggingOut={false}
          onLogout={vi.fn().mockResolvedValue(undefined)}
        />
      </NextIntlClientProvider>
    </div>,
  );
}

function desktopNavigation() {
  return screen.getByRole("navigation", { name: "Application navigation" });
}

describe("role-aware application shell", () => {
  beforeEach(() => {
    testPathname = "/";
    replace.mockReset();
    window.history.replaceState({}, "", "/");
  });

  it.each([
    ["ADMIN", ["Overview", "Traceability", "Users"], ["Production", "Inspections", "Nonconformance", "Actions"]],
    ["QUALITY", ["Overview", "Traceability", "Inspections", "Nonconformance"], ["Production", "Actions", "Users"]],
    ["PRODUCTION", ["Overview", "Traceability", "Production", "Nonconformance"], ["Inspections", "Actions", "Users"]],
    ["ENGINEERING", ["Overview", "Traceability", "Actions"], ["Production", "Inspections", "Nonconformance", "Users"]],
  ] as const)("shows the explicit %s permission bundle", (role, visible, absent) => {
    renderShell(role);
    const nav = desktopNavigation();
    visible.forEach((label) => expect(within(nav).getByRole("link", { name: label })).toBeVisible());
    absent.forEach((label) => expect(within(nav).queryByRole("link", { name: label })).not.toBeInTheDocument());
  });

  it("uses only the authenticated role even when client-controlled claims are present", () => {
    window.history.replaceState({}, "", "/?role=ADMIN&permission=users%3Amanage");
    renderShell("PRODUCTION");
    expect(within(desktopNavigation()).queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
    expect(within(desktopNavigation()).getByRole("link", { name: "Production" })).toBeVisible();
  });

  it("marks the current destination without conflating focus and active state", () => {
    testPathname = "/traceability";
    renderShell("ADMIN");
    const active = within(desktopNavigation()).getByRole("link", { name: "Traceability" });
    expect(active).toHaveAttribute("aria-current", "page");
    expect(within(desktopNavigation()).getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });

  it("renders search at the traceability root and keeps unit detail routes in traceability context", () => {
    testPathname = "/traceability";
    const { rerender } = renderShell("ENGINEERING");
    expect(screen.getByText("Traceability search")).toBeVisible();
    const mobileHeader = screen.getByRole("button", { name: "Open navigation menu" }).closest("header");
    expect(within(mobileHeader as HTMLElement).getByText("Operations")).toHaveClass("uppercase");
    expect(within(mobileHeader as HTMLElement).getByText("Traceability")).toBeVisible();

    testPathname = "/traceability/PACK-DEMO-ALPHA-PASS";
    rerender(
      <div data-testid="locale-root" dir="ltr">
        <NextIntlClientProvider locale="en" messages={englishMessages}>
          <ApplicationShell user={{ id: "server-user-id", username: "synthetic.user", role: "ENGINEERING", isActive: true }} isLoggingOut={false} onLogout={vi.fn().mockResolvedValue(undefined)} />
        </NextIntlClientProvider>
      </div>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Traceability" })).toBeVisible();
    expect(screen.getByText("Unit detail PACK-DEMO-ALPHA-PASS")).toBeVisible();
    expect(within(desktopNavigation()).getByRole("link", { name: "Traceability" })).toHaveAttribute("aria-current", "page");
  });

  it("keeps the nested unit detail route in the localized Indonesian shell", () => {
    testPathname = "/traceability/PACK-DEMO-ALPHA-PASS";
    renderShell("ENGINEERING", "id");
    expect(screen.getByRole("heading", { level: 1, name: "Ketertelusuran" })).toBeVisible();
    expect(screen.getByText("Unit detail PACK-DEMO-ALPHA-PASS")).toBeVisible();
  });

  it("opens, focuses, closes, and restores focus for the mobile menu", async () => {
    renderShell("QUALITY");
    const user = userEvent.setup();
    const openButton = screen.getByRole("button", { name: "Open navigation menu" });
    await user.click(openButton);

    const dialog = screen.getByRole("dialog", { name: "Application menu" });
    const closeButton = within(dialog).getByRole("button", { name: "Close navigation menu" });
    expect(closeButton).toHaveFocus();
    expect(within(dialog).getByRole("link", { name: "Inspections" })).toBeVisible();

    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(within(dialog).getByRole("button", { name: "Sign out" })).toHaveFocus();
    await user.tab();
    expect(closeButton).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(openButton).toHaveFocus();
  });

  it("renders real localized shell messages and exposes locale access", () => {
    renderShell("ENGINEERING", "id");
    expect(screen.getByRole("heading", { level: 1, name: "Ikhtisar" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Bahasa" })).toBeVisible();
    expect(screen.getAllByText("ENGINEERING")[0]).toBeVisible();
  });

  it("keeps full mobile context in the DOM and compacts the labeled language control responsively", async () => {
    renderShell("ENGINEERING");
    const header = screen.getByRole("button", { name: "Open navigation menu" }).closest("header");
    expect(header).not.toBeNull();
    const context = within(header as HTMLElement).getAllByText("Overview");
    expect(context).toHaveLength(2);
    expect(context[0]).toHaveClass("uppercase");
    expect(context[0]).toHaveTextContent("Overview");
    expect(context[1]).toHaveTextContent("Overview");

    const localeSelect = screen.getByRole("combobox", { name: "Language" });
    expect(localeSelect).toHaveClass("min-h-11", "max-w-28", "sm:max-w-48");
    expect(screen.getByText("Language", { selector: "label" })).toHaveClass("sr-only", "sm:not-sr-only");
    await userEvent.selectOptions(localeSelect, "id");
    expect(replace).toHaveBeenCalledWith("/", { locale: "id", scroll: false });
  });

  it.each([
    ["current scope", "", "/traceability/PACK-DEMO-ALPHA-PASS"],
    ["historical scope", "?scope=historical", "/traceability/PACK-DEMO-ALPHA-PASS?scope=historical"],
    ["as-of scope", "?scope=asOf&at=2026-01-11T03%3A00%3A00.000Z", "/traceability/PACK-DEMO-ALPHA-PASS?scope=asOf&at=2026-01-11T03%3A00%3A00.000Z"],
  ])("preserves nested Unit Detail %s while changing locale", async (_case, search, expectedHref) => {
    testPathname = "/traceability/PACK-DEMO-ALPHA-PASS";
    window.history.replaceState({}, "", `${testPathname}${search}`);
    renderShell("ENGINEERING");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Language" }), "id");
    expect(replace).toHaveBeenCalledWith(expectedHref, { locale: "id", scroll: false });
    expect(expectedHref).toContain("PACK-DEMO-ALPHA-PASS");
  });

  it("preserves the Phase 4F search query while changing locale", async () => {
    testPathname = "/traceability";
    window.history.replaceState({}, "", "/traceability?query=PACK-DEMO-ALPHA&unitType=PACK");
    renderShell("ENGINEERING");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Language" }), "id");
    expect(replace).toHaveBeenCalledWith("/traceability?query=PACK-DEMO-ALPHA&unitType=PACK", { locale: "id", scroll: false });
  });

  it("transiently restores the captured viewport after the locale layout remount", async () => {
    testPathname = "/traceability/PACK-DEMO-ALPHA-PASS";
    const search = "?scope=asOf&at=2026-01-11T03%3A00%3A00.000Z";
    window.history.replaceState({}, "", `${testPathname}${search}`);
    vi.spyOn(window, "scrollX", "get").mockReturnValue(18);
    vi.spyOn(window, "scrollY", "get").mockReturnValue(640);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(800);
    vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(2000);
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);

    const firstRender = renderShell("ENGINEERING", "en");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Language" }), "id");
    expect(replace).toHaveBeenCalledWith(`${testPathname}${search}`, { locale: "id", scroll: false });
    expect(scrollTo).not.toHaveBeenCalled();

    firstRender.unmount();
    const translatedRender = renderShell("ENGINEERING", "id");
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith(18, 640);

    translatedRender.unmount();
    renderShell("ENGINEERING", "id");
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it("preserves the Arabic RTL shell while isolating English fallback page copy and identity values", () => {
    renderShell("ENGINEERING", "ar");
    expect(screen.getByTestId("locale-root")).toHaveAttribute("dir", "rtl");
    expect(screen.getByText("Manufacturing quality and traceability workspace.")).toHaveAttribute("dir", "auto");
    expect(screen.getAllByText("synthetic.user", { selector: "bdi" })[0]).toHaveAttribute("dir", "auto");
    expect(screen.getAllByText("ENGINEERING", { selector: "bdi" })[0]).toHaveAttribute("dir", "ltr");
  });

  it("provides logout while exposing no internal identity or fake dashboard metrics", async () => {
    const onLogout = vi.fn().mockResolvedValue(undefined);
    render(
      <NextIntlClientProvider locale="en" messages={englishMessages}>
        <ApplicationShell user={{ id: "private-user-uuid", username: "safe.user", role: "ADMIN", isActive: true }} isLoggingOut={false} onLogout={onLogout} />
      </NextIntlClientProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(onLogout).toHaveBeenCalledOnce();
    expect(screen.queryByText("private-user-uuid")).not.toBeInTheDocument();
    expect(screen.getByText("Dashboard overview")).toBeVisible();
  });
});
