import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { REQUIRED_PERMISSIONS_KEY } from '../src/auth/auth.metadata.js';
import { PasswordHashService } from '../src/auth/password-hash.service.js';
import { Permission } from '../src/auth/permissions.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { TraceabilityController } from '../src/traceability/traceability.controller.js';

const FRONTEND_ORIGIN = 'http://localhost:3000';
const TEST_USERNAME = 'phase4d.detail.admin';
const TEST_PASSWORD = 'fictional-traceability-detail-passphrase';
const PREFIX = 'PHASE4D-';
const PRODUCT_CODE = 'PHASE4D_MODEL';

describe('Phase 4D unit detail and genealogy (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const originalEnvironment = process.env.NODE_ENV;
  const originalFrontendOrigin = process.env.FRONTEND_ORIGIN;
  const originalCsrfSecret = process.env.AUTH_CSRF_SECRET;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.FRONTEND_ORIGIN = FRONTEND_ORIGIN;
    process.env.AUTH_CSRF_SECRET =
      'phase4d-test-only-csrf-secret-at-least-32-characters';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    await cleanup();
    const passwordHash = app.get(PasswordHashService);
    await prisma.client.user.create({
      data: {
        username: TEST_USERNAME,
        passwordHash: await passwordHash.hashPassword(TEST_PASSWORD),
        role: 'ADMIN',
      },
    });
    const product = await prisma.client.productModel.create({
      data: { code: PRODUCT_CODE, name: 'Phase 4D Synthetic Model' },
    });
    const created = await Promise.all(
      [
        ['PACK', 'PACK', product.id],
        ['MODULE', 'MODULE', null],
        ['CELL', 'CELL', null],
        ['OLD', 'COMPONENT', null],
        ['NEW', 'COMPONENT', null],
        ['ISOLATED', 'MATERIAL', null],
        ['CYCLE-A', 'COMPONENT', null],
        ['CYCLE-B', 'COMPONENT', null],
        ['CYCLE-C', 'COMPONENT', null],
        ['BOUND-ROOT', 'PACK', product.id],
      ].map(async ([suffix, unitType, productModelId]) =>
        prisma.client.traceableUnit.create({
          data: {
            traceCode: `${PREFIX}${suffix}`,
            unitType: unitType as
              | 'PACK'
              | 'MODULE'
              | 'CELL'
              | 'COMPONENT'
              | 'MATERIAL',
            productModelId,
          },
        }),
      ),
    );
    const byCode = new Map(created.map((unit) => [unit.traceCode, unit.id]));
    await prisma.client.genealogyRelation.createMany({
      data: [
        relation(byCode, 'PACK', 'MODULE', 'MODULE-01', '2026-02-01T00:00:00Z'),
        relation(byCode, 'MODULE', 'CELL', 'CELL-01', '2026-02-02T00:00:00Z'),
        relation(
          byCode,
          'MODULE',
          'OLD',
          'SENSOR-01',
          '2026-02-03T00:00:00Z',
          '2026-02-05T00:00:00Z',
        ),
        relation(byCode, 'MODULE', 'NEW', 'SENSOR-01', '2026-02-05T00:00:00Z'),
        relation(byCode, 'CYCLE-A', 'CYCLE-B', null, '2026-02-01T00:00:00Z'),
        relation(byCode, 'CYCLE-B', 'CYCLE-C', null, '2026-02-01T00:01:00Z'),
        relation(byCode, 'CYCLE-C', 'CYCLE-A', null, '2026-02-01T00:02:00Z'),
      ],
    });

    const boundChildren = await Promise.all(
      Array.from({ length: 101 }, (_, index) =>
        prisma.client.traceableUnit.create({
          data: {
            traceCode: `${PREFIX}BOUND-${String(index + 1).padStart(3, '0')}`,
            unitType: 'COMPONENT',
          },
        }),
      ),
    );
    await prisma.client.genealogyRelation.createMany({
      data: boundChildren.map((child, index) => ({
        parentUnitId: byCode.get(`${PREFIX}BOUND-ROOT`)!,
        childUnitId: child.id,
        positionCode: `POS-${String(index + 1).padStart(3, '0')}`,
        installedAt: new Date(
          Date.parse('2026-03-01T00:00:00Z') + index * 1_000,
        ),
      })),
    });
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    restoreEnvironment();
  });

  function relation(
    ids: Map<string, string>,
    parent: string,
    child: string,
    positionCode: string | null,
    installedAt: string,
    removedAt?: string,
  ) {
    return {
      parentUnitId: ids.get(`${PREFIX}${parent}`)!,
      childUnitId: ids.get(`${PREFIX}${child}`)!,
      positionCode,
      installedAt: new Date(installedAt),
      removedAt: removedAt ? new Date(removedAt) : null,
    };
  }

  async function cleanup() {
    const units = await prisma?.client.traceableUnit.findMany({
      where: { traceCode: { startsWith: PREFIX } },
      select: { id: true },
    });
    const ids = units?.map((unit) => unit.id) ?? [];
    if (ids.length > 0) {
      await prisma.client.genealogyRelation.deleteMany({
        where: { OR: [{ parentUnitId: { in: ids } }, { childUnitId: { in: ids } }] },
      });
      await prisma.client.traceableUnit.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma?.client.productModel.deleteMany({ where: { code: PRODUCT_CODE } });
    await prisma?.client.session.deleteMany({
      where: { user: { username: TEST_USERNAME } },
    });
    await prisma?.client.user.deleteMany({ where: { username: TEST_USERNAME } });
  }

  function restoreEnvironment() {
    if (originalEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnvironment;
    if (originalFrontendOrigin === undefined) delete process.env.FRONTEND_ORIGIN;
    else process.env.FRONTEND_ORIGIN = originalFrontendOrigin;
    if (originalCsrfSecret === undefined) delete process.env.AUTH_CSRF_SECRET;
    else process.env.AUTH_CSRF_SECRET = originalCsrfSecret;
  }

  async function agent() {
    const authenticated = request.agent(app.getHttpServer());
    await authenticated
      .post('/auth/login')
      .set('Origin', FRONTEND_ORIGIN)
      .send({ username: TEST_USERNAME, password: TEST_PASSWORD })
      .expect(200);
    return authenticated;
  }

  it('protects both endpoints with traceability:view', async () => {
    for (const method of ['detail', 'genealogy'] as const) {
      const handler = Object.getOwnPropertyDescriptor(
        TraceabilityController.prototype,
        method,
      )?.value as object;
      expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, handler)).toEqual([
        Permission.TraceabilityView,
      ]);
    }
    await request(app.getHttpServer()).get('/traceability/PHASE4D-PACK').expect(401);
    await request(app.getHttpServer())
      .get('/traceability/PHASE4D-PACK/genealogy')
      .expect(401);
  });

  it('normalizes detail lookup and returns evidence counts without IDs', async () => {
    const response = await (await agent())
      .get('/traceability/%20phase4d-pack%20')
      .expect(200);
    expect(response.body.unit).toMatchObject({
      traceCode: 'PHASE4D-PACK',
      unitType: 'PACK',
      productModel: { code: PRODUCT_CODE, name: 'Phase 4D Synthetic Model' },
    });
    expect(response.body.sections).toEqual({
      genealogy: { hasRecords: true, directRelationCount: 1 },
      processHistory: { hasRecords: false, recordCount: 0 },
      qualityHistory: { hasRecords: false, recordCount: 0 },
      nonconformance: { hasRecords: false, recordCount: 0 },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27}/i);
  });

  it('distinguishes malformed and unknown trace codes', async () => {
    const authenticated = await agent();
    await authenticated
      .get('/traceability/PHASE4D%20BAD')
      .expect(400, {
        code: 'INVALID_REQUEST',
        message: 'The request is invalid.',
        details: [{ field: 'traceCode', code: 'INVALID_TRACE_CODE' }],
      });
    await authenticated
      .get('/traceability/PHASE4D-UNKNOWN')
      .expect(404, {
        code: 'TRACE_UNIT_NOT_FOUND',
        message: 'Traceable unit not found.',
      });
  });

  it('defaults to one descendant level with progressive metadata', async () => {
    const response = await (await agent())
      .get('/traceability/PHASE4D-PACK/genealogy')
      .expect(200);
    expect(response.body.direction).toBe('descendants');
    expect(response.body.edges.map((edge: { child: { traceCode: string } }) => edge.child.traceCode)).toEqual([
      'PHASE4D-MODULE',
    ]);
    expect(response.body.edges[0].child.directChildCount).toBe(2);
    expect(response.body.pageInfo).toMatchObject({
      requestedDepth: 1,
      reachedDepth: 1,
      isPartial: true,
      partialReasons: ['DEPTH_LIMIT'],
    });
  });

  it('traverses descendants and ancestors beyond one level', async () => {
    const authenticated = await agent();
    const descendants = await authenticated
      .get('/traceability/PHASE4D-PACK/genealogy')
      .query({ depth: 2 })
      .expect(200);
    expect(descendants.body.edges.map((edge: { depth: number }) => edge.depth)).toEqual([
      1, 2, 2,
    ]);
    const ancestors = await authenticated
      .get('/traceability/PHASE4D-CELL/genealogy')
      .query({ direction: 'ancestors', depth: 8 })
      .expect(200);
    expect(ancestors.body.edges.map((edge: { parent: { traceCode: string } }) => edge.parent.traceCode)).toEqual([
      'PHASE4D-MODULE',
      'PHASE4D-PACK',
    ]);
    expect(ancestors.body.pageInfo.requestedDepth).toBe(8);
  });

  it('distinguishes current and historical removed evidence', async () => {
    const authenticated = await agent();
    const current = await authenticated
      .get('/traceability/PHASE4D-MODULE/genealogy')
      .expect(200);
    expect(current.body.edges.map((edge: { child: { traceCode: string } }) => edge.child.traceCode)).toEqual([
      'PHASE4D-CELL',
      'PHASE4D-NEW',
    ]);
    const historical = await authenticated
      .get('/traceability/PHASE4D-MODULE/genealogy')
      .query({ scope: 'historical' })
      .expect(200);
    const old = historical.body.edges.find(
      (edge: { child: { traceCode: string } }) => edge.child.traceCode === 'PHASE4D-OLD',
    );
    expect(old).toMatchObject({ relationshipState: 'HISTORICAL' });
    expect(old.removedAt).toBe('2026-02-05T00:00:00.000Z');
  });

  it.each([
    ['2026-02-02T23:59:59Z', []],
    ['2026-02-04T00:00:00Z', ['PHASE4D-OLD']],
    ['2026-02-05T00:00:00Z', ['PHASE4D-NEW']],
    ['2026-02-06T00:00:00Z', ['PHASE4D-NEW']],
  ])('applies AS_OF interval semantics at %s', async (at, expectedSensorCodes) => {
    const response = await (await agent())
      .get('/traceability/PHASE4D-MODULE/genealogy')
      .query({ scope: 'asOf', at })
      .expect(200);
    const sensors = response.body.edges
      .map((edge: { child: { traceCode: string } }) => edge.child.traceCode)
      .filter((code: string) => code.endsWith('-OLD') || code.endsWith('-NEW'));
    expect(sensors).toEqual(expectedSensorCodes);
  });

  it('returns a successful empty structure for an isolated unit', async () => {
    const response = await (await agent())
      .get('/traceability/PHASE4D-ISOLATED/genealogy')
      .expect(200);
    expect(response.body.root).toMatchObject({
      traceCode: 'PHASE4D-ISOLATED',
      directParentCount: 0,
      directChildCount: 0,
      selected: true,
    });
    expect(response.body.edges).toEqual([]);
    expect(response.body.pageInfo).toMatchObject({
      returnedEdgeCount: 0,
      reachedDepth: 0,
      isPartial: false,
    });
  });

  it('enforces depth and request validation', async () => {
    const authenticated = await agent();
    for (const [query, field] of [
      [{ depth: 9 }, 'depth'],
      [{ limit: 101 }, 'limit'],
      [{ direction: 'both' }, 'direction'],
      [{ scope: 'snapshot' }, 'scope'],
      [{ scope: 'asOf' }, 'at'],
      [{ scope: 'current', at: '2026-01-01T00:00:00Z' }, 'at'],
      [{ scope: 'asOf', at: 'not-a-time' }, 'at'],
    ] as const) {
      const response = await authenticated
        .get('/traceability/PHASE4D-PACK/genealogy')
        .query(query)
        .expect(400);
      expect(response.body).toMatchObject({
        code: 'INVALID_REQUEST',
        details: [{ field }],
      });
    }
  });

  it('bounds edges, exposes truncation, and supports a scoped cursor', async () => {
    const authenticated = await agent();
    const first = await authenticated
      .get('/traceability/PHASE4D-BOUND-ROOT/genealogy')
      .query({ limit: 100 })
      .expect(200);
    expect(first.body.edges).toHaveLength(100);
    expect(first.body.pageInfo).toMatchObject({
      hasNextPage: true,
      returnedEdgeCount: 100,
      isPartial: true,
      partialReasons: ['EDGE_LIMIT'],
    });
    const second = await authenticated
      .get('/traceability/PHASE4D-BOUND-ROOT/genealogy')
      .query({ limit: 100, cursor: first.body.pageInfo.endCursor })
      .expect(200);
    expect(second.body.edges).toHaveLength(1);
    expect(second.body.pageInfo.hasNextPage).toBe(false);
    await authenticated
      .get('/traceability/PHASE4D-BOUND-ROOT/genealogy')
      .query({ limit: 50, cursor: first.body.pageInfo.endCursor })
      .expect(400);
  });

  it('reports and skips a cycle without leaking internal IDs', async () => {
    const response = await (await agent())
      .get('/traceability/PHASE4D-CYCLE-A/genealogy')
      .query({ depth: 8 })
      .expect(200);
    expect(response.body.edges).toHaveLength(2);
    expect(response.body.pageInfo.partialReasons).toContain('CYCLE_PATH_SKIPPED');
    expect(response.body.integrityWarnings).toEqual([
      { code: 'CYCLE_PATH_SKIPPED' },
    ]);
    expect(JSON.stringify(response.body)).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27}/i);
    expect(response.body.edges[0].relationId).toMatch(/^rel_[0-9a-f]{24}$/);
  });

  it('orders identical requests deterministically', async () => {
    const authenticated = await agent();
    const first = await authenticated
      .get('/traceability/PHASE4D-MODULE/genealogy')
      .query({ scope: 'historical' })
      .expect(200);
    const second = await authenticated
      .get('/traceability/PHASE4D-MODULE/genealogy')
      .query({ scope: 'historical' })
      .expect(200);
    expect(first.body).toEqual(second.body);
  });
});
