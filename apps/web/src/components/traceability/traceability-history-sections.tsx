"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  fetchNonconformanceHistory,
  fetchProcessHistory,
  fetchQualityHistory,
  type NonconformanceHistoryResponse,
  type ProcessHistoryResponse,
  type QualityEvidence,
  type QualityHistoryResponse,
} from "@/lib/api/traceability-history";
import { TraceabilityApiError, type TraceabilityErrorKind } from "@/lib/api/traceability";
import {
  consumePendingTraceabilityDisclosure,
  readPendingTraceabilityDisclosure,
  recordActiveTraceabilityDisclosure,
  releaseActiveTraceabilityDisclosure,
  type TraceabilityDisclosureGroup,
} from "@/lib/traceability-disclosure-state";

type HistoryError = { kind: Exclude<TraceabilityErrorKind, "unauthenticated" | "notFound">; code?: string };
type HistoryState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; error: HistoryError };
type QualityFilter = "ALL" | "PASS" | "NG";
type NonconformanceFilter = "ALL" | "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

function historyError(error: unknown): { kind: TraceabilityErrorKind; code?: string } {
  return error instanceof TraceabilityApiError
    ? { kind: error.kind, ...(error.code ? { code: error.code } : {}) }
    : { kind: "unexpected" };
}

export function TraceabilityHistorySections({
  traceCode,
  locale,
  onUnauthenticated,
}: {
  traceCode: string;
  locale: string;
  onUnauthenticated: () => void;
}) {
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }),
    [locale],
  );
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  return (
    <>
      <ProcessHistorySection key={`process-${traceCode}`} traceCode={traceCode} dateFormatter={dateFormatter} numberFormatter={numberFormatter} onUnauthenticated={onUnauthenticated} />
      <QualityHistorySection key={`quality-${traceCode}`} traceCode={traceCode} dateFormatter={dateFormatter} numberFormatter={numberFormatter} onUnauthenticated={onUnauthenticated} />
      <NonconformanceHistorySection key={`nonconformance-${traceCode}`} traceCode={traceCode} dateFormatter={dateFormatter} numberFormatter={numberFormatter} onUnauthenticated={onUnauthenticated} />
    </>
  );
}

