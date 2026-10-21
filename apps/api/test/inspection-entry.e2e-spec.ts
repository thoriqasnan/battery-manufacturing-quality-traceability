import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { CSRF_HEADER_NAME } from '../src/auth/csrf.service.js';
import { PasswordHashService } from '../src/auth/password-hash.service.js';
import { UserRole } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const ORIGIN = 'http://localhost:3000';
const PREFIX = 'PHASE5D4_';
const USER_PREFIX = 'phase5d4.';
const PASSWORD = 'fictional-phase5d4-passphrase';

describe('Phase 5D-4 inspection entry HTTP API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let processDefinition: { id: string; code: string };
  let productModelId: string;
  const originalEnvironment = process.env.NODE_ENV;
  const originalOrigin = process.env.FRONTEND_ORIGIN;
  const originalCsrfSecret = process.env.AUTH_CSRF_SECRET;

  async function cleanup() {
    await prisma.client.inspectionSubmission.deleteMany({
      where: { user: { username: { startsWith: USER_PREFIX } } },
    });
    const specifications = await prisma.client.inspectionSpecification.findMany(
      { where: { code: { startsWith: PREFIX } }, select: { id: true } },
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
    process.env.NODE_ENV = 'test';
    process.env.FRONTEND_ORIGIN = ORIGIN;
    process.env.AUTH_CSRF_SECRET =
      'phase5d4-test-only-csrf-secret-at-least-32-characters';
    const fixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = fixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    await cleanup();
    processDefinition = await prisma.client.processDefinition.findFirstOrThrow({
      orderBy: { id: 'asc' },
      select: { id: true, code: true },
    });
    productModelId = (
      await prisma.client.productModel.findFirstOrThrow({
        orderBy: { id: 'asc' },
        select: { id: true },
      })
    ).id;
    const passwordHash = await app
      .get(PasswordHashService)
      .hashPassword(PASSWORD);
    await prisma.client.user.createMany({
      data: [
        ...Object.values(UserRole).map((role) => ({
          username: `${USER_PREFIX}${role.toLowerCase()}`,
          passwordHash,
          role,
        })),
        {
          username: `${USER_PREFIX}quality2`,
          passwordHash,
          role: UserRole.QUALITY,
        },
      ],
    });
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    if (originalEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnvironment;
    if (originalOrigin === undefined) delete process.env.FRONTEND_ORIGIN;
    else process.env.FRONTEND_ORIGIN = originalOrigin;
    if (originalCsrfSecret === undefined) delete process.env.AUTH_CSRF_SECRET;
    else process.env.AUTH_CSRF_SECRET = originalCsrfSecret;
  });

  async function login(roleOrName: UserRole | 'quality2') {
    const username =
      roleOrName === 'quality2'
        ? `${USER_PREFIX}quality2`
        : `${USER_PREFIX}${roleOrName.toLowerCase()}`;
    const agent = request.agent(app.getHttpServer());
    const response = await agent
      .post('/auth/login')
      .set('Origin', ORIGIN)
      .send({ username, password: PASSWORD })
      .expect(200);
    return {
      agent,
      headers: {
        Origin: ORIGIN,
        [CSRF_HEADER_NAME]: response.body.session.csrfToken as string,
      },
    };
  }

  async function unit(suffix: string, unitType: 'PACK' | 'MODULE' = 'PACK') {
    return prisma.client.traceableUnit.create({
      data: {
        traceCode: `${PREFIX}${suffix}`,
        unitType,
        ...(unitType === 'PACK' ? { productModelId } : {}),
      },
    });
  }

  async function specification(
    suffix: string,
    resultType: 'NUMERIC' | 'BOOLEAN' | 'CATEGORICAL' | 'VISUAL' | 'TEXT',
    lifecycle: 'DRAFT' | 'PUBLISHED' | 'RETIRED' = 'PUBLISHED',
  ) {
    return prisma.client.inspectionSpecification.create({
      data: {
        code: `${PREFIX}${suffix}`,
        version: 1,
        name: `${suffix} HTTP inspection`,
        lifecycle,
        resultType,
        targetUnitType: 'PACK',
        processDefinitionId: processDefinition.id,
        ...(resultType === 'NUMERIC'
          ? { lowerBound: '10', upperBound: '20', unitCode: 'V' }
          : {}),
        ...(resultType === 'BOOLEAN' ? { expectedBooleanValue: true } : {}),
        ...(resultType === 'CATEGORICAL' || resultType === 'VISUAL'
          ? {
              options: {
                create: [
                  { code: 'PASS', isAcceptable: true },
                  { code: 'FAIL', isAcceptable: false },
                ],
              },
            }
          : {}),
      },
      include: { options: true },
    });
  }

  function body(
    traceCode: string,
    spec: string,
    evidence: Record<string, unknown>,
    extra: Record<string, unknown> = {},
  ) {
    return {
      traceCode,
      specification: { code: `${PREFIX}${spec}`, version: 1 },
      inspectedAt: new Date().toISOString(),
      evidence,
      ...extra,
    };
  }

  function submit(
    actor: Awaited<ReturnType<typeof login>>,
    key: string,
    value: Record<string, unknown>,
  ) {
    return actor.agent
      .post('/inspections')
      .set(actor.headers)
      .set('Idempotency-Key', key)
      .send(value);
  }

  it('enforces authentication, exact RBAC, origin, CSRF, and idempotency header', async () => {
    const payload = body(`${PREFIX}UNKNOWN`, 'UNKNOWN', {
      type: 'TEXT',
      value: 'security',
      outcome: 'PASS',
    });
    await request(app.getHttpServer())
      .post('/inspections')
      .send(payload)
      .expect(401);
    for (const role of [
      UserRole.ENGINEERING,
      UserRole.ADMIN,
      UserRole.PRODUCTION,
    ]) {
      const actor = await login(role);
      await actor.agent
        .post('/inspections')
        .set(actor.headers)
        .set('Idempotency-Key', 'phase5d4-security-key')
        .send(payload)
        .expect(403, {
          code: 'FORBIDDEN',
          message: 'Insufficient permission.',
        });
    }
    const quality = await login(UserRole.QUALITY);
    await quality.agent.post('/inspections').send(payload).expect(403);
    await quality.agent
      .post('/inspections')
      .set('Origin', ORIGIN)
      .send(payload)
      .expect(403);
    await quality.agent
      .post('/inspections')
      .set('Origin', ORIGIN)
      .set(CSRF_HEADER_NAME, 'invalid-csrf-token')
      .send(payload)
      .expect(403);
    await quality.agent
      .post('/inspections')
      .set({ ...quality.headers, Origin: 'https://untrusted.invalid' })
      .send(payload)
      .expect(403);
    await quality.agent
      .post('/inspections')
      .set(quality.headers)
      .send(payload)
      .expect(400);
    await quality.agent
      .post('/inspections')
      .set(quality.headers)
      .set('Idempotency-Key', 'too-short')
      .send(payload)
      .expect(400);
  });

  it('persists all five strict evidence variants and server-authoritative PASS/NG', async () => {
    const quality = await login(UserRole.QUALITY);
    const cases = [
      ['NUM', 'NUMERIC', { type: 'NUMERIC', value: '12.500000' }, 'PASS'],
      ['BOOL', 'BOOLEAN', { type: 'BOOLEAN', value: false }, 'NG'],
      [
        'CAT',
        'CATEGORICAL',
        { type: 'CATEGORICAL', optionCode: ' pass ' },
        'PASS',
      ],
      ['VIS', 'VISUAL', { type: 'VISUAL', optionCode: 'FAIL' }, 'NG'],
      [
        'TEXT',
        'TEXT',
        { type: 'TEXT', value: ' visual note ', outcome: 'NG' },
        'NG',
      ],
    ] as const;
    const ncBefore = await prisma.client.nonconformance.count();
    for (const [suffix, type, evidence, outcome] of cases) {
      const storedUnit = await unit(`UNIT_${suffix}`);
      await specification(`SPEC_${suffix}`, type);
      const response = await submit(
        quality,
        `phase5d4-${suffix.toLowerCase()}-key-0001`,
        body(
          storedUnit.traceCode.toLowerCase(),
          `SPEC_${suffix}`,
          evidence,
          suffix === 'NUM' ? { inspectedAt: '2026-10-07T07:00:00+07:00' } : {},
        ),
      ).expect(201);
      expect(response.body).toMatchObject({
        traceCode: storedUnit.traceCode,
        specification: { code: `${PREFIX}SPEC_${suffix}`, version: 1 },
        attemptNumber: 1,
        outcome,
      });
      expect(JSON.stringify(response.body)).not.toMatch(
        /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
      );
    }
    expect(await prisma.client.nonconformance.count()).toBe(ncBefore);

    const numericUnit = await unit('NUMERIC_REJECT');
    await specification('NUMERIC_REJECT', 'NUMERIC');
    await submit(
      quality,
      'phase5d4-numeric-number',
      body(numericUnit.traceCode, 'NUMERIC_REJECT', {
        type: 'NUMERIC',
        value: 12.5,
      }),
    ).expect(400);
    await submit(
      quality,
      'phase5d4-numeric-outcome',
      body(numericUnit.traceCode, 'NUMERIC_REJECT', {
        type: 'NUMERIC',
        value: '12.5',
        outcome: 'PASS',
      }),
    ).expect(400);
    for (const [suffix, evidence] of [
      ['BOOL', { type: 'BOOLEAN', value: true, outcome: 'PASS' }],
      ['CAT', { type: 'CATEGORICAL', optionCode: 'PASS', outcome: 'PASS' }],
      ['VIS', { type: 'VISUAL', optionCode: 'PASS', outcome: 'PASS' }],
    ] as const) {
      await submit(
        quality,
        `phase5d4-${suffix.toLowerCase()}-outcome`,
        body(`${PREFIX}UNIT_${suffix}`, `SPEC_${suffix}`, evidence),
      ).expect(400);
    }
    await submit(
      quality,
      'phase5d4-text-no-outcome',
      body(numericUnit.traceCode, 'NUMERIC_REJECT', {
        type: 'TEXT',
        value: 'x',
      }),
    ).expect(400);
  });

  it('returns durable replay, conflict, and user-scoped key behavior', async () => {
    const storedUnit = await unit('REPLAY');
    await specification('REPLAY', 'BOOLEAN');
    const firstUser = await login(UserRole.QUALITY);
    const secondUser = await login('quality2');
    const key = 'phase5d4-shared-key-0001';
    const payload = body(storedUnit.traceCode, 'REPLAY', {
      type: 'BOOLEAN',
      value: true,
    });
    const first = await submit(firstUser, key, payload).expect(201);
    const replay = await submit(firstUser, key, payload).expect(201);
    expect(replay.body).toEqual(first.body);
    await submit(firstUser, key, {
      ...payload,
      evidence: { type: 'BOOLEAN', value: false },
    }).expect(409, {
      code: 'IDEMPOTENCY_CONFLICT',
      message: 'The idempotency key was used for a different request.',
    });
    const independent = await submit(secondUser, key, payload).expect(201);
    expect(independent.body.attemptNumber).toBe(2);
    expect(
      await prisma.client.inspection.count({
        where: { traceableUnitId: storedUnit.id },
      }),
    ).toBe(2);
  });

  it('maps timestamp, lifecycle, context, discriminator, and option failures safely', async () => {
    const quality = await login(UserRole.QUALITY);
    const storedUnit = await unit('ERRORS');
    const moduleUnit = await unit('WRONG_TYPE', 'MODULE');
    await specification('ERRORS', 'CATEGORICAL');
    await specification('DRAFT', 'TEXT', 'DRAFT');
    await specification('RETIRED', 'TEXT', 'RETIRED');
    const error = async (
      key: string,
      payload: Record<string, unknown>,
      status: number,
      code: string,
    ) => {
      const response = await submit(quality, key, payload).expect(status);
      expect(response.body.code).toBe(code);
      expect(JSON.stringify(response.body)).not.toMatch(
        /Prisma|SELECT|constraint|fingerprint|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}/i,
      );
    };
    await error(
      'phase5d4-unknown-unit',
      body(`${PREFIX}MISSING`, 'ERRORS', {
        type: 'CATEGORICAL',
        optionCode: 'PASS',
      }),
      404,
      'TRACE_UNIT_NOT_FOUND',
    );
    await error(
      'phase5d4-unknown-spec',
      body(storedUnit.traceCode, 'MISSING', {
        type: 'TEXT',
        value: 'x',
        outcome: 'PASS',
      }),
      404,
      'INSPECTION_SPECIFICATION_NOT_FOUND',
    );
    for (const lifecycle of ['DRAFT', 'RETIRED'])
      await error(
        `phase5d4-${lifecycle.toLowerCase()}-key`,
        body(storedUnit.traceCode, lifecycle, {
          type: 'TEXT',
          value: 'x',
          outcome: 'PASS',
        }),
        409,
        'INSPECTION_SPECIFICATION_NOT_PUBLISHED',
      );
    await error(
      'phase5d4-type-mismatch',
      body(moduleUnit.traceCode, 'ERRORS', {
        type: 'CATEGORICAL',
        optionCode: 'PASS',
      }),
      409,
      'INCOMPATIBLE_INSPECTION_CONTEXT',
    );
    await error(
      'phase5d4-wrong-discriminator',
      body(storedUnit.traceCode, 'ERRORS', { type: 'BOOLEAN', value: true }),
      400,
      'INVALID_TYPED_RESULT',
    );
    await error(
      'phase5d4-wrong-option',
      body(storedUnit.traceCode, 'ERRORS', {
        type: 'CATEGORICAL',
        optionCode: 'UNKNOWN',
      }),
      400,
      'INVALID_TYPED_RESULT',
    );
    await error(
      'phase5d4-invalid-execution',
      body(
        storedUnit.traceCode,
        'ERRORS',
        { type: 'CATEGORICAL', optionCode: 'PASS' },
        {
          execution: { processCode: processDefinition.code, attempt: 999 },
        },
      ),
      409,
      'INCOMPATIBLE_INSPECTION_CONTEXT',
    );
    for (const inspectedAt of ['2026-10-07T00:00:00', '2026-02-30T00:00:00Z'])
      await error(
        `phase5d4-time-${inspectedAt.length}`,
        {
          ...body(storedUnit.traceCode, 'ERRORS', {
            type: 'CATEGORICAL',
            optionCode: 'PASS',
          }),
          inspectedAt,
        },
        400,
        'INVALID_REQUEST',
      );
    await error(
      'phase5d4-future-time',
      {
        ...body(storedUnit.traceCode, 'ERRORS', {
          type: 'CATEGORICAL',
          optionCode: 'PASS',
        }),
        inspectedAt: new Date(Date.now() + 6 * 60_000).toISOString(),
      },
      400,
      'INVALID_REQUEST',
    );
  });

  it('attributes the authenticated inspector and exposes the append through quality history', async () => {
    const quality = await login(UserRole.QUALITY);
    const storedUnit = await unit('HISTORY');
    await specification('HISTORY', 'TEXT');
    const payload = body(storedUnit.traceCode, 'HISTORY', {
      type: 'TEXT',
      value: 'HTTP-created evidence',
      outcome: 'PASS',
    });
    const response = await submit(quality, 'phase5d4-history-key', {
      ...payload,
      inspectorUserId: '11111111-1111-4111-8111-111111111111',
    }).expect(400);
    expect(response.body.code).toBe('INVALID_REQUEST');
    await submit(quality, 'phase5d4-history-key-ok', payload).expect(201);
    const actor = await prisma.client.user.findUniqueOrThrow({
      where: { username: `${USER_PREFIX}quality` },
      select: { id: true },
    });
    const stored = await prisma.client.inspection.findFirstOrThrow({
      where: { traceableUnitId: storedUnit.id },
      include: { result: true },
    });
    expect(stored.inspectorUserId).toBe(actor.id);
    expect(stored.result?.textValue).toBe('HTTP-created evidence');
    const history = await quality.agent
      .get(`/traceability/${storedUnit.traceCode}/quality-history`)
      .expect(200);
    expect(history.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          specification: { code: `${PREFIX}HISTORY`, version: 1 },
          attemptNumber: 1,
          outcome: 'PASS',
          evidence: { type: 'TEXT', value: 'HTTP-created evidence' },
        }),
      ]),
    );
    expect(JSON.stringify(history.body)).not.toContain(actor.id);
  });
});
