import { PrismaClient, type Prisma } from '../src/generated/prisma/client.js';
import { createPrismaPgAdapter } from '../src/prisma/prisma-pg.js';
import {
  INSPECTION_OPERATION,
  INSPECTION_OPERATION_VERSION,
  INSPECTION_RESPONSE_CONTRACT_VERSION,
  evaluateInspection,
  inspectionRequestFingerprint,
  parseInspectionRequest,
  type InspectionEvidence,
  type InspectionOutcome,
} from '../src/quality/inspection-entry.js';
import {
  assertSyntheticGeneratorMutationTarget,
  syntheticEntityId,
  syntheticOwnershipFingerprint,
  syntheticScenarioFor,
  syntheticTimestamp,
  type SyntheticGeneratorConfigInput,
} from './synthetic-generator-contract.js';
import {
  cleanupSyntheticSubset,
  persistSyntheticSubset,
  planSyntheticPersistenceSubset,
  SyntheticCleanupRefusedError,
  SyntheticOwnershipConflictError,
  type SyntheticPersistenceSubsetPlan,
} from './synthetic-generator-persistence.js';

const QUALITY_BATCH_SIZE = 100;
const RESULT_TYPES = [
  'NUMERIC',
  'BOOLEAN',
  'CATEGORICAL',
  'VISUAL',
  'TEXT',
] as const;
type ResultType = (typeof RESULT_TYPES)[number];

type QualityUserRecord = {
  id: string;
  username: string;
  passwordHash: string;
  role: 'QUALITY';
  isActive: false;
  createdAt: Date;
  updatedAt: Date;
};

type SpecificationRecord = {
  id: string;
  code: string;
  version: 1;
  name: string;
  description: string;
  resultType: ResultType;
  targetUnitType: 'PACK';
  processDefinitionId: string;
  processRouteStepId: null;
  lowerBound: string | null;
  upperBound: string | null;
  unitCode: string | null;
  expectedBooleanValue: boolean | null;
  lifecycle: 'PUBLISHED';
  createdAt: Date;
  updatedAt: Date;
};

type OptionRecord = {
  id: string;
  specificationId: string;
  resultType: 'CATEGORICAL' | 'VISUAL';
  code: string;
  description: string;
  isAcceptable: boolean;
  createdAt: Date;
};

type InspectionRecord = {
  id: string;
  traceableUnitId: string;
  specificationId: string;
  processDefinitionId: string;
  processExecutionId: string | null;
  inspectorUserId: string;
  resultType: ResultType;
  targetUnitType: 'PACK';
  attemptNumber: number;
  outcome: InspectionOutcome;
  inspectedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

type ResultRecord = {
  id: string;
  inspectionId: string;
  specificationId: string;
  resultType: ResultType;
  numericValue: string | null;
  booleanValue: boolean | null;
  optionId: string | null;
  textValue: string | null;
  createdAt: Date;
};

type SubmissionRecord = {
  id: string;
  userId: string;
  operation: string;
  operationVersion: number;
  idempotencyKey: string;
  requestFingerprint: string;
  inspectionId: string;
  responseContractVersion: number;
  responseStatus: number;
  createdAt: Date;
  updatedAt: Date;
};

export type SyntheticQualityPlan = {
  planFingerprint: string;
  base: SyntheticPersistenceSubsetPlan;
  actor: QualityUserRecord;
  specifications: SpecificationRecord[];
  options: OptionRecord[];
  inspections: InspectionRecord[];
  results: ResultRecord[];
  submissions: SubmissionRecord[];
  distribution: {
    pass: number;
    ng: number;
    byType: Record<ResultType, number>;
    withExecution: number;
    withoutExecution: number;
  };
};

function chunks<T>(items: T[]): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += QUALITY_BATCH_SIZE) {
    batches.push(items.slice(index, index + QUALITY_BATCH_SIZE));
  }
  return batches;
}

