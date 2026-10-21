import { PrismaClient } from '../src/generated/prisma/client.js';
import { createPrismaPgAdapter } from '../src/prisma/prisma-pg.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
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
} from './synthetic-generator-persistence.js';
import {
  cleanupSyntheticQuality,
  persistSyntheticQuality,
  planSyntheticQuality,
} from './synthetic-generator-quality.js';

const databaseUrl = process.env.DATABASE_URL;

function config(
  namespace: string,
  packCount = 100,
): SyntheticGeneratorConfigInput {
  return {
    profile: 'SMALL',
    seed: 'phase5g2d-seed-001',
    namespace,
    packCount,
    dryRun: false,
  };
}

describe('Phase 5G-2D guarded synthetic quality history', () => {
  let client: PrismaClient;
  let referenceCounts: {
    specifications: number;
    inspections: number;
    results: number;
    submissions: number;
    nonconformances: number;
  };

  beforeAll(async () => {
    await assertSyntheticGeneratorMutationTarget(databaseUrl);
    client = new PrismaClient({
      adapter: createPrismaPgAdapter(databaseUrl as string),
    });
    referenceCounts = {
      specifications: await client.inspectionSpecification.count({
        where: { code: { startsWith: 'DEMO_' } },
      }),
      inspections: await client.inspection.count({
        where: { specification: { code: { startsWith: 'DEMO_' } } },
      }),
      results: await client.inspectionResult.count({
        where: {
          inspection: { specification: { code: { startsWith: 'DEMO_' } } },
        },
      }),
      submissions: await client.inspectionSubmission.count({
        where: {
          inspection: { specification: { code: { startsWith: 'DEMO_' } } },
        },
      }),
      nonconformances: await client.nonconformance.count(),
    };
  });

  afterAll(async () => {
    await client?.$disconnect();
  });

  it('creates all five types, preserves immutable attempts, exposes Quality History, and reruns exactly', async () => {
    const input = config('SYN5G_QUALITY_SMALL');
    const plan = planSyntheticQuality(input);
    expect(plan.specifications).toHaveLength(5);
    expect(plan.options).toHaveLength(4);
    expect(plan.inspections).toHaveLength(523);
    expect(plan.results).toHaveLength(523);
    expect(plan.submissions).toHaveLength(523);
    expect(plan.distribution).toEqual({
      pass: 500,
      ng: 23,
      byType: {
        NUMERIC: 105,
        BOOLEAN: 103,
        CATEGORICAL: 106,
        VISUAL: 104,
        TEXT: 105,
      },
      withExecution: 273,
      withoutExecution: 250,
    });

    const first = await persistSyntheticQuality(databaseUrl, input);
    expect(first.created).toEqual({
      users: 1,
      specifications: 5,
      options: 4,
      inspections: 523,
      results: 523,
      submissions: 523,
    });
    const replay = await persistSyntheticQuality(databaseUrl, input);
    expect(replay.planFingerprint).toBe(first.planFingerprint);
    expect(replay.created).toEqual({
      users: 0,
      specifications: 0,
      options: 0,
      inspections: 0,
      results: 0,
      submissions: 0,
    });
    expect(replay.reused).toEqual(first.created);

    const noncleanIndex = plan.base.units.packs.findIndex((pack) =>
      plan.inspections.some(
        (inspection) =>
          inspection.traceableUnitId === pack.id &&
          inspection.attemptNumber === 2,
      ),
    );
    expect(noncleanIndex).toBeGreaterThanOrEqual(0);
    const pack = plan.base.units.packs[noncleanIndex];
    const prismaService = { client } as PrismaService;
    const history = new TraceabilityHistoryService(
      new TraceabilityHistoryRepository(prismaService),
    );
    const quality = await history.getQualityHistory(pack.traceCode, {
      page: 1,
      pageSize: 25,
      outcome: null,
    });
    expect(quality.items).toHaveLength(6);
    expect(new Set(quality.items.map((item) => item.resultType))).toEqual(
      new Set(['NUMERIC', 'BOOLEAN', 'CATEGORICAL', 'VISUAL', 'TEXT']),
    );
    expect(quality.items.some((item) => item.outcome === 'NG')).toBe(true);
    expect(
      quality.items.some(
        (item) => item.attemptNumber === 2 && item.outcome === 'PASS',
      ),
    ).toBe(true);
    expect(
      quality.items.every(
        (item) =>
          item.specification.version === 1 &&
          item.specification.code.startsWith(
            plan.base.config.resolvedNamespace,
          ),
      ),
    ).toBe(true);
    expect(
      quality.items.some((item) => item.processExecutionRecordId === null),
    ).toBe(true);
    expect(
      quality.items.some((item) => item.processExecutionRecordId !== null),
    ).toBe(true);
    expect(await client.nonconformance.count()).toBe(
      referenceCounts.nonconformances,
    );

    const integrity = await new TraceabilityIntegrityService(
      prismaService,
    ).validateSeedDataset();
    expect(integrity.valid).toBe(true);
    expect(integrity.checks).toHaveLength(9);
    expect(integrity.checks.every(({ passed }) => passed)).toBe(true);

    const cleanup = await cleanupSyntheticQuality(databaseUrl, input, {
      operation: 'CLEANUP',
      planFingerprint: plan.planFingerprint,
    });
    expect(cleanup.deleted.inspections).toBe(523);
    expect(cleanup.deleted.results).toBe(523);
    expect(cleanup.deleted.submissions).toBe(523);
    expect(
      await client.inspectionSpecification.count({
        where: { id: { in: plan.specifications.map((row) => row.id) } },
      }),
    ).toBe(0);
    expect(
      await client.inspection.count({
        where: { id: { in: plan.inspections.map((row) => row.id) } },
      }),
    ).toBe(0);
    expect(await client.nonconformance.count()).toBe(
      referenceCounts.nonconformances,
    );
    expect(
      await client.inspectionSpecification.count({
        where: { code: { startsWith: 'DEMO_' } },
      }),
    ).toBe(referenceCounts.specifications);
    expect(
      await client.inspection.count({
        where: { specification: { code: { startsWith: 'DEMO_' } } },
      }),
    ).toBe(referenceCounts.inspections);
    expect(
      await client.inspectionResult.count({
        where: {
          inspection: { specification: { code: { startsWith: 'DEMO_' } } },
        },
      }),
    ).toBe(referenceCounts.results);
    expect(
      await client.inspectionSubmission.count({
        where: {
          inspection: { specification: { code: { startsWith: 'DEMO_' } } },
        },
      }),
    ).toBe(referenceCounts.submissions);
  });

  it('recovers a compatible missing inspection aggregate without rewriting existing history', async () => {
    const input = config('SYN5G_QUALITY_RECOVERY', 3);
    const plan = planSyntheticQuality(input);
    await persistSyntheticQuality(databaseUrl, input);
    const target = plan.inspections.at(-1)!;
    const before = await client.inspection.findUniqueOrThrow({
      where: { id: plan.inspections[0].id },
    });
    await client.inspectionSubmission.delete({
      where: { inspectionId: target.id },
    });
    await client.inspectionResult.delete({
      where: { inspectionId: target.id },
    });
    await client.inspection.delete({ where: { id: target.id } });
    const recovery = await persistSyntheticQuality(databaseUrl, input);
    expect(recovery.created).toMatchObject({
      inspections: 1,
      results: 1,
      submissions: 1,
    });
    expect(
      await client.inspection.findUniqueOrThrow({ where: { id: before.id } }),
    ).toEqual(before);
    await cleanupSyntheticQuality(databaseUrl, input, {
      operation: 'CLEANUP',
      planFingerprint: plan.planFingerprint,
    });
  });

  it('refuses a conflicting specification before writing quality history', async () => {
    const input = config('SYN5G_QUALITY_CONFLICT', 2);
    const plan = planSyntheticQuality(input);
    await persistSyntheticSubset(databaseUrl, input);
    await client.inspectionSpecification.create({
      data: {
        ...plan.specifications[0],
        name: 'Conflicting synthetic criterion',
      },
    });
    await expect(
      persistSyntheticQuality(databaseUrl, input),
    ).rejects.toBeInstanceOf(SyntheticOwnershipConflictError);
    expect(await client.user.count({ where: { id: plan.actor.id } })).toBe(0);
    expect(
      await client.inspection.count({
        where: { id: { in: plan.inspections.map((row) => row.id) } },
      }),
    ).toBe(0);
    await client.inspectionSpecification.delete({
      where: { id: plan.specifications[0].id },
    });
    await cleanupSyntheticSubset(databaseUrl, input, {
      operation: 'CLEANUP',
      planFingerprint: plan.base.planFingerprint,
    });
  });

  it('refuses cleanup when the owned actor has an unexpected dependent session', async () => {
    const input = config('SYN5G_QUALITY_CLEANUP', 2);
    const plan = planSyntheticQuality(input);
    await persistSyntheticQuality(databaseUrl, input);
    const sessionId = plan.base.config.seed
      .split('')
      .reduce((value, character) => value + character.charCodeAt(0), 0)
      .toString(16)
      .padStart(64, '0')
      .slice(-64);
    await client.session.create({
      data: {
        userId: plan.actor.id,
        tokenDigest: sessionId,
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      },
    });
    await expect(
      cleanupSyntheticQuality(databaseUrl, input, {
        operation: 'CLEANUP',
        planFingerprint: plan.planFingerprint,
      }),
    ).rejects.toBeInstanceOf(SyntheticCleanupRefusedError);
    await client.session.delete({ where: { tokenDigest: sessionId } });
    await cleanupSyntheticQuality(databaseUrl, input, {
      operation: 'CLEANUP',
      planFingerprint: plan.planFingerprint,
    });
  });
});
