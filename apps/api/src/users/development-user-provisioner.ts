import type { UserRole } from '../generated/prisma/enums.js';
import { PasswordHashService } from '../auth/password-hash.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type DevelopmentUserDefinition = {
  username: string;
  role: UserRole;
};

export type ProvisionedDevelopmentUser = DevelopmentUserDefinition & {
  status: 'created' | 'updated';
};

export async function provisionDevelopmentUsers(
  prisma: PrismaService,
  passwordHash: PasswordHashService,
  password: string,
  environment: string | undefined,
  definitions: readonly DevelopmentUserDefinition[],
): Promise<ProvisionedDevelopmentUser[]> {
  if (environment === 'production') {
    throw new Error('Development user provisioning is disabled in production.');
  }

  const prepared = await Promise.all(
    definitions.map(async (definition) => ({
      ...definition,
      passwordHash: await passwordHash.hashPassword(password),
    })),
  );

  return prisma.client.$transaction(async (transaction) => {
    const results: ProvisionedDevelopmentUser[] = [];

    for (const definition of prepared) {
      const existing = await transaction.user.findUnique({
        where: { username: definition.username },
        select: { id: true },
      });
      const user = await transaction.user.upsert({
        where: { username: definition.username },
        create: {
          username: definition.username,
          passwordHash: definition.passwordHash,
          role: definition.role,
          isActive: true,
        },
        update: {
          passwordHash: definition.passwordHash,
          role: definition.role,
          isActive: true,
        },
        select: { id: true },
      });

      await transaction.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      results.push({
        username: definition.username,
        role: definition.role,
        status: existing ? 'updated' : 'created',
      });
    }

    return results;
  });
}
