"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import {
  searchTraceability,
  TraceabilityApiError,
  TraceabilitySearchResponse,
  TraceableUnitType,
  traceableUnitTypes,
} from "@/lib/api/traceability";
import { isValidTraceCode, normalizeTraceCodeInput, normalizeTraceCodeSubmission } from "@/lib/trace-code";

const PRODUCT_MODEL_PATTERN = /^[A-Z0-9_-]{1,64}$/;
const PAGE_SIZE = 25;
const REVIEWER_SAMPLES = [
  { key: "cleanPass", traceCode: "PACK-DEMO-ALPHA-PASS" },
  { key: "ngRetest", traceCode: "PACK-DEMO-ALPHA-RETEST" },
  { key: "escalated", traceCode: "PACK-DEMO-BETA-ESCALATED" },
] as const;

type Criteria = {
  query: string;
  unitType: TraceableUnitType | "";
  productModel: string;
  page: number;
};

type SearchState =
  | { status: "loading" }
  | { status: "ready"; data: TraceabilitySearchResponse }
  | { status: "error"; kind: "forbidden" | "invalid" | "server" | "network" | "unexpected" };

function criteriaFromSearchParams(searchParams: URLSearchParams): Criteria {
  const unitType = searchParams.get("unitType")?.toUpperCase() ?? "";
  const rawPage = searchParams.get("page") ?? "1";
  return {
    query: normalizeTraceCodeInput(searchParams.get("query") ?? ""),
    unitType: traceableUnitTypes.includes(unitType as TraceableUnitType) ? unitType as TraceableUnitType : "",
    productModel: normalizeTraceCodeInput(searchParams.get("productModel") ?? ""),
    page: /^[1-9][0-9]*$/.test(rawPage) ? Number(rawPage) : 1,
  };
}

function sameCriteria(left: Criteria, right: Criteria): boolean {
  return left.query === right.query && left.unitType === right.unitType && left.productModel === right.productModel && left.page === right.page;
}

function criteriaUrl(criteria: Criteria): string {
  const params = new URLSearchParams();
  if (criteria.query) params.set("query", criteria.query);
  if (criteria.unitType) params.set("unitType", criteria.unitType);
  if (criteria.productModel) params.set("productModel", criteria.productModel);
  if (criteria.page !== 1) params.set("page", String(criteria.page));
  const value = params.toString();
  return value ? `/traceability?${value}` : "/traceability";
}

function requestFor(criteria: Criteria) {
  return {
    ...(criteria.query ? { query: criteria.query } : {}),
    ...(criteria.unitType ? { unitType: criteria.unitType } : {}),
    ...(criteria.productModel ? { productModel: criteria.productModel } : {}),
    page: criteria.page,
    pageSize: PAGE_SIZE,
  };
}

