import { NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import englishMessages from "../../../messages/en.json";
import indonesianMessages from "../../../messages/id.json";
import { AuthGateway } from "./auth-gateway";
import { AuthProvider } from "./auth-provider";

vi.mock("@/components/language-switcher", () => ({
  LanguageSwitcher: () => <label>Language<select aria-label="Language"><option>English</option></select></label>,
}));

vi.mock("@/components/dashboard/overview-dashboard", () => ({
  OverviewDashboard: () => <section>Dashboard overview</section>,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => <a href={String(href)} {...props}>{children}</a>,
  usePathname: () => "/",
}));

const sessionBody = {
  user: {
    id: "00000000-0000-4000-8000-000000000001",
    username: "synthetic.user",
    role: "QUALITY",
    isActive: true,
  },
  session: {
    expiresAt: "2026-09-25T08:00:00.000Z",
    csrfToken: "in-memory-csrf-token",
  },
};

function response(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  });
}

function renderAuth(locale = "en") {
  const messages = locale === "id" ? indonesianMessages : englishMessages;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <AuthProvider>
        <AuthGateway />
      </AuthProvider>
    </NextIntlClientProvider>,
  );
}

async function waitForLogin() {
  expect(await screen.findByRole("heading", { name: /welcome back/i })).toBeVisible();
}

async function submitLogin() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Username"), "synthetic.user");
  await user.type(screen.getByLabelText("Password"), "local-only-password");
  await user.click(screen.getByRole("button", { name: /^sign in/i }));
}

describe("frontend authentication experience", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows a branded bootstrapping state and hides protected content", () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
    renderAuth();

    expect(screen.getByRole("status")).toHaveTextContent("Checking your secure session");
    expect(screen.queryByText("Dashboard overview")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^sign in/i })).not.toBeInTheDocument();
  });

  it("bootstraps a valid session with credentialed GET", async () => {
    fetchMock.mockResolvedValueOnce(response(200, sessionBody));
    renderAuth();

    expect(await screen.findByText("Dashboard overview")).toBeVisible();
    expect(screen.getAllByText("synthetic.user")[0]).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/auth/session" }),
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("treats a 401 bootstrap as unauthenticated", async () => {
    fetchMock.mockResolvedValueOnce(response(401, { code: "UNAUTHENTICATED" }));
    renderAuth();
    await waitForLogin();
  });

  it("shows a recoverable state for unexpected bootstrap failures", async () => {
    fetchMock.mockResolvedValueOnce(response(503));
    renderAuth();

    expect(await screen.findByRole("heading", { name: "Unable to check your session" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("logs in successfully without persistent browser storage", async () => {
    const localStorageSpy = vi.spyOn(window.localStorage, "setItem");
    const sessionStorageSpy = vi.spyOn(window.sessionStorage, "setItem");
    fetchMock
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200, sessionBody));
    renderAuth();
    await waitForLogin();
    await submitLogin();

    expect(await screen.findByText("Dashboard overview")).toBeVisible();
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ pathname: "/auth/login" }),
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(localStorageSpy).not.toHaveBeenCalled();
    expect(sessionStorageSpy).not.toHaveBeenCalled();
  });

  it("uses one generic invalid-credential message", async () => {
    fetchMock.mockResolvedValueOnce(response(401)).mockResolvedValueOnce(response(401));
    renderAuth();
    await waitForLogin();
    await submitLogin();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to sign in with those credentials.",
    );
  });

  it("uses a distinct recoverable message for login network failures", async () => {
    fetchMock
      .mockResolvedValueOnce(response(401))
      .mockRejectedValueOnce(new TypeError("network unavailable"));
    renderAuth();
    await waitForLogin();
    await submitLogin();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The secure workspace is temporarily unavailable.",
    );
  });

  it("uses the recoverable service message for login server failures", async () => {
    fetchMock.mockResolvedValueOnce(response(401)).mockResolvedValueOnce(response(503));
    renderAuth();
    await waitForLogin();
    await submitLogin();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The secure workspace is temporarily unavailable.",
    );
  });

  it("defaults the password to hidden and preserves it when visibility changes", async () => {
    fetchMock.mockResolvedValueOnce(response(401));
    renderAuth();
    await waitForLogin();
    const user = userEvent.setup();
    const password = screen.getByLabelText("Password");

    expect(password).toHaveAttribute("type", "password");
    await user.type(password, "preserved-value");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
    expect(password).toHaveValue("preserved-value");
    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password).toHaveAttribute("type", "password");
  });

  it("logs out with the in-memory CSRF token and clears authenticated UI", async () => {
    const sessionStorageSpy = vi.spyOn(window.sessionStorage, "setItem");
    fetchMock
      .mockResolvedValueOnce(response(200, sessionBody))
      .mockResolvedValueOnce(response(204));
    renderAuth();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitForLogin();

    const logoutCall = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(logoutCall[0].pathname).toBe("/auth/logout");
    expect(new Headers(logoutCall[1].headers).get("X-CSRF-Token")).toBe(
      "in-memory-csrf-token",
    );
    expect(sessionStorageSpy).not.toHaveBeenCalled();
  });

  it("handles an already-invalid session during logout as unauthenticated", async () => {
    fetchMock
      .mockResolvedValueOnce(response(200, sessionBody))
      .mockResolvedValueOnce(response(401));
    renderAuth();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitForLogin();
    expect(screen.queryByText("Dashboard overview")).not.toBeInTheDocument();
  });

  it("recovers on refresh only by requesting the current session", async () => {
    fetchMock.mockResolvedValueOnce(response(200, sessionBody));
    renderAuth();
    await screen.findByText("Dashboard overview");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0]?.[0] as URL).pathname).toBe("/auth/session");
  });

  it("renders localized login semantics and responsive brand structure", async () => {
    fetchMock.mockResolvedValueOnce(response(401));
    const { container } = renderAuth("id");

    expect(await screen.findByRole("heading", { name: "Selamat datang kembali" })).toBeVisible();
    expect(screen.getByLabelText("Nama pengguna")).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("Kata sandi")).toHaveAttribute("autocomplete", "current-password");
    expect(container.querySelector(".industrial-panel")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("grid", "min-h-screen");
    expect(container.querySelector("header")).toHaveClass("lg:hidden");
  });
});
