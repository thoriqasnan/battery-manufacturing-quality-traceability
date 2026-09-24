import type {
  ExecutionMethod,
  InspectionOutcome,
  InspectionResultType,
  ProcessExecutionStatus,
  TraceableUnitType,
} from '../generated/prisma/enums.js';

export type GenealogyScope =
  { mode: 'current' } | { mode: 'historical' } | { mode: 'asOf'; at: Date };

export interface TraceableIdentity {
  id: string;
  traceCode: string;
  unitType: TraceableUnitType;
  productModel: { code: string; name: string } | null;
}

export interface GenealogyEdge {
  relationId: string;
  depth: number;
  parentUnitId: string;
  parentTraceCode: string;
  parentUnitType: TraceableUnitType;
  childUnitId: string;
  childTraceCode: string;
  childUnitType: TraceableUnitType;
  positionCode: string | null;
  installedAt: Date;
  removedAt: Date | null;
  isCurrent: boolean;
}

export interface GenealogyResult {
  root: TraceableIdentity;
  scope: GenealogyScope;
  edges: GenealogyEdge[];
}

export interface ProcessHistoryEntry {
  id: string;
  processCode: string;
  processName: string;
  routeCode: string | null;
  routeVersion: number | null;
  stepOrder: number | null;
  attemptNumber: number;
  status: ProcessExecutionStatus;
  executionMethod: ExecutionMethod;
  startedAt: Date;
  finishedAt: Date | null;
}

export type TypedInspectionEvidence =
  | { type: 'NUMERIC'; value: string; unitCode: string | null }
  | { type: 'BOOLEAN'; value: boolean }
  | {
      type: 'CATEGORICAL' | 'VISUAL';
      optionCode: string;
      isAcceptable: boolean;
    }
  | { type: 'TEXT'; value: string };

export interface QualityHistoryEntry {
  id: string;
  specificationCode: string;
  specificationVersion: number;
  resultType: InspectionResultType;
  attemptNumber: number;
  outcome: InspectionOutcome;
  inspectedAt: Date;
  processCode: string;
  processExecutionId: string | null;
  evidence: TypedInspectionEvidence;
}

export interface IntegrityCheck {
  code: string;
  passed: boolean;
  detail: string;
}

export interface IntegrityReport {
  valid: boolean;
  checks: IntegrityCheck[];
}
