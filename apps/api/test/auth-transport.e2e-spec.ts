import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { UserRole } from '../src/generated/prisma/enums.js';
import { PasswordHashService } from '../src/auth/password-hash.service.js';
import { CSRF_HEADER_NAME, CsrfService } from '../src/auth/csrf.service.js';
import { SESSION_COOKIE_NAME } from '../src/auth/session-cookie.js';
import { SessionTokenService } from '../src/auth/session-token.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const FRONTEND_ORIGIN = 'http://localhost:3000';
const TEST_USERNAME_PREFIX = 'phase3d.transport.';
const ACTIVE_USERNAME = `${TEST_USERNAME_PREFIX}active`;
const INACTIVE_USERNAME = `${TEST_USERNAME_PREFIX}inactive`;
const TEST_PASSWORD = 'fictional-session-passphrase';

function rawTokenFrom(response: request.Response): string {
  const setCookieHeader = response.headers['set-cookie'];
  const cookies = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : setCookieHeader
      ? [setCookieHeader]
      : [];
  const sessionCookie = cookies.find((value: string) =>
    value.startsWith(`${SESSION_COOKIE_NAME}=`),
  );
  const token = sessionCookie?.split(';', 1)[0]?.split('=', 2)[1];

  if (!token) {
    throw new Error('Expected a session cookie in the test response.');
  }

  return token;
}

