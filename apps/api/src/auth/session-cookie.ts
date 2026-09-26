import type { CookieOptions, Request, Response } from 'express';

export const SESSION_COOKIE_NAME = 'bmqt_session';
export const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1_000;

export function buildSessionCookieOptions(
  environment: string | undefined,
  expires: Date,
): CookieOptions {
  return {
    httpOnly: true,
    secure: environment === 'production',
    sameSite: 'lax',
    path: '/',
    expires,
    maxAge: Math.max(0, expires.getTime() - Date.now()),
  };
}

export function setSessionCookie(
  response: Response,
  token: string,
  expiresAt: Date,
): void {
  response.cookie(
    SESSION_COOKIE_NAME,
    token,
    buildSessionCookieOptions(process.env.NODE_ENV, expiresAt),
  );
}

export function clearSessionCookie(response: Response): void {
  response.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

export function readSessionCookie(request: Request): string | undefined {
  const cookieHeader = request.headers.cookie;

  if (!cookieHeader) {
    return undefined;
  }

  for (const part of cookieHeader.split(';')) {
    const [name, ...valueParts] = part.trim().split('=');
    if (name === SESSION_COOKIE_NAME) {
      const value = valueParts.join('=');
      return value || undefined;
    }
  }

  return undefined;
}
