import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { IS_PUBLIC_KEY, REQUIRED_PERMISSIONS_KEY } from './auth.metadata.js';
import type { Permission } from './permissions.js';
import { roleHasPermissions } from './role-permissions.js';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<Permission[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const actor = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>().authenticatedActor;

    if (
      !actor ||
      !required?.length ||
      !roleHasPermissions(actor.role, required)
    ) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Insufficient permission.',
      });
    }

    return true;
  }
}
