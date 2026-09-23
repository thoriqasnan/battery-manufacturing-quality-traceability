"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { fetchHealth } from "@/lib/api/health";

type ConnectionState = "checking" | "connected" | "unavailable";

export function ApiStatus() {
  const t = useTranslations("ApiStatus");
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("checking");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    void fetchHealth(controller.signal)
      .then(() => setConnectionState("connected"))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setConnectionState("unavailable");
        }
      });

    return () => controller.abort();
  }, [attempt]);

  const isChecking = connectionState === "checking";

  function checkAgain() {
    setConnectionState("checking");
    setAttempt((current) => current + 1);
  }

  return (
    <section
      className="mt-8 border-t border-slate-200 pt-6"
      aria-labelledby="api-status-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2
            id="api-status-title"
            className="text-sm font-semibold text-slate-900"
          >
            {t("title")}
          </h2>
          <p
            className="mt-1 flex items-center gap-2 text-sm text-slate-600"
            role="status"
            aria-live="polite"
          >
            <span
              className={`size-2 shrink-0 rounded-full ${
                connectionState === "connected"
                  ? "bg-emerald-500"
                  : connectionState === "unavailable"
                    ? "bg-red-500"
                    : "animate-pulse bg-amber-500"
              }`}
              aria-hidden="true"
            />
            {t(connectionState)}
          </p>
        </div>
        <button
          type="button"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-wait disabled:opacity-60"
          onClick={checkAgain}
          disabled={isChecking}
        >
          {isChecking ? t("checkingAction") : t("checkAgain")}
        </button>
      </div>
    </section>
  );
}
