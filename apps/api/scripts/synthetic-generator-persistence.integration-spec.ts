import { PrismaClient } from '../src/generated/prisma/client.js';
import { createPrismaPgAdapter } from '../src/prisma/prisma-pg.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { findGenealogyCycles } from '../src/traceability/graph-integrity.js';
import { TraceabilityRepository } from '../src/traceability/traceability.repository.js';
import { TraceabilityService } from '../src/traceability/traceability.service.js';
import { TraceabilityHistoryRepository } from '../src/traceability/traceability-history.repository.js';
import { TraceabilityHistoryService } from '../src/traceability/traceability-history.service.js';
import { TraceabilityIntegrityService } from '../src/traceability/traceability-integrity.service.js';
import {
  assertSyntheticGeneratorMutationTarget,
  type SyntheticGeneratorConfigInput,
} from './synthetic-generator-contract.js';
import {
  SyntheticCleanupRefusedError,
  SyntheticOwnershipConflictError,
  cleanupSyntheticSubset,
  persistSyntheticSubset,
  planSyntheticPersistenceSubset,
} from './synthetic-generator-persistence.js';

const databaseUrl = process.env.DATABASE_URL;

function config(
  namespace: string,
  packCount: number,
): SyntheticGeneratorConfigInput {
  return {
    profile: 'SMALL',
    seed: 'phase5g2a-seed-001',
    namespace,
    packCount,
    dryRun: false,
  };
}

function plannedCounts(
  plan: ReturnType<typeof planSyntheticPersistenceSubset>,
) {
  return {
    productModels: 1,
    processDefinitions: plan.processDefinitions.length,
    processRoutes: 1,
    processRouteSteps: plan.processRouteSteps.length,
    traceableUnits: Object.values(plan.units).flat().length,
    genealogyRelations: plan.genealogyRelations.length,
    processExecutions: plan.processExecutions.length,
  };
}

