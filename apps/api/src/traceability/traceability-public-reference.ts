import { createHash } from 'node:crypto';

export type TraceabilityReferenceKind =
  | 'execution'
  | 'inspection'
  | 'action'
  | 'verification'
  | 'disposition';

const prefixes: Record<TraceabilityReferenceKind, string> = {
  execution: 'exec',
  inspection: 'insp',
  action: 'act',
  verification: 'ver',
  disposition: 'disp',
};

/** Produces a stable public cross-reference without exposing a database key. */
export function traceabilityPublicReference(
  kind: TraceabilityReferenceKind,
  internalId: string,
): string {
  return `${prefixes[kind]}_${createHash('sha256')
    .update(`${kind}:${internalId}`)
    .digest('hex')
    .slice(0, 24)}`;
}
