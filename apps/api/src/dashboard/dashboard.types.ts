import type {
  InspectionOutcome,
  NonconformanceStatus,
  ProcessExecutionStatus,
  TraceableUnitType,
} from '../generated/prisma/enums.js';

export const DASHBOARD_RECENT_ACTIVITY_LIMIT = 10;

export interface DashboardCountByUnitType {
  unitType: TraceableUnitType;
  count: number;
}

export interface DashboardProductModelCount {
  code: string;
  name: string;
  packCount: number;
}

export interface DashboardRecentProcessExecution {
  traceCode: string;
  unitType: TraceableUnitType;
  productModel: { code: string; name: string } | null;
  process: { code: string; name: string };
  attemptNumber: number;
  status: ProcessExecutionStatus;
  startedAt: string;
  finishedAt: string | null;
}

export interface DashboardInspectionOutcomeCount {
  outcome: InspectionOutcome;
  count: number;
}

export interface DashboardOverviewResponse {
  generatedAt: string;
  inventory: {
    totalUnits: number;
    byType: DashboardCountByUnitType[];
  };
  productModels: DashboardProductModelCount[];
  process: {
    inProgressCount: number;
    recent: DashboardRecentProcessExecution[];
    recentLimit: number;
  };
  quality: {
    scope: { mode: 'ALL_RECORDS'; from: null; to: null };
    inspectionCount: number;
    byOutcome: DashboardInspectionOutcomeCount[];
    available: true;
  };
  nonconformance: {
    openCount: number;
    inProgressCount: number;
  };
}

export interface DashboardOverviewEvidence {
  unitCounts: Array<{ unitType: TraceableUnitType; count: number }>;
  productModels: DashboardProductModelCount[];
  inProgressCount: number;
  inspectionCounts: Array<{ outcome: InspectionOutcome; count: number }>;
  nonconformanceCounts: Array<{
    status: NonconformanceStatus;
    count: number;
  }>;
  recent: Array<
    Omit<DashboardRecentProcessExecution, 'startedAt' | 'finishedAt'> & {
      startedAt: Date;
      finishedAt: Date | null;
    }
  >;
}
