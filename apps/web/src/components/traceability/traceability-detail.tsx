"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import {
  getTraceableUnitDetail,
  getTraceableUnitGenealogy,
  type GenealogyDirection,
  type GenealogyEdge,
  type GenealogyPartialReason,
  type GenealogyRequest,
  type GenealogyResponse,
  type GenealogyScope,
  type UnitDetailResponse,
} from "@/lib/api/traceability-detail";
import { TraceabilityApiError, type TraceabilityErrorKind } from "@/lib/api/traceability";
import { isValidTraceCode, normalizeTraceCodeInput, normalizeTraceCodeSubmission } from "@/lib/trace-code";
import { TraceabilityHistorySections } from "./traceability-history-sections";

type DetailState =
  | { status: "loading" }
  | { status: "ready"; data: UnitDetailResponse }
  | { status: "error"; kind: Exclude<TraceabilityErrorKind, "unauthenticated"> };

type GenealogyState =
  | { status: "loading" }
  | { status: "ready"; data: GenealogyResponse; edges: GenealogyEdge[]; loadingMore: boolean; loadMoreError: boolean }
  | { status: "error"; kind: Exclude<TraceabilityErrorKind, "unauthenticated" | "notFound"> };

const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;
const PICKER_CONTROL_CLASS_NAME = "mt-1 h-11 min-h-11 max-h-11 w-full box-border rounded-lg border border-slate-300 bg-white px-3 py-0 text-sm leading-5 text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-blue-600";

function errorKind(error: unknown): TraceabilityErrorKind {
  return error instanceof TraceabilityApiError ? error.kind : "unexpected";
}

function scopeFromParams(params: URLSearchParams): { scope: GenealogyScope; at: string | null; valid: boolean } {
  const rawScope = params.get("scope");
  const scope: GenealogyScope = rawScope === "historical" || rawScope === "asOf" ? rawScope : "current";
  const at = params.get("at");
  const validAt = Boolean(at && ISO_TIMESTAMP_PATTERN.test(at) && !Number.isNaN(Date.parse(at)));
  return { scope, at: scope === "asOf" && validAt ? at : null, valid: scope !== "asOf" || validAt };
}

function scopeQuery(scope: GenealogyScope, at: string | null): string {
  const params = new URLSearchParams();
  if (scope !== "current") params.set("scope", scope);
  if (scope === "asOf" && at) params.set("at", at);
  const query = params.toString();
  return query ? `?${query}` : "";
}

function localDateTimeValue(iso: string | null): string {
  if (!iso) return "";
  const value = new Date(iso);
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16).replace("T", " ");
}

function isValidLocalDateTime(value: string): boolean {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  return (
    parsed.getFullYear() === Number(year) &&
    parsed.getMonth() === Number(month) - 1 &&
    parsed.getDate() === Number(day) &&
    parsed.getHours() === Number(hour) &&
    parsed.getMinutes() === Number(minute)
  );
}

