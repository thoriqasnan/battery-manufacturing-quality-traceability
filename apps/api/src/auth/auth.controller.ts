import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  HttpException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthenticationService } from './authentication.service.js';
import { Public } from './auth.metadata.js';
import { CsrfService, CSRF_HEADER_NAME } from './csrf.service.js';
import { InvalidCredentialsError } from './invalid-credentials.error.js';
import { LoginRateLimiterService } from './login-rate-limiter.service.js';
import { OriginValidationService } from './origin-validation.service.js';
import {
  clearSessionCookie,
  readSessionCookie,
  setSessionCookie,
} from './session-cookie.js';
import { SessionService } from './session.service.js';

type LoginBody = { username: string; password: string };

const invalidRequest = () =>
  new BadRequestException({
    code: 'INVALID_REQUEST',
    message: 'A username and password are required.',
  });

const unauthenticated = () =>
  new UnauthorizedException({
    code: 'UNAUTHENTICATED',
    message: 'Authentication required.',
  });

const securityCheckFailed = () =>
  new ForbiddenException({
    code: 'SECURITY_CHECK_FAILED',
    message: 'Request security validation failed.',
  });

function parseLoginBody(body: unknown): LoginBody {
  if (
    !body ||
    typeof body !== 'object' ||
    !('username' in body) ||
    !('password' in body) ||
    typeof body.username !== 'string' ||
    typeof body.password !== 'string' ||
    body.username.length === 0 ||
    body.username.length > 128 ||
    body.password.length === 0 ||
    Array.from(body.password).length > 128
  ) {
    throw invalidRequest();
  }

  return { username: body.username, password: body.password };
}

@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authentication: AuthenticationService,
    private readonly sessions: SessionService,
    private readonly csrf: CsrfService,
    private readonly origins: OriginValidationService,
    private readonly loginRateLimiter: LoginRateLimiterService,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() rawBody: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!this.origins.isAllowed(request.headers.origin)) {
      throw securityCheckFailed();
    }

    if (
      this.loginRateLimiter.isEnabled(process.env.NODE_ENV) &&
      !this.loginRateLimiter.consume(
        request.ip || request.socket.remoteAddress || 'unknown-client',
      )
    ) {
      throw new HttpException(
        {
          code: 'TOO_MANY_ATTEMPTS',
          message: 'Too many sign-in attempts. Please try again later.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const body = parseLoginBody(rawBody);

    try {
      const identity = await this.authentication.authenticateCredentials(
        body.username,
        body.password,
      );
      const session = await this.sessions.createSession(identity.id);

      if (!session) {
        throw new InvalidCredentialsError();
      }

      setSessionCookie(response, session.token, session.expiresAt);

      return {
        user: session.user,
        session: {
          expiresAt: session.expiresAt,
          csrfToken: this.csrf.issueToken(session.id),
        },
      };
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        throw new UnauthorizedException({
          code: error.code,
          message: error.message,
        });
      }

      throw error;
    }
  }

  @Get('session')
  async currentSession(@Req() request: Request) {
    const token = readSessionCookie(request);
    const session = token ? await this.sessions.resolveSession(token) : null;

    if (!session) {
      throw unauthenticated();
    }

    return {
      user: session.user,
      session: {
        expiresAt: session.expiresAt,
        csrfToken: this.csrf.issueToken(session.id),
      },
    };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    if (!this.origins.isAllowed(request.headers.origin)) {
      throw securityCheckFailed();
    }

    const token = readSessionCookie(request);
    const session = token ? await this.sessions.resolveSession(token) : null;

    if (session) {
      const csrfHeader = request.headers[CSRF_HEADER_NAME];
      const candidate = Array.isArray(csrfHeader) ? undefined : csrfHeader;

      if (!this.csrf.isValid(session.id, candidate)) {
        throw securityCheckFailed();
      }

      await this.sessions.revokeSession(token!);
    }

    clearSessionCookie(response);
  }
}
