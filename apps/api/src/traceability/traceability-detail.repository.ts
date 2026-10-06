import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TraceableUnitNotFoundError } from './traceability.errors.js';
import type {
  GenealogyDirection,
  GenealogyReadScope,
  GenealogyRow,
} from './traceability-detail.types.js';

@Injectable()
export class TraceabilityDetailRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getUnitWithSectionCounts(traceCode: string) {
    const unit = await this.prisma.client.traceableUnit.findUnique({
      where: { traceCode },
      select: {
        id: true,
        traceCode: true,
        unitType: true,
        createdAt: true,
        updatedAt: true,
        productModel: { select: { code: true, name: true } },
        _count: {
          select: {
            parentRelations: true,
            childRelations: true,
            executions: true,
            inspections: true,
            nonconformances: true,
          },
        },
      },
    });
    if (!unit) throw new TraceableUnitNotFoundError(traceCode);
    return unit;
  }

  async getIdentity(traceCode: string) {
    const unit = await this.prisma.client.traceableUnit.findUnique({
      where: { traceCode },
      select: { id: true, traceCode: true, unitType: true },
    });
    if (!unit) throw new TraceableUnitNotFoundError(traceCode);
    return unit;
  }

  async getBoundedEdges(
    rootId: string,
    direction: GenealogyDirection,
    scope: GenealogyReadScope,
    depth: number,
    offset: number,
    limit: number,
  ): Promise<GenealogyRow[]> {
    return direction === 'descendants'
      ? this.descendantEdges(rootId, scope, depth, offset, limit)
      : this.ancestorEdges(rootId, scope, depth, offset, limit);
  }

  async getDirectCounts(unitIds: string[], scope: GenealogyReadScope) {
    if (unitIds.length === 0)
      return new Map<string, { parents: number; children: number }>();
    const where = this.relationWhere(scope);
    const [parents, children] = await Promise.all([
      this.prisma.client.genealogyRelation.groupBy({
        by: ['childUnitId'],
        where: { ...where, childUnitId: { in: unitIds } },
        _count: { _all: true },
      }),
      this.prisma.client.genealogyRelation.groupBy({
        by: ['parentUnitId'],
        where: { ...where, parentUnitId: { in: unitIds } },
        _count: { _all: true },
      }),
    ]);
    const result = new Map<
      string,
      { parents: number; children: number }
    >();
    for (const id of unitIds) result.set(id, { parents: 0, children: 0 });
    for (const row of parents)
      result.get(row.childUnitId)!.parents = row._count._all;
    for (const row of children)
      result.get(row.parentUnitId)!.children = row._count._all;
    return result;
  }

  private relationshipPredicate(scope: GenealogyReadScope): Prisma.Sql {
    if (scope.mode === 'current') return Prisma.sql`g."removedAt" IS NULL`;
    if (scope.mode === 'historical') return Prisma.sql`TRUE`;
    return Prisma.sql`g."installedAt" <= ${scope.at} AND (g."removedAt" IS NULL OR g."removedAt" > ${scope.at})`;
  }

  private relationWhere(
    scope: GenealogyReadScope,
  ): Prisma.GenealogyRelationWhereInput {
    if (scope.mode === 'current') return { removedAt: null };
    if (scope.mode === 'historical') return {};
    return {
      installedAt: { lte: scope.at },
      OR: [{ removedAt: null }, { removedAt: { gt: scope.at } }],
    };
  }

  private descendantEdges(
    rootId: string,
    scope: GenealogyReadScope,
    depth: number,
    offset: number,
    limit: number,
  ) {
    const predicate = this.relationshipPredicate(scope);
    return this.prisma.client.$queryRaw<GenealogyRow[]>(Prisma.sql`
      WITH RECURSIVE genealogy AS (
        SELECT g.id AS "relationId", 1 AS depth,
          parent.id AS "parentUnitId", parent."traceCode" AS "parentTraceCode", parent."unitType" AS "parentUnitType",
          child.id AS "childUnitId", child."traceCode" AS "childTraceCode", child."unitType" AS "childUnitType",
          g."positionCode", g."installedAt", g."removedAt",
          ARRAY[parent.id, child.id]::uuid[] AS path, FALSE AS cycle
        FROM "GenealogyRelation" g
        JOIN "TraceableUnit" parent ON parent.id = g."parentUnitId"
        JOIN "TraceableUnit" child ON child.id = g."childUnitId"
        WHERE g."parentUnitId" = ${rootId}::uuid AND ${predicate}
        UNION ALL
        SELECT g.id, tree.depth + 1,
          parent.id, parent."traceCode", parent."unitType",
          child.id, child."traceCode", child."unitType",
          g."positionCode", g."installedAt", g."removedAt",
          tree.path || child.id, child.id = ANY(tree.path)
        FROM genealogy tree
        JOIN "GenealogyRelation" g ON g."parentUnitId" = tree."childUnitId"
        JOIN "TraceableUnit" parent ON parent.id = g."parentUnitId"
        JOIN "TraceableUnit" child ON child.id = g."childUnitId"
        WHERE ${predicate} AND NOT tree.cycle AND tree.depth < ${depth}
      ), cycle_summary AS (
        SELECT EXISTS(SELECT 1 FROM genealogy WHERE cycle) AS "cycleDetected"
      )
      SELECT "relationId", depth, "parentUnitId", "parentTraceCode", "parentUnitType",
        "childUnitId", "childTraceCode", "childUnitType", "positionCode",
        "installedAt", "removedAt", "cycleDetected"
      FROM genealogy CROSS JOIN cycle_summary
      WHERE NOT cycle
      ORDER BY depth, "installedAt", "childTraceCode", "relationId"
      OFFSET ${offset} LIMIT ${limit + 1}
    `);
  }

  private ancestorEdges(
    rootId: string,
    scope: GenealogyReadScope,
    depth: number,
    offset: number,
    limit: number,
  ) {
    const predicate = this.relationshipPredicate(scope);
    return this.prisma.client.$queryRaw<GenealogyRow[]>(Prisma.sql`
      WITH RECURSIVE genealogy AS (
        SELECT g.id AS "relationId", 1 AS depth,
          parent.id AS "parentUnitId", parent."traceCode" AS "parentTraceCode", parent."unitType" AS "parentUnitType",
          child.id AS "childUnitId", child."traceCode" AS "childTraceCode", child."unitType" AS "childUnitType",
          g."positionCode", g."installedAt", g."removedAt",
          ARRAY[child.id, parent.id]::uuid[] AS path, FALSE AS cycle
        FROM "GenealogyRelation" g
        JOIN "TraceableUnit" parent ON parent.id = g."parentUnitId"
        JOIN "TraceableUnit" child ON child.id = g."childUnitId"
        WHERE g."childUnitId" = ${rootId}::uuid AND ${predicate}
        UNION ALL
        SELECT g.id, tree.depth + 1,
          parent.id, parent."traceCode", parent."unitType",
          child.id, child."traceCode", child."unitType",
          g."positionCode", g."installedAt", g."removedAt",
          tree.path || parent.id, parent.id = ANY(tree.path)
        FROM genealogy tree
        JOIN "GenealogyRelation" g ON g."childUnitId" = tree."parentUnitId"
        JOIN "TraceableUnit" parent ON parent.id = g."parentUnitId"
        JOIN "TraceableUnit" child ON child.id = g."childUnitId"
        WHERE ${predicate} AND NOT tree.cycle AND tree.depth < ${depth}
      ), cycle_summary AS (
        SELECT EXISTS(SELECT 1 FROM genealogy WHERE cycle) AS "cycleDetected"
      )
      SELECT "relationId", depth, "parentUnitId", "parentTraceCode", "parentUnitType",
        "childUnitId", "childTraceCode", "childUnitType", "positionCode",
        "installedAt", "removedAt", "cycleDetected"
      FROM genealogy CROSS JOIN cycle_summary
      WHERE NOT cycle
      ORDER BY depth, "installedAt", "parentTraceCode", "relationId"
      OFFSET ${offset} LIMIT ${limit + 1}
    `);
  }
}
