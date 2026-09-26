import { SetMetadata } from '@nestjs/common';
import type { Permission } from './permissions.js';

export const IS_PUBLIC_KEY = 'auth:is-public';
export const REQUIRED_PERMISSIONS_KEY = 'auth:required-permissions';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
