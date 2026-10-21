"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  discoverInspectionSpecifications,
  getInspectionSpecificationDetail,
  InspectionApiError,
  inspectionResultTypes,
  submitInspection,
  type InspectionDiscoveryRequest,
  type InspectionEvidence,
  type InspectionResultType,
  type InspectionSpecificationDetail,
  type InspectionSpecificationDiscoveryPage,
  type InspectionSpecificationSummary,
  type InspectionSubmissionRequest,
  type InspectionSubmissionResponse,
} from "@/lib/api/inspection-entry";
import { getTraceableUnitDetail, type UnitDetailResponse } from "@/lib/api/traceability-detail";
import { TraceabilityApiError } from "@/lib/api/traceability";
import { fetchProcessHistory, type ProcessHistoryResponse } from "@/lib/api/traceability-history";
import { isValidTraceCode, normalizeTraceCodeInput, normalizeTraceCodeSubmission } from "@/lib/trace-code";
import { emptyEvidence, serializeLocalInspectionTimestamp, validateEvidence, type EvidenceValidationCode, type InspectionEvidenceDraft } from "@/lib/inspection-evidence";
import { consumeInspectionLocaleHandoff, registerInspectionLocaleHandoffProvider, type InspectionDraftHandoff } from "@/lib/inspection-locale-handoff";
import {
  clearInspectionRecovery,
  createInspectionSubmission,
  inspectionRecoveryAccountBinding,
  inspectionRecoveryDisposition,
  restoreUncertainInspectionRecovery,
  saveUncertainInspectionRecovery,
  type FrozenInspectionSubmission,
} from "@/lib/inspection-entry-state";
import { Link } from "@/i18n/navigation";
import { SegmentedDateTimePicker } from "@/components/shared/segmented-date-time-picker";
import { clearInspectionWorkspaceDraft, restoreInspectionWorkspaceDraft, saveInspectionWorkspaceDraft } from "@/lib/inspection-workspace-draft";

const PAGE_SIZE = 10;
type AsyncError = "notFound" | "forbidden" | "network" | "server" | "unexpected";
type UnitState = { status: "idle" | "loading" } | { status: "ready"; data: UnitDetailResponse } | { status: "error"; kind: AsyncError };
type DiscoveryState = { status: "idle" | "loading" } | { status: "ready"; data: InspectionSpecificationDiscoveryPage } | { status: "error"; kind: AsyncError };
type DetailState = { status: "idle" | "loading" } | { status: "ready"; data: InspectionSpecificationDetail } | { status: "error"; kind: AsyncError };
type ExecutionState = { status: "idle" | "loading" } | { status: "ready"; items: ProcessHistoryResponse["items"]; page: ProcessHistoryResponse["page"] } | { status: "error"; kind: AsyncError };
type Filters = { query: string; resultType: InspectionResultType | ""; processCode: string };
type SubmissionState =
  | { status: "idle" }
  | { status: "submitting"; submission: FrozenInspectionSubmission }
  | { status: "outcome_uncertain"; submission: FrozenInspectionSubmission }
  | { status: "failed"; submission: FrozenInspectionSubmission; error: InspectionApiError | "recovery" }
  | { status: "succeeded"; submission: FrozenInspectionSubmission; response: InspectionSubmissionResponse };

function inspectionErrorKind(error: unknown): AsyncError {
  if (error instanceof InspectionApiError) {
    if (error.status === 404) return "notFound";
    if (error.status === 403) return "forbidden";
    if (error.kind === "network") return "network";
    if (error.status !== null && error.status >= 500) return "server";
  }
  return "unexpected";
}

function traceabilityErrorKind(error: unknown): AsyncError {
  if (error instanceof TraceabilityApiError && ["notFound", "forbidden", "network", "server"].includes(error.kind)) return error.kind as AsyncError;
  return "unexpected";
}

function executionMatches(item: ProcessHistoryResponse["items"][number], specification: InspectionSpecificationDetail): boolean {
  if (item.process.code !== specification.process.code) return false;
  if (!specification.routeStep) return true;
  return item.route !== null && item.route.code === specification.routeStep.routeCode && item.route.version === specification.routeStep.routeVersion && item.route.stepOrder === specification.routeStep.stepOrder;
}

