import { Body, Controller, Get, INestApplication, Post } from '@nestjs/common';
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
import { UserRole } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const FRONTEND_ORIGIN = 'http://localhost:3000';
const TEST_USERNAME_PREFIX = 'phase3e.authorization.';
const TEST_PASSWORD = 'fictional-authorization-passphrase';

@Controller('__test/rbac')
class AuthorizationTestController {
  @Get('traceability')
  @RequirePermissions(Permission.TraceabilityView)
  traceability(@AuthenticatedActor() actor: AuthenticatedUserIdentity) {
    return { actor };
  }

  @Post('manufacturing')
  @RequirePermissions(Permission.ManufacturingRecord)
  manufacturing(
    @AuthenticatedActor() actor: AuthenticatedUserIdentity,
    @Body() body: unknown,
  ) {
    return { actor, bodyAccepted: body !== undefined };
  }

  @Get('users')
  @RequirePermissions(Permission.UsersManage)
  users(@AuthenticatedActor() actor: AuthenticatedUserIdentity) {
    return { actor };
  }

  @Get('default-deny')
  defaultDeny() {
    return { unexpected: true };
  }
}

describe('Phase 3E backend authorization (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let passwordHash: PasswordHashService;
  let sessionTokens: SessionTokenService;
  const originalEnvironment = process.env.NODE_ENV;
  const originalFrontendOrigin = process.env.FRONTEND_ORIGIN;
  const originalCsrfSecret = process.env.AUTH_CSRF_SECRET;

  const usernameFor = (role: UserRole) =>
    `${TEST_USERNAME_PREFIX}${role.toLowerCase()}`;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.FRONTEND_ORIGIN = FRONTEND_ORIGIN;
    process.env.AUTH_CSRF_SECRET =
      'phase3e-test-only-csrf-secret-at-least-32-characters';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [AuthorizationTestController],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    passwordHash = app.get(PasswordHashService);
    sessionTokens = app.get(SessionTokenService);

    await prisma.client.session.deleteMany({
      where: { user: { username: { startsWith: TEST_USERNAME_PREFIX } } },
    });
    await prisma.client.user.deleteMany({
      where: { username: { startsWith: TEST_USERNAME_PREFIX } },
    });

    const storedHash = await passwordHash.hashPassword(TEST_PASSWORD);
    await prisma.client.user.createMany({
      data: Object.values(UserRole).map((role) => ({
        username: usernameFor(role),
        passwordHash: storedHash,
        role,
      })),
    });
  });

  afterAll(async () => {
    await prisma.client.session.deleteMany({
      where: { user: { username: { startsWith: TEST_USERNAME_PREFIX } } },
    });
    await prisma.client.user.deleteMany({
      where: { username: { startsWith: TEST_USERNAME_PREFIX } },
    });
    await app.close();

    if (originalEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnvironment;
    if (originalFrontendOrigin === undefined)
      delete process.env.FRONTEND_ORIGIN;
    else process.env.FRONTEND_ORIGIN = originalFrontendOrigin;
    if (originalCsrfSecret === undefined) delete process.env.AUTH_CSRF_SECRET;
    else process.env.AUTH_CSRF_SECRET = originalCsrfSecret;
  });

  async function login(role: UserRole) {
    const agent = request.agent(app.getHttpServer());
    const response = await agent
      .post('/auth/login')
      .set('Origin', FRONTEND_ORIGIN)
      .send({ username: usernameFor(role), password: TEST_PASSWORD })
      .expect(200);

    return {
      agent,
      response,
      csrfToken: response.body.session.csrfToken as string,
    };
  }

  it('distinguishes unauthenticated requests from forbidden users', async () => {
    await request(app.getHttpServer())
      .get('/__test/rbac/traceability')
      .expect(401, {
        code: 'UNAUTHENTICATED',
        message: 'Authentication required.',
      });

    const engineering = await login(UserRole.ENGINEERING);
    await engineering.agent.get('/__test/rbac/users').expect(403, {
      code: 'FORBIDDEN',
      message: 'Insufficient permission.',
    });
  });

  it('rejects invalid, expired, revoked, and inactive-user sessions', async () => {
    await request(app.getHttpServer())
      .get('/__test/rbac/traceability')
      .set('Cookie', `${SESSION_COOKIE_NAME}=invalid-token`)
      .expect(401);

    for (const state of ['expired', 'revoked', 'inactive'] as const) {
      const current = await login(UserRole.QUALITY);
      const setCookie = current.response.headers['set-cookie'];
      const cookieText = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      const rawToken = cookieText?.split(';', 1)[0]?.split('=', 2)[1] as string;
      const digest = sessionTokens.digestToken(rawToken);

      if (state === 'expired') {
        await prisma.client.session.update({
          where: { tokenDigest: digest },
          data: {
            createdAt: new Date(Date.now() - 2 * 60 * 60 * 1_000),
            expiresAt: new Date(Date.now() - 60 * 60 * 1_000),
          },
        });
      } else if (state === 'revoked') {
        await prisma.client.session.update({
          where: { tokenDigest: digest },
          data: { revokedAt: new Date() },
        });
      } else {
        await prisma.client.user.update({
          where: { username: usernameFor(UserRole.QUALITY) },
          data: { isActive: false },
        });
      }

      await current.agent.get('/__test/rbac/traceability').expect(401);

      if (state === 'inactive') {
        await prisma.client.user.update({
          where: { username: usernameFor(UserRole.QUALITY) },
          data: { isActive: true },
        });
      }
    }
  });

  it.each(Object.values(UserRole))(
    'allows %s to use the shared traceability permission',
    async (role) => {
      const current = await login(role);
      const response = await current.agent
        .get('/__test/rbac/traceability')
        .expect(200);

      expect(response.body.actor).toEqual({
        id: expect.any(String),
        username: usernameFor(role),
        role,
        isActive: true,
      });
      expect(response.body.actor).not.toHaveProperty('passwordHash');
      expect(response.body.actor).not.toHaveProperty('token');
      expect(response.body.actor).not.toHaveProperty('tokenDigest');
    },
  );

  it('allows PRODUCTION manufacturing mutation with CSRF and denies QUALITY', async () => {
    const production = await login(UserRole.PRODUCTION);
    await production.agent
      .post('/__test/rbac/manufacturing')
      .set('Origin', FRONTEND_ORIGIN)
      .set(CSRF_HEADER_NAME, production.csrfToken)
      .send({ role: UserRole.ADMIN })
      .expect(201);

    const quality = await login(UserRole.QUALITY);
    await quality.agent
      .post('/__test/rbac/manufacturing?role=PRODUCTION')
      .set('Origin', FRONTEND_ORIGIN)
      .set(CSRF_HEADER_NAME, quality.csrfToken)
      .set('X-Role', UserRole.PRODUCTION)
      .send({ role: UserRole.PRODUCTION })
      .expect(403, {
        code: 'FORBIDDEN',
        message: 'Insufficient permission.',
      });
  });

  it('preserves CSRF/origin checks before permission evaluation', async () => {
    const production = await login(UserRole.PRODUCTION);

    await production.agent
      .post('/__test/rbac/manufacturing')
      .set('Origin', FRONTEND_ORIGIN)
      .send({})
      .expect(403, {
        code: 'SECURITY_CHECK_FAILED',
        message: 'Request security validation failed.',
      });
    await production.agent
      .post('/__test/rbac/manufacturing')
      .set('Origin', 'https://untrusted.invalid')
      .set(CSRF_HEADER_NAME, production.csrfToken)
      .send({})
      .expect(403, {
        code: 'SECURITY_CHECK_FAILED',
        message: 'Request security validation failed.',
      });
  });

  it('grants ADMIN only explicit administration permission', async () => {
    const admin = await login(UserRole.ADMIN);
    await admin.agent.get('/__test/rbac/users').expect(200);
    await admin.agent
      .post('/__test/rbac/manufacturing')
      .set('Origin', FRONTEND_ORIGIN)
      .set(CSRF_HEADER_NAME, admin.csrfToken)
      .send({})
      .expect(403);
  });

  it('denies authenticated handlers with no explicit permission metadata', async () => {
    const quality = await login(UserRole.QUALITY);
    await quality.agent.get('/__test/rbac/default-deny').expect(403, {
      code: 'FORBIDDEN',
      message: 'Insufficient permission.',
    });
  });
});
