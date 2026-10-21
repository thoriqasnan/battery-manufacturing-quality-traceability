import { PrismaClient, type Prisma } from '../src/generated/prisma/client.js';
import { createPrismaPgAdapter } from '../src/prisma/prisma-pg.js';
import {
  assertSyntheticGeneratorMutationTarget,
  syntheticEntityId,
  syntheticOwnershipFingerprint,
  syntheticScenarioFor,
  type SyntheticGeneratorConfigInput,
} from './synthetic-generator-contract.js';
import {
  SyntheticCleanupRefusedError,
  SyntheticOwnershipConflictError,
} from './synthetic-generator-persistence.js';
import {
  cleanupSyntheticQuality,
  persistSyntheticQuality,
  planSyntheticQuality,
  type SyntheticQualityPlan,
} from './synthetic-generator-quality.js';

const BATCH_SIZE = 100;

type DefectCategoryRecord = {
  id: string;
  code: string;
  name: string;
  description: string;
  isActive: true;
  createdAt: Date;
  updatedAt: Date;
};

type NonconformanceRecord = {
  id: string;
  code: string;
  traceableUnitId: string;
  defectCategoryId: string;
  sourceInspectionId: string;
  sourceProcessExecutionId: string;
  status: 'OPEN' | 'RESOLVED' | 'CLOSED';
  description: string;
  detectedAt: Date;
  resolvedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type AbnormalCaseRecord = {
  id: string;
  nonconformanceId: string;
  code: string;
  reason: string;
  openedAt: Date;
  closedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

type ActionRecord = {
  id: string;
  nonconformanceId: string;
  traceableUnitId: string;
  abnormalCaseId: string | null;
  resultingInspectionId: string | null;
  relatedUnitId: string | null;
  actionType: 'CORRECTION' | 'REWORK' | 'RETEST' | 'ESCALATION';
  note: string;
  occurredAt: Date;
  createdAt: Date;
};

type VerificationRecord = {
  id: string;
  nonconformanceId: string;
  traceableUnitId: string;
  actionHistoryId: string;
  inspectionId: string;
  note: string;
  verifiedAt: Date;
  createdAt: Date;
};

type DispositionRecord = {
  id: string;
  nonconformanceId: string;
  dispositionType: 'CONTINUE' | 'RETURN_IQC';
  note: string;
  decidedAt: Date;
  createdAt: Date;
};

export type SyntheticNcPlan = {
  planFingerprint: string;
  quality: SyntheticQualityPlan;
  defectCategories: DefectCategoryRecord[];
  nonconformances: NonconformanceRecord[];
  abnormalCases: AbnormalCaseRecord[];
  actions: ActionRecord[];
  verifications: VerificationRecord[];
  dispositions: DispositionRecord[];
  distribution: {
    cleanWithoutNc: number;
    ngWithoutNc: number;
    open: number;
    resolved: number;
    closedEscalated: number;
  };
};

function chunks<T>(items: T[]): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += BATCH_SIZE)
    result.push(items.slice(index, index + BATCH_SIZE));
  return result;
}