export function InspectionWorkspaceFoundation({ onUnauthenticated, accountUserId, csrfToken }: { onUnauthenticated: () => void; accountUserId: string; csrfToken: string }) {
  const t = useTranslations("InspectionEntry");
  const locale = useLocale();
  const [traceCode, setTraceCode] = useState("");
  const [traceError, setTraceError] = useState(false);
  const [unitState, setUnitState] = useState<UnitState>({ status: "idle" });
  const [filters, setFilters] = useState<Filters>({ query: "", resultType: "", processCode: "" });
  const [discoveryState, setDiscoveryState] = useState<DiscoveryState>({ status: "idle" });
  const [selectedSpecification, setSelectedSpecification] = useState<{ code: string; version: number } | null>(null);
  const [detailState, setDetailState] = useState<DetailState>({ status: "idle" });
  const [executionState, setExecutionState] = useState<ExecutionState>({ status: "idle" });
  const [selectedExecution, setSelectedExecution] = useState<{ processCode: string; attempt: number } | null>(null);
  const [evidenceDraft, setEvidenceDraft] = useState<InspectionEvidenceDraft | null>(null);
  const [evidenceErrors, setEvidenceErrors] = useState<EvidenceValidationCode[]>([]);
  const [inspectedAtLocal, setInspectedAtLocal] = useState("");
  const [timestampError, setTimestampError] = useState(false);
  const [review, setReview] = useState<{ evidence: InspectionEvidence; inspectedAt: string } | null>(null);
  const [accountBinding, setAccountBinding] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [submissionState, setSubmissionState] = useState<SubmissionState>({ status: "idle" });
  const generation = useRef(0);
  const discoverySequence = useRef(0);
  const specificationSequence = useRef(0);
  const executionSequence = useRef(0);
  const controllers = useRef<Array<AbortController>>([]);
  const confirmedHeading = useRef<HTMLHeadingElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const submissionInFlight = useRef(false);
  const unit = unitState.status === "ready" ? unitState.data : null;
  const detail = detailState.status === "ready" ? detailState.data : null;

  function controller(): AbortController {
    const next = new AbortController();
    controllers.current.push(next);
    return next;
  }

  function abortRequests() {
    controllers.current.forEach((item) => item.abort());
    controllers.current = [];
  }

  useEffect(() => () => abortRequests(), []);

  useEffect(() => registerInspectionLocaleHandoffProvider(() => {
    if (!accountBinding || !unit || !detail || !evidenceDraft) return null;
    return {
      accountBinding,
      traceCode: unit.unit.traceCode,
      specification: { code: detail.code, version: detail.version },
      execution: selectedExecution,
      evidence: evidenceDraft,
      inspectedAtLocal,
      reviewed: review !== null,
    };
  }), [accountBinding, unit, detail, evidenceDraft, selectedExecution, inspectedAtLocal, review]);

  useEffect(() => {
    if (!draftHydrated || !accountBinding || submissionState.status === "succeeded") return;
    try {
      saveInspectionWorkspaceDraft({
        traceCodeInput: traceCode,
        confirmedTraceCode: unit?.unit.traceCode ?? null,
        filters,
        specification: selectedSpecification,
        execution: selectedExecution,
        evidence: evidenceDraft,
        inspectedAtLocal,
        reviewed: review !== null,
      }, accountBinding);
    } catch {
      // Draft persistence is best-effort and must never break inspection entry.
    }
  }, [accountBinding, draftHydrated, evidenceDraft, filters, inspectedAtLocal, review, selectedExecution, selectedSpecification, submissionState.status, traceCode, unit]);

  function resetDependentSelection() {
    setDiscoveryState({ status: "idle" });
    setSelectedSpecification(null);
    setDetailState({ status: "idle" });
    setExecutionState({ status: "idle" });
    setSelectedExecution(null);
    setEvidenceDraft(null);
    setEvidenceErrors([]);
    setInspectedAtLocal("");
    setTimestampError(false);
    setReview(null);
  }

  async function loadDiscovery(unit: UnitDetailResponse, nextFilters: Filters, page: number, requestGeneration: number) {
    const requestSequence = ++discoverySequence.current;
    setDiscoveryState({ status: "loading" });
    setSelectedSpecification(null);
    setDetailState({ status: "idle" });
    setExecutionState({ status: "idle" });
    setSelectedExecution(null);
    setEvidenceDraft(null);
    setEvidenceErrors([]);
    setInspectedAtLocal("");
    setTimestampError(false);
    setReview(null);
    const request: InspectionDiscoveryRequest = {
      targetUnitType: unit.unit.unitType,
      page,
      pageSize: PAGE_SIZE,
      ...(nextFilters.query.trim() ? { query: nextFilters.query.trim() } : {}),
      ...(nextFilters.resultType ? { resultType: nextFilters.resultType } : {}),
      ...(nextFilters.processCode.trim() ? { processCode: nextFilters.processCode.trim().toUpperCase() } : {}),
    };
    try {
      const data = await discoverInspectionSpecifications(request, controller().signal);
      if (generation.current === requestGeneration && discoverySequence.current === requestSequence) setDiscoveryState({ status: "ready", data });
    } catch (error) {
      if (generation.current !== requestGeneration || discoverySequence.current !== requestSequence) return;
      if (error instanceof InspectionApiError && error.status === 401) onUnauthenticated();
      setDiscoveryState({ status: "error", kind: inspectionErrorKind(error) });
    }
  }

  async function confirmUnit(event: FormEvent) {
    event.preventDefault();
    setDraftRestored(false);
    const normalized = normalizeTraceCodeSubmission(traceCode);
    setTraceCode(normalized);
    if (!isValidTraceCode(normalized)) {
      setTraceError(true);
      return;
    }
    setTraceError(false);
    const requestGeneration = ++generation.current;
    abortRequests();
    resetDependentSelection();
    setUnitState({ status: "loading" });
    try {
      const unit = await getTraceableUnitDetail(normalized, controller().signal);
      if (generation.current !== requestGeneration) return;
      setUnitState({ status: "ready", data: unit });
      requestAnimationFrame(() => confirmedHeading.current?.focus());
      await loadDiscovery(unit, filters, 1, requestGeneration);
    } catch (error) {
      if (generation.current !== requestGeneration) return;
      if (error instanceof TraceabilityApiError && error.kind === "unauthenticated") onUnauthenticated();
      setUnitState({ status: "error", kind: traceabilityErrorKind(error) });
    }
  }

  function searchSpecifications(event: FormEvent) {
    event.preventDefault();
    if (unitState.status === "ready") void loadDiscovery(unitState.data, filters, 1, generation.current);
  }

  async function selectSpecification(summary: InspectionSpecificationSummary) {
    const requestGeneration = generation.current;
    const requestSequence = ++specificationSequence.current;
    setSelectedSpecification({ code: summary.code, version: summary.version });
    setSelectedExecution(null);
    setEvidenceDraft(null);
    setEvidenceErrors([]);
    setInspectedAtLocal("");
    setTimestampError(false);
    setReview(null);
    setExecutionState({ status: "idle" });
    setDetailState({ status: "loading" });
    try {
      const detail = await getInspectionSpecificationDetail(summary.code, summary.version, controller().signal);
      if (generation.current !== requestGeneration || specificationSequence.current !== requestSequence) return;
      setDetailState({ status: "ready", data: detail });
      setEvidenceDraft(emptyEvidence(detail.configuration));
      if (unitState.status === "ready") void loadExecutions(unitState.data.unit.traceCode, detail, 1, requestGeneration, requestSequence, false);
    } catch (error) {
      if (generation.current !== requestGeneration || specificationSequence.current !== requestSequence) return;
      if (error instanceof InspectionApiError && error.status === 401) onUnauthenticated();
      setDetailState({ status: "error", kind: inspectionErrorKind(error) });
    }
  }

  async function loadExecutions(unitTraceCode: string, specification: InspectionSpecificationDetail, page: number, requestGeneration: number, specificationRequest: number, append: boolean) {
    const requestSequence = ++executionSequence.current;
    if (!append) setExecutionState({ status: "loading" });
    try {
      const data = await fetchProcessHistory(unitTraceCode, { page, pageSize: PAGE_SIZE }, controller().signal);
      if (generation.current !== requestGeneration || specificationSequence.current !== specificationRequest || executionSequence.current !== requestSequence) return;
      const matching = data.items.filter((item) => executionMatches(item, specification));
      setExecutionState((current) => ({ status: "ready", items: append && current.status === "ready" ? [...current.items, ...matching] : matching, page: data.page }));
    } catch (error) {
      if (generation.current !== requestGeneration || specificationSequence.current !== specificationRequest || executionSequence.current !== requestSequence) return;
      if (error instanceof TraceabilityApiError && error.kind === "unauthenticated") onUnauthenticated();
      setExecutionState({ status: "error", kind: traceabilityErrorKind(error) });
    }
  }

  async function restoreLocaleDraft(saved: InspectionDraftHandoff) {
    if (!isValidTraceCode(saved.traceCode)) return;
    const requestGeneration = ++generation.current;
    abortRequests();
    resetDependentSelection();
    setTraceCode(saved.traceCode);
    setUnitState({ status: "loading" });
    try {
      const restoredUnit = await getTraceableUnitDetail(saved.traceCode, controller().signal);
      const discovered = await discoverInspectionSpecifications({ query: saved.specification.code, targetUnitType: restoredUnit.unit.unitType, page: 1, pageSize: PAGE_SIZE }, controller().signal);
      const selected = discovered.items.find(({ code, version }) => code === saved.specification.code && version === saved.specification.version);
      if (!selected || generation.current !== requestGeneration) return resetDependentSelection();
      const restoredDetail = await getInspectionSpecificationDetail(selected.code, selected.version, controller().signal);
      if (generation.current !== requestGeneration || restoredDetail.configuration.type !== saved.evidence.type) return resetDependentSelection();
      const checked = validateEvidence(saved.evidence, restoredDetail.configuration);
      const compatibleDraft = checked.errors.includes("TYPE_MISMATCH") || checked.errors.includes("INVALID_OPTION") ? emptyEvidence(restoredDetail.configuration) : saved.evidence;
      const executions = await fetchProcessHistory(saved.traceCode, { page: 1, pageSize: PAGE_SIZE }, controller().signal);
      if (generation.current !== requestGeneration) return;
      const matching = executions.items.filter((item) => executionMatches(item, restoredDetail));
      const restoredExecution = saved.execution && matching.some((item) => item.process.code === saved.execution?.processCode && item.attemptNumber === saved.execution.attempt) ? saved.execution : null;
      setUnitState({ status: "ready", data: restoredUnit });
      setDiscoveryState({ status: "ready", data: discovered });
      setSelectedSpecification(saved.specification);
      setDetailState({ status: "ready", data: restoredDetail });
      setExecutionState({ status: "ready", items: matching, page: executions.page });
      setSelectedExecution(restoredExecution);
      setEvidenceDraft(compatibleDraft);
      setInspectedAtLocal(saved.inspectedAtLocal);
      const inspectedAt = serializeLocalInspectionTimestamp(saved.inspectedAtLocal);
      const validation = validateEvidence(compatibleDraft, restoredDetail.configuration);
      setReview(saved.reviewed && inspectedAt && validation.evidence ? { evidence: validation.evidence, inspectedAt } : null);
      setDraftRestored(true);
    } catch (error) {
      if (generation.current !== requestGeneration) return;
      if ((error instanceof InspectionApiError && error.status === 401) || (error instanceof TraceabilityApiError && error.kind === "unauthenticated")) onUnauthenticated();
      setUnitState({ status: "error", kind: error instanceof InspectionApiError ? inspectionErrorKind(error) : traceabilityErrorKind(error) });
    }
  }

  useEffect(() => {
    let active = true;
    void inspectionRecoveryAccountBinding(accountUserId).then(async (binding) => {
      if (!active) return;
      setAccountBinding(binding);
      const unresolved = restoreUncertainInspectionRecovery(binding);
      if (unresolved) setSubmissionState({ status: "outcome_uncertain", submission: unresolved });
      const localeDraft = consumeInspectionLocaleHandoff(binding);
      const storedDraft = restoreInspectionWorkspaceDraft(binding);
      const restored = localeDraft ?? (storedDraft?.confirmedTraceCode && storedDraft.specification && storedDraft.evidence ? {
        accountBinding: binding,
        traceCode: storedDraft.confirmedTraceCode,
        specification: storedDraft.specification,
        execution: storedDraft.execution,
        evidence: storedDraft.evidence,
        inspectedAtLocal: storedDraft.inspectedAtLocal,
        reviewed: storedDraft.reviewed,
      } : null);
      if (storedDraft) {
        setTraceCode(storedDraft.traceCodeInput);
        setFilters(storedDraft.filters);
      }
      if (restored) await restoreLocaleDraft(restored);
      else if (storedDraft) setDraftRestored(true);
      if (active) setDraftHydrated(true);
    });
    return () => { active = false; };
    // A locale handoff is single-use and is consumed only when the authenticated account changes/remounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountUserId]);

  function changeEvidence(next: InspectionEvidenceDraft) {
    setEvidenceDraft(next);
    setEvidenceErrors([]);
    setReview(null);
  }

  function changeExecution(next: { processCode: string; attempt: number } | null) {
    setSelectedExecution(next);
    setReview(null);
  }

  function prepareReview() {
    if (!unit || !detail || !evidenceDraft || selectedSpecification?.code !== detail.code || selectedSpecification.version !== detail.version) return;
    const validation = validateEvidence(evidenceDraft, detail.configuration);
    const inspectedAt = serializeLocalInspectionTimestamp(inspectedAtLocal);
    setEvidenceErrors(validation.errors);
    setTimestampError(!inspectedAt);
    if (!validation.evidence || !inspectedAt) {
      setReview(null);
      return;
    }
    setReview({ evidence: validation.evidence, inspectedAt });
    requestAnimationFrame(() => reviewHeading.current?.focus());
  }

  function reviewedRequest(): InspectionSubmissionRequest | null {
    if (!review || !unit || !detail) return null;
    return {
      traceCode: unit.unit.traceCode,
      specification: { code: detail.code, version: detail.version },
      execution: selectedExecution,
      inspectedAt: review.inspectedAt,
      evidence: review.evidence,
    };
  }

  async function executeSubmission(submission: FrozenInspectionSubmission) {
    if (submissionInFlight.current || !accountBinding) return;
    try {
      saveUncertainInspectionRecovery(submission, accountBinding);
    } catch {
      setSubmissionState({ status: "failed", submission, error: "recovery" });
      return;
    }
    submissionInFlight.current = true;
    setSubmissionState({ status: "submitting", submission });
    const requestController = new AbortController();
    const timeout = window.setTimeout(() => requestController.abort(), 30_000);
    try {
      const response = await submitInspection(submission.request as InspectionSubmissionRequest, {
        csrfToken,
        idempotencyKey: submission.idempotencyKey,
        signal: requestController.signal,
        onUnauthenticated,
      });
      clearInspectionRecovery();
      clearInspectionWorkspaceDraft();
      setSubmissionState({ status: "succeeded", submission, response });
      requestAnimationFrame(() => resultHeading.current?.focus());
    } catch (error) {
      const safeError = error instanceof InspectionApiError ? error : new InspectionApiError("network");
      const disposition = inspectionRecoveryDisposition(safeError);
      if (disposition === "uncertain") {
        setSubmissionState({ status: "outcome_uncertain", submission });
      } else if (disposition === "retry_same_key") {
        setSubmissionState({ status: "failed", submission, error: safeError });
      } else {
        clearInspectionRecovery();
        setSubmissionState({ status: "failed", submission, error: safeError });
      }
    } finally {
      window.clearTimeout(timeout);
      submissionInFlight.current = false;
    }
  }

  function submitReviewedInspection() {
    if (submissionState.status === "submitting" || submissionState.status === "outcome_uncertain") return;
    const request = reviewedRequest();
    if (!request) return;
    void executeSubmission(createInspectionSubmission(request));
  }

  function retryUncertainSubmission() {
    if (submissionState.status !== "outcome_uncertain") return;
    void executeSubmission(submissionState.submission);
  }

  function retryRecognizedWriteConflict() {
    if (submissionState.status !== "failed" || submissionState.error === "recovery" || submissionState.error.code !== "INSPECTION_WRITE_CONFLICT") return;
    void executeSubmission(submissionState.submission);
  }

  function abandonUncertainSubmission() {
    if (submissionState.status !== "outcome_uncertain") return;
    clearInspectionRecovery();
    setSubmissionState({ status: "idle" });
    setReview(null);
  }

  function inspectAgain() {
    clearInspectionRecovery();
    setSubmissionState({ status: "idle" });
    setReview(null);
    setEvidenceErrors([]);
    setTimestampError(false);
    setInspectedAtLocal("");
    if (detail) setEvidenceDraft(emptyEvidence(detail.configuration));
  }

  function submissionErrorMessage(error: InspectionApiError | "recovery"): string {
    if (error === "recovery") return t("errors.recovery");
    if (error.kind === "malformed-response") return t("errors.malformed");
    if (error.kind === "network") return t("errors.network");
    return error.code ? t(`errors.${error.code}`) : t("errors.unexpected");
  }

  return <div className="space-y-6">
    {draftRestored ? <p role="status" className="sr-only">{t("accessibility.draftRestored")}</p> : null}
    <fieldset disabled={submissionState.status === "submitting" || submissionState.status === "outcome_uncertain" || submissionState.status === "succeeded"} className="contents">
      <legend className="sr-only">{t("accessibility.workflowLabel")}</legend>
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7" aria-labelledby="inspection-unit-title">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">{t("accessibility.workspaceLabel")}</p>
      <h2 id="inspection-unit-title" className="mt-2 text-xl font-semibold text-slate-950">{t("unit.title")}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{t("unit.description")}</p>
      <form className="mt-5 flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(event) => void confirmUnit(event)} noValidate>
        <div className="min-w-0 flex-1">
          <label htmlFor="inspection-trace-code" className="block text-sm font-semibold text-slate-800">{t("unit.traceCode")}</label>
          <input id="inspection-trace-code" value={traceCode} onChange={(event) => { setTraceCode(normalizeTraceCodeInput(event.target.value)); setTraceError(false); }} aria-invalid={traceError} aria-describedby={traceError ? "inspection-trace-error" : "inspection-trace-help"} autoComplete="off" dir="ltr" className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 px-3 font-mono text-sm uppercase outline-none focus-visible:border-blue-700 focus-visible:ring-2 focus-visible:ring-blue-700/25" placeholder="PACK-DEMO-ALPHA" />
          <p id={traceError ? "inspection-trace-error" : "inspection-trace-help"} role={traceError ? "alert" : undefined} className={`mt-2 text-sm ${traceError ? "text-red-700" : "text-slate-500"}`}>{traceError ? t("unit.invalid") : t("unit.help")}</p>
        </div>
        <button type="submit" className="min-h-12 rounded-lg bg-blue-700 px-5 font-semibold text-white outline-none hover:bg-blue-800 focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2">{t("unit.confirm")}</button>
      </form>
      <div className="mt-5" aria-live="polite">
        {unitState.status === "loading" ? <Status text={t("unit.loading")} /> : null}
        {unitState.status === "error" ? <ErrorState title={t(`unit.errors.${unitState.kind}.title`)} description={t(`unit.errors.${unitState.kind}.description`)} /> : null}
        {unit ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4"><h3 ref={confirmedHeading} tabIndex={-1} className="font-semibold text-emerald-950 outline-none">{t("unit.confirmed")}</h3><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4"><Data label={t("unit.traceCode")} value={unit.unit.traceCode} technical hyphenWrap /><Data label={t("unit.unitType")} value={unit.unit.unitType} technical /><Data label={t("unit.productModel")} value={unit.unit.productModel ? `${unit.unit.productModel.code} · ${unit.unit.productModel.name}` : t("unit.notAssigned")} technical={Boolean(unit.unit.productModel)} /><Data label={t("unit.historySummary")} value={t("unit.historyCounts", { process: unit.sections.processHistory.recordCount, quality: unit.sections.qualityHistory.recordCount })} /></dl></div> : null}
      </div>
    </section>

    {unit ? <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7" aria-labelledby="inspection-specifications-title">
      <h2 id="inspection-specifications-title" className="text-xl font-semibold text-slate-950">{t("discovery.title")}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{t("discovery.compatibility")}</p>
      <form onSubmit={searchSpecifications} className="mt-5 grid gap-4 md:grid-cols-3 xl:grid-cols-[2fr_1fr_1fr_auto]" noValidate>
        <Field label={t("discovery.search")} htmlFor="spec-query"><input id="spec-query" value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus-visible:ring-2 focus-visible:ring-blue-700/25" /></Field>
        <Field label={t("discovery.resultType")} htmlFor="spec-result-type"><select id="spec-result-type" value={filters.resultType} onChange={(event) => setFilters((current) => ({ ...current, resultType: event.target.value as InspectionResultType | "" }))} className="h-11 min-h-11 max-h-11 w-full box-border rounded-lg border border-slate-300 bg-white px-3 py-0 text-sm leading-5 outline-none focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600"><option value="">{t("discovery.allResultTypes")}</option>{inspectionResultTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></Field>
        <Field label={t("discovery.processCode")} htmlFor="spec-process-code"><input id="spec-process-code" dir="ltr" value={filters.processCode} onChange={(event) => setFilters((current) => ({ ...current, processCode: normalizeTraceCodeInput(event.target.value) }))} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 font-mono outline-none focus-visible:ring-2 focus-visible:ring-blue-700/25" /></Field>
        <button type="submit" disabled={discoveryState.status === "loading"} className="min-h-11 self-end rounded-lg border border-blue-700 px-5 font-semibold text-blue-800 outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:opacity-50">{t("actions.search")}</button>
      </form>
      <div className="mt-6" aria-live="polite">
        {discoveryState.status === "loading" ? <Status text={t("discovery.loading")} /> : null}
        {discoveryState.status === "error" ? <ErrorState title={t(`discovery.errors.${discoveryState.kind}.title`)} description={t(`discovery.errors.${discoveryState.kind}.description`)} /> : null}
        {discoveryState.status === "ready" && discoveryState.data.items.length === 0 ? <Empty title={t("discovery.empty")} description={t("discovery.emptyDescription")} /> : null}
        {discoveryState.status === "ready" && discoveryState.data.items.length > 0 ? <><fieldset><legend className="sr-only">{t("discovery.selectionLegend")}</legend><div className="grid gap-3 lg:grid-cols-2">{discoveryState.data.items.map((item) => { const checked = selectedSpecification?.code === item.code && selectedSpecification.version === item.version; return <label key={`${item.code}:${item.version}`} className={`block cursor-pointer rounded-lg border p-4 ${checked ? "border-blue-600 bg-blue-50" : "border-slate-200"}`}><span className="flex items-start gap-3"><input type="radio" name="specification" checked={checked} onChange={() => void selectSpecification(item)} className="mt-1 size-4 accent-blue-700" /><span className="min-w-0 flex-1"><bdi dir="ltr" className="font-mono text-sm font-bold text-blue-800">{item.code} · v{item.version}</bdi><span dir="auto" className="mt-1 block font-semibold text-slate-950">{item.name}</span><span className="mt-2 block text-sm text-slate-600">{item.resultType} · {item.targetUnitType}</span><span className="mt-1 block text-sm text-slate-600"><bdi dir="ltr">{item.process.code}</bdi> · <span dir="auto">{item.process.name}</span></span>{item.routeStep ? <span className="mt-1 block text-xs text-slate-500"><bdi dir="ltr">{item.routeStep.productModelCode} / {item.routeStep.routeCode} v{item.routeStep.routeVersion} · {t("criteria.step", { order: item.routeStep.stepOrder })}</bdi></span> : null}</span></span></label>; })}</div></fieldset><nav aria-label={t("discovery.paginationLabel")} className="mt-5 flex flex-wrap items-center justify-between gap-3"><button type="button" disabled={discoveryState.data.page.number <= 1} onClick={() => void loadDiscovery(unit, filters, discoveryState.data.page.number - 1, generation.current)} className="min-h-11 rounded-lg border border-slate-300 px-4 font-semibold disabled:opacity-40">{t("actions.previous")}</button><p className="text-sm text-slate-600">{t("discovery.page", { page: discoveryState.data.page.number, totalPages: discoveryState.data.page.totalPages })}</p><button type="button" disabled={discoveryState.data.page.number >= discoveryState.data.page.totalPages} onClick={() => void loadDiscovery(unit, filters, discoveryState.data.page.number + 1, generation.current)} className="min-h-11 rounded-lg border border-slate-300 px-4 font-semibold disabled:opacity-40">{t("actions.next")}</button></nav></> : null}
      </div>
    </section> : null}

    {selectedSpecification ? <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7" aria-labelledby="inspection-criteria-title">
      {detailState.status === "loading" ? <Status text={t("criteria.loading")} /> : null}
      {detailState.status === "error" ? <ErrorState title={t("criteria.unavailable")} description={t(`criteria.errors.${detailState.kind}`)} /> : null}
      {detail ? <><h2 id="inspection-criteria-title" className="text-xl font-semibold text-slate-950">{t("criteria.title")}</h2><p className="mt-2 text-sm text-slate-600">{t("criteria.serverAuthority")}</p><dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Data label={t("criteria.identity")} value={`${detail.code} · v${detail.version}`} technical /><Data label={t("criteria.name")} value={detail.name} /><Data label={t("criteria.resultType")} value={detail.configuration.type} technical /><Data label={t("criteria.targetUnitType")} value={detail.targetUnitType} technical /><Data label={t("criteria.process")} value={`${detail.process.code} · ${detail.process.name}`} technical /><Data label={t("criteria.routeStep")} value={detail.routeStep ? `${detail.routeStep.productModelCode} / ${detail.routeStep.routeCode} v${detail.routeStep.routeVersion} · ${t("criteria.step", { order: detail.routeStep.stepOrder })}` : t("criteria.notConfigured")} technical={Boolean(detail.routeStep)} /></dl>{detail.description ? <p dir="auto" className="mt-5 rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-700">{detail.description}</p> : null}<Criteria configuration={detail.configuration} t={t} /></> : null}
    </section> : null}

    {detail ? <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7" aria-labelledby="inspection-execution-title"><h2 id="inspection-execution-title" className="text-xl font-semibold text-slate-950">{t("execution.title")}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{t("execution.description")}</p>{executionState.status === "loading" ? <div className="mt-4"><Status text={t("execution.loading")} /></div> : null}{executionState.status === "error" ? <div className="mt-4"><ErrorState title={t("execution.errorTitle")} description={t(`execution.errors.${executionState.kind}`)} /></div> : null}{executionState.status === "ready" ? <fieldset className="mt-5"><legend className="sr-only">{t("execution.selectionLegend")}</legend><label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-4 py-3"><input type="radio" name="execution" checked={selectedExecution === null} onChange={() => changeExecution(null)} className="size-4 accent-blue-700" /><span>{t("execution.none")}</span></label><div className="mt-3 grid gap-3 lg:grid-cols-2">{executionState.items.map((item) => { const checked = selectedExecution?.processCode === item.process.code && selectedExecution.attempt === item.attemptNumber; return <label key={item.recordId} className={`cursor-pointer rounded-lg border p-4 ${checked ? "border-blue-600 bg-blue-50" : "border-slate-200"}`}><span className="flex items-start gap-3"><input type="radio" name="execution" checked={checked} onChange={() => changeExecution({ processCode: item.process.code, attempt: item.attemptNumber })} className="mt-1 size-4 accent-blue-700" /><span className="min-w-0"><bdi dir="ltr" className="font-mono text-sm font-bold">{item.process.code} · {t("execution.processAttempt", { attempt: item.attemptNumber })}</bdi><span className="mt-1 block text-sm text-slate-600">{item.status} · {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.startedAt))}</span>{item.route ? <span className="mt-1 block text-xs text-slate-500"><bdi dir="ltr">{item.route.code} v{item.route.version} · {t("criteria.step", { order: item.route.stepOrder })}</bdi></span> : null}</span></span></label>; })}</div>{executionState.items.length === 0 ? <p className="mt-4 text-sm text-slate-600">{t("execution.empty")}</p> : null}{executionState.page.number < executionState.page.totalPages ? <button type="button" onClick={() => unit && void loadExecutions(unit.unit.traceCode, detail, executionState.page.number + 1, generation.current, specificationSequence.current, true)} className="mt-4 min-h-11 rounded-lg border border-slate-300 px-4 font-semibold">{t("execution.loadMore")}</button> : null}</fieldset> : null}</section> : null}

    {detail && evidenceDraft ? <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7" aria-labelledby="inspection-evidence-title">
      <h2 id="inspection-evidence-title" className="text-xl font-semibold text-slate-950">{t("evidence.title")}</h2>
      <p className="mt-2 text-sm text-slate-600">{t("evidence.description")}</p>
      <EvidenceForm draft={evidenceDraft} configuration={detail.configuration} errors={evidenceErrors} onChange={changeEvidence} t={t} />
      <div className="mt-5 max-w-md"><SegmentedDateTimePicker value={inspectedAtLocal} onChange={(value) => { setInspectedAtLocal(value); setTimestampError(false); setReview(null); }} locale={locale} idPrefix="inspection-time" invalid={timestampError || (inspectedAtLocal !== "" && !serializeLocalInspectionTimestamp(inspectedAtLocal))} labels={{ label: t("timestamp.label"), help: t("timestamp.help", { zone: Intl.DateTimeFormat().resolvedOptions().timeZone }), invalid: t("timestamp.invalid"), open: t("timestamp.pickerOpen"), close: t("timestamp.pickerClose"), legend: t("timestamp.pickerLegend"), day: t("timestamp.pickerDay"), month: t("timestamp.pickerMonth"), year: t("timestamp.pickerYear"), hour: t("timestamp.pickerHour"), minute: t("timestamp.pickerMinute"), time: t("timestamp.pickerTime") }} /></div>
      <button type="button" onClick={prepareReview} className="mt-6 min-h-12 rounded-lg bg-blue-700 px-5 font-semibold text-white outline-none hover:bg-blue-800 focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2">{t("review.prepare")}</button>
      {evidenceErrors.length || timestampError ? <p role="alert" className="mt-4 text-sm font-semibold text-red-700">{t("validation.summary")}</p> : null}
    </section> : null}

    {review && unit && detail ? <section className="rounded-xl border border-blue-200 bg-blue-50 p-5 shadow-sm sm:p-7" aria-labelledby="inspection-review-title">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">{t("review.notSubmitted")}</p>
      <h2 ref={reviewHeading} tabIndex={-1} id="inspection-review-title" className="mt-2 text-xl font-semibold text-slate-950 outline-none">{t("review.title")}</h2>
      <p className="mt-2 text-sm text-slate-700">{t("review.description")}</p>
      <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Data label={t("unit.traceCode")} value={unit.unit.traceCode} technical hyphenWrap /><Data label={t("unit.unitType")} value={unit.unit.unitType} technical /><Data label={t("unit.productModel")} value={unit.unit.productModel ? `${unit.unit.productModel.code} · ${unit.unit.productModel.name}` : t("unit.notAssigned")} technical={Boolean(unit.unit.productModel)} /><Data label={t("criteria.identity")} value={`${detail.code} · v${detail.version}`} technical /><Data label={t("criteria.process")} value={detail.process.code} technical /><Data label={t("execution.title")} value={selectedExecution ? `${selectedExecution.processCode} · ${t("execution.processAttempt", { attempt: selectedExecution.attempt })}` : t("execution.none")} technical={Boolean(selectedExecution)} /><Data label={t("criteria.resultType")} value={review.evidence.type} technical /><Data label={t("timestamp.utc")} value={review.inspectedAt} technical /><Data label={t("review.evidence")} value={evidenceSummary(review.evidence)} technical /></dl>
      <p className="mt-5 text-sm font-semibold text-blue-900">{review.evidence.type === "TEXT" ? t("review.textOutcomeInput", { outcome: review.evidence.outcome }) : t("review.noPrediction")}</p>
      <p className="mt-2 text-sm text-slate-600">{t("review.confirmation")}</p>
      <button type="button" onClick={submitReviewedInspection} disabled={!accountBinding || submissionState.status === "submitting" || submissionState.status === "outcome_uncertain"} className="mt-5 min-h-12 rounded-lg bg-blue-700 px-5 font-semibold text-white outline-none hover:bg-blue-800 focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-blue-400">{submissionState.status === "submitting" ? t("submission.pending") : t("actions.submit")}</button>
    </section> : null}
    </fieldset>

    {submissionState.status === "submitting" ? <section aria-live="polite"><Status text={t("submission.pending")} /></section> : null}

    {submissionState.status === "outcome_uncertain" ? <section className="rounded-xl border border-amber-300 bg-amber-50 p-5 shadow-sm sm:p-7" aria-labelledby="inspection-recovery-title">
      <h2 id="inspection-recovery-title" className="text-xl font-semibold text-amber-950">{t("recovery.title")}</h2>
      <p role="alert" className="mt-2 text-sm leading-6 text-amber-900">{t("recovery.description")}</p>
      <RecoverySummary submission={submissionState.submission} t={t} />
      <p className="mt-4 text-sm font-semibold text-amber-950">{t("recovery.abandonWarning")}</p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row"><button type="button" onClick={retryUncertainSubmission} className="min-h-12 rounded-lg bg-blue-700 px-5 font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2">{t("submission.retrySame")}</button><button type="button" onClick={abandonUncertainSubmission} className="min-h-12 rounded-lg border border-amber-700 px-5 font-semibold text-amber-950 outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2">{t("actions.abandon")}</button></div>
    </section> : null}

    {submissionState.status === "failed" ? <section className="rounded-xl border border-red-200 bg-red-50 p-5 shadow-sm sm:p-7" aria-labelledby="inspection-failure-title">
      <h2 id="inspection-failure-title" className="text-xl font-semibold text-red-950">{t("submission.failedTitle")}</h2>
      <p role="alert" className="mt-2 text-sm leading-6 text-red-900">{submissionErrorMessage(submissionState.error)}</p>
      <p className="mt-3 text-sm text-red-900">{t("submission.deterministicFailure")}</p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">{submissionState.error !== "recovery" && submissionState.error.code === "INSPECTION_WRITE_CONFLICT" ? <button type="button" onClick={retryRecognizedWriteConflict} className="min-h-12 rounded-lg bg-blue-700 px-5 font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2">{t("submission.retrySame")}</button> : null}<button type="button" onClick={() => { if (submissionState.error !== "recovery" && submissionState.error.code === "INSPECTION_WRITE_CONFLICT") clearInspectionRecovery(); setSubmissionState({ status: "idle" }); }} className="min-h-12 rounded-lg border border-red-700 px-5 font-semibold text-red-950 outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2">{t("actions.returnToReview")}</button></div>
    </section> : null}

    {submissionState.status === "succeeded" ? <ResultPanel state={submissionState} onInspectAgain={inspectAgain} resultHeading={resultHeading} t={t} /> : null}
  </div>;
}

