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
} from './synthetic-generator-persistence.js';
import {
  cleanupSyntheticNc,
  persistSyntheticNc,
  planSyntheticNc,
} from './synthetic-generator-nc.js';
import {
  cleanupSyntheticQuality,
  persistSyntheticQuality,
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

describe('Phase 5G-2E guarded synthetic NC lifecycle', () => {
  let client: PrismaClient;
  let referenceCounts: {
    nonconformances: number;
    abnormalCases: number;
    actions: number;
    verifications: number;
    dispositions: number;
  };

  beforeAll(async () => {
    await assertSyntheticGeneratorMutationTarget(databaseUrl);
    client = new PrismaClient({
      adapter: createPrismaPgAdapter(databaseUrl as string),
    });
    referenceCounts = {
      nonconformances: await client.nonconformance.count({
        where: { code: { startsWith: 'NC-DEMO-' } },
      }),
      abnormalCases: await client.abnormalCase.count({
        where: { code: { startsWith: 'ABNORMAL-DEMO-' } },
      }),
      actions: await client.actionHistory.count({
        where: { nonconformance: { code: { startsWith: 'NC-DEMO-' } } },
      }),
      verifications: await client.verification.count({
        where: { nonconformance: { code: { startsWith: 'NC-DEMO-' } } },
      }),
      dispositions: await client.dispositionHistory.count({
        where: { nonconformance: { code: { startsWith: 'NC-DEMO-' } } },
      }),
    };
  });

  afterAll(async () => {
    await client?.$disconnect();
  });

  it('creates the exact bounded lifecycle distribution, public history, and zero-duplicate rerun', async () => {
    const input = config('SYN5G_NC_SMALL');
    const plan = planSyntheticNc(input);
    expect(plan.distribution).toEqual({
      cleanWithoutNc: 77,
      ngWithoutNc: 14,
      open: 3,
      resolved: 3,
      closedEscalated: 3,
    });
    expect(plan.defectCategories).toHaveLength(5);
    expect(plan.nonconformances).toHaveLength(9);
    expect(plan.abnormalCases).toHaveLength(3);
    expect(plan.actions).toHaveLength(15);
    expect(plan.verifications).toHaveLength(6);
    expect(plan.dispositions).toHaveLength(9);
    expect(
      plan.actions.filter((row) => row.actionType === 'REWORK'),
    ).toHaveLength(3);
    expect(
      plan.actions.filter((row) => row.actionType === 'RETEST'),
    ).toHaveLength(6);

    const first = await persistSyntheticNc(databaseUrl, input);
    expect(first.created).toEqual({
      defectCategories: 5,
      nonconformances: 9,
      abnormalCases: 3,
      actions: 15,
      verifications: 6,
      dispositions: 9,
    });
    const replay = await persistSyntheticNc(databaseUrl, input);
    expect(replay.planFingerprint).toBe(first.planFingerprint);
    expect(replay.created).toEqual({
      defectCategories: 0,
      nonconformances: 0,
      abnormalCases: 0,
      actions: 0,
      verifications: 0,
      dispositions: 0,
    });
    expect(replay.reused).toEqual(first.created);

    const closed = plan.nonconformances.find((row) => row.status === 'CLOSED')!;
    const pack = plan.quality.base.units.packs.find(
      (row) => row.id === closed.traceableUnitId,
    )!;
    const prismaService = { client } as PrismaService;
    const history = new TraceabilityHistoryService(
      new TraceabilityHistoryRepository(prismaService),
    );
    const publicHistory = await history.getNonconformanceHistory(
      pack.traceCode,
      {
        page: 1,
        pageSize: 10,
        status: null,
      },
    );
    expect(publicHistory.items).toHaveLength(1);
    expect(publicHistory.items[0]).toMatchObject({
      code: closed.code,
      status: 'CLOSED',
      nestedPageInfo: {
        abnormalCases: { returnedCount: 1, totalCount: 1, isPartial: false },
        actions: { returnedCount: 3, totalCount: 3, isPartial: false },
        verifications: { returnedCount: 1, totalCount: 1, isPartial: false },
        dispositions: { returnedCount: 2, totalCount: 2, isPartial: false },
      },
    });
    expect(publicHistory.items[0].actions.map((row) => row.actionType)).toEqual(
      ['ESCALATION', 'REWORK', 'RETEST'],
    );
    expect(
      publicHistory.items[0].dispositions.map((row) => row.dispositionType),
    ).toEqual(['RETURN_IQC', 'CONTINUE']);
    expect(publicHistory.items[0].source.inspectionRecordId).toMatch(
      /^insp_[a-f0-9]{24}$/,
    );
    expect(publicHistory.items[0].source.processExecutionRecordId).toMatch(
      /^exec_[a-f0-9]{24}$/,
    );

    const ngCount = plan.quality.inspections.filter(
      (row) => row.outcome === 'NG',
    ).length;
    expect(ngCount).toBe(23);
    expect(plan.nonconformances).toHaveLength(9);
    const integrity = await new TraceabilityIntegrityService(
      prismaService,
    ).validateSeedDataset();
    expect(integrity.valid).toBe(true);
    expect(integrity.checks).toHaveLength(9);
    expect(integrity.checks.every((check) => check.passed)).toBe(true);

    const cleanup = await cleanupSyntheticNc(databaseUrl, input, {
      operation: 'CLEANUP',
      planFingerprint: plan.planFingerprint,
    });
    expect(cleanup.deleted).toMatchObject({
      defectCategories: 5,
      nonconformances: 9,
      abnormalCases: 3,
      actions: 15,
      verifications: 6,
      dispositions: 9,
    });
    expect(
      await client.nonconformance.count({
        where: { id: { in: plan.nonconformances.map((row) => row.id) } },
      }),
    ).toBe(0);
    expect(
      await client.nonconformance.count({
        where: { code: { startsWith: 'NC-DEMO-' } },
      }),
    ).toBe(referenceCounts.nonconformances);
    expect(
      await client.abnormalCase.count({
        where: { code: { startsWith: 'ABNORMAL-DEMO-' } },
      }),
    ).toBe(referenceCounts.abnormalCases);
    expect(
      await client.actionHistory.count({
        where: { nonconformance: { code: { startsWith: 'NC-DEMO-' } } },
      }),
    ).toBe(referenceCounts.actions);
    expect(
      await client.verification.count({
        where: { nonconformance: { code: { startsWith: 'NC-DEMO-' } } },
      }),
    ).toBe(referenceCounts.verifications);
    expect(
      await client.dispositionHistory.count({
        where: { nonconformance: { code: { startsWith: 'NC-DEMO-' } } },
      }),
    ).toBe(referenceCounts.dispositions);
  });

  it('recovers a compatible missing lifecycle without rewriting retained history', async () => {
    const input = config('SYN5G_NC_RECOVERY');
    const plan = planSyntheticNc(input);
    await persistSyntheticNc(databaseUrl, input);
    const target = plan.nonconformances.find(
      (row) => row.status === 'RESOLVED',
    )!;
    const retained = await client.nonconformance.findUniqueOrThrow({
      where: { id: plan.nonconformances[0].id },
    });
    await client.dispositionHistory.deleteMany({
      where: { nonconformanceId: target.id },
    });
    await client.verification.deleteMany({
      where: { nonconformanceId: target.id },
    });
    await client.actionHistory.deleteMany({
      where: { nonconformanceId: target.id },
    });
    await client.nonconformance.delete({ where: { id: target.id } });
    const recovery = await persistSyntheticNc(databaseUrl, input);
    expect(recovery.created).toMatchObject({
      nonconformances: 1,
      actions: 2,
      verifications: 1,
      dispositions: 1,
    });
    expect(
      await client.nonconformance.findUniqueOrThrow({
        where: { id: retained.id },
      }),
    ).toEqual(retained);
    await cleanupSyntheticNc(databaseUrl, input, {
      operation: 'CLEANUP',
      planFingerprint: plan.planFingerprint,
    });
  });

  it('refuses conflicting NC-owned identity before lifecycle writes', async () => {
    const input = config('SYN5G_NC_CONFLICT');
    const plan = planSyntheticNc(input);
    await persistSyntheticQuality(databaseUrl, input);
    await client.defectCategory.create({
      data: { ...plan.defectCategories[0], name: 'Conflicting category' },
    });
    await expect(persistSyntheticNc(databaseUrl, input)).rejects.toBeInstanceOf(
      SyntheticOwnershipConflictError,
    );
    expect(
      await client.nonconformance.count({
        where: { id: { in: plan.nonconformances.map((row) => row.id) } },
      }),
    ).toBe(0);
    await client.defectCategory.delete({
      where: { id: plan.defectCategories[0].id },
    });
    await cleanupSyntheticQuality(databaseUrl, input, {
      operation: 'CLEANUP',
      planFingerprint: plan.quality.planFingerprint,
    });
  });

  it('refuses cleanup when an NC has an unexpected dependent event', async () => {
    const input = config('SYN5G_NC_CLEANUP');
    const plan = planSyntheticNc(input);
    await persistSyntheticNc(databaseUrl, input);
    const target = plan.nonconformances[0];
    const unexpectedId = plan.quality.base.processDefinitions[0].id;
    await client.dispositionHistory.create({
      data: {
        id: unexpectedId,
        nonconformanceId: target.id,
        dispositionType: 'CONCESSION',
        note: 'Isolated cleanup refusal fixture.',
        decidedAt: new Date(target.detectedAt.getTime() + 60_000),
      },
    });
    await expect(
      cleanupSyntheticNc(databaseUrl, input, {
        operation: 'CLEANUP',
        planFingerprint: plan.planFingerprint,
      }),
    ).rejects.toBeInstanceOf(SyntheticCleanupRefusedError);
    await client.dispositionHistory.delete({ where: { id: unexpectedId } });
    await cleanupSyntheticNc(databaseUrl, input, {
      operation: 'CLEANUP',
      planFingerprint: plan.planFingerprint,
    });
  });
});
