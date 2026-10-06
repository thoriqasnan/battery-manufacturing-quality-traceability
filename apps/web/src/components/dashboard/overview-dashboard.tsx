"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  DashboardApiError,
  DashboardOverview,
  getDashboardOverview,
} from "@/lib/api/dashboard";
import { isValidTraceCode, normalizeTraceCodeInput, normalizeTraceCodeSubmission } from "@/lib/trace-code";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: DashboardOverview }
  | { status: "error"; kind: "forbidden" | "server" | "network" | "unexpected" };

export function OverviewDashboard({ onUnauthenticated }: { onUnauthenticated: () => void }) {
  const t = useTranslations("Dashboard");
  const locale = useLocale();
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [traceCode, setTraceCode] = useState("");
  const [traceError, setTraceError] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setState({ status: "ready", data: await getDashboardOverview(signal) });
    } catch (error) {
      if (signal?.aborted) return;
      const kind = error instanceof DashboardApiError ? error.kind : "unexpected";
      if (kind === "unauthenticated") {
        onUnauthenticated();
        return;
      }
      setState({ status: "error", kind });
    }
  }, [onUnauthenticated]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    void load();
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    void getDashboardOverview(controller.signal)
      .then((data) => setState({ status: "ready", data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const kind = error instanceof DashboardApiError ? error.kind : "unexpected";
        if (kind === "unauthenticated") {
          onUnauthenticated();
          return;
        }
        setState({ status: "error", kind });
      });
    return () => controller.abort();
  }, [onUnauthenticated]);

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }),
    [locale],
  );
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  function submitTrace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeTraceCodeSubmission(traceCode);
    if (!isValidTraceCode(normalized)) {
      setTraceError(true);
      return;
    }
    setTraceError(false);
    router.push(`/traceability?query=${encodeURIComponent(normalized)}`);
  }

  if (state.status === "loading") return <DashboardLoading />;
  if (state.status === "error") {
    return (
      <section role="alert" aria-labelledby="dashboard-error-title" className="rounded-2xl border border-rose-200 bg-white p-6 shadow-sm sm:p-8">
        <p dir="auto" className="text-xs font-bold uppercase tracking-[0.18em] text-rose-700">{t("states.errorEyebrow")}</p>
        <h2 dir="auto" id="dashboard-error-title" className="mt-2 text-xl font-semibold text-slate-950">
          {state.kind === "forbidden" ? t("states.forbiddenTitle") : t("states.errorTitle")}
        </h2>
        <p dir="auto" className="mt-2 max-w-2xl leading-7 text-slate-600">
          {state.kind === "forbidden" ? t("states.forbiddenDescription") : t("states.errorDescription")}
        </p>
        {state.kind !== "forbidden" ? (
          <button dir="auto" type="button" onClick={retry} className="mt-5 min-h-11 rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white outline-none hover:bg-blue-800 focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2">
            {t("states.retry")}
          </button>
        ) : null}
      </section>
    );
  }

  const { data } = state;
  const countFor = (unitType: string) => data.inventory.byType.find((item) => item.unitType === unitType)?.count ?? 0;
  const outcomeCount = (outcome: "PASS" | "NG") => data.quality.byOutcome.find((item) => item.outcome === outcome)?.count ?? 0;

  return (
    <div className="space-y-7 sm:space-y-8">
      <section className="relative overflow-hidden rounded-2xl bg-[#0a1b31] px-5 py-6 text-white shadow-lg sm:px-7 sm:py-7" aria-labelledby="trace-unit-title">
        <div className="industrial-grid opacity-40" aria-hidden="true" />
        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(28rem,1.15fr)] lg:items-end">
          <div>
            <p dir="auto" className="text-xs font-bold uppercase tracking-[0.2em] text-blue-300">{t("trace.eyebrow")}</p>
            <h2 dir="auto" id="trace-unit-title" className="mt-2 text-2xl font-semibold tracking-tight">{t("trace.title")}</h2>
            <p dir="auto" className="mt-2 max-w-xl leading-7 text-slate-300">{t("trace.description")}</p>
          </div>
          <form onSubmit={submitTrace} noValidate>
            <label dir="auto" htmlFor="overview-trace-code" className="text-sm font-semibold text-slate-100">{t("trace.label")}</label>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <input dir="ltr" id="overview-trace-code" value={traceCode} onChange={(event) => { setTraceCode(normalizeTraceCodeInput(event.target.value)); if (traceError) setTraceError(false); }} aria-invalid={traceError} aria-describedby={traceError ? "overview-trace-error" : "overview-trace-help"} autoComplete="off" placeholder={t("trace.placeholder")} className="min-h-12 min-w-0 flex-1 rounded-lg border border-white/20 bg-white px-4 text-slate-950 outline-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-400" />
              <button dir="auto" type="submit" className="min-h-12 shrink-0 rounded-lg bg-blue-600 px-6 font-semibold text-white outline-none hover:bg-blue-500 focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a1b31]">{t("trace.action")}</button>
            </div>
            <p dir="auto" id={traceError ? "overview-trace-error" : "overview-trace-help"} className={`mt-2 text-sm ${traceError ? "text-rose-300" : "text-slate-400"}`} role={traceError ? "alert" : undefined}>
              {traceError ? t("trace.invalid") : t("trace.help")}
            </p>
          </form>
        </div>
      </section>

      <section aria-labelledby="operational-summary-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">{t("summary.eyebrow")}</p>
            <h2 id="operational-summary-title" className="mt-1 text-xl font-semibold text-slate-950">{t("summary.title")}</h2>
          </div>
          <p dir="auto" className="text-sm text-slate-500">
            <span>{t("summary.generated")}</span>{" "}
            <bdi dir="auto">{dateFormatter.format(new Date(data.generatedAt))}</bdi>
          </p>
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label={t("summary.totalUnits")} value={numberFormatter.format(data.inventory.totalUnits)} tone="blue" />
          <Metric label={t("summary.inProgress")} value={numberFormatter.format(data.process.inProgressCount)} tone="amber" />
          <Metric label={t("summary.inspections")} value={numberFormatter.format(data.quality.inspectionCount)} tone="slate" />
          <Metric label={t("summary.openNc")} value={numberFormatter.format(data.nonconformance.openCount)} tone="red" />
          <Metric label={t("summary.inProgressNc")} value={numberFormatter.format(data.nonconformance.inProgressCount)} tone="amber" />
        </dl>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="inventory-title">
          <SectionHeading eyebrow={t("inventory.eyebrow")} title={t("inventory.title")} id="inventory-title" />
          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-3 2xl:grid-cols-5">
            {(["PACK", "MODULE", "CELL", "COMPONENT", "MATERIAL"] as const).map((unitType) => (
              <div key={unitType} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                <dt dir="auto" className="text-xs font-bold tracking-[0.12em] text-slate-500">{t(`unitTypes.${unitType}`)}</dt>
                <dd className="mt-2 text-2xl font-semibold text-slate-950"><bdi dir="ltr">{numberFormatter.format(countFor(unitType))}</bdi></dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="quality-title">
          <SectionHeading eyebrow={t("quality.eyebrow")} title={t("quality.title")} id="quality-title" />
          {data.quality.available ? (
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Outcome label={t("quality.pass")} value={numberFormatter.format(outcomeCount("PASS"))} tone="pass" />
              <Outcome label={t("quality.ng")} value={numberFormatter.format(outcomeCount("NG"))} tone="ng" />
              <p dir="auto" className="col-span-2 mt-1 text-sm leading-6 text-slate-500">{t("quality.scopeAllRecords")}</p>
            </div>
          ) : (
            <p dir="auto" className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">{t("quality.unavailable")}</p>
          )}
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="models-title">
          <SectionHeading eyebrow={t("models.eyebrow")} title={t("models.title")} id="models-title" />
          {data.productModels.length > 0 ? (
            <ul className="mt-4 divide-y divide-slate-100">
              {data.productModels.map((model) => (
                <li key={model.code} className="flex items-center justify-between gap-4 py-3 first:pt-1 last:pb-0">
                  <div className="min-w-0"><p dir="auto" className="truncate font-semibold text-slate-950">{model.name}</p><p className="mt-0.5 text-xs font-bold tracking-[0.1em] text-slate-500"><bdi dir="ltr">{model.code}</bdi></p></div>
                  <p dir="auto" className="shrink-0 text-sm text-slate-600"><strong className="text-lg text-slate-950"><bdi dir="ltr">{numberFormatter.format(model.packCount)}</bdi></strong> {t("models.packs")}</p>
                </li>
              ))}
            </ul>
          ) : <EmptyState text={t("models.empty")} />}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="nc-title">
          <SectionHeading eyebrow={t("nonconformance.eyebrow")} title={t("nonconformance.title")} id="nc-title" />
          <dl className="mt-5 grid grid-cols-2 gap-3">
            <Outcome label={t("nonconformance.open")} value={numberFormatter.format(data.nonconformance.openCount)} tone="ng" />
            <Outcome label={t("nonconformance.inProgress")} value={numberFormatter.format(data.nonconformance.inProgressCount)} tone="warning" />
          </dl>
          <p dir="auto" className="mt-4 text-sm leading-6 text-slate-500">{t("nonconformance.context")}</p>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="activity-title">
        <SectionHeading eyebrow={t("activity.eyebrow")} title={t("activity.title")} id="activity-title" />
        {data.process.recent.length > 0 ? (
          <ol className="mt-5 space-y-3">
            {data.process.recent.map((activity, index) => (
              <li key={`${activity.traceCode}-${activity.process.code}-${activity.attemptNumber}-${activity.startedAt}`} className="grid gap-3 rounded-xl border border-slate-200 px-4 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
                <span className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-600" aria-hidden="true">{index + 1}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><p className="font-semibold text-slate-950"><bdi dir="ltr">{activity.traceCode}</bdi></p><span dir="auto" className="text-xs font-bold tracking-[0.1em] text-slate-500">{t(`unitTypes.${activity.unitType}`)}</span></div>
                  <p dir="auto" className="mt-1 text-sm text-slate-600">{activity.process.name} <span className="text-slate-400">·</span> {t("activity.attempt", { number: activity.attemptNumber })}{activity.productModel ? <> · <bdi dir="ltr">{activity.productModel.code}</bdi></> : null}</p>
                  <p className="mt-1 text-xs text-slate-500"><bdi dir="auto">{dateFormatter.format(new Date(activity.startedAt))}</bdi>{activity.finishedAt ? <> – <bdi dir="auto">{dateFormatter.format(new Date(activity.finishedAt))}</bdi></> : null}</p>
                </div>
                <StatusBadge status={activity.status} label={t(`statuses.${activity.status}`)} />
              </li>
            ))}
          </ol>
        ) : <EmptyState text={t("activity.empty")} />}
      </section>
    </div>
  );
}

function DashboardLoading() {
  const t = useTranslations("Dashboard.states");
  return <div role="status" aria-live="polite" className="space-y-5"><p className="sr-only">{t("loading")}</p><div className="h-44 animate-pulse rounded-2xl bg-slate-200" /><div className="grid gap-3 sm:grid-cols-3"><div className="h-28 animate-pulse rounded-xl bg-slate-200" /><div className="h-28 animate-pulse rounded-xl bg-slate-200" /><div className="h-28 animate-pulse rounded-xl bg-slate-200" /></div></div>;
}

function SectionHeading({ eyebrow, title, id }: { eyebrow: string; title: string; id: string }) {
  return <div><p dir="auto" className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">{eyebrow}</p><h2 dir="auto" id={id} className="mt-1 text-lg font-semibold text-slate-950">{title}</h2></div>;
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "blue" | "amber" | "red" | "slate" }) {
  const tones = { blue: "border-blue-200 bg-blue-50", amber: "border-amber-200 bg-amber-50", red: "border-rose-200 bg-rose-50", slate: "border-slate-200 bg-white" };
  return <div className={`rounded-xl border px-4 py-4 shadow-sm ${tones[tone]}`}><dt dir="auto" className="text-sm font-medium text-slate-600">{label}</dt><dd className="mt-2 text-3xl font-semibold text-slate-950"><bdi dir="ltr">{value}</bdi></dd></div>;
}

function Outcome({ label, value, tone }: { label: string; value: string; tone: "pass" | "ng" | "warning" }) {
  const tones = { pass: "border-emerald-200 bg-emerald-50 text-emerald-800", ng: "border-rose-200 bg-rose-50 text-rose-800", warning: "border-amber-200 bg-amber-50 text-amber-800" };
  return <div className={`rounded-xl border px-4 py-4 ${tones[tone]}`}><dt dir="auto" className="text-sm font-bold">{label}</dt><dd className="mt-2 text-3xl font-semibold text-slate-950"><bdi dir="ltr">{value}</bdi></dd></div>;
}

function StatusBadge({ status, label }: { status: "IN_PROGRESS" | "COMPLETED" | "ABORTED"; label: string }) {
  const tones = { IN_PROGRESS: "bg-amber-100 text-amber-900", COMPLETED: "bg-slate-100 text-slate-700", ABORTED: "bg-rose-100 text-rose-900" };
  return <span dir="auto" className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${tones[status]}`}>{label}</span>;
}

function EmptyState({ text }: { text: string }) {
  return <p dir="auto" className="mt-5 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">{text}</p>;
}
