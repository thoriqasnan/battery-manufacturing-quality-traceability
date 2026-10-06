import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  DASHBOARD_RECENT_ACTIVITY_LIMIT,
  type DashboardOverviewEvidence,
} from './dashboard.types.js';

@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getOverviewEvidence(): Promise<DashboardOverviewEvidence> {
    const [
      unitCounts,
      productModels,
      inProgressCount,
      inspectionCounts,
      nonconformanceCounts,
      recentExecutions,
    ] = await Promise.all([
      this.prisma.client.traceableUnit.groupBy({
        by: ['unitType'],
        _count: { _all: true },
      }),
      this.prisma.client.productModel.findMany({
        where: { packs: { some: { unitType: 'PACK' } } },
        select: {
          code: true,
          name: true,
          _count: { select: { packs: true } },
        },
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.client.processExecution.count({
        where: { status: 'IN_PROGRESS' },
      }),
      this.prisma.client.inspection.groupBy({
        by: ['outcome'],
        _count: { _all: true },
      }),
      this.prisma.client.nonconformance.groupBy({
        by: ['status'],
        where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
        _count: { _all: true },
      }),
      this.prisma.client.processExecution.findMany({
        take: DASHBOARD_RECENT_ACTIVITY_LIMIT,
        select: {
          attemptNumber: true,
          status: true,
          startedAt: true,
          finishedAt: true,
          traceableUnit: {
            select: {
              traceCode: true,
              unitType: true,
              productModel: { select: { code: true, name: true } },
            },
          },
          processDefinition: { select: { code: true, name: true } },
        },
        orderBy: [
          { startedAt: 'desc' },
          { attemptNumber: 'desc' },
          { id: 'desc' },
        ],
      }),
    ]);

    return {
      unitCounts: unitCounts.map((row) => ({
        unitType: row.unitType,
        count: row._count._all,
      })),
      productModels: productModels.map((model) => ({
        code: model.code,
        name: model.name,
        packCount: model._count.packs,
      })),
      inProgressCount,
      inspectionCounts: inspectionCounts.map((row) => ({
        outcome: row.outcome,
        count: row._count._all,
      })),
      nonconformanceCounts: nonconformanceCounts.map((row) => ({
        status: row.status,
        count: row._count._all,
      })),
      recent: recentExecutions.map((execution) => ({
        traceCode: execution.traceableUnit.traceCode,
        unitType: execution.traceableUnit.unitType,
        productModel: execution.traceableUnit.productModel,
        process: execution.processDefinition,
        attemptNumber: execution.attemptNumber,
        status: execution.status,
        startedAt: execution.startedAt,
        finishedAt: execution.finishedAt,
      })),
    };
  }
}