function NonconformanceHistorySection({ traceCode, dateFormatter, numberFormatter, onUnauthenticated }: HistorySectionProps) {
  const t = useTranslations("TraceabilityDetail.history");
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<NonconformanceFilter>("ALL");
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<HistoryState<NonconformanceHistoryResponse>>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    void fetchNonconformanceHistory(traceCode, { page, pageSize: 10, ...(filter === "ALL" ? {} : { status: filter }) }, controller.signal)
      .then((data) => setState({ status: "ready", data }))
      .catch((error: unknown) => handleFailure(error, controller, onUnauthenticated, setState));
    return () => controller.abort();
  }, [filter, onUnauthenticated, page, traceCode, version]);

  function changeFilter(next: NonconformanceFilter) {
    setState({ status: "loading" });
    setFilter(next);
    setPage(1);
  }

  function requestPage(nextPage: number) {
    setState({ status: "loading" });
    setPage(nextPage);
  }

  function retry() {
    setState({ status: "loading" });
    setVersion((value) => value + 1);
  }

  return (
    <HistorySectionShell eyebrow={t("nonconformance.eyebrow")} title={t("nonconformance.title")} description={t("nonconformance.description")} titleId="nonconformance-history-title">
      <fieldset className="mb-5">
        <legend dir="auto" className="text-sm font-semibold text-slate-800">{t("nonconformance.filterLabel")}</legend>
        <div className="mt-2 inline-flex max-w-full flex-wrap gap-2" role="group">
          {(["ALL", "OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const).map((value) => (
            <button key={value} type="button" aria-pressed={filter === value} onClick={() => changeFilter(value)} className={`min-h-11 rounded-lg border px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${filter === value ? "border-blue-700 bg-blue-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>{t(`nonconformance.filters.${value}`)}</button>
          ))}
        </div>
      </fieldset>
      {state.status === "loading" ? <Loading text={t("nonconformance.loading")} /> : null}
      {state.status === "error" ? <HistoryFailure error={state.error} onRetry={retry} /> : null}
      {state.status === "ready" ? (
        <>
          {state.data.items.length === 0 ? <Empty text={filter === "ALL" ? t("nonconformance.empty") : t("nonconformance.emptyFiltered")} /> : (
            <ol className="space-y-4">
              {state.data.items.map((item) => <li key={item.code}><NonconformanceCard traceCode={traceCode} item={item} dateFormatter={dateFormatter} numberFormatter={numberFormatter} /></li>)}
            </ol>
          )}
          <HistoryPagination page={state.data.page} onPage={requestPage} label={t("nonconformance.paginationLabel")} />
        </>
      ) : null}
    </HistorySectionShell>
  );
}

type NonconformanceItem = NonconformanceHistoryResponse["items"][number];

function NonconformanceCard({ traceCode, item, dateFormatter, numberFormatter }: { traceCode: string; item: NonconformanceItem; dateFormatter: Intl.DateTimeFormat; numberFormatter: Intl.NumberFormat }) {
  const t = useTranslations("TraceabilityDetail.history.nonconformance");
  const statusStyle = { OPEN: "border-rose-200 bg-rose-100 text-rose-900", IN_PROGRESS: "border-amber-200 bg-amber-100 text-amber-950", RESOLVED: "border-blue-200 bg-blue-100 text-blue-900", CLOSED: "border-slate-300 bg-slate-200 text-slate-800" }[item.status];
  return (
    <article className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0"><h3 className="break-all font-semibold text-slate-950"><bdi dir="ltr">{item.code}</bdi></h3><p dir="auto" className="mt-1 text-sm font-medium text-slate-800">{item.defectCategory.name}</p><p className="mt-1 break-all text-xs text-slate-500"><bdi dir="ltr">{item.defectCategory.code}</bdi></p></div>
        <span dir="auto" className={`self-start rounded-full border px-2.5 py-1 text-xs font-bold ${statusStyle}`}>{t("currentStatus", { status: t(`status.${item.status}`) })}</span>
      </div>
      {item.description ? <p dir="auto" className="mt-4 break-words text-sm leading-6 text-slate-700">{item.description}</p> : null}
      <dl className="mt-4 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2 xl:grid-cols-3">
        <HistoryField label={t("detected")}><HistoryTimestamp value={item.detectedAt} formatter={dateFormatter} /></HistoryField>
        {item.resolvedAt ? <HistoryField label={t("resolved")}><HistoryTimestamp value={item.resolvedAt} formatter={dateFormatter} /></HistoryField> : null}
        {item.closedAt ? <HistoryField label={t("closed")}><HistoryTimestamp value={item.closedAt} formatter={dateFormatter} /></HistoryField> : null}
      </dl>
      {(item.source.inspectionRecordId || item.source.processExecutionRecordId) ? <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3"><h4 dir="auto" className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">{t("sourceEvidence")}</h4><dl className="mt-2 grid gap-2 sm:grid-cols-2">{item.source.inspectionRecordId ? <HistoryField label={t("inspectionReference")}><TechnicalReference value={item.source.inspectionRecordId} /></HistoryField> : null}{item.source.processExecutionRecordId ? <HistoryField label={t("executionReference")}><TechnicalReference value={item.source.processExecutionRecordId} /></HistoryField> : null}</dl></div> : null}
      <div className="mt-4 space-y-3">
        <EvidenceGroup traceCode={traceCode} nonconformanceCode={item.code} group="abnormalCases" title={t("groups.abnormalCases")} items={item.abnormalCases} metadata={item.nestedPageInfo.abnormalCases} numberFormatter={numberFormatter} render={(entry) => <dl className="grid gap-2 sm:grid-cols-2"><HistoryField label={t("code")}><TechnicalReference value={entry.code} /></HistoryField><HistoryField label={t("opened")}><HistoryTimestamp value={entry.openedAt} formatter={dateFormatter} /></HistoryField>{entry.reason ? <HistoryField label={t("reason")}><span dir="auto">{entry.reason}</span></HistoryField> : null}{entry.closedAt ? <HistoryField label={t("closed")}><HistoryTimestamp value={entry.closedAt} formatter={dateFormatter} /></HistoryField> : null}</dl>} itemKey={(entry) => entry.code} />
        <EvidenceGroup traceCode={traceCode} nonconformanceCode={item.code} group="actions" title={t("groups.actions")} items={item.actions} metadata={item.nestedPageInfo.actions} numberFormatter={numberFormatter} render={(entry) => <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3"><HistoryField label={t("publicReference")}><TechnicalReference value={entry.recordId} /></HistoryField><HistoryField label={t("actionType")}><span dir="auto">{t(`actions.${entry.actionType}`)}</span></HistoryField><HistoryField label={t("occurred")}><HistoryTimestamp value={entry.occurredAt} formatter={dateFormatter} /></HistoryField>{entry.abnormalCaseCode ? <HistoryField label={t("abnormalCase")}><TechnicalReference value={entry.abnormalCaseCode} /></HistoryField> : null}{entry.resultingInspectionRecordId ? <HistoryField label={t("resultingInspectionReference")}><TechnicalReference value={entry.resultingInspectionRecordId} /></HistoryField> : null}{entry.relatedUnitTraceCode ? <HistoryField label={t("relatedUnit")}><Link href={`/traceability/${encodeURIComponent(entry.relatedUnitTraceCode)}`} aria-label={t("relatedUnitLink", { traceCode: entry.relatedUnitTraceCode })} className="break-all font-semibold text-blue-800 underline decoration-blue-300 underline-offset-4 outline-none hover:text-blue-950 focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-blue-600"><bdi dir="ltr">{entry.relatedUnitTraceCode}</bdi></Link></HistoryField> : null}{entry.note ? <HistoryField label={t("note")}><span dir="auto">{entry.note}</span></HistoryField> : null}</dl>} itemKey={(entry) => entry.recordId} />
        <EvidenceGroup traceCode={traceCode} nonconformanceCode={item.code} group="verifications" title={t("groups.verifications")} items={item.verifications} metadata={item.nestedPageInfo.verifications} numberFormatter={numberFormatter} render={(entry) => <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3"><HistoryField label={t("publicReference")}><TechnicalReference value={entry.recordId} /></HistoryField><HistoryField label={t("inspectionReference")}><TechnicalReference value={entry.inspectionRecordId} /></HistoryField>{entry.actionRecordId ? <HistoryField label={t("actionReference")}><TechnicalReference value={entry.actionRecordId} /></HistoryField> : null}<HistoryField label={t("verified")}><HistoryTimestamp value={entry.verifiedAt} formatter={dateFormatter} /></HistoryField>{entry.note ? <HistoryField label={t("note")}><span dir="auto">{entry.note}</span></HistoryField> : null}</dl>} itemKey={(entry) => entry.recordId} />
        <EvidenceGroup traceCode={traceCode} nonconformanceCode={item.code} group="dispositions" title={t("groups.dispositions")} items={item.dispositions} metadata={item.nestedPageInfo.dispositions} numberFormatter={numberFormatter} render={(entry) => <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3"><HistoryField label={t("publicReference")}><TechnicalReference value={entry.recordId} /></HistoryField><HistoryField label={t("dispositionType")}><span dir="auto">{t(`dispositions.${entry.dispositionType}`)}</span></HistoryField><HistoryField label={t("decided")}><HistoryTimestamp value={entry.decidedAt} formatter={dateFormatter} /></HistoryField>{entry.note ? <HistoryField label={t("note")}><span dir="auto">{entry.note}</span></HistoryField> : null}</dl>} itemKey={(entry) => entry.recordId} />
      </div>
    </article>
  );
}

function EvidenceGroup<T>({ traceCode, nonconformanceCode, group, title, items, metadata, numberFormatter, render, itemKey }: { traceCode: string; nonconformanceCode: string; group: TraceabilityDisclosureGroup; title: string; items: T[]; metadata: { returnedCount: number; totalCount: number; isPartial: boolean }; numberFormatter: Intl.NumberFormat; render: (item: T) => React.ReactNode; itemKey: (item: T) => string }) {
  const t = useTranslations("TraceabilityDetail.history.nonconformance");
  const owner = useRef<symbol>(Symbol("traceability-disclosure"));
  const [open, setOpen] = useState(() => readPendingTraceabilityDisclosure(traceCode, nonconformanceCode, group) ?? false);

  useEffect(() => {
    const currentOwner = owner.current;
    recordActiveTraceabilityDisclosure(traceCode, nonconformanceCode, group, currentOwner, open);
    consumePendingTraceabilityDisclosure(traceCode, nonconformanceCode, group);
    return () => releaseActiveTraceabilityDisclosure(traceCode, nonconformanceCode, group, currentOwner);
  }, [group, nonconformanceCode, open, traceCode]);

  return <details open={open} onToggle={(event) => {
    const nextOpen = event.currentTarget.open;
    setOpen(nextOpen);
    recordActiveTraceabilityDisclosure(traceCode, nonconformanceCode, group, owner.current, nextOpen);
  }} className="rounded-lg border border-slate-200 bg-white"><summary dir="auto" className="min-h-11 cursor-pointer px-4 py-3 font-semibold text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-blue-600">{title} ({numberFormatter.format(metadata.returnedCount)})</summary><div className="border-t border-slate-200 p-4">{metadata.isPartial ? <p role="note" dir="auto" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{t("partial", { returned: numberFormatter.format(metadata.returnedCount), total: numberFormatter.format(metadata.totalCount) })} {t("partialNotice")}</p> : null}{items.length === 0 ? <p dir="auto" className="text-sm text-slate-500">{t("noneRecorded")}</p> : <ol className="space-y-3">{items.map((item) => <li key={itemKey(item)} className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3">{render(item)}</li>)}</ol>}</div></details>;
}

function TechnicalReference({ value }: { value: string }) {
  return <bdi dir="ltr" className="break-all font-mono text-xs text-slate-700">{value}</bdi>;
}

function ProcessHistorySection({ traceCode, dateFormatter, numberFormatter, onUnauthenticated }: HistorySectionProps) {
  const t = useTranslations("TraceabilityDetail.history");
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<HistoryState<ProcessHistoryResponse>>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    void fetchProcessHistory(traceCode, { page, pageSize: 25 }, controller.signal)
      .then((data) => setState({ status: "ready", data }))
      .catch((error: unknown) => handleFailure(error, controller, onUnauthenticated, setState));
    return () => controller.abort();
  }, [onUnauthenticated, page, traceCode, version]);

  function requestPage(nextPage: number) {
    setState({ status: "loading" });
    setPage(nextPage);
  }

  function retry() {
    setState({ status: "loading" });
    setVersion((value) => value + 1);
  }

  return (
    <HistorySectionShell eyebrow={t("process.eyebrow")} title={t("process.title")} description={t("process.description")} titleId="process-history-title">
      {state.status === "loading" ? <Loading text={t("process.loading")} /> : null}
      {state.status === "error" ? <HistoryFailure error={state.error} onRetry={retry} /> : null}
      {state.status === "ready" ? (
        <>
          {state.data.items.length === 0 ? <Empty text={t("process.empty")} /> : (
            <ol className="space-y-3">
              {state.data.items.map((item) => (
                <li key={item.recordId}>
                  <article className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h3 dir="auto" className="font-semibold text-slate-950">{item.process.name}</h3>
                        <p className="mt-1 text-sm text-slate-600"><bdi dir="ltr">{item.process.code}</bdi></p>
                      </div>
                      <span dir="auto" className="self-start rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700">{t(`process.status.${item.status}`)}</span>
                    </div>
                    <dl className="mt-4 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2 xl:grid-cols-4">
                      <HistoryField label={t("attempt")}><bdi dir="ltr">{numberFormatter.format(item.attemptNumber)}</bdi></HistoryField>
                      <HistoryField label={t("process.method")}>{t(`process.methods.${item.executionMethod}`)}</HistoryField>
                      <HistoryField label={t("process.started")}><HistoryTimestamp value={item.startedAt} formatter={dateFormatter} /></HistoryField>
                      <HistoryField label={t("process.finished")}>{item.finishedAt ? <HistoryTimestamp value={item.finishedAt} formatter={dateFormatter} /> : <span dir="auto">{t("process.notFinished")}</span>}</HistoryField>
                      {item.route ? <HistoryField label={t("process.route")}><bdi dir="ltr">{item.route.code}</bdi><span dir="auto" className="ms-2 text-slate-500">{t("process.routeContext", { version: item.route.version, step: item.route.stepOrder })}</span></HistoryField> : null}
                    </dl>
                  </article>
                </li>
              ))}
            </ol>
          )}
          <HistoryPagination page={state.data.page} onPage={requestPage} label={t("process.paginationLabel")} />
        </>
      ) : null}
    </HistorySectionShell>
  );
}

function QualityHistorySection({ traceCode, dateFormatter, numberFormatter, onUnauthenticated }: HistorySectionProps) {
  const t = useTranslations("TraceabilityDetail.history");
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<QualityFilter>("ALL");
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<HistoryState<QualityHistoryResponse>>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    void fetchQualityHistory(traceCode, { page, pageSize: 25, ...(filter === "ALL" ? {} : { outcome: filter }) }, controller.signal)
      .then((data) => setState({ status: "ready", data }))
      .catch((error: unknown) => handleFailure(error, controller, onUnauthenticated, setState));
    return () => controller.abort();
  }, [filter, onUnauthenticated, page, traceCode, version]);

  function changeFilter(next: QualityFilter) {
    setState({ status: "loading" });
    setFilter(next);
    setPage(1);
  }

  function requestPage(nextPage: number) {
    setState({ status: "loading" });
    setPage(nextPage);
  }

  function retry() {
    setState({ status: "loading" });
    setVersion((value) => value + 1);
  }

  return (
    <HistorySectionShell eyebrow={t("quality.eyebrow")} title={t("quality.title")} description={t("quality.description")} titleId="quality-history-title">
      <fieldset className="mb-5">
        <legend dir="auto" className="text-sm font-semibold text-slate-800">{t("quality.filterLabel")}</legend>
        <div className="mt-2 inline-flex max-w-full flex-wrap gap-2" role="group">
          {(["ALL", "PASS", "NG"] as const).map((value) => (
            <button key={value} type="button" aria-pressed={filter === value} onClick={() => changeFilter(value)} className={`min-h-11 rounded-lg border px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${filter === value ? "border-blue-700 bg-blue-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>{t(`quality.filters.${value}`)}</button>
          ))}
        </div>
      </fieldset>
      {state.status === "loading" ? <Loading text={t("quality.loading")} /> : null}
      {state.status === "error" ? <HistoryFailure error={state.error} onRetry={retry} /> : null}
      {state.status === "ready" ? (
        <>
          {state.data.items.length === 0 ? <Empty text={filter === "ALL" ? t("quality.empty") : t("quality.emptyFiltered", { filter: t(`quality.filters.${filter}`) })} /> : (
            <ol className="space-y-3">
              {state.data.items.map((item) => (
                <li key={item.recordId}>
                  <article className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-slate-950"><bdi dir="ltr">{item.specification.code}</bdi></h3>
                        <p dir="auto" className="mt-1 text-sm text-slate-600">{t("quality.specVersion", { version: item.specification.version })} · <bdi dir="ltr">{item.processCode}</bdi></p>
                      </div>
                      <span dir="auto" className={`self-start rounded-full px-2.5 py-1 text-xs font-bold ${item.outcome === "PASS" ? "bg-emerald-100 text-emerald-900" : "bg-rose-100 text-rose-900"}`}>{item.outcome}</span>
                    </div>
                    <dl className="mt-4 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2 xl:grid-cols-3">
                      <HistoryField label={t("attempt")}><bdi dir="ltr">{numberFormatter.format(item.attemptNumber)}</bdi></HistoryField>
                      <HistoryField label={t("quality.inspected")}><HistoryTimestamp value={item.inspectedAt} formatter={dateFormatter} /></HistoryField>
                      <HistoryField label={t("quality.evidence")}><QualityEvidenceValue evidence={item.evidence} /></HistoryField>
                    </dl>
                  </article>
                </li>
              ))}
            </ol>
          )}
          <HistoryPagination page={state.data.page} onPage={requestPage} label={t("quality.paginationLabel")} />
        </>
      ) : null}
    </HistorySectionShell>
  );
}

type HistorySectionProps = {
  traceCode: string;
  dateFormatter: Intl.DateTimeFormat;
  numberFormatter: Intl.NumberFormat;
  onUnauthenticated: () => void;
};

function handleFailure<T>(error: unknown, controller: AbortController, onUnauthenticated: () => void, setState: (state: HistoryState<T>) => void) {
  if (controller.signal.aborted) return;
  const normalized = historyError(error);
  if (normalized.kind === "unauthenticated") {
    onUnauthenticated();
    return;
  }
  setState({ status: "error", error: { kind: normalized.kind === "notFound" ? "unexpected" : normalized.kind, ...(normalized.code ? { code: normalized.code } : {}) } });
}

function HistorySectionShell({ eyebrow, title, description, titleId, children }: { eyebrow: string; title: string; description: string; titleId: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby={titleId}><div className="border-b border-slate-200 pb-5"><p dir="auto" className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">{eyebrow}</p><h2 dir="auto" id={titleId} className="mt-1 text-xl font-semibold text-slate-950">{title}</h2><p dir="auto" className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p></div><div className="mt-5">{children}</div></section>;
}

function Loading({ text }: { text: string }) {
  return <div role="status" aria-live="polite" className="rounded-xl border border-slate-200 bg-slate-50 p-5"><p dir="auto" className="text-sm font-medium text-slate-700">{text}</p><div aria-hidden="true" className="mt-4 h-16 animate-pulse rounded-lg bg-slate-200" /></div>;
}

function Empty({ text }: { text: string }) {
  return <p dir="auto" className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm leading-6 text-slate-600">{text}</p>;
}

function HistoryFailure({ error, onRetry }: { error: HistoryError; onRetry: () => void }) {
  const t = useTranslations("TraceabilityDetail.history.errors");
  const integrity = error.code === "TRACEABILITY_HISTORY_INTEGRITY_ERROR";
  const key = integrity ? "integrity" : error.kind;
  const retryable = error.kind !== "forbidden" && error.kind !== "invalid";
  return <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4"><p dir="auto" className="font-semibold text-slate-950">{t(`${key}Title`)}</p><p dir="auto" className="mt-1 text-sm leading-6 text-slate-700">{t(`${key}Description`)}</p>{retryable ? <button type="button" onClick={onRetry} className="mt-3 min-h-11 rounded-lg bg-blue-700 px-4 font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">{t("retry")}</button> : null}</div>;
}

function HistoryField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0"><dt dir="auto" className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm text-slate-800">{children}</dd></div>;
}

function HistoryTimestamp({ value, formatter }: { value: string; formatter: Intl.DateTimeFormat }) {
  return <time dateTime={value}><bdi dir="auto" className="inline-block whitespace-nowrap">{formatter.format(new Date(value))}</bdi></time>;
}

function QualityEvidenceValue({ evidence }: { evidence: QualityEvidence }) {
  const t = useTranslations("TraceabilityDetail.history.quality");
  if (evidence.type === "NUMERIC") return <span><bdi dir="ltr">{evidence.value}</bdi>{evidence.unitCode ? <> <bdi dir="ltr">{evidence.unitCode}</bdi></> : null}</span>;
  if (evidence.type === "BOOLEAN") return <span dir="auto">{evidence.value ? t("booleanTrue") : t("booleanFalse")}</span>;
  if (evidence.type === "TEXT") return <span dir="auto">{evidence.value}</span>;
  return <span><bdi dir="ltr">{evidence.optionCode}</bdi><span dir="auto" className="ms-2 text-slate-500">{evidence.isAcceptable ? t("acceptable") : t("notAcceptable")}</span></span>;
}

function HistoryPagination({ page, onPage, label }: { page: { number: number; totalPages: number }; onPage: (page: number) => void; label: string }) {
  const t = useTranslations("TraceabilityDetail.history.pagination");
  if (page.totalPages === 0) return null;
  return <nav className="mt-5 flex flex-col items-stretch gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between" aria-label={label}><button type="button" disabled={page.number <= 1} onClick={() => onPage(page.number - 1)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 font-semibold text-slate-800 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-45">{t("previous")}</button><p dir="auto" className="text-center text-sm text-slate-600">{t("page", { page: page.number, total: page.totalPages })}</p><button type="button" disabled={page.number >= page.totalPages} onClick={() => onPage(page.number + 1)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 font-semibold text-slate-800 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-45">{t("next")}</button></nav>;
}
