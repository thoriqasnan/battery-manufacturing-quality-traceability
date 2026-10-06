import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { REQUIRED_PERMISSIONS_KEY } from '../src/auth/auth.metadata.js';
import { PasswordHashService } from '../src/auth/password-hash.service.js';
import { Permission } from '../src/auth/permissions.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { TraceabilityController } from '../src/traceability/traceability.controller.js';
import { TraceabilityHistoryIntegrityError } from '../src/traceability/traceability-history.types.js';

const FRONTEND_ORIGIN = 'http://localhost:3000';
const TEST_USERNAME = 'phase4h3.history.admin';
const TEST_PASSWORD = 'fictional-traceability-history-passphrase';
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

describe('Phase 4H-3 public history endpoints (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authenticated: request.Agent;
  const originalEnvironment = process.env.NODE_ENV;
  const originalFrontendOrigin = process.env.FRONTEND_ORIGIN;
  const originalCsrfSecret = process.env.AUTH_CSRF_SECRET;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.FRONTEND_ORIGIN = FRONTEND_ORIGIN;
    process.env.AUTH_CSRF_SECRET =
      'phase4h3-test-only-csrf-secret-at-least-32-characters';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    await cleanupUser();
    await prisma.client.user.create({
      data: {
        username: TEST_USERNAME,
        passwordHash: await app
          .get(PasswordHashService)
          .hashPassword(TEST_PASSWORD),
        role: 'ADMIN',
      },
    });
    authenticated = request.agent(app.getHttpServer());
    await authenticated
      .post('/auth/login')
      .set('Origin', FRONTEND_ORIGIN)
      .send({ username: TEST_USERNAME, password: TEST_PASSWORD })
      .expect(200);
  });

  afterAll(async () => {
    await cleanupUser();
    await app.close();
    if (originalEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnvironment;
    if (originalFrontendOrigin === undefined) delete process.env.FRONTEND_ORIGIN;
    else process.env.FRONTEND_ORIGIN = originalFrontendOrigin;
    if (originalCsrfSecret === undefined) delete process.env.AUTH_CSRF_SECRET;
    else process.env.AUTH_CSRF_SECRET = originalCsrfSecret;
  });

  async function cleanupUser() {
    await prisma?.client.session.deleteMany({
      where: { user: { username: TEST_USERNAME } },
    });
    await prisma?.client.user.deleteMany({ where: { username: TEST_USERNAME } });
  }

  it('protects all routes with traceability:view and rejects unauthenticated access', async () => {
    for (const method of [
      'processHistory',
      'qualityHistory',
      'nonconformanceHistory',
    ] as const) {
      const handler = Object.getOwnPropertyDescriptor(
        TraceabilityController.prototype,
        method,
      )?.value as object;
      expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, handler)).toEqual([
        Permission.TraceabilityView,
      ]);
    }
    for (const suffix of [
      'process-history',
      'quality-history',
      'nonconformances',
    ]) {
      await request(app.getHttpServer())
        .get(`/traceability/PACK-DEMO-ALPHA-PASS/${suffix}`)
        .expect(401, {
          code: 'UNAUTHENTICATED',
          message: 'Authentication required.',
        });
    }
  });

  it('returns bounded process history with opaque references and stable ordering', async () => {
    const pass = await authenticated
      .get('/traceability/%20pack-demo-alpha-pass%20/process-history')
      .expect(200);
    expect(pass.body.page).toEqual({
      number: 1,
      size: 25,
      totalItems: 4,
      totalPages: 1,
    });
    expect(pass.body.items).toHaveLength(4);
    expect(pass.body.items.every((item: { recordId: string }) => /^exec_[a-f0-9]{24}$/.test(item.recordId))).toBe(true);
    expect(pass.body.items.map((item: { startedAt: string }) => item.startedAt)).toEqual(
      pass.body.items.map((item: { startedAt: string }) => item.startedAt).sort().reverse(),
    );
    expect(JSON.stringify(pass.body)).not.toMatch(UUID_PATTERN);

    const completeRetest = await authenticated
      .get('/traceability/PACK-DEMO-ALPHA-RETEST/process-history')
      .expect(200);
    expect(
      completeRetest.body.items
        .filter((item: { process: { code: string } }) => item.process.code === 'DEMO_VERIFY')
        .map((item: { attemptNumber: number }) => item.attemptNumber),
    ).toEqual([2, 1]);

    const retest = await authenticated
      .get('/traceability/PACK-DEMO-ALPHA-RETEST/process-history?page=2&pageSize=2')
      .expect(200);
    expect(retest.body.page).toEqual({ number: 2, size: 2, totalItems: 5, totalPages: 3 });
    expect(retest.body.items).toHaveLength(2);
  });

  it('serializes all quality evidence variants and preserves NG then PASS', async () => {
    const pass = await authenticated
      .get('/traceability/PACK-DEMO-ALPHA-PASS/quality-history')
      .expect(200);
    expect(pass.body.page.totalItems).toBe(4);
    expect(pass.body.items.map((item: { evidence: { type: string } }) => item.evidence.type).sort()).toEqual([
      'BOOLEAN', 'CATEGORICAL', 'NUMERIC', 'TEXT',
    ]);
    expect(JSON.stringify(pass.body)).not.toMatch(UUID_PATTERN);

    const all = await authenticated
      .get('/traceability/PACK-DEMO-ALPHA-RETEST/quality-history')
      .expect(200);
    expect(all.body.items.map((item: { attemptNumber: number; outcome: string }) => [item.attemptNumber, item.outcome])).toEqual([
      [2, 'PASS'], [1, 'NG'],
    ]);
    for (const outcome of ['PASS', 'NG']) {
      const filtered = await authenticated
        .get(`/traceability/PACK-DEMO-ALPHA-RETEST/quality-history?outcome=${outcome}`)
        .expect(200);
      expect(filtered.body.items).toHaveLength(1);
      expect(filtered.body.items[0].outcome).toBe(outcome);
    }
    const visual = await authenticated
      .get('/traceability/PACK-DEMO-BETA-ESCALATED/quality-history')
      .expect(200);
    expect(visual.body.items.map((item: { evidence: unknown }) => item.evidence)).toEqual([
      { type: 'VISUAL', optionCode: 'CLEAR', isAcceptable: true },
      { type: 'VISUAL', optionCode: 'DEMO_MARK', isAcceptable: false },
    ]);
  });

  it('returns NC aggregates with chronological retained evidence and truthful metadata', async () => {
    const simple = await authenticated
      .get('/traceability/PACK-DEMO-ALPHA-RETEST/nonconformances')
      .expect(200);
    const item = simple.body.items[0];
    expect(item).toMatchObject({
      code: 'NC-DEMO-SIMPLE-001',
      status: 'CLOSED',
      nestedPageInfo: {
        actions: { returnedCount: 2, totalCount: 2, isPartial: false },
      },
    });
    expect(item.actions.map((entry: { actionType: string }) => entry.actionType)).toEqual([
      'CORRECTION', 'RETEST',
    ]);
    expect(item.dispositions.map((entry: { dispositionType: string }) => entry.dispositionType)).toEqual(['CONTINUE']);

    const escalated = await authenticated
      .get('/traceability/PACK-DEMO-BETA-ESCALATED/nonconformances?status=CLOSED')
      .expect(200);
    const escalatedItem = escalated.body.items[0];
    expect(escalatedItem.code).toBe('NC-DEMO-ESCALATED-001');
    expect(escalatedItem.abnormalCases.map((entry: { code: string }) => entry.code)).toEqual(['ABNORMAL-DEMO-001']);
    expect(escalatedItem.actions.map((entry: { actionType: string }) => entry.actionType)).toEqual([
      'ESCALATION', 'REPLACEMENT', 'RETEST',
    ]);
    expect(escalatedItem.dispositions.map((entry: { dispositionType: string }) => entry.dispositionType)).toEqual([
      'RETURN_IQC', 'CONTINUE',
    ]);
    expect(JSON.stringify(escalated.body)).not.toMatch(UUID_PATTERN);
  });

  it('keeps cross-endpoint opaque references consistent', async () => {
    const [processes, inspections, nonconformances] = await Promise.all([
      authenticated.get('/traceability/PACK-DEMO-ALPHA-RETEST/process-history').expect(200),
      authenticated.get('/traceability/PACK-DEMO-ALPHA-RETEST/quality-history').expect(200),
      authenticated.get('/traceability/PACK-DEMO-ALPHA-RETEST/nonconformances').expect(200),
    ]);
    const nc = nonconformances.body.items[0];
    expect(processes.body.items.map((item: { recordId: string }) => item.recordId)).toContain(nc.source.processExecutionRecordId);
    expect(inspections.body.items.map((item: { recordId: string }) => item.recordId)).toContain(nc.source.inspectionRecordId);
    expect(inspections.body.items.map((item: { recordId: string }) => item.recordId)).toContain(nc.actions[1].resultingInspectionRecordId);
    expect(nc.verifications[0].inspectionRecordId).toBe(nc.actions[1].resultingInspectionRecordId);
    expect(nc.verifications[0].actionRecordId).toBe(nc.actions[1].recordId);
  });

  it('returns truthful empty direct histories for a module and PASS pack NCs', async () => {
    for (const suffix of ['process-history', 'quality-history', 'nonconformances']) {
      const response = await authenticated
        .get(`/traceability/MODULE-DEMO-ALPHA-PASS-01/${suffix}`)
        .expect(200);
      expect(response.body.items).toEqual([]);
      expect(response.body.page.totalItems).toBe(0);
    }
    const passNc = await authenticated
      .get('/traceability/PACK-DEMO-ALPHA-PASS/nonconformances')
      .expect(200);
    expect(passNc.body.items).toEqual([]);
  });

  it('rejects malformed trace codes, unknown units, and invalid bounded queries', async () => {
    await authenticated
      .get('/traceability/PACK%20BAD/process-history')
      .expect(400, {
        code: 'INVALID_REQUEST',
        message: 'The request is invalid.',
        details: [{ field: 'traceCode', code: 'INVALID_TRACE_CODE' }],
      });
    await authenticated
      .get('/traceability/PACK-DOES-NOT-EXIST/process-history')
      .expect(404, {
        code: 'TRACE_UNIT_NOT_FOUND',
        message: 'Traceable unit not found.',
      });
    for (const [suffix, query, field] of [
      ['process-history', 'page=0', 'page'],
      ['process-history', 'pageSize=101', 'pageSize'],
      ['quality-history', 'outcome=UNKNOWN', 'outcome'],
      ['nonconformances', 'status=UNKNOWN', 'status'],
    ]) {
      const response = await authenticated
        .get(`/traceability/PACK-DEMO-ALPHA-PASS/${suffix}?${query}`)
        .expect(400);
      expect(response.body).toMatchObject({
        code: 'INVALID_REQUEST',
        details: [{ field }],
      });
    }
  });
});

describe('Phase 4H-3 integrity-error HTTP boundary (e2e)', () => {
  it('returns a safe server response without leaking persisted/internal detail', async () => {
    const historyService = {
      getQualityHistory: () =>
        Promise.reject(
          new TraceabilityHistoryIntegrityError(
            'Stored BOOLEAN inspection for internal id 123 is malformed.',
          ),
        ),
    };
    const controller = new TraceabilityController(
      {} as never,
      {} as never,
      historyService as never,
    );
    await expect(
      controller.qualityHistory('PACK-DEMO', {}),
    ).rejects.toMatchObject({
      response: {
        code: 'TRACEABILITY_HISTORY_INTEGRITY_ERROR',
        message: 'Stored traceability history could not be read safely.',
      },
      status: 500,
    });
  });
});
