import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { REQUIRED_PERMISSIONS_KEY } from '../src/auth/auth.metadata.js';
import { PasswordHashService } from '../src/auth/password-hash.service.js';
import { Permission } from '../src/auth/permissions.js';
import { ROLE_PERMISSIONS } from '../src/auth/role-permissions.js';
import { UserRole } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { TraceabilityController } from '../src/traceability/traceability.controller.js';

const FRONTEND_ORIGIN = 'http://localhost:3000';
const TEST_USERNAME = 'phase4c.search.admin';
const TEST_PASSWORD = 'fictional-traceability-search-passphrase';
const TRACE_PREFIX = 'PHASE4C-';
const PRODUCT_CODE = 'PHASE4C_MODEL';

describe('Phase 4C traceability search (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const originalEnvironment = process.env.NODE_ENV;
  const originalFrontendOrigin = process.env.FRONTEND_ORIGIN;
  const originalCsrfSecret = process.env.AUTH_CSRF_SECRET;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.FRONTEND_ORIGIN = FRONTEND_ORIGIN;
    process.env.AUTH_CSRF_SECRET =
      'phase4c-test-only-csrf-secret-at-least-32-characters';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    const passwordHash = app.get(PasswordHashService);

    await cleanup();
    await prisma.client.user.create({
      data: {
        username: TEST_USERNAME,
        passwordHash: await passwordHash.hashPassword(TEST_PASSWORD),
        role: UserRole.ADMIN,
      },
    });
    const product = await prisma.client.productModel.create({
      data: {
        code: PRODUCT_CODE,
        name: 'Phase 4C Synthetic Model',
        description: 'Isolated fictional search fixture.',
      },
    });
    await prisma.client.traceableUnit.createMany({
      data: [
        {
          traceCode: 'PHASE4C-EXACT',
          unitType: 'PACK',
          productModelId: product.id,
        },
        {
          traceCode: 'PHASE4C-EXACT-CHILD',
          unitType: 'PACK',
          productModelId: product.id,
        },
        { traceCode: 'PHASE4C-MODULE', unitType: 'MODULE' },
        { traceCode: 'PHASE4C-CELL', unitType: 'CELL' },
        { traceCode: 'PHASE4C-COMPONENT', unitType: 'COMPONENT' },
        { traceCode: 'PHASE4C-MATERIAL', unitType: 'MATERIAL' },
      ],
    });
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    if (originalEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnvironment;
    if (originalFrontendOrigin === undefined)
      delete process.env.FRONTEND_ORIGIN;
    else process.env.FRONTEND_ORIGIN = originalFrontendOrigin;
    if (originalCsrfSecret === undefined) delete process.env.AUTH_CSRF_SECRET;
    else process.env.AUTH_CSRF_SECRET = originalCsrfSecret;
  });

  async function cleanup() {
    await prisma?.client.session.deleteMany({
      where: { user: { username: TEST_USERNAME } },
    });
    await prisma?.client.user.deleteMany({ where: { username: TEST_USERNAME } });
    await prisma?.client.traceableUnit.deleteMany({
      where: { traceCode: { startsWith: TRACE_PREFIX } },
    });
    await prisma?.client.productModel.deleteMany({
      where: { code: PRODUCT_CODE },
    });
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

  it('declares traceability:view and preserves the role policy', () => {
    const handler = Object.getOwnPropertyDescriptor(
      TraceabilityController.prototype,
      'search',
    )?.value as object;
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, handler)).toEqual([
      Permission.TraceabilityView,
    ]);
    expect(
      Object.values(UserRole).every((role) =>
        ROLE_PERMISSIONS[role].includes(Permission.TraceabilityView),
      ),
    ).toBe(true);
  });

  it('rejects unauthenticated requests', async () => {
    await request(app.getHttpServer()).get('/traceability').expect(401, {
      code: 'UNAUTHENTICATED',
      message: 'Authentication required.',
    });
  });

  it('normalizes an exact search and ranks it before prefix matches', async () => {
    const response = await (await agent())
      .get('/traceability')
      .query({ query: '  phase4c-exact  ' })
      .expect(200);
    expect(response.body.items.map((item: { traceCode: string }) => item.traceCode)).toEqual([
      'PHASE4C-EXACT',
      'PHASE4C-EXACT-CHILD',
    ]);
    expect(response.body.items.map((item: { match: string }) => item.match)).toEqual([
      'EXACT',
      'PREFIX',
    ]);
  });

  it('uses prefix matching and never arbitrary substring matching', async () => {
    const authenticated = await agent();
    const prefix = await authenticated
      .get('/traceability')
      .query({ query: 'phase4c-c' })
      .expect(200);
    expect(prefix.body.items.map((item: { traceCode: string }) => item.traceCode)).toEqual([
      'PHASE4C-CELL',
      'PHASE4C-COMPONENT',
    ]);
    const substring = await authenticated
      .get('/traceability')
      .query({ query: 'EXACT-CHILD' })
      .expect(200);
    expect(substring.body.items).toEqual([]);
    expect(substring.body.page.totalItems).toBe(0);
  });

  it('supports unit type and direct product-model filters', async () => {
    const authenticated = await agent();
    const cells = await authenticated
      .get('/traceability')
      .query({ query: 'phase4c-', unitType: 'cell' })
      .expect(200);
    expect(cells.body.items.map((item: { traceCode: string }) => item.traceCode)).toEqual([
      'PHASE4C-CELL',
    ]);

    const product = await authenticated
      .get('/traceability')
      .query({ productModel: 'phase4c_model', query: 'phase4c-' })
      .expect(200);
    expect(product.body.items).toHaveLength(2);
    expect(
      product.body.items.every(
        (item: { unitType: string; productModel: { code: string } }) =>
          item.unitType === 'PACK' && item.productModel.code === PRODUCT_CODE,
      ),
    ).toBe(true);

    const impossibleCombination = await authenticated
      .get('/traceability')
      .query({ productModel: PRODUCT_CODE, unitType: 'MODULE' })
      .expect(200);
    expect(impossibleCombination.body.items).toEqual([]);
  });

  it('supports browse mode with default deterministic pagination', async () => {
    const authenticated = await agent();
    const first = await authenticated.get('/traceability').expect(200);
    const second = await authenticated.get('/traceability').expect(200);
    expect(first.body.page).toMatchObject({ number: 1, size: 25 });
    expect(first.body.items).toEqual(second.body.items);
    const codes = first.body.items.map((item: { traceCode: string }) => item.traceCode);
    expect(codes).toEqual(
      [...codes].sort((left: string, right: string) =>
        left.localeCompare(right),
      ),
    );
    expect(first.body.items.every((item: { match: null }) => item.match === null)).toBe(true);
  });

  it('supports bounded custom pagination and pages beyond the end', async () => {
    const authenticated = await agent();
    const page = await authenticated
      .get('/traceability')
      .query({ query: 'phase4c-', page: 2, pageSize: 2 })
      .expect(200);
    expect(page.body.page).toEqual({
      number: 2,
      size: 2,
      totalItems: 6,
      totalPages: 3,
    });
    expect(page.body.items).toHaveLength(2);

    const maximum = await authenticated
      .get('/traceability')
      .query({ query: 'phase4c-', pageSize: 100 })
      .expect(200);
    expect(maximum.body.page.size).toBe(100);

    const pastEnd = await authenticated
      .get('/traceability')
      .query({ query: 'phase4c-', page: 4, pageSize: 2 })
      .expect(200);
    expect(pastEnd.body.items).toEqual([]);
    expect(pastEnd.body.page).toEqual({
      number: 4,
      size: 2,
      totalItems: 6,
      totalPages: 3,
    });
  });

  it.each([
    [{ unitType: 'ASSEMBLY' }, 'unitType'],
    [{ productModel: 'bad model' }, 'productModel'],
    [{ page: 0 }, 'page'],
    [{ pageSize: 101 }, 'pageSize'],
  ])('rejects invalid filters or pagination %#', async (query, field) => {
    const response = await (await agent())
      .get('/traceability')
      .query(query)
      .expect(400);
    expect(response.body).toMatchObject({
      code: 'INVALID_REQUEST',
      message: 'The request is invalid.',
      details: [{ field }],
    });
  });

  it('returns no matches and no internal identifiers', async () => {
    const response = await (await agent())
      .get('/traceability')
      .query({ query: 'PHASE4C-NOT-FOUND' })
      .expect(200);
    expect(response.body.items).toEqual([]);
    expect(response.body.page.totalItems).toBe(0);

    const found = await (await agent())
      .get('/traceability')
      .query({ query: 'PHASE4C-EXACT' })
      .expect(200);
    const serialized = JSON.stringify(found.body);
    for (const field of ['"id"', 'productModelId', 'traceableUnitId'])
      expect(serialized).not.toContain(field);
  });
});
