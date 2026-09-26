import { UserRole } from '../generated/prisma/enums.js';
import {
  Permission,
  type Permission as PermissionValue,
} from './permissions.js';

export const ROLE_PERMISSIONS = Object.freeze({
  [UserRole.ADMIN]: Object.freeze([
    Permission.DashboardView,
    Permission.TraceabilityView,
    Permission.UsersManage,
  ]),
  [UserRole.QUALITY]: Object.freeze([
    Permission.DashboardView,
    Permission.TraceabilityView,
    Permission.InspectionWrite,
    Permission.NonconformanceCreate,
    Permission.NonconformanceUpdate,
    Permission.VerificationPerform,
    Permission.DispositionPerform,
  ]),
  [UserRole.PRODUCTION]: Object.freeze([
    Permission.DashboardView,
    Permission.TraceabilityView,
    Permission.ManufacturingRecord,
    Permission.NonconformanceCreate,
  ]),
  [UserRole.ENGINEERING]: Object.freeze([
    Permission.DashboardView,
    Permission.TraceabilityView,
    Permission.EngineeringActionPerform,
  ]),
}) satisfies Readonly<Record<UserRole, readonly PermissionValue[]>>;

export function permissionsForRole(role: UserRole): readonly PermissionValue[] {
  return ROLE_PERMISSIONS[role];
}

export function roleHasPermissions(
  role: UserRole,
  required: readonly PermissionValue[],
): boolean {
  const granted = new Set<PermissionValue>(permissionsForRole(role));
  return required.every((permission) => granted.has(permission));
}