describe('Phase 3D authentication transport (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let passwordHash: PasswordHashService;
  let sessionTokens: SessionTokenService;
  let csrf: CsrfService;
  let activeUserId: string;
  const originalEnvironment = process.env.NODE_ENV;
  const originalFrontendOrigin = process.env.FRONTEND_ORIGIN;
  const originalCsrfSecret = process.env.AUTH_CSRF_SECRET;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.FRONTEND_ORIGIN = FRONTEND_ORIGIN;
    process.env.AUTH_CSRF_SECRET =
      'phase3d-test-only-csrf-secret-at-least-32-characters';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    passwordHash = app.get(PasswordHashService);
    sessionTokens = app.get(SessionTokenService);
    csrf = app.get(CsrfService);

    await prisma.client.session.deleteMany({
      where: { user: { username: { startsWith: TEST_USERNAME_PREFIX } } },
    });
    await prisma.client.user.deleteMany({
      where: { username: { startsWith: TEST_USERNAME_PREFIX } },
    });

    const storedHash = await passwordHash.hashPassword(TEST_PASSWORD);
    const active = await prisma.client.user.create({
      data: {
        username: ACTIVE_USERNAME,
        passwordHash: storedHash,
        role: UserRole.QUALITY,
      },
    });
    activeUserId = active.id;
    await prisma.client.user.create({
      data: {
        username: INACTIVE_USERNAME,
        passwordHash: storedHash,
        role: UserRole.PRODUCTION,
        isActive: false,
      },
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

  async function login(agent = request.agent(app.getHttpServer())) {
    const response = await agent
      .post('/auth/login')
      .set('Origin', FRONTEND_ORIGIN)
      .send({ username: ACTIVE_USERNAME, password: TEST_PASSWORD })
      .expect(200);

    return { agent, response, rawToken: rawTokenFrom(response) };
  }

  it('creates a digest-backed session and returns a safe contract', async () => {
    const { response, rawToken } = await login();
    const stored = await prisma.client.session.findUnique({
      where: { tokenDigest: sessionTokens.digestToken(rawToken) },
    });
    const setCookieHeader = response.headers['set-cookie'];
    const setCookie = Array.isArray(setCookieHeader)
      ? (setCookieHeader[0] ?? '')
      : (setCookieHeader ?? '');

    expect(stored).not.toBeNull();
    expect(stored?.tokenDigest).not.toBe(rawToken);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('Max-Age=');
    expect(setCookie).not.toContain('Domain=');
    expect(response.body.user).toMatchObject({
      username: ACTIVE_USERNAME,
      role: UserRole.QUALITY,
      isActive: true,
    });
    expect(response.body.user).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(response.body)).not.toContain(rawToken);
    expect(response.body.session.csrfToken).toBe(csrf.issueToken(stored!.id));
  });

  it('does not create sessions for invalid credentials or inactive users', async () => {
    const sessionScope = {
      user: { username: { startsWith: TEST_USERNAME_PREFIX } },
    } as const;
    const before = await prisma.client.session.count({ where: sessionScope });
    const invalid = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', FRONTEND_ORIGIN)
      .send({ username: ACTIVE_USERNAME, password: 'fictional-wrong-password' })
      .expect(401);
    const inactive = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', FRONTEND_ORIGIN)
      .send({ username: INACTIVE_USERNAME, password: TEST_PASSWORD })
      .expect(401);

    expect(invalid.body).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(inactive.body).toEqual(invalid.body);
    expect(await prisma.client.session.count({ where: sessionScope })).toBe(
      before,
    );
  });

  it('rejects login from an untrusted origin', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', 'https://untrusted.invalid')
      .send({ username: ACTIVE_USERNAME, password: TEST_PASSWORD })
      .expect(403, {
        code: 'SECURITY_CHECK_FAILED',
        message: 'Request security validation failed.',
      });
  });

  it('resolves a valid current session and rejects missing or invalid cookies', async () => {
    const { agent } = await login();
    const current = await agent.get('/auth/session').expect(200);

    expect(current.body.user.username).toBe(ACTIVE_USERNAME);
    expect(current.body.user).not.toHaveProperty('passwordHash');
    await request(app.getHttpServer()).get('/auth/session').expect(401);
    await request(app.getHttpServer())
      .get('/auth/session')
      .set('Cookie', `${SESSION_COOKIE_NAME}=invalid-token`)
      .expect(401);
  });

  it('rejects expired and revoked sessions', async () => {
    const expired = await login();
    await prisma.client.session.update({
      where: { tokenDigest: sessionTokens.digestToken(expired.rawToken) },
      data: {
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1_000),
        expiresAt: new Date(Date.now() - 60 * 60 * 1_000),
      },
    });
    await expired.agent.get('/auth/session').expect(401);

    const revoked = await login();
    await prisma.client.session.update({
      where: { tokenDigest: sessionTokens.digestToken(revoked.rawToken) },
      data: { revokedAt: new Date() },
    });
    await revoked.agent.get('/auth/session').expect(401);
  });

  it('invalidates an otherwise valid session when the user is inactive', async () => {
    const current = await login();
    await prisma.client.user.update({
      where: { id: activeUserId },
      data: { isActive: false },
    });

    await current.agent.get('/auth/session').expect(401);

    await prisma.client.user.update({
      where: { id: activeUserId },
      data: { isActive: true },
    });
  });

  it('requires the session-bound CSRF token and allowed origin for logout', async () => {
    const missing = await login();
    await missing.agent
      .post('/auth/logout')
      .set('Origin', FRONTEND_ORIGIN)
      .expect(403);

    const wrongToken = await login();
    await wrongToken.agent
      .post('/auth/logout')
      .set('Origin', FRONTEND_ORIGIN)
      .set(CSRF_HEADER_NAME, 'wrong-token')
      .expect(403);

    const wrongOrigin = await login();
    await wrongOrigin.agent
      .post('/auth/logout')
      .set('Origin', 'https://untrusted.invalid')
      .set(CSRF_HEADER_NAME, wrongOrigin.response.body.session.csrfToken)
      .expect(403);
  });

  it('rejects a CSRF token issued for another session', async () => {
    const first = await login();
    const second = await login();

    await second.agent
      .post('/auth/logout')
      .set('Origin', FRONTEND_ORIGIN)
      .set(CSRF_HEADER_NAME, first.response.body.session.csrfToken)
      .expect(403);
  });

  it('revokes on logout, clears the cookie, and permits repeated logout', async () => {
    const current = await login();
    const csrfToken = current.response.body.session.csrfToken as string;
    const logout = await current.agent
      .post('/auth/logout')
      .set('Origin', FRONTEND_ORIGIN)
      .set(CSRF_HEADER_NAME, csrfToken)
      .expect(204);

    expect(String(logout.headers['set-cookie'])).toContain(
      `${SESSION_COOKIE_NAME}=;`,
    );
    await current.agent.get('/auth/session').expect(401);
    const stored = await prisma.client.session.findUnique({
      where: { tokenDigest: sessionTokens.digestToken(current.rawToken) },
    });
    expect(stored?.revokedAt).not.toBeNull();

    await current.agent
      .post('/auth/logout')
      .set('Origin', FRONTEND_ORIGIN)
      .expect(204);
  });
});
