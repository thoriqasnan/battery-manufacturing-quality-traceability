import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import {
  REQUIRED_PERMISSIONS_KEY,
} from '../src/auth/auth.metadata.js';
import { PasswordHashService } from '../src/auth/password-hash.service.js';
import { Permission } from '../src/auth/permissions.js';
import { ROLE_PERMISSIONS } from '../src/auth/role-permissions.js';
import { DashboardController } from '../src/dashboard/dashboard.controller.js';
import { UserRole } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const FRONTEND_ORIGIN = 'http://localhost:3000';
const TEST_USERNAME = 'phase4b.dashboard.admin';
const TEST_PASSWORD = 'fictional-dashboard-passphrase';

describe('Phase 4B dashboard overview (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const originalEnvironment = process.env.NODE_ENV;
  const originalFrontendOrigin = process.env.FRONTEND_ORIGIN;
  const originalCsrfSecret = process.env.AUTH_CSRF_SECRET;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.FRONTEND_ORIGIN = FRONTEND_ORIGIN;
    process.env.AUTH_CSRF_SECRET =
      'phase4b-test-only-csrf-secret-at-least-32-characters';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    const passwordHash = app.get(PasswordHashService);
    await prisma.client.session.deleteMany({
      where: { user: { username: TEST_USERNAME } },
    });
    await prisma.client.user.deleteMany({ where: { username: TEST_USERNAME } });
    await prisma.client.user.create({
      data: {
        username: TEST_USERNAME,
        passwordHash: await passwordHash.hashPassword(TEST_PASSWORD),
        role: UserRole.ADMIN,
      },
    });
  });

  afterAll(async () => {
    await prisma.client.session.deleteMany({
      where: { user: { username: TEST_USERNAME } },
    });
    await prisma.client.user.deleteMany({ where: { username: TEST_USERNAME } });
    await app.close();

    if (originalEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnvironment;
    if (originalFrontendOrigin === undefined)
      delete process.env.FRONTEND_ORIGIN;
    else process.env.FRONTEND_ORIGIN = originalFrontendOrigin;
    if (originalCsrfSecret === undefined) delete process.env.AUTH_CSRF_SECRET;
    else process.env.AUTH_CSRF_SECRET = originalCsrfSecret;
  });

  async function authenticatedAgent() {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/login')
      .set('Origin', FRONTEND_ORIGIN)
      .send({ username: TEST_USERNAME, password: TEST_PASSWORD })
      .expect(200);
    return agent;
  }

  it('declares dashboard:view and preserves the authoritative role matrix', () => {
    const overviewHandler = Object.getOwnPropertyDescriptor(
      DashboardController.prototype,
      'overview',
    )?.value as object;
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, overviewHandler),
    ).toEqual([Permission.DashboardView]);
    expect(
      Object.values(UserRole).every((role) =>
        ROLE_PERMISSIONS[role].includes(Permission.DashboardView),
      ),
    ).toBe(true);
  });

  it('rejects an unauthenticated overview request', async () => {
    await request(app.getHttpServer()).get('/dashboard/overview').expect(401, {
      code: 'UNAUTHENTICATED',
      message: 'Authentication required.',
    });
  });

  it('returns database-derived seed evidence without internal fields', async () => {
    const agent = await authenticatedAgent();
    const first = await agent.get('/dashboard/overview').expect(200);
    const second = await agent.get('/dashboard/overview').expect(200);

    expect(first.body.inventory).toEqual({
      totalUnits: 16,
      byType: [
        { unitType: 'PACK', count: 3 },
        { unitType: 'MODULE', count: 3 },
        { unitType: 'CELL', count: 6 },
        { unitType: 'COMPONENT', count: 3 },
        { unitType: 'MATERIAL', count: 1 },
      ],
    });
    expect(first.body.productModels).toEqual([
      { code: 'DEMO_ALPHA', name: 'Demo Alpha Product', packCount: 2 },
      { code: 'DEMO_BETA', name: 'Demo Beta Product', packCount: 1 },
    ]);
    expect(first.body.process.inProgressCount).toBe(0);
    expect(first.body.process.recentLimit).toBe(10);
    expect(first.body.process.recent).toHaveLength(10);
    expect(first.body.process.recent).toEqual(second.body.process.recent);
    expect(
      first.body.process.recent.map((item: { startedAt: string }) =>
        Date.parse(item.startedAt),
      ),
    ).toEqual(
      [...first.body.process.recent]
        .map((item: { startedAt: string }) => Date.parse(item.startedAt))
        .sort((a: number, b: number) => b - a),
    );
    expect(first.body.quality).toEqual({
      scope: { mode: 'ALL_RECORDS', from: null, to: null },
      inspectionCount: 8,
      byOutcome: [
        { outcome: 'PASS', count: 6 },
        { outcome: 'NG', count: 2 },
      ],
      available: true,
    });
    expect(first.body.nonconformance).toEqual({
      openCount: 0,
      inProgressCount: 0,
    });

    const serialized = JSON.stringify(first.body);
    for (const privateField of [
      'passwordHash',
      'tokenDigest',
      'session',
      'traceableUnitId',
      'processDefinitionId',
      'productModelId',
    ]) {
      expect(serialized).not.toContain(privateField);
    }
    expect(first.body.process.recent[0]).not.toHaveProperty('id');
  });
});
