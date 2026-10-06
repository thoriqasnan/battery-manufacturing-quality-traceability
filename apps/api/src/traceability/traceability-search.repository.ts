import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  TraceabilitySearchPageEvidence,
  TraceabilitySearchQuery,
} from './traceability-search.types.js';

const UNIT_SELECT = {
  id: true,
  traceCode: true,
  unitType: true,
  createdAt: true,
  productModel: { select: { code: true, name: true } },
} as const;

type SelectedUnit = Prisma.TraceableUnitGetPayload<{
  select: typeof UNIT_SELECT;
}>;

@Injectable()
export class TraceabilitySearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    query: TraceabilitySearchQuery,
  ): Promise<TraceabilitySearchPageEvidence> {
    const where = this.where(query);
    const offset = (query.page - 1) * query.pageSize;
    const [totalItems, exact] = await Promise.all([
      this.prisma.client.traceableUnit.count({ where }),
      query.query
        ? this.prisma.client.traceableUnit.findFirst({
            where: { ...where, traceCode: query.query },
            select: UNIT_SELECT,
          })
        : Promise.resolve(null),
    ]);

    const units = await this.pageUnits(query, where, exact, offset);
    const activityByUnit = await this.lastActivityByUnit(
      units.map((unit) => unit.id),
    );

    return {
      totalItems,
      items: units.map((unit) => ({
        ...unit,
        match: query.query
          ? unit.traceCode === query.query
            ? 'EXACT'
            : 'PREFIX'
          : null,
        lastActivityAt: activityByUnit.get(unit.id) ?? null,
      })),
    };
  }

  private where(query: TraceabilitySearchQuery): Prisma.TraceableUnitWhereInput {
    return {
      ...(query.query ? { traceCode: { startsWith: query.query } } : {}),
      ...(query.unitType ? { unitType: query.unitType } : {}),
      ...(query.productModel
        ? { productModel: { is: { code: query.productModel } } }
        : {}),
    };
  }

  private async pageUnits(
    query: TraceabilitySearchQuery,
    where: Prisma.TraceableUnitWhereInput,
    exact: SelectedUnit | null,
    offset: number,
  ): Promise<SelectedUnit[]> {
    if (!exact) {
      return this.prisma.client.traceableUnit.findMany({
        where,
        select: UNIT_SELECT,
        orderBy: [{ traceCode: 'asc' }, { id: 'asc' }],
        skip: offset,
        take: query.pageSize,
      });
    }

    const prefixWhere: Prisma.TraceableUnitWhereInput = {
      ...where,
      NOT: { traceCode: exact.traceCode },
    };
    if (offset === 0) {
      const remaining = await this.prisma.client.traceableUnit.findMany({
        where: prefixWhere,
        select: UNIT_SELECT,
        orderBy: [{ traceCode: 'asc' }, { id: 'asc' }],
        take: query.pageSize - 1,
      });
      return [exact, ...remaining];
    }

    return this.prisma.client.traceableUnit.findMany({
      where: prefixWhere,
      select: UNIT_SELECT,
      orderBy: [{ traceCode: 'asc' }, { id: 'asc' }],
      skip: offset - 1,
      take: query.pageSize,
    });
  }

  private async lastActivityByUnit(
    unitIds: string[],
  ): Promise<Map<string, Date>> {
    if (unitIds.length === 0) return new Map();

    const [processes, inspections, nonconformances] = await Promise.all([
      this.prisma.client.processExecution.groupBy({
        by: ['traceableUnitId'],
        where: { traceableUnitId: { in: unitIds } },
        _max: { startedAt: true },
      }),
      this.prisma.client.inspection.groupBy({
        by: ['traceableUnitId'],
        where: { traceableUnitId: { in: unitIds } },
        _max: { inspectedAt: true },
      }),
      this.prisma.client.nonconformance.groupBy({
        by: ['traceableUnitId'],
        where: { traceableUnitId: { in: unitIds } },
        _max: { detectedAt: true },
      }),
    ]);
    const result = new Map<string, Date>();
    const keepLatest = (unitId: string, value: Date | null) => {
      if (!value) return;
      const current = result.get(unitId);
      if (!current || value > current) result.set(unitId, value);
    };
    for (const row of processes)
      keepLatest(row.traceableUnitId, row._max.startedAt);
    for (const row of inspections)
      keepLatest(row.traceableUnitId, row._max.inspectedAt);
    for (const row of nonconformances)
      keepLatest(row.traceableUnitId, row._max.detectedAt);
    return result;
  }
}
