import { Injectable } from '@nestjs/common';
import type { UserRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SESSION_LIFETIME_MS } from './session-cookie.js';
import { SessionTokenService } from './session-token.service.js';

export type ResolvedSession = {
  id: string;
  expiresAt: Date;
  user: {
    id: string;
    username: string;
    role: UserRole;
    isActive: true;
  };
};

export type CreatedSession = ResolvedSession & {
  token: string;
};

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionTokens: SessionTokenService,
  ) {}

  async createSession(userId: string): Promise<CreatedSession | null> {
    const user = await this.prisma.client.user.findFirst({
      where: { id: userId, isActive: true },
      select: { id: true, username: true, role: true, isActive: true },
    });

    if (!user) {
      return null;
    }

    const token = this.sessionTokens.generateToken();
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
    const session = await this.prisma.client.session.create({
      data: {
        userId,
        tokenDigest: this.sessionTokens.digestToken(token),
        expiresAt,
      },
      select: { id: true, expiresAt: true },
    });

    return {
      ...session,
      token,
      user: { ...user, isActive: true },
    };
  }

  async resolveSession(token: string): Promise<ResolvedSession | null> {
    const session = await this.prisma.client.session.findUnique({
      where: { tokenDigest: this.sessionTokens.digestToken(token) },
      select: {
        id: true,
        expiresAt: true,
        revokedAt: true,
        user: {
          select: { id: true, username: true, role: true, isActive: true },
        },
      },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now() ||
      !session.user.isActive
    ) {
      return null;
    }

    return {
      id: session.id,
      expiresAt: session.expiresAt,
      user: { ...session.user, isActive: true },
    };
  }

  async revokeSession(token: string): Promise<void> {
    await this.prisma.client.session.updateMany({
      where: {
        tokenDigest: this.sessionTokens.digestToken(token),
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }
}