function RecoverySummary({ submission, t }: { submission: FrozenInspectionSubmission; t: Translator }) {
  const request = submission.request;
  return <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Data label={t("unit.traceCode")} value={request.traceCode} technical hyphenWrap /><Data label={t("criteria.identity")} value={`${request.specification.code} · v${request.specification.version}`} technical /><Data label={t("timestamp.utc")} value={request.inspectedAt} technical /><Data label={t("review.evidence")} value={evidenceSummary(request.evidence)} technical /></dl>;
}

function ResultPanel({ state, onInspectAgain, resultHeading, t }: { state: Extract<SubmissionState, { status: "succeeded" }>; onInspectAgain: () => void; resultHeading: { current: HTMLHeadingElement | null }; t: Translator }) {
  const { response, submission } = state;
  const textInputOutcome = submission.request.evidence.type === "TEXT" ? submission.request.evidence.outcome : null;
  return <section className={`rounded-xl border p-5 shadow-sm sm:p-7 ${response.outcome === "PASS" ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50"}`} aria-labelledby="inspection-result-title">
    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-700">{t("result.confirmed")}</p>
    <h2 ref={resultHeading} tabIndex={-1} id="inspection-result-title" className="mt-2 text-xl font-semibold text-slate-950 outline-none">{t("result.title")}</h2>
    <p role="status" className="mt-3 text-lg font-bold text-slate-950">{t("accessibility.resultAnnouncement", { outcome: response.outcome })}</p>
    <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Data label={t("unit.traceCode")} value={response.traceCode} technical hyphenWrap /><Data label={t("criteria.identity")} value={`${response.specification.code} · v${response.specification.version}`} technical /><Data label={t("criteria.process")} value={response.processCode} technical /><Data label={t("execution.title")} value={response.execution ? `${response.execution.processCode} · ${t("execution.processAttempt", { attempt: response.execution.attempt })}` : t("execution.none")} technical={Boolean(response.execution)} /><Data label={t("result.attemptLabel")} value={String(response.attemptNumber)} technical /><Data label={t("timestamp.utc")} value={response.inspectedAt} technical /><Data label={t("result.createdAt")} value={response.createdAt} technical /><Data label={t("criteria.resultType")} value={response.evidence.type} technical /><Data label={t("review.evidence")} value={responseEvidenceSummary(response.evidence)} technical /><Data label={t("result.outcome")} value={response.outcome} technical /></dl>
    {textInputOutcome ? <p className="mt-4 text-sm text-slate-700">{t("result.textDistinction", { input: textInputOutcome, confirmed: response.outcome })}</p> : null}
    <div className="mt-6 flex flex-col gap-3 sm:flex-row"><Link href={`/traceability/${encodeURIComponent(response.traceCode)}#quality-history-title`} className="flex min-h-12 items-center justify-center rounded-lg bg-blue-700 px-5 font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2">{t("result.history")}</Link><button type="button" onClick={onInspectAgain} className="min-h-12 rounded-lg border border-slate-400 px-5 font-semibold text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2">{t("result.another")}</button></div>
  </section>;
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) { return <div><label htmlFor={htmlFor} className="mb-2 block text-sm font-semibold text-slate-800">{label}</label>{children}</div>; }
function Data({ label, value, technical = false, hyphenWrap = false }: { label: string; value: string; technical?: boolean; hyphenWrap?: boolean }) {
  return <div className="min-w-0"><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</dt><dd dir={technical ? "ltr" : "auto"} className={`mt-1 break-words text-slate-900 ${technical ? "font-mono text-sm" : "text-sm"}`}>{hyphenWrap ? <HyphenWrappedIdentifier value={value} /> : value}</dd></div>;
}

