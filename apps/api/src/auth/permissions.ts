export const Permission = {
  DashboardView: 'dashboard:view',
  TraceabilityView: 'traceability:view',
  ManufacturingRecord: 'manufacturing:record',
  InspectionWrite: 'inspection:write',
  NonconformanceCreate: 'nonconformance:create',
  NonconformanceUpdate: 'nonconformance:update',
  EngineeringActionPerform: 'engineering-action:perform',
  VerificationPerform: 'verification:perform',
  DispositionPerform: 'disposition:perform',
  UsersManage: 'users:manage',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];
