import type { Request } from 'express';
import type { AuthenticatedUserIdentity } from './authentication.types.js';

export type AuthenticatedRequest = Request & {
  authenticatedActor?: AuthenticatedUserIdentity;
  authenticatedSession?: {
    id: string;
    expiresAt: Date;
  };
};
