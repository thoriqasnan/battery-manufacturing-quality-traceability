import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { IS_PUBLIC_KEY } from './auth.metadata.js';
import { readSessionCookie } from './session-cookie.js';
import { SessionService } from './session.service.js';

@Injectable()
export class AuthenticatedSessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readSessionCookie(request);
    const session = token ? await this.sessions.resolveSession(token) : null;

    if (!session) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Authentication required.',
      });
    }

    request.authenticatedActor = session.user;
    request.authenticatedSession = {
      id: session.id,
      expiresAt: session.expiresAt,
    };
    return true;
  }
}