export function TraceabilityDetail({
  rawTraceCode,
  onUnauthenticated,
}: {
  rawTraceCode: string;
  onUnauthenticated: () => void;
}) {
  const t = useTranslations("TraceabilityDetail");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const serializedSearchParams = searchParams.toString();
  const { push, replace } = useRouter();
  const traceCode = normalizeTraceCodeSubmission(rawTraceCode);
  const validTraceCode = isValidTraceCode(traceCode);
  const criteria = useMemo(
    () => scopeFromParams(new URLSearchParams(serializedSearchParams)),
    [serializedSearchParams],
  );
  const [detail, setDetail] = useState<DetailState>({ status: "loading" });
  const [detailVersion, setDetailVersion] = useState(0);
  const [asOfDraft, setAsOfDraft] = useState(() => localDateTimeValue(criteria.at));
  const [lastAsOf, setLastAsOf] = useState(criteria.at);
  const [searchCode, setSearchCode] = useState("");
  const [searchError, setSearchError] = useState(false);

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }),
    [locale],
  );
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  if (lastAsOf !== criteria.at) {
    setLastAsOf(criteria.at);
    setAsOfDraft(localDateTimeValue(criteria.at));
  }

  useEffect(() => {
    if (!validTraceCode) return;
    const canonicalQuery = criteria.scope === "asOf" && !criteria.valid
      ? "?scope=asOf"
      : scopeQuery(criteria.scope, criteria.at);
    const expected = `/traceability/${encodeURIComponent(traceCode)}${canonicalQuery}`;
    const current = `/traceability/${encodeURIComponent(rawTraceCode)}${serializedSearchParams ? `?${serializedSearchParams}` : ""}`;
    if (expected !== current) replace(expected);
  }, [criteria.at, criteria.scope, criteria.valid, rawTraceCode, replace, serializedSearchParams, traceCode, validTraceCode]);

  useEffect(() => {
    if (!validTraceCode) return;
    const controller = new AbortController();
    void getTraceableUnitDetail(traceCode, controller.signal)
      .then((data) => setDetail({ status: "ready", data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const kind = errorKind(error);
        if (kind === "unauthenticated") {
          onUnauthenticated();
          return;
        }
        setDetail({ status: "error", kind });
      });
    return () => controller.abort();
  }, [detailVersion, onUnauthenticated, traceCode, validTraceCode]);

  function setScope(scope: GenealogyScope) {
    setAsOfDraft(scope === "asOf" ? asOfDraft : "");
    push(`/traceability/${encodeURIComponent(traceCode)}${scopeQuery(scope, null)}`, { scroll: false });
  }

  function applyAsOf(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValidLocalDateTime(asOfDraft)) return;
    const parsed = new Date(asOfDraft.replace(" ", "T"));
    if (Number.isNaN(parsed.getTime())) return;
    push(`/traceability/${encodeURIComponent(traceCode)}${scopeQuery("asOf", parsed.toISOString())}`, { scroll: false });
  }

  function searchAnotherUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeTraceCodeSubmission(searchCode);
    if (!isValidTraceCode(normalized)) {
      setSearchError(true);
      return;
    }
    const params = new URLSearchParams({ query: normalized });
    push(`/traceability?${params.toString()}`);
  }

  if (!validTraceCode) {
    return <PageState kind="invalidRoute" onRetry={null} />;
  }

  if (detail.status === "loading") {
    return (
      <section role="status" aria-live="polite" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p dir="auto" className="font-semibold text-slate-700">{t("states.loading")}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2" aria-hidden="true">
          <div className="h-28 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-28 animate-pulse rounded-xl bg-slate-100" />
        </div>
      </section>
    );
  }

  if (detail.status === "error") {
    return (
      <PageState
        kind={detail.kind}
        onRetry={detail.kind === "forbidden" || detail.kind === "notFound" || detail.kind === "invalid" ? null : () => { setDetail({ status: "loading" }); setDetailVersion((value) => value + 1); }}
      />
    );
  }

  const unit = detail.data.unit;
  const query = scopeQuery(criteria.scope, criteria.at);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="unit-identity-title">
        <div className="relative bg-[#0a1b31] px-5 py-6 text-white sm:px-7">
          <div className="industrial-grid opacity-30" aria-hidden="true" />
          <div className="relative">
            <p dir="auto" className="text-xs font-bold uppercase tracking-[0.2em] text-blue-300">{t("identity.eyebrow")}</p>
            <h2 id="unit-identity-title" className="mt-2 break-all text-2xl font-semibold sm:text-3xl"><bdi dir="ltr">{unit.traceCode}</bdi></h2>
            <p dir="auto" className="mt-2 text-slate-300">{t("identity.description")}</p>
          </div>
        </div>
        <dl className="grid gap-px bg-slate-200 sm:grid-cols-2 xl:grid-cols-4">
          <IdentityField label={t("identity.unitType")}><span dir="auto">{t(`unitTypes.${unit.unitType}`)}</span></IdentityField>
          <IdentityField label={t("identity.productModel")}>
            {unit.productModel ? <><span dir="auto" className="block font-medium">{unit.productModel.name}</span><bdi dir="ltr" className="mt-1 block text-xs font-bold text-slate-500">{unit.productModel.code}</bdi></> : <span dir="auto" className="text-slate-500">{t("identity.notAssigned")}</span>}
          </IdentityField>
          <IdentityField label={t("identity.recorded")}><Timestamp value={unit.createdAt} formatter={dateFormatter} /></IdentityField>
          <IdentityField label={t("identity.updated")}><Timestamp value={unit.updatedAt} formatter={dateFormatter} /></IdentityField>
        </dl>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="unit-search-title">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 xl:max-w-md xl:flex-1">
            <h2 dir="auto" id="unit-search-title" className="text-xl font-semibold leading-tight text-slate-950 sm:text-2xl">{t("search.title")}</h2>
            <p dir="auto" className="mt-2 text-sm leading-6 text-slate-600 sm:text-base sm:leading-7">{t("search.description")}</p>
          </div>
          <form onSubmit={searchAnotherUnit} className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start xl:w-[36rem]" noValidate>
            <div className="min-w-0 flex-1">
              <label dir="auto" htmlFor="unit-detail-search" className="text-sm font-semibold text-slate-800">{t("search.label")}</label>
              <input id="unit-detail-search" dir="ltr" value={searchCode} onChange={(event) => { setSearchCode(normalizeTraceCodeInput(event.target.value)); if (searchError) setSearchError(false); }} aria-invalid={searchError} aria-describedby={searchError ? "unit-detail-search-error" : "unit-detail-search-help"} autoComplete="off" placeholder={t("search.placeholder")} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950 outline-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-600" />
              <p dir="auto" id={searchError ? "unit-detail-search-error" : "unit-detail-search-help"} role={searchError ? "alert" : undefined} className={`mt-2 text-sm ${searchError ? "text-rose-800" : "text-slate-600"}`}>{searchError ? t("search.invalid") : t("search.help")}</p>
            </div>
            <button type="submit" className="min-h-11 rounded-lg bg-blue-700 px-5 font-semibold text-white outline-none hover:bg-blue-800 focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 sm:mt-7">{t("search.action")}</button>
          </form>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="evidence-title">
        <p dir="auto" className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">{t("evidence.eyebrow")}</p>
        <h2 dir="auto" id="evidence-title" className="mt-1 text-xl font-semibold text-slate-950">{t("evidence.title")}</h2>
        <p dir="auto" className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{t("evidence.description")}</p>
        <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <EvidenceCount label={t("evidence.genealogy")} count={detail.data.sections.genealogy.directRelationCount} formatter={numberFormatter} />
          <EvidenceCount label={t("evidence.process")} count={detail.data.sections.processHistory.recordCount} formatter={numberFormatter} />
          <EvidenceCount label={t("evidence.quality")} count={detail.data.sections.qualityHistory.recordCount} formatter={numberFormatter} />
          <EvidenceCount label={t("evidence.nonconformance")} count={detail.data.sections.nonconformance.recordCount} formatter={numberFormatter} />
        </dl>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="genealogy-title">
        <div className="flex flex-col gap-5 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p dir="auto" className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">{t("genealogy.eyebrow")}</p>
            <h2 dir="auto" id="genealogy-title" className="mt-1 text-xl font-semibold text-slate-950">{t("genealogy.title")}</h2>
            <p dir="auto" className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{t("genealogy.description")}</p>
          </div>
          <div className="min-w-0 lg:w-[24rem]">
            <label dir="auto" htmlFor="genealogy-scope" className="text-sm font-semibold text-slate-800">{t("scope.label")}</label>
            <select id="genealogy-scope" value={criteria.scope} onChange={(event) => setScope(event.target.value as GenealogyScope)} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
              <option value="current">{t("scope.current")}</option>
              <option value="historical">{t("scope.historical")}</option>
              <option value="asOf">{t("scope.asOf")}</option>
            </select>
          </div>
        </div>

        {criteria.scope === "historical" ? <p dir="auto" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">{t("scope.historicalNotice")}</p> : null}

        {criteria.scope === "asOf" ? (
          <form onSubmit={applyAsOf} className="mt-4 flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 sm:flex-row sm:items-end" noValidate>
            <div className="min-w-0 flex-1">
              <AsOfDateTimeControl value={asOfDraft} onChange={setAsOfDraft} />
            </div>
            <button type="submit" disabled={!isValidLocalDateTime(asOfDraft)} className="min-h-11 rounded-lg bg-blue-700 px-5 font-semibold text-white outline-none hover:bg-blue-800 focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">{t("scope.apply")}</button>
          </form>
        ) : null}

        {criteria.valid ? (
          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <GenealogyPanel key={`ancestors-${criteria.scope}-${criteria.at ?? ""}-${traceCode}`} traceCode={traceCode} direction="ancestors" depth={criteria.scope === "historical" ? 1 : 8} scope={criteria.scope} at={criteria.at} query={query} dateFormatter={dateFormatter} onUnauthenticated={onUnauthenticated} />
            <GenealogyPanel key={`descendants-${criteria.scope}-${criteria.at ?? ""}-${traceCode}`} traceCode={traceCode} direction="descendants" depth={1} scope={criteria.scope} at={criteria.at} query={query} dateFormatter={dateFormatter} onUnauthenticated={onUnauthenticated} />
          </div>
        ) : null}
      </section>

      <TraceabilityHistorySections
        traceCode={traceCode}
        locale={locale}
        onUnauthenticated={onUnauthenticated}
      />
    </div>
  );
}

