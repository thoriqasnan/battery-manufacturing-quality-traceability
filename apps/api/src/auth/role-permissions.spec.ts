import { UserRole } from '../generated/prisma/enums.js';
import { Permission } from './permissions.js';
import { permissionsForRole, roleHasPermissions } from './role-permissions.js';

describe('Phase 3E role permission policy', () => {
  const expected = {
    [UserRole.ADMIN]: [
      Permission.DashboardView,
      Permission.TraceabilityView,
      Permission.UsersManage,
    ],
    [UserRole.QUALITY]: [
      Permission.DashboardView,
      Permission.TraceabilityView,
      Permission.InspectionWrite,
      Permission.NonconformanceCreate,
      Permission.NonconformanceUpdate,
      Permission.VerificationPerform,
      Permission.DispositionPerform,
    ],
    [UserRole.PRODUCTION]: [
      Permission.DashboardView,
      Permission.TraceabilityView,
      Permission.ManufacturingRecord,
      Permission.NonconformanceCreate,
    ],
    [UserRole.ENGINEERING]: [
      Permission.DashboardView,
      Permission.TraceabilityView,
      Permission.EngineeringActionPerform,
      Permission.InspectionSpecificationManage,
    ],
  } as const;

  it.each(Object.values(UserRole))(
    'maps %s to its complete explicit permission bundle',
    (role) => {
      expect(permissionsForRole(role)).toEqual(expected[role]);
    },
  );

  it('does not treat ADMIN as a domain superuser', () => {
    expect(roleHasPermissions(UserRole.ADMIN, [Permission.UsersManage])).toBe(
      true,
    );
    expect(
      roleHasPermissions(UserRole.ADMIN, [Permission.ManufacturingRecord]),
    ).toBe(false);
    expect(
      roleHasPermissions(UserRole.ADMIN, [Permission.InspectionWrite]),
    ).toBe(false);
    expect(
      roleHasPermissions(UserRole.ADMIN, [
        Permission.InspectionSpecificationManage,
      ]),
    ).toBe(false);
    expect(
      roleHasPermissions(UserRole.QUALITY, [
        Permission.InspectionSpecificationManage,
      ]),
    ).toBe(false);
    expect(
      roleHasPermissions(UserRole.ENGINEERING, [
        Permission.InspectionSpecificationManage,
      ]),
    ).toBe(true);
  });

  it('requires every permission declared by a policy boundary', () => {
    expect(
      roleHasPermissions(UserRole.QUALITY, [
        Permission.TraceabilityView,
        Permission.VerificationPerform,
      ]),
    ).toBe(true);
    expect(
      roleHasPermissions(UserRole.PRODUCTION, [
        Permission.TraceabilityView,
        Permission.VerificationPerform,
      ]),
    ).toBe(false);
  });
});