function dated<T extends { createdAt: Date }>(row: T) {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

function datedUpdated<T extends { createdAt: Date; updatedAt: Date }>(row: T) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function ncValue(row: NonconformanceRecord) {
  return {
    ...datedUpdated(row),
    detectedAt: row.detectedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
  };
}

function abnormalValue(row: AbnormalCaseRecord) {
  return {
    ...datedUpdated(row),
    openedAt: row.openedAt.toISOString(),
    closedAt: row.closedAt.toISOString(),
  };
}

function actionValue(row: ActionRecord) {
  return { ...dated(row), occurredAt: row.occurredAt.toISOString() };
}

function verificationValue(row: VerificationRecord) {
  return { ...dated(row), verifiedAt: row.verifiedAt.toISOString() };
}

function dispositionValue(row: DispositionRecord) {
  return { ...dated(row), decidedAt: row.decidedAt.toISOString() };
}

function match(planned: unknown, existing: unknown): boolean {
  return (
    syntheticOwnershipFingerprint(planned) ===
    syntheticOwnershipFingerprint(existing)
  );
}

function plus(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function planSyntheticNc(
  input: SyntheticGeneratorConfigInput,
): SyntheticNcPlan {
  const quality = planSyntheticQuality(input);
  const namespace = quality.base.config.resolvedNamespace;
  const ncPacks = quality.base.units.packs.filter(
    (_, index) =>
      syntheticScenarioFor(quality.base.config, index + 1) === 'NC_REWORK',
  );
  const defectCategories = quality.specifications.map(
    (specification, index) => {
      const createdAt = plus(quality.specifications[0].createdAt, 20 + index);
      return {
        id: syntheticEntityId(
          quality.base.config,
          'defect-category',
          index + 1,
        ),
        code: `${namespace}-DEFECT-${specification.resultType}`,
        name: `Synthetic ${specification.resultType.toLowerCase()} nonconformance`,
        description: `Fictional generator-owned ${specification.resultType.toLowerCase()} defect category.`,
        isActive: true as const,
        createdAt,
        updatedAt: createdAt,
      };
    },
  );
  const categoryByType = new Map(
    quality.specifications.map((specification, index) => [
      specification.resultType,
      defectCategories[index],
    ]),
  );
  const nonconformances: NonconformanceRecord[] = [];
  const abnormalCases: AbnormalCaseRecord[] = [];
  const actions: ActionRecord[] = [];
  const verifications: VerificationRecord[] = [];
  const dispositions: DispositionRecord[] = [];

  for (const [ncIndex, pack] of ncPacks.entries()) {
    const source = quality.inspections.find(
      (inspection) =>
        inspection.traceableUnitId === pack.id &&
        inspection.attemptNumber === 1 &&
        inspection.outcome === 'NG',
    );
    if (!source) throw new Error('Synthetic NC source inspection is missing.');
    const retest = quality.inspections.find(
      (inspection) =>
        inspection.traceableUnitId === pack.id &&
        inspection.specificationId === source.specificationId &&
        inspection.attemptNumber === 2 &&
        inspection.outcome === 'PASS',
    );
    if (!retest) throw new Error('Synthetic NC retest inspection is missing.');
    const sourceExecution = quality.base.processExecutions.find(
      (execution) =>
        execution.traceableUnitId === pack.id &&
        execution.processDefinitionId === source.processDefinitionId &&
        execution.attemptNumber === 1,
    );
    if (!sourceExecution)
      throw new Error('Synthetic NC source execution is missing.');
    const group = ncIndex % 3;
    const status = group === 0 ? 'OPEN' : group === 1 ? 'RESOLVED' : 'CLOSED';
    const detectedAt = plus(source.inspectedAt, 1);
    const verificationAt = plus(retest.inspectedAt, 1);
    const ncId = syntheticEntityId(
      quality.base.config,
      'nonconformance',
      ncIndex + 1,
    );
    const nc: NonconformanceRecord = {
      id: ncId,
      code: `${namespace}-NC-${String(ncIndex + 1).padStart(4, '0')}`,
      traceableUnitId: pack.id,
      defectCategoryId: categoryByType.get(source.resultType)!.id,
      sourceInspectionId: source.id,
      sourceProcessExecutionId: sourceExecution.id,
      status,
      description: `Fictional ${status.toLowerCase()} generator-owned nonconformance history.`,
      detectedAt,
      resolvedAt: status === 'OPEN' ? null : verificationAt,
      closedAt: status === 'CLOSED' ? plus(verificationAt, 2) : null,
      createdAt: detectedAt,
      updatedAt:
        status === 'OPEN'
          ? detectedAt
          : status === 'CLOSED'
            ? plus(verificationAt, 2)
            : verificationAt,
    };
    nonconformances.push(nc);
    if (status === 'OPEN') continue;

    let abnormalCaseId: string | null = null;
    if (status === 'CLOSED') {
      const openedAt = plus(detectedAt, 1);
      abnormalCaseId = syntheticEntityId(
        quality.base.config,
        'abnormal-case',
        abnormalCases.length + 1,
      );
      abnormalCases.push({
        id: abnormalCaseId,
        nonconformanceId: ncId,
        code: `${namespace}-ABNORMAL-${String(abnormalCases.length + 1).padStart(4, '0')}`,
        reason: 'Fictional escalated manufacturing exception.',
        openedAt,
        closedAt: verificationAt,
        createdAt: openedAt,
        updatedAt: verificationAt,
      });
      actions.push({
        id: syntheticEntityId(
          quality.base.config,
          'nc-action',
          actions.length + 1,
        ),
        nonconformanceId: ncId,
        traceableUnitId: pack.id,
        abnormalCaseId,
        resultingInspectionId: null,
        relatedUnitId: null,
        actionType: 'ESCALATION',
        note: 'Fictional escalation recorded before rework.',
        occurredAt: plus(detectedAt, 2),
        createdAt: plus(detectedAt, 2),
      });
    }
    actions.push({
      id: syntheticEntityId(
        quality.base.config,
        'nc-action',
        actions.length + 1,
      ),
      nonconformanceId: ncId,
      traceableUnitId: pack.id,
      abnormalCaseId,
      resultingInspectionId: null,
      relatedUnitId: null,
      actionType: status === 'CLOSED' ? 'REWORK' : 'CORRECTION',
      note:
        status === 'CLOSED'
          ? 'Fictional literal REWORK action before retest.'
          : 'Fictional corrective adjustment before retest.',
      occurredAt: plus(detectedAt, 3),
      createdAt: plus(detectedAt, 3),
    });
    const retestActionId = syntheticEntityId(
      quality.base.config,
      'nc-action',
      actions.length + 1,
    );
    actions.push({
      id: retestActionId,
      nonconformanceId: ncId,
      traceableUnitId: pack.id,
      abnormalCaseId,
      resultingInspectionId: retest.id,
      relatedUnitId: null,
      actionType: 'RETEST',
      note: 'Separate PASS inspection retained after the original NG.',
      occurredAt: retest.inspectedAt,
      createdAt: retest.inspectedAt,
    });
    verifications.push({
      id: syntheticEntityId(
        quality.base.config,
        'verification',
        verifications.length + 1,
      ),
      nonconformanceId: ncId,
      traceableUnitId: pack.id,
      actionHistoryId: retestActionId,
      inspectionId: retest.id,
      note: 'Fictional successful verification of the PASS retest.',
      verifiedAt: verificationAt,
      createdAt: verificationAt,
    });
    if (status === 'CLOSED') {
      dispositions.push({
        id: syntheticEntityId(
          quality.base.config,
          'disposition',
          dispositions.length + 1,
        ),
        nonconformanceId: ncId,
        dispositionType: 'RETURN_IQC',
        note: 'Fictional interim return decision during escalation.',
        decidedAt: plus(detectedAt, 4),
        createdAt: plus(detectedAt, 4),
      });
    }
    dispositions.push({
      id: syntheticEntityId(
        quality.base.config,
        'disposition',
        dispositions.length + 1,
      ),
      nonconformanceId: ncId,
      dispositionType: 'CONTINUE',
      note: 'Fictional continuation after successful verification.',
      decidedAt: plus(verificationAt, status === 'CLOSED' ? 2 : 1),
      createdAt: plus(verificationAt, status === 'CLOSED' ? 2 : 1),
    });
  }
  const distribution = {
    cleanWithoutNc: quality.base.units.packs.filter(
      (_, index) =>
        syntheticScenarioFor(quality.base.config, index + 1) === 'CLEAN_PASS',
    ).length,
    ngWithoutNc: quality.base.units.packs.filter(
      (_, index) =>
        syntheticScenarioFor(quality.base.config, index + 1) === 'NG_RETEST',
    ).length,
    open: nonconformances.filter((row) => row.status === 'OPEN').length,
    resolved: nonconformances.filter((row) => row.status === 'RESOLVED').length,
    closedEscalated: nonconformances.filter((row) => row.status === 'CLOSED')
      .length,
  };
  const planFingerprint = syntheticOwnershipFingerprint({
    purpose: 'phase5g-nonconformance-history-plan-v1',
    qualityPlanFingerprint: quality.planFingerprint,
    defectCategories: defectCategories.map(datedUpdated),
    nonconformances: nonconformances.map(ncValue),
    abnormalCases: abnormalCases.map(abnormalValue),
    actions: actions.map(actionValue),
    verifications: verifications.map(verificationValue),
    dispositions: dispositions.map(dispositionValue),
  });
  return {
    planFingerprint,
    quality,
    defectCategories,
    nonconformances,
    abnormalCases,
    actions,
    verifications,
    dispositions,
    distribution,
  };
}

function advisoryKey(fingerprint: string): bigint {
  const unsigned = BigInt(`0x${fingerprint.slice(0, 16)}`);
  return unsigned >= 2n ** 63n ? unsigned - 2n ** 64n : unsigned;
}

function transactionOptions(plan: SyntheticNcPlan) {
  return {
    maxWait: 10_000,
    timeout: plan.quality.base.config.profile === 'MEDIUM' ? 900_000 : 30_000,
  };
}

async function withGuardedClient<T>(
  databaseUrl: string | undefined,
  operation: (client: PrismaClient) => Promise<T>,
): Promise<T> {
  await assertSyntheticGeneratorMutationTarget(databaseUrl);
  const client = new PrismaClient({
    adapter: createPrismaPgAdapter(databaseUrl as string),
  });
  try {
    return await operation(client);
  } finally {
    await client.$disconnect();
  }
}

type Classification = {
  defectCategories: DefectCategoryRecord[];
  nonconformances: NonconformanceRecord[];
  abnormalCases: AbnormalCaseRecord[];
  actions: ActionRecord[];
  verifications: VerificationRecord[];
  dispositions: DispositionRecord[];
};

async function classifyNc(
  tx: Prisma.TransactionClient,
  plan: SyntheticNcPlan,
): Promise<Classification> {
  const pending: Classification = {
    defectCategories: [],
    nonconformances: [],
    abnormalCases: [],
    actions: [],
    verifications: [],
    dispositions: [],
  };
  const conflicts: string[] = [];
  const classify = async <T extends { id: string }>(
    planned: T[],
    load: (rows: T[]) => Promise<Array<T & Record<string, unknown>>>,
    publicIdentity: (row: T) => string,
    normalizePlanned: (row: T) => unknown,
    normalizeExisting: (row: T & Record<string, unknown>) => unknown,
    target: T[],
  ) => {
    for (const batch of chunks(planned)) {
      const existing = await load(batch);
      const byId = new Map(existing.map((row) => [row.id, row]));
      const byPublic = new Map(
        existing.map((row) => [publicIdentity(row), row]),
      );
      for (const row of batch) {
        const id = byId.get(row.id);
        const identity = byPublic.get(publicIdentity(row));
        if (!id && !identity) target.push(row);
        else if (
          !id ||
          !identity ||
          id.id !== identity.id ||
          !match(normalizePlanned(row), normalizeExisting(id))
        )
          conflicts.push(publicIdentity(row));
      }
    }
  };

  await classify(
    plan.defectCategories,
    (rows) =>
      tx.defectCategory.findMany({
        where: {
          OR: [
            { id: { in: rows.map((row) => row.id) } },
            { code: { in: rows.map((row) => row.code) } },
          ],
        },
      }) as never,
    (row) => row.code,
    datedUpdated,
    datedUpdated,
    pending.defectCategories,
  );
  await classify(
    plan.nonconformances,
    (rows) =>
      tx.nonconformance.findMany({
        where: {
          OR: [
            { id: { in: rows.map((row) => row.id) } },
            { code: { in: rows.map((row) => row.code) } },
          ],
        },
      }) as never,
    (row) => row.code,
    ncValue,
    ncValue,
    pending.nonconformances,
  );
  await classify(
    plan.abnormalCases,
    (rows) =>
      tx.abnormalCase.findMany({
        where: {
          OR: [
            { id: { in: rows.map((row) => row.id) } },
            { code: { in: rows.map((row) => row.code) } },
          ],
        },
      }) as never,
    (row) => row.code,
    abnormalValue,
    abnormalValue,
    pending.abnormalCases,
  );
  for (const [planned, load, normalize, target] of [
    [
      plan.actions,
      (rows: ActionRecord[]) =>
        tx.actionHistory.findMany({
          where: { id: { in: rows.map((row) => row.id) } },
        }),
      actionValue,
      pending.actions,
    ],
    [
      plan.verifications,
      (rows: VerificationRecord[]) =>
        tx.verification.findMany({
          where: { id: { in: rows.map((row) => row.id) } },
        }),
      verificationValue,
      pending.verifications,
    ],
    [
      plan.dispositions,
      (rows: DispositionRecord[]) =>
        tx.dispositionHistory.findMany({
          where: { id: { in: rows.map((row) => row.id) } },
        }),
      dispositionValue,
      pending.dispositions,
    ],
  ] as const) {
    await classify(
      planned as never[],
      load as never,
      (row: { id: string }) => row.id,
      normalize as never,
      normalize as never,
      target as never[],
    );
  }
  if (conflicts.length > 0)
    throw new SyntheticOwnershipConflictError(conflicts);
  return pending;
}

export async function persistSyntheticNc(
  databaseUrl: string | undefined,
  input: SyntheticGeneratorConfigInput,
) {
  const plan = planSyntheticNc(input);
  await persistSyntheticQuality(databaseUrl, input);
  return withGuardedClient(databaseUrl, (client) =>
    client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${advisoryKey(plan.planFingerprint)})`;
      const pending = await classifyNc(tx, plan);
      for (const batch of chunks(pending.defectCategories))
        await tx.defectCategory.createMany({ data: batch });
      for (const batch of chunks(pending.nonconformances))
        await tx.nonconformance.createMany({ data: batch });
      for (const batch of chunks(pending.abnormalCases))
        await tx.abnormalCase.createMany({ data: batch });
      for (const batch of chunks(pending.actions))
        await tx.actionHistory.createMany({ data: batch });
      for (const batch of chunks(pending.verifications))
        await tx.verification.createMany({ data: batch });
      for (const batch of chunks(pending.dispositions))
        await tx.dispositionHistory.createMany({ data: batch });
      const created = Object.fromEntries(
        Object.entries(pending).map(([key, rows]) => [key, rows.length]),
      );
      const reused = Object.fromEntries(
        Object.entries(plan)
          .filter(([key]) => key in pending)
          .map(([key, rows]) => [
            key,
            (rows as unknown[]).length -
              pending[key as keyof Classification].length,
          ]),
      );
      return { planFingerprint: plan.planFingerprint, created, reused };
    }, transactionOptions(plan)),
  );
}

export async function cleanupSyntheticNc(
  databaseUrl: string | undefined,
  input: SyntheticGeneratorConfigInput,
  confirmation: { operation: 'CLEANUP'; planFingerprint: string },
) {
  const plan = planSyntheticNc(input);
  if (
    confirmation.operation !== 'CLEANUP' ||
    confirmation.planFingerprint !== plan.planFingerprint
  )
    throw new SyntheticCleanupRefusedError('PLAN_CONFIRMATION_MISMATCH');
  const deletedNc = await withGuardedClient(databaseUrl, (client) =>
    client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${advisoryKey(plan.planFingerprint)})`;
      const pending = await classifyNc(tx, plan);
      if (Object.values(pending).some((rows) => rows.length > 0))
        throw new SyntheticCleanupRefusedError('PLAN_IS_NOT_FULLY_PERSISTED');
      const ncs = await tx.nonconformance.findMany({
        where: { id: { in: plan.nonconformances.map((row) => row.id) } },
        select: {
          id: true,
          _count: {
            select: {
              abnormalCases: true,
              actions: true,
              verifications: true,
              dispositions: true,
            },
          },
        },
      });
      const ambiguous =
        ncs.length !== plan.nonconformances.length ||
        ncs.some(
          (row) =>
            row._count.abnormalCases !==
              plan.abnormalCases.filter(
                (item) => item.nonconformanceId === row.id,
              ).length ||
            row._count.actions !==
              plan.actions.filter((item) => item.nonconformanceId === row.id)
                .length ||
            row._count.verifications !==
              plan.verifications.filter(
                (item) => item.nonconformanceId === row.id,
              ).length ||
            row._count.dispositions !==
              plan.dispositions.filter(
                (item) => item.nonconformanceId === row.id,
              ).length,
        );
      const categories = await tx.defectCategory.findMany({
        where: { id: { in: plan.defectCategories.map((row) => row.id) } },
        select: { id: true, _count: { select: { nonconformances: true } } },
      });
      if (
        ambiguous ||
        categories.length !== plan.defectCategories.length ||
        categories.some(
          (row) =>
            row._count.nonconformances !==
            plan.nonconformances.filter(
              (item) => item.defectCategoryId === row.id,
            ).length,
        )
      )
        throw new SyntheticCleanupRefusedError('DEPENDENT_OR_UNOWNED_RECORDS');
      const deleted = {
        dispositions: (
          await tx.dispositionHistory.deleteMany({
            where: { id: { in: plan.dispositions.map((row) => row.id) } },
          })
        ).count,
        verifications: (
          await tx.verification.deleteMany({
            where: { id: { in: plan.verifications.map((row) => row.id) } },
          })
        ).count,
        actions: (
          await tx.actionHistory.deleteMany({
            where: { id: { in: plan.actions.map((row) => row.id) } },
          })
        ).count,
        abnormalCases: (
          await tx.abnormalCase.deleteMany({
            where: { id: { in: plan.abnormalCases.map((row) => row.id) } },
          })
        ).count,
        nonconformances: (
          await tx.nonconformance.deleteMany({
            where: { id: { in: plan.nonconformances.map((row) => row.id) } },
          })
        ).count,
        defectCategories: (
          await tx.defectCategory.deleteMany({
            where: {
              id: { in: plan.defectCategories.map((row) => row.id) },
            },
          })
        ).count,
      };
      return deleted;
    }, transactionOptions(plan)),
  );
  const deletedQuality = await cleanupSyntheticQuality(databaseUrl, input, {
    operation: 'CLEANUP',
    planFingerprint: plan.quality.planFingerprint,
  });
  return { deleted: { ...deletedQuality.deleted, ...deletedNc } };
}