function dated<T extends { createdAt: Date; updatedAt: Date }>(row: T) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function specificationValue(row: SpecificationRecord) {
  return dated(row);
}

function optionValue(row: OptionRecord) {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

function inspectionValue(row: InspectionRecord) {
  return { ...dated(row), inspectedAt: row.inspectedAt.toISOString() };
}

function resultValue(row: ResultRecord) {
  const numericValue = row.numericValue
    ? `${row.numericValue.split('.')[0]}.${(row.numericValue.split('.')[1] ?? '').padEnd(6, '0')}`
    : null;
  return { ...row, numericValue, createdAt: row.createdAt.toISOString() };
}

function valuesMatch(planned: unknown, existing: unknown): boolean {
  return (
    syntheticOwnershipFingerprint(planned) ===
    syntheticOwnershipFingerprint(existing)
  );
}

function evaluationFor(
  type: ResultType,
  evidence: InspectionEvidence,
): Parameters<typeof evaluateInspection>[1] {
  if (type === 'NUMERIC') {
    return { type, lowerBound: '10', upperBound: '20' };
  }
  if (type === 'BOOLEAN') return { type, expectedValue: true };
  if (type === 'TEXT') return { type };
  return {
    type,
    isAcceptable:
      evidence.type === type && evidence.optionCode.endsWith('-ACCEPT'),
  };
}

function evidenceFor(
  namespace: string,
  type: ResultType,
  passing: boolean,
  packOrdinal: number,
): InspectionEvidence {
  switch (type) {
    case 'NUMERIC':
      return { type, value: passing ? '15.25' : '25.25' };
    case 'BOOLEAN':
      return { type, value: passing };
    case 'CATEGORICAL':
    case 'VISUAL':
      return {
        type,
        optionCode: `${namespace}-${type}-${passing ? 'ACCEPT' : 'REJECT'}`,
      };
    case 'TEXT':
      return {
        type,
        value: `Synthetic observation for pack ${String(packOrdinal).padStart(4, '0')}.`,
        outcome: passing ? 'PASS' : 'NG',
      };
  }
}

function resultFor(
  base: SyntheticPersistenceSubsetPlan,
  evidence: InspectionEvidence,
  inspectionId: string,
  specificationId: string,
  ordinal: number,
  optionByCode: Map<string, OptionRecord>,
  createdAt: Date,
): ResultRecord {
  return {
    id: syntheticEntityId(base.config, 'inspection-result', ordinal),
    inspectionId,
    specificationId,
    resultType: evidence.type,
    numericValue: evidence.type === 'NUMERIC' ? evidence.value : null,
    booleanValue: evidence.type === 'BOOLEAN' ? evidence.value : null,
    optionId:
      evidence.type === 'CATEGORICAL' || evidence.type === 'VISUAL'
        ? (optionByCode.get(evidence.optionCode)?.id ?? null)
        : null,
    textValue: evidence.type === 'TEXT' ? evidence.value : null,
    createdAt,
  };
}

export function planSyntheticQuality(
  input: SyntheticGeneratorConfigInput,
): SyntheticQualityPlan {
  const base = planSyntheticPersistenceSubset(input);
  const namespace = base.config.resolvedNamespace;
  const verifyDefinition = base.processDefinitions[2];
  const actorTimestamp = new Date(syntheticTimestamp(base.config, 4_000_000));
  const actor: QualityUserRecord = {
    id: syntheticEntityId(base.config, 'quality-generator-actor', 1),
    username: `${namespace.toLowerCase()}_quality_history`,
    passwordHash: 'SYNTHETIC_DISABLED_ACCOUNT_NO_LOGIN',
    role: 'QUALITY',
    isActive: false,
    createdAt: actorTimestamp,
    updatedAt: actorTimestamp,
  };
  const specifications = RESULT_TYPES.map((resultType, index) => {
    const timestamp = new Date(
      syntheticTimestamp(base.config, 4_000_010 + index),
    );
    return {
      id: syntheticEntityId(base.config, 'inspection-specification', index + 1),
      code: `${namespace}-SPEC-${resultType}`,
      version: 1 as const,
      name: `Synthetic ${resultType.toLowerCase()} inspection`,
      description: `Fictional generator-owned ${resultType.toLowerCase()} quality criterion.`,
      resultType,
      targetUnitType: 'PACK' as const,
      processDefinitionId: verifyDefinition.id,
      processRouteStepId: null,
      lowerBound: resultType === 'NUMERIC' ? '10.000000' : null,
      upperBound: resultType === 'NUMERIC' ? '20.000000' : null,
      unitCode: resultType === 'NUMERIC' ? 'SYN_UNIT' : null,
      expectedBooleanValue: resultType === 'BOOLEAN' ? true : null,
      lifecycle: 'PUBLISHED' as const,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });
  const specByType = new Map(
    specifications.map((row) => [row.resultType, row]),
  );
  const options: OptionRecord[] = [];
  for (const type of ['CATEGORICAL', 'VISUAL'] as const) {
    for (const [offset, acceptable] of [true, false].entries()) {
      const timestamp = new Date(
        syntheticTimestamp(base.config, 4_000_020 + options.length),
      );
      options.push({
        id: syntheticEntityId(
          base.config,
          'inspection-option',
          options.length + 1,
        ),
        specificationId: specByType.get(type)!.id,
        resultType: type,
        code: `${namespace}-${type}-${acceptable ? 'ACCEPT' : 'REJECT'}`,
        description: `Fictional ${acceptable ? 'acceptable' : 'not acceptable'} ${type.toLowerCase()} option.`,
        isAcceptable: acceptable,
        createdAt: timestamp,
      });
      void offset;
    }
  }
  const optionByCode = new Map(options.map((row) => [row.code, row]));
  const inspections: InspectionRecord[] = [];
  const results: ResultRecord[] = [];
  const submissions: SubmissionRecord[] = [];
  const byType = Object.fromEntries(
    RESULT_TYPES.map((type) => [type, 0]),
  ) as Record<ResultType, number>;
  let pass = 0;
  let ng = 0;
  let withExecution = 0;
  let withoutExecution = 0;

  const addInspection = (
    pack: SyntheticPersistenceSubsetPlan['units']['packs'][number],
    packOrdinal: number,
    type: ResultType,
    attemptNumber: number,
    passing: boolean,
  ) => {
    const ordinal = inspections.length + 1;
    const specification = specByType.get(type)!;
    const evidence = evidenceFor(namespace, type, passing, packOrdinal);
    const outcome = evaluateInspection(evidence, evaluationFor(type, evidence));
    const processExecution = base.processExecutions.find(
      (execution) =>
        execution.traceableUnitId === pack.id &&
        execution.processDefinitionId === verifyDefinition.id &&
        execution.attemptNumber === attemptNumber,
    );
    const linkExecution =
      attemptNumber > 1 || (packOrdinal + RESULT_TYPES.indexOf(type)) % 2 === 0;
    const inspectedAt = new Date(
      syntheticTimestamp(base.config, 4_100_000 + ordinal * 10),
    );
    const inspectionId = syntheticEntityId(base.config, 'inspection', ordinal);
    const execution = linkExecution ? processExecution : undefined;
    const inspection: InspectionRecord = {
      id: inspectionId,
      traceableUnitId: pack.id,
      specificationId: specification.id,
      processDefinitionId: verifyDefinition.id,
      processExecutionId: execution?.id ?? null,
      inspectorUserId: actor.id,
      resultType: type,
      targetUnitType: 'PACK',
      attemptNumber,
      outcome,
      inspectedAt,
      createdAt: inspectedAt,
      updatedAt: inspectedAt,
    };
    if (outcome !== (passing ? 'PASS' : 'NG')) {
      throw new Error('Synthetic inspection evaluation mismatch.');
    }
    const request = parseInspectionRequest({
      traceCode: pack.traceCode,
      specification: { code: specification.code, version: 1 },
      execution: execution
        ? { processCode: verifyDefinition.code, attempt: attemptNumber }
        : null,
      inspectedAt: inspectedAt.toISOString(),
      evidence,
    });
    const result = resultFor(
      base,
      evidence,
      inspectionId,
      specification.id,
      ordinal,
      optionByCode,
      inspectedAt,
    );
    if (
      (type === 'CATEGORICAL' || type === 'VISUAL') &&
      result.optionId === null
    ) {
      throw new Error('Synthetic inspection option planning mismatch.');
    }
    inspections.push(inspection);
    results.push(result);
    submissions.push({
      id: syntheticEntityId(base.config, 'inspection-submission', ordinal),
      userId: actor.id,
      operation: INSPECTION_OPERATION,
      operationVersion: INSPECTION_OPERATION_VERSION,
      idempotencyKey: `${namespace}:inspection:${String(ordinal).padStart(6, '0')}`,
      requestFingerprint: inspectionRequestFingerprint(request),
      inspectionId,
      responseContractVersion: INSPECTION_RESPONSE_CONTRACT_VERSION,
      responseStatus: 201,
      createdAt: inspectedAt,
      updatedAt: inspectedAt,
    });
    byType[type] += 1;
    if (outcome === 'PASS') pass += 1;
    else ng += 1;
    if (execution) withExecution += 1;
    else withoutExecution += 1;
  };

  for (const [packIndex, pack] of base.units.packs.entries()) {
    const packOrdinal = packIndex + 1;
    const scenario = syntheticScenarioFor(base.config, packOrdinal);
    const ngType = RESULT_TYPES[packIndex % RESULT_TYPES.length];
    for (const type of RESULT_TYPES) {
      addInspection(
        pack,
        packOrdinal,
        type,
        1,
        scenario === 'CLEAN_PASS' || type !== ngType,
      );
    }
    if (scenario !== 'CLEAN_PASS') {
      addInspection(pack, packOrdinal, ngType, 2, true);
    }
  }
  if (
    inspections.length !==
    base.config.packCount * RESULT_TYPES.length +
      base.units.packs.filter(
        (_, index) =>
          syntheticScenarioFor(base.config, index + 1) !== 'CLEAN_PASS',
      ).length
  ) {
    throw new Error('Synthetic inspection planning count mismatch.');
  }
  const planFingerprint = syntheticOwnershipFingerprint({
    purpose: 'phase5g-quality-history-plan-v1',
    basePlanFingerprint: base.planFingerprint,
    actor: dated(actor),
    specifications: specifications.map(specificationValue),
    options: options.map(optionValue),
    inspections: inspections.map(inspectionValue),
    results: results.map(resultValue),
    submissions: submissions.map(dated),
  });
  return {
    planFingerprint,
    base,
    actor,
    specifications,
    options,
    inspections,
    results,
    submissions,
    distribution: { pass, ng, byType, withExecution, withoutExecution },
  };
}

function advisoryKey(fingerprint: string): bigint {
  const unsigned = BigInt(`0x${fingerprint.slice(0, 16)}`);
  return unsigned >= 2n ** 63n ? unsigned - 2n ** 64n : unsigned;
}

function transactionOptions(plan: SyntheticQualityPlan) {
  return {
    maxWait: 10_000,
    timeout: plan.base.config.profile === 'MEDIUM' ? 900_000 : 30_000,
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
  createActor: boolean;
  specifications: SpecificationRecord[];
  options: OptionRecord[];
  inspections: InspectionRecord[];
  results: ResultRecord[];
  submissions: SubmissionRecord[];
};

async function classifyQuality(
  tx: Prisma.TransactionClient,
  plan: SyntheticQualityPlan,
): Promise<Classification> {
  const conflicts: string[] = [];
  const actorMatches = await tx.user.findMany({
    where: { OR: [{ id: plan.actor.id }, { username: plan.actor.username }] },
  });
  const actor = actorMatches[0];
  if (
    actorMatches.length > 1 ||
    (actor && !valuesMatch(dated(plan.actor), dated(actor)))
  ) {
    conflicts.push(plan.actor.username);
  }
  const pending: Classification = {
    createActor: actor === undefined,
    specifications: [],
    options: [],
    inspections: [],
    results: [],
    submissions: [],
  };

  const specs = await tx.inspectionSpecification.findMany({
    where: {
      OR: [
        { id: { in: plan.specifications.map((row) => row.id) } },
        ...plan.specifications.map((row) => ({
          code: row.code,
          version: row.version,
        })),
      ],
    },
  });
  const specById = new Map(specs.map((row) => [row.id, row]));
  const specByIdentity = new Map(
    specs.map((row) => [`${row.code}:${row.version}`, row]),
  );
  for (const planned of plan.specifications) {
    const id = specById.get(planned.id);
    const identity = specByIdentity.get(`${planned.code}:${planned.version}`);
    if (!id && !identity) pending.specifications.push(planned);
    else if (
      !id ||
      !identity ||
      id.id !== identity.id ||
      !valuesMatch(specificationValue(planned), {
        ...dated(id),
        lowerBound: id.lowerBound?.toFixed(6) ?? null,
        upperBound: id.upperBound?.toFixed(6) ?? null,
      })
    )
      conflicts.push(planned.code);
  }

  const options = await tx.inspectionSpecificationOption.findMany({
    where: {
      OR: [
        { id: { in: plan.options.map((row) => row.id) } },
        ...plan.options.map((row) => ({
          specificationId: row.specificationId,
          code: row.code,
        })),
      ],
    },
  });
  const optionById = new Map(options.map((row) => [row.id, row]));
  const optionByIdentity = new Map(
    options.map((row) => [`${row.specificationId}:${row.code}`, row]),
  );
  for (const planned of plan.options) {
    const id = optionById.get(planned.id);
    const identity = optionByIdentity.get(
      `${planned.specificationId}:${planned.code}`,
    );
    if (!id && !identity) pending.options.push(planned);
    else if (
      !id ||
      !identity ||
      id.id !== identity.id ||
      !valuesMatch(optionValue(planned), {
        ...id,
        createdAt: id.createdAt.toISOString(),
      })
    )
      conflicts.push(planned.code);
  }

  for (const batch of chunks(plan.inspections)) {
    const rows = await tx.inspection.findMany({
      where: {
        OR: [
          { id: { in: batch.map((row) => row.id) } },
          ...batch.map((row) => ({
            traceableUnitId: row.traceableUnitId,
            specificationId: row.specificationId,
            attemptNumber: row.attemptNumber,
          })),
        ],
      },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const byAttempt = new Map(
      rows.map((row) => [
        `${row.traceableUnitId}:${row.specificationId}:${row.attemptNumber}`,
        row,
      ]),
    );
    for (const planned of batch) {
      const id = byId.get(planned.id);
      const attempt = byAttempt.get(
        `${planned.traceableUnitId}:${planned.specificationId}:${planned.attemptNumber}`,
      );
      if (!id && !attempt) pending.inspections.push(planned);
      else if (
        !id ||
        !attempt ||
        id.id !== attempt.id ||
        !valuesMatch(inspectionValue(planned), {
          ...dated(id),
          inspectedAt: id.inspectedAt.toISOString(),
        })
      )
        conflicts.push(planned.id);
    }
  }

  for (const [kind, plannedRows, load, normalize] of [
    [
      'result',
      plan.results,
      (batch: ResultRecord[]) =>
        tx.inspectionResult.findMany({
          where: {
            OR: [
              { id: { in: batch.map((row) => row.id) } },
              { inspectionId: { in: batch.map((row) => row.inspectionId) } },
            ],
          },
        }),
      (
        row: Awaited<ReturnType<typeof tx.inspectionResult.findMany>>[number],
      ) => ({
        ...row,
        numericValue: row.numericValue?.toFixed(6) ?? null,
        createdAt: row.createdAt.toISOString(),
      }),
    ],
    [
      'submission',
      plan.submissions,
      (batch: SubmissionRecord[]) =>
        tx.inspectionSubmission.findMany({
          where: {
            OR: [
              { id: { in: batch.map((row) => row.id) } },
              { inspectionId: { in: batch.map((row) => row.inspectionId) } },
            ],
          },
        }),
      (
        row: Awaited<
          ReturnType<typeof tx.inspectionSubmission.findMany>
        >[number],
      ) => dated(row),
    ],
  ] as const) {
    for (const batch of chunks(plannedRows as never[])) {
      const rows = await load(batch as never);
      const byId = new Map(rows.map((row) => [row.id, row]));
      const byInspection = new Map(rows.map((row) => [row.inspectionId, row]));
      for (const planned of batch as Array<ResultRecord | SubmissionRecord>) {
        const id = byId.get(planned.id);
        const inspection = byInspection.get(planned.inspectionId);
        if (!id && !inspection)
          pending[kind === 'result' ? 'results' : 'submissions'].push(
            planned as never,
          );
        else if (
          !id ||
          !inspection ||
          id.id !== inspection.id ||
          !valuesMatch(
            kind === 'result'
              ? resultValue(planned as ResultRecord)
              : dated(planned as SubmissionRecord),
            normalize(id as never),
          )
        )
          conflicts.push(planned.id);
      }
    }
  }
  if (conflicts.length > 0)
    throw new SyntheticOwnershipConflictError(conflicts);
  return pending;
}

export async function persistSyntheticQuality(
  databaseUrl: string | undefined,
  input: SyntheticGeneratorConfigInput,
) {
  const plan = planSyntheticQuality(input);
  await persistSyntheticSubset(databaseUrl, input);
  return withGuardedClient(databaseUrl, (client) =>
    client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${advisoryKey(plan.planFingerprint)})`;
      const pending = await classifyQuality(tx, plan);
      if (pending.createActor) await tx.user.create({ data: plan.actor });
      for (const batch of chunks(pending.specifications))
        await tx.inspectionSpecification.createMany({ data: batch });
      for (const batch of chunks(pending.options))
        await tx.inspectionSpecificationOption.createMany({ data: batch });
      for (const batch of chunks(pending.inspections))
        await tx.inspection.createMany({ data: batch });
      for (const batch of chunks(pending.results))
        await tx.inspectionResult.createMany({ data: batch });
      for (const batch of chunks(pending.submissions))
        await tx.inspectionSubmission.createMany({ data: batch });
      return {
        planFingerprint: plan.planFingerprint,
        created: {
          users: pending.createActor ? 1 : 0,
          specifications: pending.specifications.length,
          options: pending.options.length,
          inspections: pending.inspections.length,
          results: pending.results.length,
          submissions: pending.submissions.length,
        },
        reused: {
          users: pending.createActor ? 0 : 1,
          specifications:
            plan.specifications.length - pending.specifications.length,
          options: plan.options.length - pending.options.length,
          inspections: plan.inspections.length - pending.inspections.length,
          results: plan.results.length - pending.results.length,
          submissions: plan.submissions.length - pending.submissions.length,
        },
      };
    }, transactionOptions(plan)),
  );
}

export async function cleanupSyntheticQuality(
  databaseUrl: string | undefined,
  input: SyntheticGeneratorConfigInput,
  confirmation: { operation: 'CLEANUP'; planFingerprint: string },
) {
  const plan = planSyntheticQuality(input);
  if (
    confirmation.operation !== 'CLEANUP' ||
    confirmation.planFingerprint !== plan.planFingerprint
  ) {
    throw new SyntheticCleanupRefusedError('PLAN_CONFIRMATION_MISMATCH');
  }
  const deletedQuality = await withGuardedClient(databaseUrl, (client) =>
    client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${advisoryKey(plan.planFingerprint)})`;
      const pending = await classifyQuality(tx, plan);
      if (
        pending.createActor ||
        pending.specifications.length ||
        pending.options.length ||
        pending.inspections.length ||
        pending.results.length ||
        pending.submissions.length
      ) {
        throw new SyntheticCleanupRefusedError('PLAN_IS_NOT_FULLY_PERSISTED');
      }
      const inspections = await tx.inspection.findMany({
        where: { id: { in: plan.inspections.map((row) => row.id) } },
        select: {
          id: true,
          _count: {
            select: {
              sourceNonconformances: true,
              actionResults: true,
              verifications: true,
            },
          },
        },
      });
      const actor = await tx.user.findUniqueOrThrow({
        where: { id: plan.actor.id },
        select: {
          _count: {
            select: {
              sessions: true,
              recordedInspections: true,
              inspectionSubmissions: true,
            },
          },
        },
      });
      const specificationCounts = await tx.inspectionSpecification.findMany({
        where: { id: { in: plan.specifications.map((row) => row.id) } },
        select: {
          id: true,
          _count: { select: { options: true, inspections: true } },
        },
      });
      if (
        inspections.length !== plan.inspections.length ||
        inspections.some(
          (row) =>
            row._count.sourceNonconformances ||
            row._count.actionResults ||
            row._count.verifications,
        ) ||
        actor._count.sessions !== 0 ||
        actor._count.recordedInspections !== plan.inspections.length ||
        actor._count.inspectionSubmissions !== plan.submissions.length ||
        specificationCounts.length !== plan.specifications.length ||
        specificationCounts.some(
          (row) =>
            row._count.inspections !==
              plan.inspections.filter(
                (inspection) => inspection.specificationId === row.id,
              ).length ||
            row._count.options !==
              plan.options.filter((option) => option.specificationId === row.id)
                .length,
        )
      )
        throw new SyntheticCleanupRefusedError('DEPENDENT_OR_UNOWNED_RECORDS');
      const deleted = {
        submissions: 0,
        results: 0,
        inspections: 0,
        options: 0,
        specifications: 0,
        users: 0,
      };
      for (const batch of chunks(plan.submissions))
        deleted.submissions += (
          await tx.inspectionSubmission.deleteMany({
            where: { id: { in: batch.map((row) => row.id) } },
          })
        ).count;
      for (const batch of chunks(plan.results))
        deleted.results += (
          await tx.inspectionResult.deleteMany({
            where: { id: { in: batch.map((row) => row.id) } },
          })
        ).count;
      for (const batch of chunks(plan.inspections))
        deleted.inspections += (
          await tx.inspection.deleteMany({
            where: { id: { in: batch.map((row) => row.id) } },
          })
        ).count;
      deleted.options = (
        await tx.inspectionSpecificationOption.deleteMany({
          where: { id: { in: plan.options.map((row) => row.id) } },
        })
      ).count;
      deleted.specifications = (
        await tx.inspectionSpecification.deleteMany({
          where: { id: { in: plan.specifications.map((row) => row.id) } },
        })
      ).count;
      deleted.users = (
        await tx.user.deleteMany({ where: { id: plan.actor.id } })
      ).count;
      return deleted;
    }, transactionOptions(plan)),
  );
  const deletedBase = await cleanupSyntheticSubset(databaseUrl, input, {
    operation: 'CLEANUP',
    planFingerprint: plan.base.planFingerprint,
  });
  return { deleted: { ...deletedBase.deleted, ...deletedQuality } };
}