function HyphenWrappedIdentifier({ value }: { value: string }) {
  const segments = value.split("-");
  return <bdi dir="ltr" aria-label={value} className="max-w-full break-words [word-break:normal]">{segments.map((segment, index) => <span key={`${index}:${segment}`}>{segment}{index < segments.length - 1 ? <>-<wbr /></> : null}</span>)}</bdi>;
}
function Status({ text }: { text: string }) { return <p role="status" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">{text}</p>; }
function ErrorState({ title, description }: { title: string; description: string }) { return <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3"><p className="font-semibold text-red-900">{title}</p><p className="mt-1 text-sm text-red-800">{description}</p></div>; }
function Empty({ title, description }: { title: string; description: string }) { return <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-5"><p className="font-semibold text-slate-900">{title}</p><p className="mt-1 text-sm text-slate-600">{description}</p></div>; }

type Translator = ReturnType<typeof useTranslations<"InspectionEntry">>;
function EvidenceForm({ draft, configuration, errors, onChange, t }: { draft: InspectionEvidenceDraft; configuration: InspectionSpecificationDetail["configuration"]; errors: EvidenceValidationCode[]; onChange: (draft: InspectionEvidenceDraft) => void; t: Translator }) {
  const invalid = errors.length > 0;
  if (draft.type !== configuration.type) return null;
  switch (draft.type) {
    case "NUMERIC": { const config = configuration as Extract<InspectionSpecificationDetail["configuration"], { type: "NUMERIC" }>; return <div className="mt-5 max-w-md"><label htmlFor="numeric-evidence" className="block text-sm font-semibold text-slate-800">{t("evidence.numeric")}{config.unitCode ? ` (${config.unitCode})` : ""}</label><input id="numeric-evidence" type="text" inputMode="decimal" dir="ltr" value={draft.value} onChange={(event) => onChange({ type: "NUMERIC", value: event.target.value })} aria-invalid={invalid} aria-describedby="evidence-error" className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 px-3 font-mono outline-none focus-visible:ring-2 focus-visible:ring-blue-700/25" />{invalid ? <EvidenceErrors errors={errors} t={t} /> : null}</div>; }
    case "BOOLEAN": return <fieldset className="mt-5"><legend className="text-sm font-semibold text-slate-800">{t("evidence.boolean")}</legend><div className="mt-2 flex flex-wrap gap-3">{[true, false].map((value) => <label key={String(value)} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-slate-300 px-4"><input type="radio" name="boolean-evidence" checked={draft.value === value} onChange={() => onChange({ type: "BOOLEAN", value })} className="size-4 accent-blue-700" />{t(value ? "evidence.true" : "evidence.false")}</label>)}</div>{invalid ? <EvidenceErrors errors={errors} t={t} /> : null}</fieldset>;
    case "CATEGORICAL":
    case "VISUAL": { const config = configuration as Extract<InspectionSpecificationDetail["configuration"], { type: "CATEGORICAL" | "VISUAL" }>; return <fieldset className="mt-5"><legend className="text-sm font-semibold text-slate-800">{t(draft.type === "VISUAL" ? "evidence.visual" : "evidence.categorical")}</legend><div className="mt-2 grid gap-3 sm:grid-cols-2">{config.options.map((option) => <label key={option.code} className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-slate-300 p-3"><input type="radio" name="option-evidence" checked={draft.optionCode === option.code} onChange={() => onChange({ type: draft.type, optionCode: option.code })} className="mt-1 size-4 accent-blue-700" /><span><bdi dir="ltr" className="font-mono font-semibold">{option.code}</bdi>{option.description ? <span dir="auto" className="mt-1 block text-sm text-slate-600">{option.description}</span> : null}</span></label>)}</div>{invalid ? <EvidenceErrors errors={errors} t={t} /> : null}</fieldset>; }
    case "TEXT": {
      const count = Array.from(draft.value).length;
      return <div className="mt-5"><label htmlFor="text-evidence" className="block text-sm font-semibold text-slate-800">{t("evidence.text")}</label><textarea id="text-evidence" value={draft.value} onChange={(event) => onChange({ ...draft, value: event.target.value })} aria-invalid={invalid} aria-describedby="text-count evidence-error" rows={5} className="mt-2 w-full rounded-lg border border-slate-300 p-3 outline-none focus-visible:ring-2 focus-visible:ring-blue-700/25" /><p id="text-count" className="mt-1 text-sm text-slate-500" aria-live="polite">{t("evidence.characterCount", { count, maximum: 4000 })}</p><fieldset className="mt-4"><legend className="text-sm font-semibold text-slate-800">{t("evidence.outcome")}</legend><div className="mt-2 flex gap-3">{(["PASS", "NG"] as const).map((outcome) => <label key={outcome} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-slate-300 px-4"><input type="radio" name="text-outcome" checked={draft.outcome === outcome} onChange={() => onChange({ ...draft, outcome })} className="size-4 accent-blue-700" />{outcome}</label>)}</div></fieldset>{invalid ? <EvidenceErrors errors={errors} t={t} /> : null}</div>;
    }
  }
}

function EvidenceErrors({ errors, t }: { errors: EvidenceValidationCode[]; t: Translator }) { return <ul id="evidence-error" className="mt-2 text-sm text-red-700" role="alert">{errors.map((error) => <li key={error}>{t(`validation.${error}`)}</li>)}</ul>; }
function evidenceSummary(evidence: InspectionEvidence): string { switch (evidence.type) { case "NUMERIC": return evidence.value; case "BOOLEAN": return String(evidence.value); case "CATEGORICAL": case "VISUAL": return evidence.optionCode; case "TEXT": return evidence.value; } }
function responseEvidenceSummary(evidence: InspectionSubmissionResponse["evidence"]): string { switch (evidence.type) { case "NUMERIC": return `${evidence.value}${evidence.unitCode ? ` ${evidence.unitCode}` : ""}`; case "BOOLEAN": return String(evidence.value); case "CATEGORICAL": case "VISUAL": return evidence.optionCode; case "TEXT": return evidence.value; } }

function Criteria({ configuration, t }: { configuration: InspectionSpecificationDetail["configuration"]; t: Translator }) {
  switch (configuration.type) {
    case "NUMERIC": return <div className="mt-5 rounded-lg border border-slate-200 p-4"><h3 className="font-semibold">{t("criteria.numeric.title")}</h3><dl className="mt-3 grid gap-3 sm:grid-cols-3"><Data label={t("criteria.lowerBound")} value={configuration.lowerBound ?? t("criteria.notConfigured")} technical /><Data label={t("criteria.upperBound")} value={configuration.upperBound ?? t("criteria.notConfigured")} technical /><Data label={t("criteria.measurementUnit")} value={configuration.unitCode ?? t("criteria.notConfigured")} technical /></dl><p className="mt-3 text-sm text-slate-600">{t("criteria.numeric.inclusive")}</p></div>;
    case "BOOLEAN": return <div className="mt-5 rounded-lg border border-slate-200 p-4"><h3 className="font-semibold">{t("criteria.boolean.title")}</h3><p className="mt-2 text-sm text-slate-700">{t("criteria.boolean.expected", { value: String(configuration.expectedValue) })}</p></div>;
    case "CATEGORICAL":
    case "VISUAL": return <div className="mt-5 rounded-lg border border-slate-200 p-4"><h3 className="font-semibold">{t(configuration.type === "VISUAL" ? "criteria.visual.title" : "criteria.categorical.title")}</h3>{configuration.type === "VISUAL" ? <p className="mt-2 text-sm text-slate-600">{t("criteria.visual.textOnly")}</p> : null}<ul className="mt-3 grid gap-2 sm:grid-cols-2">{configuration.options.map((option) => <li key={option.code} className="rounded-md bg-slate-50 p-3 text-sm"><bdi dir="ltr" className="font-mono font-bold">{option.code}</bdi>{option.description ? <span dir="auto" className="ms-2 text-slate-600">{option.description}</span> : null}<span className={`mt-1 block text-xs font-semibold ${option.isAcceptable ? "text-emerald-700" : "text-red-700"}`}>{option.isAcceptable ? t("criteria.acceptable") : t("criteria.notAcceptable")}</span></li>)}</ul></div>;
    case "TEXT": return <div className="mt-5 rounded-lg border border-slate-200 p-4"><h3 className="font-semibold">{t("criteria.text.title")}</h3><p className="mt-2 text-sm text-slate-600">{t("criteria.text.requirement")}</p></div>;
  }
}
