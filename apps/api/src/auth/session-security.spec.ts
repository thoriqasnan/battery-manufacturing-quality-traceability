import { CsrfService } from './csrf.service.js';
import {
  buildSessionCookieOptions,
  clearSessionCookie,
  SESSION_COOKIE_NAME,
  SESSION_LIFETIME_MS,
} from './session-cookie.js';
import {
  SESSION_TOKEN_BYTES,
  SessionTokenService,
} from './session-token.service.js';

describe('session transport security primitives', () => {
  const originalCsrfSecret = process.env.AUTH_CSRF_SECRET;

  beforeAll(() => {
    process.env.AUTH_CSRF_SECRET =
      'phase3d-test-only-csrf-secret-at-least-32-characters';
  });

  afterAll(() => {
    if (originalCsrfSecret === undefined) {
      delete process.env.AUTH_CSRF_SECRET;
    } else {
      process.env.AUTH_CSRF_SECRET = originalCsrfSecret;
    }
  });

  it('generates independent opaque tokens and stable lookup digests', () => {
    const service = new SessionTokenService();
    const first = service.generateToken();
    const second = service.generateToken();

    expect(SESSION_TOKEN_BYTES).toBe(32);
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
    expect(service.digestToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(service.digestToken(first)).toBe(service.digestToken(first));
    expect(service.digestToken(second)).not.toBe(service.digestToken(first));
  });

  it('binds CSRF tokens to one session', () => {
    const service = new CsrfService();
    const firstToken = service.issueToken('session-one');

    expect(service.isValid('session-one', firstToken)).toBe(true);
    expect(service.isValid('session-two', firstToken)).toBe(false);
    expect(service.isValid('session-one', 'wrong-token')).toBe(false);
    expect(service.isValid('session-one', undefined)).toBe(false);
  });

  it('uses host-only secure production cookie options', () => {
    const expires = new Date(Date.now() + SESSION_LIFETIME_MS);
    const options = buildSessionCookieOptions('production', expires);

    expect(options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      expires,
    });
    expect(options.maxAge).toBeGreaterThan(0);
    expect(options).not.toHaveProperty('domain');
  });

  it('uses a non-secure local cookie and clears it with matching scope', () => {
    const expires = new Date(Date.now() + SESSION_LIFETIME_MS);
    const options = buildSessionCookieOptions('development', expires);
    const clearCookie = vi.fn();
    const originalEnvironment = process.env.NODE_ENV;

    expect(options).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      expires,
    });
    expect(options).not.toHaveProperty('domain');

    process.env.NODE_ENV = 'production';
    try {
      clearSessionCookie({ clearCookie } as never);
    } finally {
      if (originalEnvironment === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalEnvironment;
    }

    expect(clearCookie).toHaveBeenCalledWith(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });
  });
});
