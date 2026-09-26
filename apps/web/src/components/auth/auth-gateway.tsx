"use client";

import { useTranslations } from "next-intl";
import { ApplicationShell } from "@/components/shell/application-shell";
import { useAuth } from "./auth-provider";
import { LoginView } from "./login-view";

export function AuthGateway() {
  const { state, isSubmitting, bootstrap, login, logout } = useAuth();

  if (state.status === "bootstrapping") return <BootstrappingView />;
  if (state.status === "error") {
    return <BootstrapErrorView isRetrying={isSubmitting} onRetry={bootstrap} />;
  }
  if (state.status === "unauthenticated") {
    return <LoginView error={state.error} isSubmitting={isSubmitting} onLogin={login} />;
  }

  return (
    <ApplicationShell
      user={state.session.user}
      error={state.error}
      isLoggingOut={isSubmitting}
      onLogout={logout}
    />
  );
}

function BootstrappingView() {
  const t = useTranslations("Auth.bootstrap");
  return (
    <main className="industrial-panel relative flex min-h-screen items-center justify-center overflow-hidden bg-[#071426] px-6 text-white">
      <div className="industrial-grid" aria-hidden="true" />
      <div className="relative z-10 text-center" role="status" aria-live="polite">
        <p className="text-3xl font-bold tracking-[0.18em]">BMQT</p>
        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-300">{t("subtitle")}</p>
        <span className="auth-progress mx-auto mt-8 block h-1 w-40 overflow-hidden rounded-full bg-white/15" aria-hidden="true"><span className="block h-full w-1/2 rounded-full bg-blue-400" /></span>
        <p className="mt-5 text-sm text-slate-200">{t("loading")}</p>
      </div>
    </main>
  );
}

function BootstrapErrorView({ onRetry, isRetrying }: { onRetry: () => Promise<void>; isRetrying: boolean }) {
  const t = useTranslations("Auth.bootstrap");
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-5 py-10">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-7 shadow-sm" aria-labelledby="bootstrap-error-title">
        <p className="text-xl font-bold tracking-[0.15em] text-slate-950">BMQT</p>
        <h1 id="bootstrap-error-title" className="mt-8 text-2xl font-semibold text-slate-950">{t("errorTitle")}</h1>
        <p className="mt-3 leading-7 text-slate-600">{t("errorDescription")}</p>
        <button type="button" onClick={() => void onRetry()} disabled={isRetrying} className="mt-6 min-h-12 w-full rounded-lg bg-blue-700 px-5 font-semibold text-white outline-none hover:bg-blue-800 focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:bg-blue-400">
          {t("retry")}
        </button>
      </section>
    </main>
  );
}
