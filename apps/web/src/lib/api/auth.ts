import { getApiBaseUrl } from "./config";

export const userRoles = [
  "ADMIN",
  "QUALITY",
  "PRODUCTION",
  "ENGINEERING",
] as const;

export type UserRole = (typeof userRoles)[number];

export type AuthenticatedIdentity = {
  id: string;
  username: string;
  role: UserRole;
  isActive: true;
};

export type AuthSession = {
  user: AuthenticatedIdentity;
  expiresAt: string;
  csrfToken: string;
};

export type AuthErrorKind =
  | "unauthenticated"
  | "invalid-credentials"
  | "server"
  | "network"
  | "unexpected";

export class AuthApiError extends Error {
  constructor(public readonly kind: AuthErrorKind) {
    super(kind);
    this.name = "AuthApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isAuthSessionResponse(value: unknown): value is {
  user: AuthenticatedIdentity;
  session: { expiresAt: string; csrfToken: string };
} {
  if (!isRecord(value) || !isRecord(value.user) || !isRecord(value.session)) {
    return false;
  }

  return (
    typeof value.user.id === "string" &&
    typeof value.user.username === "string" &&
    userRoles.includes(value.user.role as UserRole) &&
    value.user.isActive === true &&
    typeof value.session.expiresAt === "string" &&
    !Number.isNaN(Date.parse(value.session.expiresAt)) &&
    typeof value.session.csrfToken === "string" &&
    value.session.csrfToken.length > 0
  );
}

async function parseSessionResponse(response: Response): Promise<AuthSession> {
  let value: unknown;

  try {
    value = await response.json();
  } catch {
    throw new AuthApiError("unexpected");
  }

  if (!isAuthSessionResponse(value)) {
    throw new AuthApiError("unexpected");
  }

  return {
    user: value.user,
    expiresAt: value.session.expiresAt,
    csrfToken: value.session.csrfToken,
  };
}

async function performRequest(
  path: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetch(new URL(path, getApiBaseUrl()), {
      ...init,
      credentials: "include",
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof AuthApiError) {
      throw error;
    }
    throw new AuthApiError("network");
  }
}

export async function getCurrentSession(
  signal?: AbortSignal,
): Promise<AuthSession> {
  const response = await performRequest("auth/session", {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
  });

  if (response.status === 401) {
    throw new AuthApiError("unauthenticated");
  }
  if (!response.ok) {
    throw new AuthApiError(response.status >= 500 ? "server" : "unexpected");
  }

  return parseSessionResponse(response);
}

export async function login(
  username: string,
  password: string,
): Promise<AuthSession> {
  const response = await performRequest("auth/login", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });

  if (response.status === 401) {
    throw new AuthApiError("invalid-credentials");
  }
  if (!response.ok) {
    throw new AuthApiError(response.status >= 500 ? "server" : "unexpected");
  }

  return parseSessionResponse(response);
}

export function withCsrfHeader(
  csrfToken: string,
  headers?: HeadersInit,
): Headers {
  const securedHeaders = new Headers(headers);
  securedHeaders.set("X-CSRF-Token", csrfToken);
  return securedHeaders;
}

export async function logout(csrfToken: string): Promise<void> {
  const response = await performRequest("auth/logout", {
    method: "POST",
    headers: withCsrfHeader(csrfToken, { Accept: "application/json" }),
  });

  if (response.status === 401) {
    throw new AuthApiError("unauthenticated");
  }
  if (!response.ok) {
    throw new AuthApiError(response.status >= 500 ? "server" : "unexpected");
  }
}
