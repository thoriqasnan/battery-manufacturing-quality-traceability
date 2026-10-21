import {
  InspectionSpecificationLifecycle,
  UserRole,
} from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';

const TEST_USERNAME_PREFIX = 'phase5b2.persistence.';
const TEST_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=1$c3ludGhldGljLXRlc3Qtc2FsdA$ZmFicmljYXRlZC10ZXN0LWhhc2gtbm90LWEtY3JlZGVudGlhbA';
const TEST_ATTEMPT_MINIMUM = 90_000;
const TEST_INSPECTION_IDS = Array.from(
  { length: 12 },
  (_, index) =>
    `5b200001-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
);

describe('Phase 5B-2 quality persistence', () => {
  const prisma = new PrismaService();
  let nextAttempt = TEST_ATTEMPT_MINIMUM;
  let nextInspectionId = 0;

  async function cleanup(): Promise<void> {
    await prisma.client.inspectionSubmission.deleteMany({
      where: { inspectionId: { in: TEST_INSPECTION_IDS } },
    });
    await prisma.client.inspection.deleteMany({
      where: { id: { in: TEST_INSPECTION_IDS } },
    });
    await prisma.client.user.deleteMany({
      where: { username: { startsWith: TEST_USERNAME_PREFIX } },
    });
  }

  async function createUser(suffix: string, role = UserRole.QUALITY) {
    return prisma.client.user.create({
      data: {
        username: `${TEST_USERNAME_PREFIX}${suffix}`,
        passwordHash: TEST_PASSWORD_HASH,
        role,
      },
    });
  }

  async function createInspection(inspectorUserId: string | null = null) {
    const reference = await prisma.client.inspection.findFirstOrThrow({
      orderBy: { id: 'asc' },
      select: {
        traceableUnitId: true,
        specificationId: true,
        processDefinitionId: true,
        resultType: true,
        targetUnitType: true,
      },
    });
    nextAttempt += 1;
    const id = TEST_INSPECTION_IDS[nextInspectionId];
    nextInspectionId += 1;
    if (!id) throw new Error('Phase 5B-2 test inspection IDs exhausted.');
    return prisma.client.inspection.create({
      data: {
        id,
        ...reference,
        processExecutionId: null,
        inspectorUserId,
        attemptNumber: nextAttempt,
        outcome: 'PASS',
        inspectedAt: new Date('2026-02-01T00:00:00.000Z'),
      },
    });
  }

  beforeEach(async () => {
    await cleanup();
    nextInspectionId = 0;
  });
  afterAll(async () => {
    await cleanup();
    await prisma.onModuleDestroy();
  });

  it('backfills reference specifications as published and removes isActive', async () => {
    const specifications = await prisma.client.inspectionSpecification.findMany(
      {
        select: { lifecycle: true },
      },
    );
    expect(specifications).toHaveLength(5);
    expect(
      specifications.every(
        ({ lifecycle }) =>
          lifecycle === InspectionSpecificationLifecycle.PUBLISHED,
      ),
    ).toBe(true);

    const enumValues = await prisma.client.$queryRaw<
      Array<{ enumlabel: string }>
    >`
      SELECT enumlabel
      FROM pg_enum
      JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
      WHERE pg_type.typname = 'InspectionSpecificationLifecycle'
      ORDER BY enumsortorder`;
    expect(enumValues.map(({ enumlabel }) => enumlabel)).toEqual([
      'DRAFT',
      'PUBLISHED',
      'RETIRED',
    ]);

    const columns = await prisma.client.$queryRaw<
      Array<{ column_name: string; column_default: string | null }>
    >`
      SELECT column_name, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'InspectionSpecification'
        AND column_name IN ('isActive', 'lifecycle')
      ORDER BY column_name`;
    expect(columns).toEqual([
      {
        column_name: 'lifecycle',
        column_default: '\'DRAFT\'::"InspectionSpecificationLifecycle"',
      },
    ]);

    const attemptIndex = await prisma.client.$queryRaw<
      Array<{ indexname: string }>
    >`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'Inspection'
        AND indexname = 'Inspection_traceableUnitId_specificationId_attemptNumber_key'`;
    expect(attemptIndex).toHaveLength(1);
  });

  it('retains code/version uniqueness and positive version enforcement', async () => {
    const reference =
      await prisma.client.inspectionSpecification.findFirstOrThrow({
        orderBy: { id: 'asc' },
      });
    const {
      id: _id,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...configuration
    } = reference;

    await expect(
      prisma.client.inspectionSpecification.create({ data: configuration }),
    ).rejects.toMatchObject({ code: 'P2002' });

    await expect(
      prisma.client.inspectionSpecification.create({
        data: {
          ...configuration,
          code: 'PHASE5B2_INVALID_VERSION',
          version: 0,
          lifecycle: InspectionSpecificationLifecycle.DRAFT,
        },
      }),
    ).rejects.toThrow();
  });

  it('keeps legacy attribution nullable and restricts deletion of an inspector', async () => {
    const legacyCount = await prisma.client.inspection.count({
      where: { inspectorUserId: null },
    });
    expect(legacyCount).toBe(8);

    const user = await createUser('inspector');
    const inspection = await createInspection(user.id);
    await prisma.client.user.update({
      where: { id: user.id },
      data: { role: UserRole.ENGINEERING },
    });
    const persisted = await prisma.client.inspection.findUniqueOrThrow({
      where: { id: inspection.id },
      select: { inspectorUserId: true },
    });
    expect(persisted.inspectorUserId).toBe(user.id);

    await expect(
      prisma.client.user.delete({ where: { id: user.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('persists durable scoped idempotency and restrictive relationships', async () => {
    const [firstUser, secondUser] = await Promise.all([
      createUser('idempotency-a'),
      createUser('idempotency-b'),
    ]);
    const [first, duplicateScope, versionScope, userScope] = await Promise.all([
      createInspection(),
      createInspection(),
      createInspection(),
      createInspection(),
    ]);
    const base = {
      operation: 'inspection.submit',
      operationVersion: 1,
      idempotencyKey: 'phase5b2-key-0001',
      requestFingerprint: 'a'.repeat(64),
      responseContractVersion: 1,
      responseStatus: 201,
    } as const;

    const stored = await prisma.client.inspectionSubmission.create({
      data: { ...base, userId: firstUser.id, inspectionId: first.id },
    });
    expect(stored).toMatchObject(base);

    await expect(
      prisma.client.inspectionSubmission.create({
        data: {
          ...base,
          userId: firstUser.id,
          inspectionId: duplicateScope.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    await prisma.client.inspectionSubmission.create({
      data: {
        ...base,
        operationVersion: 2,
        userId: firstUser.id,
        inspectionId: versionScope.id,
      },
    });
    await prisma.client.inspectionSubmission.create({
      data: {
        ...base,
        userId: secondUser.id,
        inspectionId: userScope.id,
      },
    });

    await expect(
      prisma.client.user.delete({ where: { id: secondUser.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.client.inspection.delete({ where: { id: first.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('enforces fingerprint, key, version, and successful-status shapes', async () => {
    const user = await createUser('constraints');
    const invalidRows = [
      {
        idempotencyKey: 'too-short',
        requestFingerprint: 'a'.repeat(64),
        responseContractVersion: 1,
        responseStatus: 201,
      },
      {
        idempotencyKey: 'phase5b2-key-0002',
        requestFingerprint: 'NOT-A-SHA256',
        responseContractVersion: 1,
        responseStatus: 201,
      },
      {
        idempotencyKey: 'phase5b2-key-0003',
        requestFingerprint: 'b'.repeat(64),
        responseContractVersion: 0,
        responseStatus: 201,
      },
      {
        idempotencyKey: 'phase5b2-key-0004',
        requestFingerprint: 'c'.repeat(64),
        responseContractVersion: 1,
        responseStatus: 500,
      },
    ];

    for (const invalid of invalidRows) {
      const inspection = await createInspection();
      await expect(
        prisma.client.inspectionSubmission.create({
          data: {
            operation: 'inspection.submit',
            operationVersion: 1,
            userId: user.id,
            inspectionId: inspection.id,
            ...invalid,
          },
        }),
      ).rejects.toThrow();
    }
  });

  it('preserves the reference inspection/result evidence', async () => {
    const [inspections, results, attempts] = await Promise.all([
      prisma.client.inspection.count({
        where: { id: { notIn: TEST_INSPECTION_IDS } },
      }),
      prisma.client.inspectionResult.count(),
      prisma.client.inspection.findMany({
        where: {
          traceableUnit: { traceCode: 'PACK-DEMO-ALPHA-RETEST' },
          specification: { code: 'DEMO_NUMERIC_LEVEL', version: 1 },
        },
        orderBy: { attemptNumber: 'asc' },
        select: { attemptNumber: true, outcome: true },
      }),
    ]);
    expect(inspections).toBe(8);
    expect(results).toBe(8);
    expect(attempts).toEqual([
      { attemptNumber: 1, outcome: 'NG' },
      { attemptNumber: 2, outcome: 'PASS' },
    ]);
  });
});
