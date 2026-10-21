import type { InspectionEvidenceDraft } from "./inspection-evidence";

export type InspectionDraftHandoff = {
  accountBinding: string;
  traceCode: string;
  specification: { code: string; version: number };
  execution: { processCode: string; attempt: number } | null;
  evidence: InspectionEvidenceDraft;
  inspectedAtLocal: string;
  reviewed: boolean;
};

let provider: (() => InspectionDraftHandoff | null) | null = null;
let pending: InspectionDraftHandoff | null = null;

export function registerInspectionLocaleHandoffProvider(next: () => InspectionDraftHandoff | null): () => void {
  provider = next;
  return () => { if (provider === next) provider = null; };
}

export function prepareInspectionLocaleHandoff(): void {
  pending = provider?.() ?? null;
}

export function consumeInspectionLocaleHandoff(accountBinding: string): InspectionDraftHandoff | null {
  const value = pending;
  pending = null;
  return value?.accountBinding === accountBinding ? structuredClone(value) : null;
}
