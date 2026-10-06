import type { UserRole } from "@/lib/api/auth";

export const Permission = {
  DashboardView: "dashboard:view",
  TraceabilityView: "traceability:view",
  ManufacturingRecord: "manufacturing:record",
  InspectionWrite: "inspection:write",
  NonconformanceCreate: "nonconformance:create",
  NonconformanceUpdate: "nonconformance:update",
  EngineeringActionPerform: "engineering-action:perform",
  VerificationPerform: "verification:perform",
  DispositionPerform: "disposition:perform",
  UsersManage: "users:manage",
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

// Mirrors the server policy for presentation only. The API remains authoritative.
export const ROLE_PERMISSIONS: Readonly<Record<UserRole, readonly Permission[]>> =
  Object.freeze({
    ADMIN: Object.freeze([
      Permission.DashboardView,
      Permission.TraceabilityView,
      Permission.UsersManage,
    ]),
    QUALITY: Object.freeze([
      Permission.DashboardView,
      Permission.TraceabilityView,
      Permission.InspectionWrite,
      Permission.NonconformanceCreate,
      Permission.NonconformanceUpdate,
      Permission.VerificationPerform,
      Permission.DispositionPerform,
    ]),
    PRODUCTION: Object.freeze([
      Permission.DashboardView,
      Permission.TraceabilityView,
      Permission.ManufacturingRecord,
      Permission.NonconformanceCreate,
    ]),
    ENGINEERING: Object.freeze([
      Permission.DashboardView,
      Permission.TraceabilityView,
      Permission.EngineeringActionPerform,
    ]),
  });

export function roleHasAnyPermission(
  role: UserRole,
  required: readonly Permission[],
): boolean {
  const granted = ROLE_PERMISSIONS[role];
  return required.some((permission) => granted.includes(permission));
}
