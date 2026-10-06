import type {
  ActionType,
  DispositionType,
  ExecutionMethod,
  InspectionOutcome,
  InspectionResultType,
  NonconformanceStatus,
  ProcessExecutionStatus,
} from '../generated/prisma/enums.js';

export const PROCESS_HISTORY_DEFAULT_PAGE_SIZE = 25;
export const PROCESS_HISTORY_MAX_PAGE_SIZE = 100;
export const QUALITY_HISTORY_DEFAULT_PAGE_SIZE = 25;
export const QUALITY_HISTORY_MAX_PAGE_SIZE = 100;
export const NONCONFORMANCE_HISTORY_DEFAULT_PAGE_SIZE = 10;
export const NONCONFORMANCE_HISTORY_MAX_PAGE_SIZE = 50;
export const NONCONFORMANCE_NESTED_MAX_ITEMS = 100;

export interface PageQuery {
  page: number;
  pageSize: number;
}

export type ProcessHistoryQuery = PageQuery;
export interface QualityHistoryQuery extends PageQuery {
  outcome: InspectionOutcome | null;
}
export interface NonconformanceHistoryQuery extends PageQuery {
  status: NonconformanceStatus | null;
}

export interface PageMetadata {
  number: number;
  size: number;
  totalItems: number;
  totalPages: number;
}

export interface ProcessHistoryItem {
  recordId: string;
  process: { code: string; name: string };
  route: { code: string; version: number; stepOrder: number } | null;
  attemptNumber: number;
  status: ProcessExecutionStatus;
  executionMethod: ExecutionMethod;
  startedAt: string;
  finishedAt: string | null;
}

export interface ProcessHistoryResponse {
  items: ProcessHistoryItem[];
  page: PageMetadata;
}

export type QualityEvidence =
  | { type: 'NUMERIC'; value: string; unitCode: string | null }
  | { type: 'BOOLEAN'; value: boolean }
  | {
      type: 'CATEGORICAL' | 'VISUAL';
      optionCode: string;
      isAcceptable: boolean;
    }
  | { type: 'TEXT'; value: string };

export interface QualityHistoryItem {
  recordId: string;
  specification: { code: string; version: number };
  processCode: string;
  processExecutionRecordId: string | null;
  resultType: InspectionResultType;
  attemptNumber: number;
  outcome: InspectionOutcome;
  inspectedAt: string;
  evidence: QualityEvidence;
}

export interface QualityHistoryResponse {
  items: QualityHistoryItem[];
  page: PageMetadata;
}

export interface NestedCollectionMetadata {
  returnedCount: number;
  totalCount: number;
  isPartial: boolean;
}

export interface NonconformanceHistoryItem {
  code: string;
  status: NonconformanceStatus;
  defectCategory: { code: string; name: string };
  description: string | null;
  detectedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  source: {
    inspectionRecordId: string | null;
    processExecutionRecordId: string | null;
  };
  abnormalCases: Array<{
    code: string;
    reason: string | null;
    openedAt: string;
    closedAt: string | null;
  }>;
  actions: Array<{
    recordId: string;
    actionType: ActionType;
    abnormalCaseCode: string | null;
    note: string | null;
    occurredAt: string;
    resultingInspectionRecordId: string | null;
    relatedUnitTraceCode: string | null;
  }>;
  verifications: Array<{
    recordId: string;
    inspectionRecordId: string;
    actionRecordId: string | null;
    note: string | null;
    verifiedAt: string;
  }>;
  dispositions: Array<{
    recordId: string;
    dispositionType: DispositionType;
    note: string | null;
    decidedAt: string;
  }>;
  nestedPageInfo: {
    abnormalCases: NestedCollectionMetadata;
    actions: NestedCollectionMetadata;
    verifications: NestedCollectionMetadata;
    dispositions: NestedCollectionMetadata;
  };
}

export interface NonconformanceHistoryResponse {
  items: NonconformanceHistoryItem[];
  page: PageMetadata;
}

export const TRACEABILITY_HISTORY_ORDERING = {
  process: ['startedAt DESC', 'attemptNumber DESC', 'internalId DESC'],
  quality: ['inspectedAt DESC', 'attemptNumber DESC', 'internalId DESC'],
  nonconformance: ['detectedAt DESC', 'code ASC', 'internalId DESC'],
  abnormalCases: ['openedAt ASC', 'internalId ASC'],
  actions: ['occurredAt ASC', 'internalId ASC'],
  verifications: ['verifiedAt ASC', 'internalId ASC'],
  dispositions: ['decidedAt ASC', 'internalId ASC'],
} as const;

export class TraceabilityHistoryIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TraceabilityHistoryIntegrityError';
  }
}

export interface StoredInspectionEvidence {
  numericValue: { toString(): string } | null;
  booleanValue: boolean | null;
  textValue: string | null;
  selectedOption: {
    resultType: InspectionResultType;
    code: string;
    isAcceptable: boolean;
  } | null;
}

function integrityFailure(resultType: InspectionResultType): never {
  throw new TraceabilityHistoryIntegrityError(
    `Stored ${resultType} inspection evidence is incomplete or inconsistent.`,
  );
}

export function toPublicQualityEvidence(
  resultType: InspectionResultType,
  result: StoredInspectionEvidence | null,
  unitCode: string | null,
): QualityEvidence {
  if (!result) return integrityFailure(resultType);
  const hasNumeric = result.numericValue !== null;
  const hasBoolean = result.booleanValue !== null;
  const hasText = result.textValue !== null;
  const hasOption = result.selectedOption !== null;
  const valueCount = [hasNumeric, hasBoolean, hasText, hasOption].filter(Boolean).length;
  if (valueCount !== 1) return integrityFailure(resultType);

  switch (resultType) {
    case 'NUMERIC': {
      if (!hasNumeric) return integrityFailure(resultType);
      const value = result.numericValue!.toString();
      if (!/^-?(?:\d+|\d*\.\d+)$/.test(value)) return integrityFailure(resultType);
      return { type: 'NUMERIC', value, unitCode };
    }
    case 'BOOLEAN':
      if (!hasBoolean) return integrityFailure(resultType);
      return { type: 'BOOLEAN', value: result.booleanValue! };
    case 'CATEGORICAL':
    case 'VISUAL':
      if (
        !hasOption ||
        result.selectedOption!.resultType !== resultType ||
        result.selectedOption!.code.trim().length === 0
      ) return integrityFailure(resultType);
      return {
        type: resultType,
        optionCode: result.selectedOption!.code,
        isAcceptable: result.selectedOption!.isAcceptable,
      };
    case 'TEXT':
      if (!hasText || result.textValue!.trim().length === 0)
        return integrityFailure(resultType);
      return { type: 'TEXT', value: result.textValue! };
  }
}
