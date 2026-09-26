"use client";

import { FormEvent, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/language-switcher";
import { AuthErrorKind } from "@/lib/api/auth";
import { BrandPanel } from "./brand-panel";

type LoginViewProps = {
  error?: AuthErrorKind;
  isSubmitting: boolean;
  onLogin: (username: string, password: string) => Promise<void>;
};

export function LoginView({ error, isSubmitting, onLogin }: LoginViewProps) {
  const t = useTranslations("Auth");
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await onLogin(String(data.get("username") ?? ""), password);
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  const errorMessage =
    error === "invalid-credentials"
      ? t("errors.invalidCredentials")
      : error
        ? t("errors.service")
        : null;

  return (
    <div className="grid min-h-screen bg-slate-50 lg:grid-cols-[minmax(0,1fr)_minmax(480px,0.92fr)]">
      <BrandForMobile />
      <div className="hidden lg:block">
        <BrandPanel />
      </div>
      <main className="flex min-w-0 flex-col px-5 pb-10 pt-5 sm:px-9 lg:px-12 lg:py-10 xl:px-20">
        <div className="flex justify-end">
          <LanguageSwitcher />
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8 lg:py-12">
          <p className="text-xs font-bold uppercase tracking-[0.19em] text-blue-700">
            {t("login.eyebrow")}
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-5xl">
            {t("login.heading")}
          </h1>
          <p className="mt-4 max-w-sm text-base leading-7 text-slate-600">
            {t("login.description")}
          </p>

          <form className="mt-9" onSubmit={handleSubmit} noValidate>
            {errorMessage ? (
              <div
                ref={errorRef}
                tabIndex={-1}
                role="alert"
                className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
              >
                {errorMessage}
              </div>
            ) : null}

            <div>
              <label className="text-sm font-semibold text-slate-800" htmlFor="username">
                {t("login.username")}
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                disabled={isSubmitting}
                className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 disabled:cursor-wait disabled:bg-slate-100"
              />
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between gap-4">
                <label className="text-sm font-semibold text-slate-800" htmlFor="password">
                  {t("login.password")}
                </label>
                <span className="text-xs font-medium text-slate-500">
                  {t("login.protected")}
                </span>
              </div>
              <div className="relative mt-2">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  disabled={isSubmitting}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="min-h-12 w-full rounded-lg border border-slate-300 bg-white py-2 pe-20 ps-3.5 text-base text-slate-950 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 disabled:cursor-wait disabled:bg-slate-100"
                />
                <button
                  type="button"
                  aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((current) => !current)}
                  disabled={isSubmitting}
                  className="absolute inset-y-1 end-1 min-w-16 rounded-md px-3 text-sm font-semibold text-blue-700 outline-none hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-50"
                >
                  {showPassword ? t("login.hide") : t("login.show")}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-7 flex min-h-12 w-full items-center justify-center gap-3 rounded-lg bg-blue-700 px-5 text-base font-semibold text-white outline-none transition hover:bg-blue-800 focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:bg-blue-400"
            >
              {isSubmitting ? t("login.signingIn") : t("login.signIn")}
              <span aria-hidden="true">→</span>
            </button>
          </form>

          <section className="mt-9 border-t border-slate-200 pt-6" aria-label={t("secure.title")}>
            <div className="flex gap-3">
              <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-blue-700" aria-hidden="true">◇</span>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">{t("secure.title")}</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">{t("secure.description")}</p>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function BrandForMobile() {
  const t = useTranslations("Auth.brand");
  return (
    <header className="relative overflow-hidden bg-[#071426] px-5 py-6 text-white sm:px-9 lg:hidden">
      <div className="industrial-grid opacity-50" aria-hidden="true" />
      <div className="relative z-10 flex items-center justify-between gap-5">
        <div>
          <p className="text-xl font-bold tracking-[0.16em]">BMQT</p>
          <p className="mt-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-300">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
          <span className="size-2 rounded-full bg-emerald-400" aria-hidden="true" />
          {t("workspaceShort")}
        </div>
      </div>
    </header>
  );
}
