import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedUserIdentity } from './authentication.types.js';
import { InvalidCredentialsError } from './invalid-credentials.error.js';
import { PasswordHashService } from './password-hash.service.js';

@Injectable()
export class AuthenticationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHash: PasswordHashService,
  ) {}

  async authenticateCredentials(
    username: string,
    plaintextPassword: string,
  ): Promise<AuthenticatedUserIdentity> {
    const normalizedUsername = username.trim().toLowerCase();
    const user = await this.prisma.client.user.findUnique({
      where: { username: normalizedUsername },
      select: {
        id: true,
        username: true,
        passwordHash: true,
        role: true,
        isActive: true,
      },
    });

    if (!user) {
      await this.passwordHash.verifyAgainstDummyHash(plaintextPassword);
      throw new InvalidCredentialsError();
    }

    const passwordMatches = await this.passwordHash.verifyPassword(
      user.passwordHash,
      plaintextPassword,
    );

    if (!passwordMatches || !user.isActive) {
      throw new InvalidCredentialsError();
    }

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      isActive: true,
    };
  }
}
