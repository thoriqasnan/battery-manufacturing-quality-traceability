export type TraceabilityDisclosureGroup =
  | "abnormalCases"
  | "actions"
  | "verifications"
  | "dispositions";

type ActiveDisclosure = {
  owner: symbol;
  open: boolean;
};

const activeDisclosures = new Map<string, ActiveDisclosure>();
let pendingLocaleDisclosures: Map<string, boolean> | null = null;

function disclosureKey(traceCode: string, nonconformanceCode: string, group: TraceabilityDisclosureGroup) {
  return JSON.stringify([traceCode, nonconformanceCode, group]);
}

export function prepareTraceabilityDisclosureLocaleHandoff() {
  pendingLocaleDisclosures = new Map(
    Array.from(activeDisclosures, ([key, value]) => [key, value.open]),
  );
}

export function readPendingTraceabilityDisclosure(
  traceCode: string,
  nonconformanceCode: string,
  group: TraceabilityDisclosureGroup,
) {
  return pendingLocaleDisclosures?.get(disclosureKey(traceCode, nonconformanceCode, group));
}

export function consumePendingTraceabilityDisclosure(
  traceCode: string,
  nonconformanceCode: string,
  group: TraceabilityDisclosureGroup,
) {
  if (!pendingLocaleDisclosures) return;
  pendingLocaleDisclosures.delete(disclosureKey(traceCode, nonconformanceCode, group));
  if (pendingLocaleDisclosures.size === 0) pendingLocaleDisclosures = null;
}

export function recordActiveTraceabilityDisclosure(
  traceCode: string,
  nonconformanceCode: string,
  group: TraceabilityDisclosureGroup,
  owner: symbol,
  open: boolean,
) {
  activeDisclosures.set(disclosureKey(traceCode, nonconformanceCode, group), { owner, open });
}

export function releaseActiveTraceabilityDisclosure(
  traceCode: string,
  nonconformanceCode: string,
  group: TraceabilityDisclosureGroup,
  owner: symbol,
) {
  const key = disclosureKey(traceCode, nonconformanceCode, group);
  if (activeDisclosures.get(key)?.owner === owner) activeDisclosures.delete(key);
}