export function TraceabilitySearch({ onUnauthenticated }: { onUnauthenticated: () => void }) {
  const t = useTranslations("TraceabilitySearch");
  const locale = useLocale();
  const { push, replace } = useRouter();
  const searchParams = useSearchParams();
  const serializedSearchParams = searchParams.toString();
  const urlCriteria = useMemo(
    () => criteriaFromSearchParams(new URLSearchParams(serializedSearchParams)),
    [serializedSearchParams],
  );
  const [initialCriteria] = useState(urlCriteria);
  const [lastSearchParams, setLastSearchParams] = useState(serializedSearchParams);
  const [criteria, setCriteria] = useState<Criteria>(initialCriteria);
  const [query, setQuery] = useState(initialCriteria.query);
  const [unitType, setUnitType] = useState<TraceableUnitType | "">(initialCriteria.unitType);
  const [productModel, setProductModel] = useState(initialCriteria.productModel);
  const [queryError, setQueryError] = useState(false);
  const [productModelError, setProductModelError] = useState(false);
  const [state, setState] = useState<SearchState>({ status: "loading" });
  const [requestVersion, setRequestVersion] = useState(0);

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }),
    [locale],
  );
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  if (lastSearchParams !== serializedSearchParams) {
    setLastSearchParams(serializedSearchParams);
    setCriteria(urlCriteria);
    setQuery(urlCriteria.query);
    setUnitType(urlCriteria.unitType);
    setProductModel(urlCriteria.productModel);
    setQueryError(false);
    setProductModelError(false);
    setState({ status: "loading" });
  }

  useEffect(() => {
    const currentUrl = serializedSearchParams ? `/traceability?${serializedSearchParams}` : "/traceability";
    const canonicalUrl = criteriaUrl(urlCriteria);
    if (canonicalUrl !== currentUrl) replace(canonicalUrl);
  }, [replace, serializedSearchParams, urlCriteria]);

  useEffect(() => {
    const controller = new AbortController();
    void searchTraceability(requestFor(criteria), controller.signal)
      .then((data) => setState({ status: "ready", data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const kind = error instanceof TraceabilityApiError ? error.kind : "unexpected";
        if (kind === "unauthenticated") {
          onUnauthenticated();
          return;
        }
        setState({ status: "error", kind: kind === "notFound" ? "unexpected" : kind });
      });
    return () => controller.abort();
  }, [criteria, onUnauthenticated, requestVersion]);

  function applyCriteria(next: Criteria) {
    if (sameCriteria(criteria, next)) {
      setState({ status: "loading" });
      setRequestVersion((version) => version + 1);
      return;
    }
    setState({ status: "loading" });
    setCriteria(next);
    push(criteriaUrl(next));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedQuery = normalizeTraceCodeSubmission(query);
    const normalizedProductModel = normalizeTraceCodeSubmission(productModel);
    const invalidQuery = normalizedQuery.length > 0 && !isValidTraceCode(normalizedQuery);
    const invalidProductModel = normalizedProductModel.length > 0 && !PRODUCT_MODEL_PATTERN.test(normalizedProductModel);
    setQueryError(invalidQuery);
    setProductModelError(invalidProductModel);
    if (invalidQuery || invalidProductModel) return;
    setQuery(normalizedQuery);
    setProductModel(normalizedProductModel);
    applyCriteria({ query: normalizedQuery, unitType, productModel: normalizedProductModel, page: 1 });
  }

  function clear() {
    const next: Criteria = { query: "", unitType: "", productModel: "", page: 1 };
    setQuery("");
    setUnitType("");
    setProductModel("");
    setQueryError(false);
    setProductModelError(false);
    applyCriteria(next);
  }

  function selectSample(traceCode: string) {
    setQuery(traceCode);
    setQueryError(false);
  }

  const hasFormCriteria = Boolean(query || unitType || productModel);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl bg-[#0a1b31] px-5 py-6 text-white shadow-lg sm:px-7" aria-labelledby="traceability-search-title">
        <div className="industrial-grid opacity-35" aria-hidden="true" />
        <div className="relative">
          <p dir="auto" className="text-xs font-bold uppercase tracking-[0.2em] text-blue-300">{t("eyebrow")}</p>
          <h2 dir="auto" id="traceability-search-title" className="mt-2 text-2xl font-semibold">{t("title")}</h2>
          <p dir="auto" className="mt-2 max-w-3xl leading-7 text-slate-300">{t("description")}</p>

          <form className="mt-6 grid gap-4 xl:grid-cols-[minmax(16rem,1.5fr)_minmax(11rem,0.7fr)_minmax(13rem,0.8fr)_auto] xl:items-end" onSubmit={submit} noValidate>
            <div>
              <label dir="auto" htmlFor="traceability-query" className="text-sm font-semibold text-slate-100">{t("form.traceCode")}</label>
              <input dir="ltr" id="traceability-query" value={query} onChange={(event) => { setQuery(normalizeTraceCodeInput(event.target.value)); if (queryError) setQueryError(false); }} aria-invalid={queryError} aria-describedby={queryError ? "traceability-query-error" : "traceability-query-help"} autoComplete="off" placeholder={t("form.tracePlaceholder")} className="mt-2 min-h-12 w-full rounded-lg border border-white/20 bg-white px-4 text-slate-950 outline-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-400" />
              <p dir="auto" id={queryError ? "traceability-query-error" : "traceability-query-help"} role={queryError ? "alert" : undefined} className={`mt-2 text-sm ${queryError ? "text-rose-300" : "text-slate-400"}`}>{queryError ? t("form.traceInvalid") : t("form.traceHelp")}</p>
            </div>
            <div>
              <label dir="auto" htmlFor="traceability-unit-type" className="text-sm font-semibold text-slate-100">{t("form.unitType")}</label>
              <select id="traceability-unit-type" value={unitType} onChange={(event) => setUnitType(event.target.value as TraceableUnitType | "")} className="mt-2 min-h-12 w-full rounded-lg border border-white/20 bg-white px-3 text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
                <option value="">{t("form.allUnitTypes")}</option>
                {traceableUnitTypes.map((value) => <option key={value} value={value}>{t(`unitTypes.${value}`)}</option>)}
              </select>
              <p dir="auto" className="mt-2 text-sm text-slate-400">{t("form.unitTypeHelp")}</p>
            </div>
            <div>
              <label dir="auto" htmlFor="traceability-product-model" className="text-sm font-semibold text-slate-100">{t("form.productModel")}</label>
              <input dir="ltr" id="traceability-product-model" value={productModel} onChange={(event) => { setProductModel(normalizeTraceCodeInput(event.target.value)); if (productModelError) setProductModelError(false); }} aria-invalid={productModelError} aria-describedby={productModelError ? "traceability-model-error" : "traceability-model-help"} autoComplete="off" placeholder={t("form.productModelPlaceholder")} className="mt-2 min-h-12 w-full rounded-lg border border-white/20 bg-white px-4 text-slate-950 outline-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-400" />
              <p dir="auto" id={productModelError ? "traceability-model-error" : "traceability-model-help"} role={productModelError ? "alert" : undefined} className={`mt-2 text-sm ${productModelError ? "text-rose-300" : "text-slate-400"}`}>{productModelError ? t("form.productModelInvalid") : t("form.productModelHelp")}</p>
            </div>
            <div className="flex gap-3 xl:pb-8">
              <button type="submit" className="min-h-12 flex-1 rounded-lg bg-blue-600 px-6 font-semibold text-white outline-none hover:bg-blue-500 focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a1b31] xl:flex-none">{t("form.search")}</button>
              <button type="button" onClick={clear} disabled={!hasFormCriteria} className="min-h-12 flex-1 rounded-lg border border-white/25 px-5 font-semibold text-white outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-45 xl:flex-none">{t("form.clear")}</button>
            </div>
          </form>

          <details className="mt-4 rounded-lg border border-white/15 bg-white/[0.06] open:bg-white/[0.08]">
            <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold text-blue-100 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-300">
              <span dir="auto">{t("samples.summary")}</span>
            </summary>
            <div className="border-t border-white/15 px-4 py-4">
              <p dir="auto" className="text-sm leading-6 text-slate-300">{t("samples.description")}</p>
              <ul className="mt-3 grid min-w-0 gap-2 lg:grid-cols-3">
                {REVIEWER_SAMPLES.map((sample) => (
                  <li key={sample.traceCode} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => selectSample(sample.traceCode)}
                      aria-label={t("samples.use", { traceCode: sample.traceCode, scenario: t(`samples.${sample.key}.title`) })}
                      className="min-h-11 w-full min-w-0 rounded-lg border border-white/20 bg-[#102946] px-3 py-3 text-start outline-none hover:border-blue-300 hover:bg-[#15365c] focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a1b31]"
                    >
                      <span dir="auto" className="block text-sm font-semibold text-white">{t(`samples.${sample.key}.title`)}</span>
                      <SampleTraceCode value={sample.traceCode} />
                      <span dir="auto" className="mt-1 block text-xs leading-5 text-slate-300">{t(`samples.${sample.key}.description`)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p dir="auto" className="mt-3 text-xs leading-5 text-slate-400">{t("samples.behavior")}</p>
            </div>
          </details>
        </div>
      </section>

      {state.status === "loading" ? (
        <section role="status" aria-live="polite" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p dir="auto" className="font-semibold text-slate-700">{t("states.loading")}</p>
          <div className="mt-5 space-y-3" aria-hidden="true"><div className="h-24 animate-pulse rounded-xl bg-slate-100" /><div className="h-24 animate-pulse rounded-xl bg-slate-100" /><div className="h-24 animate-pulse rounded-xl bg-slate-100" /></div>
        </section>
      ) : state.status === "error" ? (
        <SearchError kind={state.kind} onRetry={() => { setState({ status: "loading" }); setRequestVersion((version) => version + 1); }} />
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="traceability-results-title">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <p dir="auto" className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">{t("results.eyebrow")}</p>
              <h2 dir="auto" id="traceability-results-title" className="mt-1 text-xl font-semibold text-slate-950">{t("results.title")}</h2>
            </div>
            <p dir="auto" className="text-sm text-slate-600">{t("results.count", { count: numberFormatter.format(state.data.page.totalItems) })}</p>
          </div>

          {state.data.items.length === 0 ? (
            <div className="py-10 text-center">
              <h3 dir="auto" className="text-lg font-semibold text-slate-950">{state.data.page.totalItems > 0 ? t("states.pageEmptyTitle") : t("states.emptyTitle")}</h3>
              <p dir="auto" className="mx-auto mt-2 max-w-xl leading-7 text-slate-600">{state.data.page.totalItems > 0 ? t("states.pageEmptyDescription") : t("states.emptyDescription")}</p>
            </div>
          ) : (
            <ul className="mt-5 space-y-3">
              {state.data.items.map((item) => (
                <li key={item.traceCode} className="rounded-xl border border-slate-200 p-4 transition-colors hover:border-blue-300 sm:p-5">
                  <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(10rem,0.7fr)_minmax(12rem,0.8fr)_auto] md:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/traceability/${encodeURIComponent(item.traceCode)}`} className="break-all font-semibold text-blue-800 underline decoration-blue-300 underline-offset-4 outline-none hover:text-blue-950 focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-blue-600"><bdi dir="ltr">{item.traceCode}</bdi></Link>
                        {item.match === "EXACT" ? <span dir="auto" className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-800">{t("results.exact")}</span> : null}
                      </div>
                      <p dir="auto" className="mt-2 text-sm text-slate-600">{t("results.unitTypeLabel")} <strong>{t(`unitTypes.${item.unitType}`)}</strong></p>
                    </div>
                    <div>
                      <p dir="auto" className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{t("results.productModel")}</p>
                      {item.productModel ? <><p dir="auto" className="mt-1 font-medium text-slate-900">{item.productModel.name}</p><p className="mt-0.5 text-xs font-bold text-slate-500"><bdi dir="ltr">{item.productModel.code}</bdi></p></> : <p dir="auto" className="mt-1 text-sm text-slate-500">{t("results.notApplicable")}</p>}
                    </div>
                    <dl className="grid grid-cols-2 gap-3 md:grid-cols-1">
                      <div><dt dir="auto" className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">{t("results.created")}</dt><dd className="mt-1 text-sm text-slate-700"><time dateTime={item.createdAt}><bdi dir="auto" className="inline-block whitespace-nowrap">{dateFormatter.format(new Date(item.createdAt))}</bdi></time></dd></div>
                      <div><dt dir="auto" className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">{t("results.lastActivity")}</dt><dd className="mt-1 text-sm text-slate-700">{item.lastActivityAt ? <time dateTime={item.lastActivityAt}><bdi dir="auto" className="inline-block whitespace-nowrap">{dateFormatter.format(new Date(item.lastActivityAt))}</bdi></time> : <span dir="auto">{t("results.noActivity")}</span>}</dd></div>
                    </dl>
                    <Link href={`/traceability/${encodeURIComponent(item.traceCode)}`} aria-label={t("results.openUnit", { traceCode: item.traceCode })} className="flex min-h-11 items-center justify-center rounded-lg border border-blue-200 px-4 text-sm font-semibold text-blue-800 outline-none hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-600">{t("results.open")}</Link>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {state.data.page.totalPages > 0 ? <nav className="mt-6 flex items-center justify-between gap-4 border-t border-slate-200 pt-5" aria-label={t("pagination.label")}>
            <button type="button" disabled={state.data.page.number <= 1} onClick={() => applyCriteria({ ...criteria, page: criteria.page - 1 })} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-800 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-45">{t("pagination.previous")}</button>
            <p dir="auto" className="text-center text-sm text-slate-600">{t("pagination.page", { page: numberFormatter.format(state.data.page.number), totalPages: numberFormatter.format(state.data.page.totalPages) })}</p>
            <button type="button" disabled={state.data.page.totalPages === 0 || state.data.page.number >= state.data.page.totalPages} onClick={() => applyCriteria({ ...criteria, page: criteria.page + 1 })} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-800 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-45">{t("pagination.next")}</button>
          </nav> : null}
        </section>
      )}
    </div>
  );
}

function SampleTraceCode({ value }: { value: string }) {
  const segments = value.split("-");
  return (
    <bdi dir="ltr" aria-label={value} className="mt-1 block max-w-full break-words font-mono text-xs font-bold text-blue-200 [word-break:normal]">
      {segments.map((segment, index) => (
        <span key={`${index}:${segment}`}>{segment}{index < segments.length - 1 ? <>-<wbr /></> : null}</span>
      ))}
    </bdi>
  );
}

function SearchError({ kind, onRetry }: { kind: "forbidden" | "invalid" | "server" | "network" | "unexpected"; onRetry: () => void }) {
  const t = useTranslations("TraceabilitySearch.states");
  const retryable = kind !== "forbidden" && kind !== "invalid";
  return (
    <section role="alert" className="rounded-2xl border border-rose-200 bg-white p-6 shadow-sm" aria-labelledby="traceability-error-title">
      <h2 dir="auto" id="traceability-error-title" className="text-xl font-semibold text-slate-950">{t(`${kind}Title`)}</h2>
      <p dir="auto" className="mt-2 max-w-2xl leading-7 text-slate-600">{t(`${kind}Description`)}</p>
      {retryable ? <button type="button" onClick={onRetry} className="mt-5 min-h-11 rounded-lg bg-blue-700 px-5 font-semibold text-white outline-none hover:bg-blue-800 focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2">{t("retry")}</button> : null}
    </section>
  );
}
