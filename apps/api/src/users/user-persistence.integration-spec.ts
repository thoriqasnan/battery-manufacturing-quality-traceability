import { UserRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';

const TEST_USERNAME_PREFIX = 'phase3b.persistence.';
const TEST_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=1$c3ludGhldGljLXRlc3Qtc2FsdA$ZmFicmljYXRlZC10ZXN0LWhhc2gtbm90LWEtY3JlZGVudGlhbA';

describe('Phase 3B user and role persistence', () => {
  const prisma = new PrismaService();

  beforeEach(async () => {
    await prisma.client.user.deleteMany({
      where: { username: { startsWith: TEST_USERNAME_PREFIX } },
    });
  });

  afterAll(async () => {
    await prisma.client.user.deleteMany({
      where: { username: { startsWith: TEST_USERNAME_PREFIX } },
    });
    await prisma.onModuleDestroy();
  });

  it('persists each fixed role without a dynamic role table', async () => {
    const roles = Object.values(UserRole);

    await prisma.client.user.createMany({
      data: roles.map((role) => ({
        username: `${TEST_USERNAME_PREFIX}${role.toLowerCase()}`,
        passwordHash: TEST_PASSWORD_HASH,
        role,
      })),
    });

    const users = await prisma.client.user.findMany({
      where: { username: { startsWith: TEST_USERNAME_PREFIX } },
      orderBy: { username: 'asc' },
    });

    expect(new Set(users.map((user) => user.role))).toEqual(new Set(roles));
    expect(users).toHaveLength(4);
  });

  it('represents active and disabled users explicitly', async () => {
    const active = await prisma.client.user.create({
      data: {
        username: `${TEST_USERNAME_PREFIX}active`,
        passwordHash: TEST_PASSWORD_HASH,
        role: UserRole.PRODUCTION,
      },
    });
    const disabled = await prisma.client.user.create({
      data: {
        username: `${TEST_USERNAME_PREFIX}disabled`,
        passwordHash: TEST_PASSWORD_HASH,
        role: UserRole.QUALITY,
        isActive: false,
      },
    });

    expect(active.isActive).toBe(true);
    expect(disabled.isActive).toBe(false);
  });

  it('rejects duplicate usernames', async () => {
    const username = `${TEST_USERNAME_PREFIX}unique`;
    await prisma.client.user.create({
      data: {
        username,
        passwordHash: TEST_PASSWORD_HASH,
        role: UserRole.ADMIN,
      },
    });

    await expect(
      prisma.client.user.create({
        data: {
          username,
          passwordHash: TEST_PASSWORD_HASH,
          role: UserRole.ENGINEERING,
        },
      }),
    ).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('rejects malformed usernames and blank password hashes', async () => {
    await expect(
      prisma.client.user.create({
        data: {
          username: 'Invalid User',
          passwordHash: TEST_PASSWORD_HASH,
          role: UserRole.QUALITY,
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.client.user.create({
        data: {
          username: `${TEST_USERNAME_PREFIX}blank-hash`,
          passwordHash: '   ',
          role: UserRole.QUALITY,
        },
      }),
    ).rejects.toThrow();
  });
});
