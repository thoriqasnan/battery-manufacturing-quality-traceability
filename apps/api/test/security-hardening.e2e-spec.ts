import { Controller, Get, INestApplication, Post } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AuthenticatedActor } from '../src/auth/authenticated-actor.decorator.js';
import type { AuthenticatedUserIdentity } from '../src/auth/authentication.types.js';
import { RequirePermissions } from '../src/auth/auth.metadata.js';
import { CSRF_HEADER_NAME } from '../src/auth/csrf.service.js';
import { PasswordHashService } from '../src/auth/password-hash.service.js';
import { Permission } from '../src/auth/permissions.js';
import { SESSION_COOKIE_NAME } from '../src/auth/session-cookie.js';
import { SessionTokenService } from '../src/auth/session-token.service.js';
import { SECURITY_HEADERS } from '../src/config/security-headers.middleware.js';
import { UserRole } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const FRONTEND_ORIGIN = 'http://localhost:3000';
const TEST_USERNAME = 'phase3h.lifecycle.quality';
const TEST_PASSWORD = 'fictional-lifecycle-passphrase';

@Controller('__test/security-lifecycle')
class SecurityLifecycleController {
  @Get('read')
  @RequirePermissions(Permission.TraceabilityView)
  read(@AuthenticatedActor() actor: AuthenticatedUserIdentity) {
    return { username: actor.username };
  }

  @Post('write')
  @RequirePermissions(Permission.InspectionWrite)
  write() {
    return { accepted: true };
  }
}

function rawSessionToken(response: request.Response): string {
  const values = response.headers['set-cookie'];
  const cookies = Array.isArray(values) ? values : values ? [values] : [];
  const cookie = cookies.find((value: string) =>
    value.startsWith(`${SESSION_COOKIE_NAME}=`),
  );
  const token = cookie?.split(';', 1)[0]?.split('=', 2)[1];
  if (!token) throw new Error('Expected the session cookie.');
  return token;
}

describe('Phase 3H security integration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let passwordHash: PasswordHashService;
  let sessionTokens: SessionTokenService;
  const originalEnvironment = process.env.NODE_ENV;
  const originalFrontendOrigin = process.env.FRONTEND_ORIGIN;
  const originalCsrfSecret = process.env.AUTH_CSRF_SECRET;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.FRONTEND_ORIGIN = FRONTEND_ORIGIN;
    process.env.AUTH_CSRF_SECRET =
      'phase3h-test-only-csrf-secret-at-least-32-characters';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [SecurityLifecycleController],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    passwordHash = app.get(PasswordHashService);
    sessionTokens = app.get(SessionTokenService);
    await prisma.client.session.deleteMany({
      where: { user: { username: TEST_USERNAME } },
    });
    await prisma.client.user.deleteMany({ where: { username: TEST_USERNAME } });
    await prisma.client.user.create({
      data: {
        username: TEST_USERNAME,
        passwordHash: await passwordHash.hashPassword(TEST_PASSWORD),
        role: UserRole.QUALITY,
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
    if (originalFrontendOrigin === undefined) delete process.env.FRONTEND_ORIGIN;
    else process.env.FRONTEND_ORIGIN = originalFrontendOrigin;
    if (originalCsrfSecret === undefined) delete process.env.AUTH_CSRF_SECRET;
    else process.env.AUTH_CSRF_SECRET = originalCsrfSecret;
  });

  it('completes login, bootstrap, protected read/write, logout, and rejection', async () => {
    const agent = request.agent(app.getHttpServer());
    const login = await agent
      .post('/auth/login')
      .set('Origin', FRONTEND_ORIGIN)
      .send({ username: TEST_USERNAME, password: TEST_PASSWORD })
      .expect(200);
    const rawToken = rawSessionToken(login);
    const csrfToken = login.body.session.csrfToken as string;

    await agent.get('/auth/session').expect(200);
    await agent.get('/__test/security-lifecycle/read').expect(200, {
      username: TEST_USERNAME,
    });
    await agent
      .post('/__test/security-lifecycle/write')
      .set('Origin', FRONTEND_ORIGIN)
      .set(CSRF_HEADER_NAME, csrfToken)
      .expect(201, { accepted: true });

    await agent
      .post('/auth/logout')
      .set('Origin', FRONTEND_ORIGIN)
      .set(CSRF_HEADER_NAME, csrfToken)
      .expect(204);
    await agent.get('/auth/session').expect(401);
    await agent.get('/__test/security-lifecycle/read').expect(401);

    const stored = await prisma.client.session.findUnique({
      where: { tokenDigest: sessionTokens.digestToken(rawToken) },
    });
    expect(stored?.revokedAt).not.toBeNull();
  });

  it('issues a fresh independent session for each successful login', async () => {
    const first = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', FRONTEND_ORIGIN)
      .send({ username: TEST_USERNAME, password: TEST_PASSWORD })
      .expect(200);
    const second = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', FRONTEND_ORIGIN)
      .send({ username: TEST_USERNAME, password: TEST_PASSWORD })
      .expect(200);

    expect(rawSessionToken(first)).not.toBe(rawSessionToken(second));
    expect(first.body.session.csrfToken).not.toBe(
      second.body.session.csrfToken,
    );
  });

  it('emits the explicit API security-header baseline', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(response.headers[name.toLowerCase()]).toBe(value);
    }
  });

  it('enforces the generic login limit in production mode', async () => {
    process.env.NODE_ENV = 'production';
    try {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await request(app.getHttpServer())
          .post('/auth/login')
          .set('Origin', FRONTEND_ORIGIN)
          .send({})
          .expect(400);
      }

      await request(app.getHttpServer())
        .post('/auth/login')
        .set('Origin', FRONTEND_ORIGIN)
        .send({})
        .expect(429, {
          code: 'TOO_MANY_ATTEMPTS',
          message: 'Too many sign-in attempts. Please try again later.',
        });
    } finally {
      process.env.NODE_ENV = 'test';
    }
  });
});
