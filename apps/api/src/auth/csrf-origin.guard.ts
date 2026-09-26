import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { IS_PUBLIC_KEY } from './auth.metadata.js';
import { CsrfService, CSRF_HEADER_NAME } from './csrf.service.js';
import { OriginValidationService } from './origin-validation.service.js';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfOriginGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly csrf: CsrfService,
    private readonly origins: OriginValidationService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (safeMethods.has(request.method)) {
      return true;
    }

    const csrfHeader = request.headers[CSRF_HEADER_NAME];
    const candidate = Array.isArray(csrfHeader) ? undefined : csrfHeader;
    const sessionId = request.authenticatedSession?.id;

    if (
      !sessionId ||
      !this.origins.isAllowed(request.headers.origin) ||
      !this.csrf.isValid(sessionId, candidate)
    ) {
      throw new ForbiddenException({
        code: 'SECURITY_CHECK_FAILED',
        message: 'Request security validation failed.',
      });
    }

    return true;
  }
}