describe('Phase 5G-2A guarded synthetic persistence', () => {
  let client: PrismaClient;
  let referenceCounts: { productModels: number; traceableUnits: number };

  beforeAll(async () => {
    await assertSyntheticGeneratorMutationTarget(databaseUrl);
    client = new PrismaClient({
      adapter: createPrismaPgAdapter(databaseUrl as string),
    });
    referenceCounts = {
      productModels: await client.productModel.count({
        where: { code: { startsWith: 'DEMO_' } },
      }),
      traceableUnits: await client.traceableUnit.count({
        where: { traceCode: { contains: '-DEMO-' } },
      }),
    };
  });

  afterAll(async () => {
    await client?.$disconnect();
  });

  it('creates a bounded subset transactionally and reuses it on an exact rerun', async () => {
    const input = config('SYN5G_PERSIST_RERUN', 3);
    const plan = planSyntheticPersistenceSubset(input);
    const first = await persistSyntheticSubset(databaseUrl, input);
    expect(first.created).toEqual(plannedCounts(plan));
    expect(first.reused).toEqual({
      productModels: 0,
      processDefinitions: 0,
      processRoutes: 0,
      processRouteSteps: 0,
      traceableUnits: 0,
      genealogyRelations: 0,
      processExecutions: 0,
    });

    const replay = await persistSyntheticSubset(databaseUrl, input);
    expect(replay.planFingerprint).toBe(first.planFingerprint);
    expect(replay.created).toEqual({
      productModels: 0,
      processDefinitions: 0,
      processRoutes: 0,
      processRouteSteps: 0,
      traceableUnits: 0,
      genealogyRelations: 0,
      processExecutions: 0,
    });
    expect(replay.reused).toEqual(plannedCounts(plan));

    await expect(
      cleanupSyntheticSubset(databaseUrl, input, {
        operation: 'CLEANUP',
        planFingerprint: first.planFingerprint,
      }),
    ).resolves.toEqual({
      deleted: plannedCounts(plan),
    });
  });

  it('recovers a compatible partial run without rewriting existing rows', async () => {
    const input = config('SYN5G_PARTIAL_RECOVERY', 5);
    const plan = planSyntheticPersistenceSubset(input);
    const units = Object.values(plan.units).flat();
    await client.$transaction(async (tx) => {
      await tx.productModel.create({ data: plan.productModel });
      await tx.processDefinition.createMany({ data: plan.processDefinitions });
      await tx.processRoute.create({ data: plan.processRoute });
      await tx.processRouteStep.createMany({ data: plan.processRouteSteps });
      await tx.traceableUnit.createMany({ data: units.slice(0, 7) });
      await tx.processExecution.createMany({
        data: plan.processExecutions.slice(0, 2),
      });
    });

    const recovered = await persistSyntheticSubset(databaseUrl, input);
    expect(recovered.created).toEqual({
      productModels: 0,
      processDefinitions: 0,
      processRoutes: 0,
      processRouteSteps: 0,
      traceableUnits: units.length - 7,
      genealogyRelations: plan.genealogyRelations.length,
      processExecutions: plan.processExecutions.length - 2,
    });
    expect(recovered.reused).toEqual({
      productModels: 1,
      processDefinitions: 4,
      processRoutes: 1,
      processRouteSteps: 4,
      traceableUnits: 7,
      genealogyRelations: 0,
      processExecutions: 2,
    });
    expect(
      await client.traceableUnit.count({
        where: { id: { in: units.map(({ id }) => id) } },
      }),
    ).toBe(units.length);

    await cleanupSyntheticSubset(databaseUrl, input, {
      operation: 'CLEANUP',
      planFingerprint: plan.planFingerprint,
    });
  });

  it('refuses an incompatible public identity before creating any planned pack', async () => {
    const input = config('SYN5G_COLLISION_REFUSAL', 2);
    const plan = planSyntheticPersistenceSubset(input);
    const conflictingId = '51000000-0000-4000-8000-000000000001';
    await client.productModel.create({
      data: {
        id: conflictingId,
        code: plan.productModel.code,
        name: 'Incompatible test-owned collision',
        description: 'Isolated collision fixture.',
      },
    });

    await expect(
      persistSyntheticSubset(databaseUrl, input),
    ).rejects.toBeInstanceOf(SyntheticOwnershipConflictError);
    expect(
      await client.traceableUnit.count({
        where: {
          id: {
            in: Object.values(plan.units)
              .flat()
              .map(({ id }) => id),
          },
        },
      }),
    ).toBe(0);
    await client.productModel.delete({ where: { id: conflictingId } });
  });

  it('refuses a conflicting exact relationship without committing a partial graph', async () => {
    const input = config('SYN5G_RELATION_CONFLICT', 2);
    const persisted = await persistSyntheticSubset(databaseUrl, input);
    const plan = planSyntheticPersistenceSubset(input);
    const relation = plan.genealogyRelations[0];
    await client.genealogyRelation.update({
      where: { id: relation.id },
      data: { positionCode: 'INCOMPATIBLE-POSITION' },
    });

    await expect(
      persistSyntheticSubset(databaseUrl, input),
    ).rejects.toBeInstanceOf(SyntheticOwnershipConflictError);
    expect(
      await client.genealogyRelation.count({
        where: { id: { in: plan.genealogyRelations.map(({ id }) => id) } },
      }),
    ).toBe(plan.genealogyRelations.length);

    await client.genealogyRelation.update({
      where: { id: relation.id },
      data: {
        positionCode: relation.positionCode,
        updatedAt: relation.updatedAt,
      },
    });
    await cleanupSyntheticSubset(databaseUrl, input, {
      operation: 'CLEANUP',
      planFingerprint: persisted.planFingerprint,
    });
  });

  it('refuses a conflicting process execution without rewriting history', async () => {
    const input = config('SYN5G_PROCESS_CONFLICT', 2);
    const persisted = await persistSyntheticSubset(databaseUrl, input);
    const plan = planSyntheticPersistenceSubset(input);
    const execution = plan.processExecutions[0];
    await client.processExecution.update({
      where: { id: execution.id },
      data: { status: 'ABORTED' },
    });

    await expect(
      persistSyntheticSubset(databaseUrl, input),
    ).rejects.toBeInstanceOf(SyntheticOwnershipConflictError);
    expect(
      await client.processExecution.count({
        where: { id: { in: plan.processExecutions.map(({ id }) => id) } },
      }),
    ).toBe(plan.processExecutions.length);

    await client.processExecution.update({
      where: { id: execution.id },
      data: { status: execution.status, updatedAt: execution.updatedAt },
    });
    await cleanupSyntheticSubset(databaseUrl, input, {
      operation: 'CLEANUP',
      planFingerprint: persisted.planFingerprint,
    });
  });

  it('requires exact cleanup confirmation and refuses unowned dependants', async () => {
    const input = config('SYN5G_CLEANUP_SAFETY', 2);
    const persisted = await persistSyntheticSubset(databaseUrl, input);
    const plan = planSyntheticPersistenceSubset(input);

    await expect(
      cleanupSyntheticSubset(databaseUrl, input, {
        operation: 'CLEANUP',
        planFingerprint: 'not-the-plan-fingerprint',
      }),
    ).rejects.toBeInstanceOf(SyntheticCleanupRefusedError);

    const unownedUnitId = '52000000-0000-4000-8000-000000000001';
    await client.traceableUnit.create({
      data: {
        id: unownedUnitId,
        traceCode: 'PHASE5G2A-UNOWNED-PACK',
        unitType: 'PACK',
        productModelId: plan.productModel.id,
      },
    });
    await expect(
      cleanupSyntheticSubset(databaseUrl, input, {
        operation: 'CLEANUP',
        planFingerprint: persisted.planFingerprint,
      }),
    ).rejects.toMatchObject({ reason: 'DEPENDENT_OR_UNOWNED_RECORDS' });

    await client.traceableUnit.delete({ where: { id: unownedUnitId } });
    await cleanupSyntheticSubset(databaseUrl, input, {
      operation: 'CLEANUP',
      planFingerprint: persisted.planFingerprint,
    });
  });

  it('persists and cleans the SMALL profile without changing reference fixtures', async () => {
    const input = config('SYN5G_SMALL_ACCEPTANCE', 100);
    const plan = planSyntheticPersistenceSubset(input);
    const first = await persistSyntheticSubset(databaseUrl, input);
    expect(first.created).toEqual(plannedCounts(plan));
    const rerun = await persistSyntheticSubset(databaseUrl, input);
    expect(rerun.created).toEqual({
      productModels: 0,
      processDefinitions: 0,
      processRoutes: 0,
      processRouteSteps: 0,
      traceableUnits: 0,
      genealogyRelations: 0,
      processExecutions: 0,
    });
    expect(rerun.reused).toEqual(plannedCounts(plan));

    const unitIds = Object.values(plan.units)
      .flat()
      .map(({ id }) => id);
    const persistedRelations = await client.genealogyRelation.findMany({
      where: { id: { in: plan.genealogyRelations.map(({ id }) => id) } },
      select: { parentUnitId: true, childUnitId: true },
    });
    expect(persistedRelations).toHaveLength(700);
    expect(findGenealogyCycles(persistedRelations)).toEqual([]);
    expect(
      persistedRelations.every(
        ({ parentUnitId, childUnitId }) =>
          unitIds.includes(parentUnitId) && unitIds.includes(childUnitId),
      ),
    ).toBe(true);
    const childCounts = new Map<string, number>();
    for (const { childUnitId } of persistedRelations) {
      childCounts.set(childUnitId, (childCounts.get(childUnitId) ?? 0) + 1);
    }
    expect([...childCounts.values()].every((count) => count === 1)).toBe(true);
    const prismaService = { client } as PrismaService;
    const traceability = new TraceabilityService(
      new TraceabilityRepository(prismaService),
    );
    const forward = await traceability.forwardGenealogy(
      plan.units.packs[0].traceCode,
    );
    expect(forward.edges).toHaveLength(7);
    expect(forward.edges.filter(({ depth }) => depth === 1)).toHaveLength(1);
    expect(forward.edges.filter(({ depth }) => depth === 2)).toHaveLength(6);
    const reverse = await traceability.reverseGenealogy(
      plan.units.cells[0].traceCode,
    );
    expect(reverse.edges).toHaveLength(2);
    expect(reverse.edges.map(({ depth }) => depth)).toEqual([1, 2]);
    const history = new TraceabilityHistoryService(
      new TraceabilityHistoryRepository(prismaService),
    );
    const firstPackHistory = await history.getProcessHistory(
      plan.units.packs[0].traceCode,
      { page: 1, pageSize: 25 },
    );
    const firstPackExecutions = plan.processExecutions.filter(
      ({ traceableUnitId }) => traceableUnitId === plan.units.packs[0].id,
    );
    expect(firstPackHistory.page.totalItems).toBe(firstPackExecutions.length);
    expect(
      firstPackHistory.items.every(
        (item) =>
          /^exec_[a-f0-9]{24}$/.test(item.recordId) &&
          item.status === 'COMPLETED' &&
          item.process.code.startsWith(plan.config.resolvedNamespace),
      ),
    ).toBe(true);
    const retryExecution = plan.processExecutions.find(
      ({ attemptNumber }) => attemptNumber === 2,
    );
    expect(retryExecution).toBeDefined();
    const retryPack = plan.units.packs.find(
      ({ id }) => id === retryExecution?.traceableUnitId,
    );
    const retryHistory = await history.getProcessHistory(retryPack!.traceCode, {
      page: 1,
      pageSize: 25,
    });
    expect(
      retryHistory.items.some(({ attemptNumber }) => attemptNumber === 2),
    ).toBe(true);
    expect(
      retryHistory.items.some(
        ({ attemptNumber, route }) => attemptNumber === 2 && route === null,
      ),
    ).toBe(true);

    await cleanupSyntheticSubset(databaseUrl, input, {
      operation: 'CLEANUP',
      planFingerprint: plan.planFingerprint,
    });
    expect(
      await client.productModel.count({
        where: { code: { startsWith: 'DEMO_' } },
      }),
    ).toBe(referenceCounts.productModels);
    expect(
      await client.traceableUnit.count({
        where: { traceCode: { contains: '-DEMO-' } },
      }),
    ).toBe(referenceCounts.traceableUnits);
    expect(
      await client.productModel.count({
        where: { id: plan.productModel.id },
      }),
    ).toBe(0);
    expect(
      await client.traceableUnit.count({
        where: { id: { in: unitIds } },
      }),
    ).toBe(0);

    const integrity = await new TraceabilityIntegrityService(
      prismaService,
    ).validateSeedDataset();
    expect(integrity.valid).toBe(true);
    expect(integrity.checks).toHaveLength(9);
    expect(integrity.checks.every(({ passed }) => passed)).toBe(true);
  });
});
