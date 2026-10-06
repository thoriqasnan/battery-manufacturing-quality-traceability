import { Injectable } from '@nestjs/common';
import {
  InspectionOutcome,
  TraceableUnitType,
} from '../generated/prisma/enums.js';
import { DashboardRepository } from './dashboard.repository.js';
import {
  DASHBOARD_RECENT_ACTIVITY_LIMIT,
  type DashboardOverviewResponse,
} from './dashboard.types.js';

const UNIT_TYPE_ORDER = [
  TraceableUnitType.PACK,
  TraceableUnitType.MODULE,
  TraceableUnitType.CELL,
  TraceableUnitType.COMPONENT,
  TraceableUnitType.MATERIAL,
] as const;

const OUTCOME_ORDER = [
  InspectionOutcome.PASS,
  InspectionOutcome.NG,
] as const;

@Injectable()
export class DashboardService {
  constructor(private readonly repository: DashboardRepository) {}

  async getOverview(): Promise<DashboardOverviewResponse> {
    const evidence = await this.repository.getOverviewEvidence();
    const unitCounts = new Map(
      evidence.unitCounts.map((item) => [item.unitType, item.count]),
    );
    const inspectionCounts = new Map(
      evidence.inspectionCounts.map((item) => [item.outcome, item.count]),
    );
    const nonconformanceCounts = new Map(
      evidence.nonconformanceCounts.map((item) => [item.status, item.count]),
    );
    const byType = UNIT_TYPE_ORDER.map((unitType) => ({
      unitType,
      count: unitCounts.get(unitType) ?? 0,
    }));
    const byOutcome = OUTCOME_ORDER.map((outcome) => ({
      outcome,
      count: inspectionCounts.get(outcome) ?? 0,
    }));

    return {
      generatedAt: new Date().toISOString(),
      inventory: {
        totalUnits: byType.reduce((total, item) => total + item.count, 0),
        byType,
      },
      productModels: evidence.productModels,
      process: {
        inProgressCount: evidence.inProgressCount,
        recent: evidence.recent.map((execution) => ({
          ...execution,
          startedAt: execution.startedAt.toISOString(),
          finishedAt: execution.finishedAt?.toISOString() ?? null,
        })),
        recentLimit: DASHBOARD_RECENT_ACTIVITY_LIMIT,
      },
      quality: {
        scope: { mode: 'ALL_RECORDS', from: null, to: null },
        inspectionCount: byOutcome.reduce(
          (total, item) => total + item.count,
          0,
        ),
        byOutcome,
        available: true,
      },
      nonconformance: {
        openCount: nonconformanceCounts.get('OPEN') ?? 0,
        inProgressCount: nonconformanceCounts.get('IN_PROGRESS') ?? 0,
      },
    };
  }
}