type DateTimeParts = { year: number; month: number; day: number; time: string };
type DateTimeSegments = { year: string; month: string; day: string; hour: string; minute: string };

const EMPTY_DATE_TIME_SEGMENTS: DateTimeSegments = { year: "", month: "", day: "", hour: "", minute: "" };

function pickerParts(value: string): DateTimeParts {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value);
  if (match && isValidLocalDateTime(value)) {
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), time: `${match[4]}:${match[5]}` };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(), time: "12:00" };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function pickerValue(parts: DateTimeParts): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${parts.time}`;
}

function segmentParts(value: string): DateTimeSegments {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value);
  return match
    ? { year: match[1], month: match[2], day: match[3], hour: match[4], minute: match[5] }
    : { ...EMPTY_DATE_TIME_SEGMENTS };
}

function segmentValue(segments: DateTimeSegments): string {
  return `${segments.year}-${segments.month}-${segments.day} ${segments.hour}:${segments.minute}`;
}

function AsOfDateTimeControl({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const t = useTranslations("TraceabilityDetail.scope");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [parts, setParts] = useState(() => pickerParts(value));
  const [segments, setSegments] = useState<DateTimeSegments>(() => segmentParts(value));
  const [lastValue, setLastValue] = useState(value);
  const firstPickerControl = useRef<HTMLSelectElement>(null);
  const pickerButton = useRef<HTMLButtonElement>(null);
  const valid = isValidLocalDateTime(value);

  if (lastValue !== value) {
    setLastValue(value);
    if (isValidLocalDateTime(value)) {
      setParts(pickerParts(value));
      setSegments(segmentParts(value));
    }
  }

  useEffect(() => {
    if (open) firstPickerControl.current?.focus();
  }, [open]);

  const years = useMemo(() => {
    const values = Array.from({ length: 101 }, (_, index) => 2000 + index);
    if (!values.includes(parts.year)) values.push(parts.year);
    return values.sort((left, right) => left - right);
  }, [parts.year]);
  const monthFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { month: "long" }), [locale]);

  function updateParts(next: Partial<DateTimeParts>) {
    const merged = { ...parts, ...next };
    merged.day = Math.min(merged.day, daysInMonth(merged.year, merged.month));
    setParts(merged);
    const nextValue = pickerValue(merged);
    setSegments(segmentParts(nextValue));
    onChange(nextValue);
  }

  function updateSegment(key: keyof DateTimeSegments, rawValue: string, input: HTMLInputElement) {
    const maxLength = key === "year" ? 4 : 2;
    const digits = rawValue.replace(/\D/g, "").slice(0, maxLength);
    const next = { ...segments, [key]: digits };
    let completedSegmentIsValid = false;
    if (digits.length === maxLength) {
      const numeric = Number(digits);
      if (key === "year") {
        completedSegmentIsValid = numeric >= 2000 && numeric <= 2100;
        next.year = String(Math.min(2100, Math.max(2000, numeric)));
      }
      if (key === "month") {
        completedSegmentIsValid = numeric >= 1 && numeric <= 12;
        next.month = String(Math.min(12, Math.max(1, numeric))).padStart(2, "0");
      }
      if (key === "hour") {
        completedSegmentIsValid = numeric >= 0 && numeric <= 23;
        next.hour = String(Math.min(23, numeric)).padStart(2, "0");
      }
      if (key === "minute") {
        completedSegmentIsValid = numeric >= 0 && numeric <= 59;
        next.minute = String(Math.min(59, numeric)).padStart(2, "0");
      }
      if (key === "day") {
        const maximum = next.year.length === 4 && next.month.length === 2
          ? daysInMonth(Number(next.year), Number(next.month))
          : 31;
        completedSegmentIsValid = numeric >= 1 && numeric <= maximum;
        next.day = String(Math.min(maximum, Math.max(1, numeric))).padStart(2, "0");
      }
    }
    if ((key === "year" || key === "month") && next.year.length === 4 && next.month.length === 2 && next.day.length === 2) {
      next.day = String(Math.min(Number(next.day), daysInMonth(Number(next.year), Number(next.month)))).padStart(2, "0");
    }
    setSegments(next);
    const nextValue = segmentValue(next);
    onChange(nextValue);
    if (isValidLocalDateTime(nextValue)) setParts(pickerParts(nextValue));
    if (completedSegmentIsValid) {
      const nextKey = key === "day"
        ? "month"
        : key === "month"
          ? "year"
          : key === "year"
            ? "hour"
            : key === "hour"
              ? "minute"
              : null;
      const nextInput = nextKey
        ? input.closest<HTMLElement>('[role="group"]')?.querySelector<HTMLInputElement>(`[data-segment="${nextKey}"]`)
        : null;
      nextInput?.focus();
      nextInput?.select();
    }
  }

  const segmentInputClassName = "min-w-0 rounded-sm border border-transparent bg-transparent px-0.5 py-0 text-center font-mono text-base leading-5 tabular-nums text-slate-950 outline-none focus:border-blue-500 focus:bg-blue-50 focus:text-slate-950";
  const segmentProps = (key: keyof DateTimeSegments, label: string, width: string, placeholder: string) => ({
    type: "text",
    "data-segment": key,
    inputMode: "numeric" as const,
    autoComplete: "off",
    spellCheck: false,
    value: segments[key],
    placeholder,
    "aria-label": label,
    "aria-invalid": !valid,
    "aria-describedby": !valid ? "genealogy-as-of-error" : "genealogy-as-of-help",
    className: `${segmentInputClassName} ${width}`,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => updateSegment(key, event.target.value, event.currentTarget),
    onFocus: (event: React.FocusEvent<HTMLInputElement>) => event.currentTarget.select(),
    onClick: (event: React.MouseEvent<HTMLInputElement>) => event.currentTarget.select(),
  });

  return (
    <div>
      <p dir="auto" id="genealogy-as-of-label" className="text-sm font-semibold text-slate-900">{t("atLabel")}</p>
      <div role="group" aria-labelledby="genealogy-as-of-label" dir="ltr" className="mt-2 flex min-h-11 w-full max-w-md items-center overflow-x-auto rounded-lg border border-slate-300 bg-white px-3 py-0.5 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600">
        <input {...segmentProps("day", t("pickerDay"), "w-[3.5ch]", "DD")} />
        <span aria-hidden="true" className="text-slate-400">/</span>
        <input {...segmentProps("month", t("pickerMonth"), "w-[3.5ch]", "MM")} />
        <span aria-hidden="true" className="text-slate-400">/</span>
        <input {...segmentProps("year", t("pickerYear"), "w-[5ch]", "YYYY")} />
        <span aria-hidden="true" className="mr-1 text-slate-400">,</span>
        <input {...segmentProps("hour", t("pickerHour"), "w-[3.5ch]", "HH")} />
        <span aria-hidden="true" className="text-slate-400">:</span>
        <input {...segmentProps("minute", t("pickerMinute"), "w-[3.5ch]", "mm")} />
      </div>
      <p dir="auto" id={!valid ? "genealogy-as-of-error" : "genealogy-as-of-help"} role={!valid ? "alert" : undefined} className={`mt-2 text-sm ${!valid ? "text-rose-800" : "text-slate-600"}`}>{!valid ? t("atRequired") : t("atHelp")}</p>
      <button ref={pickerButton} type="button" aria-expanded={open} aria-controls="as-of-picker-panel" onClick={() => setOpen((value) => !value)} className="mt-3 min-h-11 rounded-lg border border-blue-300 bg-white px-4 text-sm font-semibold text-blue-800 outline-none hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-600">
        {open ? t("pickerClose") : t("pickerOpen")}
      </button>
      {open ? (
        <fieldset id="as-of-picker-panel" className="mt-3 max-h-[60vh] overflow-y-auto rounded-xl border border-blue-200 bg-white p-4" onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); pickerButton.current?.focus(); } }}>
          <legend dir="auto" className="px-1 text-sm font-semibold text-slate-900">{t("pickerLegend")}</legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label dir="auto" className="text-sm font-medium text-slate-700">{t("pickerYear")}<select ref={firstPickerControl} value={parts.year} onChange={(event) => updateParts({ year: Number(event.target.value) })} className={PICKER_CONTROL_CLASS_NAME}>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
            <label dir="auto" className="text-sm font-medium text-slate-700">{t("pickerMonth")}<select value={parts.month} onChange={(event) => updateParts({ month: Number(event.target.value) })} className={PICKER_CONTROL_CLASS_NAME}>{Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option key={month} value={month}>{monthFormatter.format(new Date(2020, month - 1, 1))}</option>)}</select></label>
            <label dir="auto" className="text-sm font-medium text-slate-700">{t("pickerDay")}<select value={parts.day} onChange={(event) => updateParts({ day: Number(event.target.value) })} className={PICKER_CONTROL_CLASS_NAME}>{Array.from({ length: daysInMonth(parts.year, parts.month) }, (_, index) => index + 1).map((day) => <option key={day} value={day}>{day}</option>)}</select></label>
            <label dir="auto" className="text-sm font-medium text-slate-700">{t("pickerTime")}<input type="time" value={parts.time} onChange={(event) => updateParts({ time: event.target.value })} className={PICKER_CONTROL_CLASS_NAME} /></label>
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}

function IdentityField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0 bg-white p-5"><dt dir="auto" className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</dt><dd className="mt-2 text-sm text-slate-900">{children}</dd></div>;
}

function EvidenceCount({ label, count, formatter }: { label: string; count: number; formatter: Intl.NumberFormat }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><dt dir="auto" className="text-sm font-medium text-slate-600">{label}</dt><dd className="mt-2 text-2xl font-semibold text-slate-950">{formatter.format(count)}</dd></div>;
}

function Timestamp({ value, formatter }: { value: string; formatter: Intl.DateTimeFormat }) {
  return <time dateTime={value}><bdi dir="auto" className="inline-block whitespace-nowrap">{formatter.format(new Date(value))}</bdi></time>;
}

function GenealogyPanel({
  traceCode,
  direction,
  depth,
  scope,
  at,
  query,
  dateFormatter,
  onUnauthenticated,
}: {
  traceCode: string;
  direction: GenealogyDirection;
  depth: number;
  scope: GenealogyScope;
  at: string | null;
  query: string;
  dateFormatter: Intl.DateTimeFormat;
  onUnauthenticated: () => void;
}) {
  const t = useTranslations("TraceabilityDetail");
  const [state, setState] = useState<GenealogyState>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const request = useMemo<GenealogyRequest>(() => ({ direction, scope, ...(at ? { at } : {}), depth, limit: 50 }), [at, depth, direction, scope]);

  useEffect(() => {
    const controller = new AbortController();
    void getTraceableUnitGenealogy(traceCode, request, controller.signal)
      .then((data) => setState({ status: "ready", data, edges: data.edges, loadingMore: false, loadMoreError: false }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const kind = errorKind(error);
        if (kind === "unauthenticated") {
          onUnauthenticated();
          return;
        }
        setState({ status: "error", kind: kind === "notFound" ? "unexpected" : kind });
      });
    return () => controller.abort();
  }, [onUnauthenticated, request, traceCode, version]);

  async function loadMore() {
    if (state.status !== "ready" || !state.data.pageInfo.endCursor) return;
    setState({ ...state, loadingMore: true });
    try {
      const data = await getTraceableUnitGenealogy(traceCode, { ...request, cursor: state.data.pageInfo.endCursor });
      setState({ status: "ready", data, edges: [...state.edges, ...data.edges], loadingMore: false, loadMoreError: false });
    } catch (error) {
      const kind = errorKind(error);
      if (kind === "unauthenticated") {
        onUnauthenticated();
        return;
      }
      setState({ ...state, loadingMore: false, loadMoreError: true });
    }
  }

  const title = direction === "ancestors" ? t("genealogy.ancestors") : t("genealogy.descendants");
  const description = direction === "ancestors" ? t("genealogy.ancestorsDescription") : t("genealogy.descendantsDescription");

  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5" aria-labelledby={`genealogy-${direction}-title`}>
      <h3 dir="auto" id={`genealogy-${direction}-title`} className="text-lg font-semibold text-slate-950">{title}</h3>
      <p dir="auto" className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
      {state.status === "loading" ? <p dir="auto" role="status" aria-live="polite" className="mt-5 rounded-lg bg-white px-4 py-5 text-sm font-medium text-slate-700">{t("states.genealogyLoading", { direction: title })}</p> : null}
      {state.status === "error" ? <GenealogyError kind={state.kind} onRetry={() => { setState({ status: "loading" }); setVersion((value) => value + 1); }} /> : null}
      {state.status === "ready" ? (
        <>
          {state.edges.length === 0 ? <p dir="auto" className="mt-5 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-600">{direction === "ancestors" ? t("genealogy.noAncestors") : t("genealogy.noDescendants")}</p> : (
            <ul className="mt-5 space-y-3">
              {state.edges.map((edge) => <RelationshipCard key={edge.relationId} edge={edge} direction={direction} scope={scope} query={query} formatter={dateFormatter} />)}
            </ul>
          )}
          <PartialNotice reasons={state.data.pageInfo.partialReasons} />
          {state.data.integrityWarnings.some((warning) => warning.code === "CYCLE_PATH_SKIPPED") ? <p dir="auto" role="alert" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">{t("genealogy.cycleWarning")}</p> : null}
          {state.loadMoreError ? <p dir="auto" role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{t("genealogy.loadMoreError")}</p> : null}
          {state.data.pageInfo.hasNextPage && state.data.pageInfo.endCursor ? <button type="button" onClick={() => void loadMore()} disabled={state.loadingMore} className="mt-4 min-h-11 w-full rounded-lg border border-blue-300 bg-white px-4 font-semibold text-blue-800 outline-none hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-50">{state.loadingMore ? t("genealogy.loadingMore") : t("genealogy.loadMore")}</button> : null}
        </>
      ) : null}
    </section>
  );
}

function RelationshipCard({ edge, direction, scope, query, formatter }: { edge: GenealogyEdge; direction: GenealogyDirection; scope: GenealogyScope; query: string; formatter: Intl.DateTimeFormat }) {
  const t = useTranslations("TraceabilityDetail");
  const related = direction === "ancestors" ? edge.parent : edge.child;
  const removedAfterAsOf = scope === "asOf" && edge.removedAt !== null;
  return (
    <li>
      <article className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p dir="auto" className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{direction === "ancestors" ? t("relationship.parent") : t("relationship.child")} · {t("relationship.depth", { depth: edge.depth })}</p>
            <Link href={`/traceability/${encodeURIComponent(related.traceCode)}${query}`} className="mt-1 inline-block break-all font-semibold text-blue-800 underline decoration-blue-300 underline-offset-4 outline-none hover:text-blue-950 focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-blue-600"><bdi dir="ltr">{related.traceCode}</bdi></Link>
            <p dir="auto" className="mt-1 text-sm text-slate-600">{t(`unitTypes.${related.unitType}`)}</p>
          </div>
          <span dir="auto" className={`self-start rounded-full px-2.5 py-1 text-xs font-bold ${edge.relationshipState === "CURRENT" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{removedAfterAsOf ? t("relationship.activeThenRemoved") : edge.relationshipState === "CURRENT" ? t("relationship.current") : t("relationship.historical")}</span>
        </div>
        <dl className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
          {edge.positionCode ? <div><dt dir="auto" className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">{t("relationship.position")}</dt><dd className="mt-1 text-sm text-slate-800"><bdi dir="ltr">{edge.positionCode}</bdi></dd></div> : null}
          <div><dt dir="auto" className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">{t("relationship.installed")}</dt><dd className="mt-1 text-sm text-slate-800"><Timestamp value={edge.installedAt} formatter={formatter} /></dd></div>
          {edge.removedAt ? <div><dt dir="auto" className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">{t("relationship.removed")}</dt><dd className="mt-1 text-sm text-slate-800"><Timestamp value={edge.removedAt} formatter={formatter} /></dd></div> : null}
        </dl>
        {removedAfterAsOf ? <p dir="auto" className="mt-3 text-sm leading-6 text-slate-600">{t("relationship.asOfExplanation")}</p> : null}
      </article>
    </li>
  );
}

function PartialNotice({ reasons }: { reasons: GenealogyPartialReason[] }) {
  const t = useTranslations("TraceabilityDetail.genealogy");
  const visibleReasons = reasons.filter((reason) => reason !== "CYCLE_PATH_SKIPPED");
  if (visibleReasons.length === 0) return null;
  return <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-950"><p dir="auto" className="font-semibold">{t("partialTitle")}</p><ul className="mt-1 list-disc ps-5">{visibleReasons.map((reason) => <li dir="auto" key={reason}>{t(`partial.${reason}`)}</li>)}</ul></div>;
}

function GenealogyError({ kind, onRetry }: { kind: Exclude<TraceabilityErrorKind, "unauthenticated" | "notFound">; onRetry: () => void }) {
  const t = useTranslations("TraceabilityDetail.states");
  const retryable = kind !== "forbidden" && kind !== "invalid";
  return <div role="alert" className="mt-5 rounded-lg border border-rose-200 bg-white px-4 py-4"><p dir="auto" className="font-semibold text-slate-950">{t(`${kind}GenealogyTitle`)}</p><p dir="auto" className="mt-1 text-sm leading-6 text-slate-600">{t(`${kind}GenealogyDescription`)}</p>{retryable ? <button type="button" onClick={onRetry} className="mt-3 min-h-11 rounded-lg bg-blue-700 px-4 font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">{t("retry")}</button> : null}</div>;
}

function PageState({ kind, onRetry }: { kind: Exclude<TraceabilityErrorKind, "unauthenticated"> | "invalidRoute"; onRetry: (() => void) | null }) {
  const t = useTranslations("TraceabilityDetail.states");
  return <section role="alert" className="rounded-2xl border border-rose-200 bg-white p-6 shadow-sm" aria-labelledby="traceability-detail-error"><h2 dir="auto" id="traceability-detail-error" className="text-xl font-semibold text-slate-950">{t(`${kind}Title`)}</h2><p dir="auto" className="mt-2 max-w-2xl leading-7 text-slate-600">{t(`${kind}Description`)}</p>{onRetry ? <button type="button" onClick={onRetry} className="mt-5 min-h-11 rounded-lg bg-blue-700 px-5 font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">{t("retry")}</button> : null}</section>;
}
