import type { ComponentProps } from "react";
import { NextIntlClientProvider } from "next-intl";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import englishMessages from "../../../messages/en.json";
import indonesianMessages from "../../../messages/id.json";
import type { UserRole } from "@/lib/api/auth";
import { ApplicationShell } from "./application-shell";

let testPathname = "/";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: ComponentProps<"a">) => <a href={String(href)} {...props}>{children}</a>,
  usePathname: () => testPathname,
}));

vi.mock("@/components/language-switcher", () => ({
  LanguageSwitcher: () => <label>Language<select aria-label="Language"><option>English</option></select></label>,
}));

function renderShell(role: UserRole, locale = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "id" ? indonesianMessages : englishMessages}>
      <ApplicationShell
        user={{ id: "server-user-id", username: "synthetic.user", role, isActive: true }}
        isLoggingOut={false}
        onLogout={vi.fn().mockResolvedValue(undefined)}
      />
    </NextIntlClientProvider>,
  );
}

function desktopNavigation() {
  return screen.getByRole("navigation", { name: "Application navigation" });
}

describe("role-aware application shell", () => {
  beforeEach(() => {
    testPathname = "/";
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
    expect(screen.getByRole("heading", { name: "Mutu & Ketertelusuran Manufaktur" })).toBeVisible();
    expect(screen.getByLabelText("Language")).toBeVisible();
    expect(screen.getAllByText("ENGINEERING")[0]).toBeVisible();
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
    expect(screen.queryByText(/total packs|pass rate|ng units|open nc/i)).not.toBeInTheDocument();
  });
});
