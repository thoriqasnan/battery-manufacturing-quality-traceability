import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { assertIsolatedTestDatabase } from '../scripts/test-database-identity.js';
import { AppModule } from '../src/app.module.js';
import { CSRF_HEADER_NAME } from '../src/auth/csrf.service.js';
import { PasswordHashService } from '../src/auth/password-hash.service.js';
import { UserRole } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { TraceabilityIntegrityService } from '../src/traceability/traceability-integrity.service.js';

const ORIGIN = 'http://localhost:3000';
const PREFIX = 'PHASE5F1B_';
const USER_PREFIX = 'phase5f1b.';
const PASSWORD = 'fictional-phase5f1b-passphrase';
const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

describe('Phase 5F-1B cross-layer history integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let quality: Awaited<ReturnType<typeof login>>;
  let production: Awaited<ReturnType<typeof login>>;
  let unitId: string;
  let specificationId: string;
  const originalEnvironment = process.env.NODE_ENV;
  const originalOrigin = process.env.FRONTEND_ORIGIN;
  const originalCsrfSecret = process.env.AUTH_CSRF_SECRET;

  async function cleanup(): Promise<void> {
    await prisma.client.inspectionSubmission.deleteMany({
      where: { user: { username: { startsWith: USER_PREFIX } } },
    });
    const specifications = await prisma.client.inspectionSpecification.findMany(
      {
        where: { code: { startsWith: PREFIX } },
        select: { id: true },
      },
    );
    const specificationIds = specifications.map(({ id }) => id);
    await prisma.client.inspectionResult.deleteMany({
      where: { specificationId: { in: specificationIds } },
    });
    await prisma.client.inspection.deleteMany({
      where: { specificationId: { in: specificationIds } },
    });
    await prisma.client.inspectionSpecificationOption.deleteMany({
      where: { specificationId: { in: specificationIds } },
    });
    await prisma.client.inspectionSpecification.deleteMany({
      where: { id: { in: specificationIds } },
    });
    await prisma.client.processExecution.deleteMany({
      where: { traceableUnit: { traceCode: { startsWith: PREFIX } } },
    });
    await prisma.client.traceableUnit.deleteMany({
      where: { traceCode: { startsWith: PREFIX } },
    });
    await prisma.client.session.deleteMany({
      where: { user: { username: { startsWith: USER_PREFIX } } },
    });
    await prisma.client.user.deleteMany({
      where: { username: { startsWith: USER_PREFIX } },
    });
  }

  beforeAll(async () => {
    // This is deliberately inside the test process and precedes Nest startup,
    // fixture cleanup, or any other database mutation.
    await assertIsolatedTestDatabase();

    process.env.NODE_ENV = 'test';
    process.env.FRONTEND_ORIGIN = ORIGIN;
    process.env.AUTH_CSRF_SECRET =
      'phase5f1b-test-only-csrf-secret-at-least-32-characters';
    const fixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = fixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    await cleanup();

    const [processDefinition, productModel] = await Promise.all([
      prisma.client.processDefinition.findUniqueOrThrow({
        where: { code: 'DEMO_VERIFY' },
      }),
      prisma.client.productModel.findUniqueOrThrow({
        where: { code: 'DEMO_ALPHA' },
      }),
    ]);
    const unit = await prisma.client.traceableUnit.create({
      data: {
        traceCode: `${PREFIX}PACK`,
        unitType: 'PACK',
        productModelId: productModel.id,
      },
    });
    unitId = unit.id;
    await prisma.client.processExecution.create({
      data: {
        traceableUnitId: unit.id,
        processDefinitionId: processDefinition.id,
        attemptNumber: 1,
        status: 'COMPLETED',
        executionMethod: 'AUTOMATED',
        startedAt: new Date('2026-10-09T05:00:00.000Z'),
        finishedAt: new Date('2026-10-09T05:10:00.000Z'),
      },
    });
    const specification = await prisma.client.inspectionSpecification.create({
      data: {
        code: `${PREFIX}NUMERIC_LEVEL`,
        version: 1,
        name: 'Phase 5F isolated numeric level',
        lifecycle: 'PUBLISHED',
        resultType: 'NUMERIC',
        targetUnitType: 'PACK',
        processDefinitionId: processDefinition.id,
        lowerBound: '10',
        upperBound: '20',
        unitCode: 'DEMO_UNIT',
      },
    });
    specificationId = specification.id;

    const passwordHash = await app
      .get(PasswordHashService)
      .hashPassword(PASSWORD);
    await prisma.client.user.createMany({
      data: [
        {
          username: `${USER_PREFIX}quality`,
          passwordHash,
          role: UserRole.QUALITY,
        },
        {
          username: `${USER_PREFIX}production`,
          passwordHash,
          role: UserRole.PRODUCTION,
        },
      ],
    });
    quality = await login(UserRole.QUALITY);
    production = await login(UserRole.PRODUCTION);
  });

  afterAll(async () => {
    if (prisma) {
      await cleanup();
      expect(
        await prisma.client.traceableUnit.count({
          where: { traceCode: { startsWith: PREFIX } },
        }),
      ).toBe(0);
      expect(
        await prisma.client.inspectionSpecification.count({
          where: { code: { startsWith: PREFIX } },
        }),
      ).toBe(0);
      expect(
        await prisma.client.user.count({
          where: { username: { startsWith: USER_PREFIX } },
        }),
      ).toBe(0);
      const integrity = await new TraceabilityIntegrityService(
        prisma,
      ).validateSeedDataset();
      expect(integrity.valid).toBe(true);
      expect(integrity.checks).toHaveLength(9);
      expect(integrity.checks.every(({ passed }) => passed)).toBe(true);
    }
    await app?.close();
    if (originalEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnvironment;
    if (originalOrigin === undefined) delete process.env.FRONTEND_ORIGIN;
    else process.env.FRONTEND_ORIGIN = originalOrigin;
    if (originalCsrfSecret === undefined) delete process.env.AUTH_CSRF_SECRET;
    else process.env.AUTH_CSRF_SECRET = originalCsrfSecret;
  });

  async function login(role: UserRole) {
    const agent = request.agent(app.getHttpServer());
    const response = await agent
      .post('/auth/login')
      .set('Origin', ORIGIN)
      .send({
        username: `${USER_PREFIX}${role.toLowerCase()}`,
        password: PASSWORD,
      })
      .expect(200);
    return {
      agent,
      headers: {
        Origin: ORIGIN,
        [CSRF_HEADER_NAME]: response.body.session.csrfToken as string,
      },
    };
  }

  function submit(
    actor: Awaited<ReturnType<typeof login>>,
    key: string,
    body: Record<string, unknown>,
  ) {
    return actor.agent
      .post('/inspections')
      .set(actor.headers)
      .set('Idempotency-Key', key)
      .send(body);
  }

  it('reconciles an idempotent inspection append across all existing history surfaces', async () => {
    const referenceGenealogyBefore = await quality.agent
      .get(
        '/traceability/PACK-DEMO-ALPHA-RETEST/genealogy?scope=historical&depth=8&limit=100',
      )
      .expect(200);
    expect(JSON.stringify(referenceGenealogyBefore.body)).toContain(
      'COMP-DEMO-OLD',
    );
    expect(JSON.stringify(referenceGenealogyBefore.body)).toContain(
      'COMP-DEMO-NEW',
    );
    const referenceNcBefore = await quality.agent
      .get('/traceability/PACK-DEMO-ALPHA-RETEST/nonconformances')
      .expect(200);
    const processBefore = await quality.agent
      .get(`/traceability/${PREFIX}PACK/process-history`)
      .expect(200);
    const ncBefore = await quality.agent
      .get(`/traceability/${PREFIX}PACK/nonconformances`)
      .expect(200);
    expect(processBefore.body.page.totalItems).toBe(1);
    expect(ncBefore.body.page.totalItems).toBe(0);

    const passRequest = {
      traceCode: `${PREFIX}PACK`,
      specification: { code: `${PREFIX}NUMERIC_LEVEL`, version: 1 },
      execution: { processCode: 'DEMO_VERIFY', attempt: 1 },
      inspectedAt: '2026-10-10T05:00:00.000Z',
      evidence: { type: 'NUMERIC', value: '15.750000' },
    };
    const ngRequest = {
      traceCode: `${PREFIX}PACK`,
      specification: { code: `${PREFIX}NUMERIC_LEVEL`, version: 1 },
      inspectedAt: '2026-10-10T05:01:00.000Z',
      evidence: { type: 'NUMERIC', value: '25' },
    };

    await request(app.getHttpServer())
      .post('/inspections')
      .set('Idempotency-Key', 'phase5f1b-unauthenticated')
      .send(passRequest)
      .expect(401, {
        code: 'UNAUTHENTICATED',
        message: 'Authentication required.',
      });
    await submit(production, 'phase5f1b-production-denied', passRequest).expect(
      403,
      {
        code: 'FORBIDDEN',
        message: 'Insufficient permission.',
      },
    );
    expect(
      await prisma.client.inspection.count({
        where: { traceableUnitId: unitId },
      }),
    ).toBe(0);

    const pass = await submit(
      quality,
      'phase5f1b-pass-key-0001',
      passRequest,
    ).expect(201);
    expect(pass.body).toMatchObject({
      traceCode: `${PREFIX}PACK`,
      specification: { code: `${PREFIX}NUMERIC_LEVEL`, version: 1 },
      processCode: 'DEMO_VERIFY',
      execution: { processCode: 'DEMO_VERIFY', attempt: 1 },
      attemptNumber: 1,
      inspectedAt: '2026-10-10T05:00:00.000Z',
      evidence: { type: 'NUMERIC', value: '15.75' },
      outcome: 'PASS',
    });
    expect(JSON.stringify(pass.body)).not.toMatch(UUID_PATTERN);
    expect(JSON.stringify(pass.body)).not.toMatch(
      /inspector|idempotency|fingerprint/i,
    );

    const replay = await submit(
      quality,
      'phase5f1b-pass-key-0001',
      passRequest,
    ).expect(201);
    expect(replay.body).toEqual(pass.body);

    const ng = await submit(quality, 'phase5f1b-ng-key-0001', ngRequest).expect(
      201,
    );
    expect(ng.body).toMatchObject({
      execution: null,
      attemptNumber: 2,
      inspectedAt: '2026-10-10T05:01:00.000Z',
      evidence: { type: 'NUMERIC', value: '25' },
      outcome: 'NG',
    });

    const stored = await prisma.client.inspection.findMany({
      where: { specificationId },
      include: { result: true, submission: true },
      orderBy: { attemptNumber: 'asc' },
    });
    expect(stored).toHaveLength(2);
    expect(stored.map(({ attemptNumber }) => attemptNumber)).toEqual([1, 2]);
    expect(stored.every(({ result, submission }) => result && submission)).toBe(
      true,
    );
    expect(stored[0]?.processExecutionId).not.toBeNull();
    expect(stored[1]?.processExecutionId).toBeNull();

    const qualityHistory = await quality.agent
      .get(`/traceability/${PREFIX}PACK/quality-history?pageSize=25`)
      .expect(200);
    expect(qualityHistory.body.page.totalItems).toBe(2);
    expect(qualityHistory.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          specification: { code: `${PREFIX}NUMERIC_LEVEL`, version: 1 },
          processCode: 'DEMO_VERIFY',
          attemptNumber: 1,
          inspectedAt: '2026-10-10T05:00:00.000Z',
          evidence: {
            type: 'NUMERIC',
            value: '15.75',
            unitCode: 'DEMO_UNIT',
          },
          outcome: 'PASS',
        }),
        expect.objectContaining({
          specification: { code: `${PREFIX}NUMERIC_LEVEL`, version: 1 },
          processExecutionRecordId: null,
          attemptNumber: 2,
          inspectedAt: '2026-10-10T05:01:00.000Z',
          evidence: {
            type: 'NUMERIC',
            value: '25',
            unitCode: 'DEMO_UNIT',
          },
          outcome: 'NG',
        }),
      ]),
    );
    const passHistory = qualityHistory.body.items.find(
      (item: { attemptNumber: number }) => item.attemptNumber === 1,
    );
    expect(passHistory.processExecutionRecordId).toMatch(/^exec_[a-f0-9]{24}$/);
    expect(JSON.stringify(qualityHistory.body)).not.toMatch(UUID_PATTERN);
    expect(JSON.stringify(qualityHistory.body)).not.toMatch(/inspector/i);

    const processAfter = await quality.agent
      .get(`/traceability/${PREFIX}PACK/process-history`)
      .expect(200);
    expect(processAfter.body).toEqual(processBefore.body);
    expect(processAfter.body.items[0].recordId).toBe(
      passHistory.processExecutionRecordId,
    );

    const ncAfter = await quality.agent
      .get(`/traceability/${PREFIX}PACK/nonconformances`)
      .expect(200);
    expect(ncAfter.body).toEqual(ncBefore.body);
    expect(ncAfter.body.page.totalItems).toBe(0);
    expect(
      await prisma.client.nonconformance.count({
        where: { traceableUnitId: unitId },
      }),
    ).toBe(0);

    const detail = await quality.agent
      .get(`/traceability/${PREFIX}PACK`)
      .expect(200);
    expect(detail.body.sections).toMatchObject({
      genealogy: { hasRecords: false, directRelationCount: 0 },
      processHistory: { hasRecords: true, recordCount: 1 },
      qualityHistory: { hasRecords: true, recordCount: 2 },
      nonconformance: { hasRecords: false, recordCount: 0 },
    });
    expect(JSON.stringify(detail.body)).not.toMatch(UUID_PATTERN);

    const referenceGenealogyAfter = await quality.agent
      .get(
        '/traceability/PACK-DEMO-ALPHA-RETEST/genealogy?scope=historical&depth=8&limit=100',
      )
      .expect(200);
    const referenceNcAfter = await quality.agent
      .get('/traceability/PACK-DEMO-ALPHA-RETEST/nonconformances')
      .expect(200);
    expect(referenceGenealogyAfter.body).toEqual(referenceGenealogyBefore.body);
    expect(referenceNcAfter.body).toEqual(referenceNcBefore.body);
  });
});
