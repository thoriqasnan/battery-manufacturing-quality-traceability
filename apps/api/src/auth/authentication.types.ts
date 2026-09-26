import type { UserRole } from '../generated/prisma/enums.js';

export type AuthenticatedUserIdentity = {
  id: string;
  username: string;
  role: UserRole;
  isActive: true;
};
