import * as argon2 from 'argon2';
import { PasswordHashService } from '../auth/password-hash.service.js';
import { UserRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  type DevelopmentUserDefinition,
  provisionDevelopmentUsers,
} from './development-user-provisioner.js';

const TEST_PREFIX = 'phase3i.provision.';
const PASSWORD_ONE = 'fictional-acceptance-passphrase-one';
const PASSWORD_TWO = 'fictional-acceptance-passphrase-two';
const UNRELATED_USERNAME = 'phase3i.unrelated.fixture';
const definitions: readonly DevelopmentUserDefinition[] = [
  { username: `${TEST_PREFIX}admin`, role: UserRole.ADMIN },
  { username: `${TEST_PREFIX}quality`, role: UserRole.QUALITY },
  { username: `${TEST_PREFIX}production`, role: UserRole.PRODUCTION },
  { username: `${TEST_PREFIX}engineering`, role: UserRole.ENGINEERING },
];

describe('development acceptance-user provisioning', () => {
  const prisma = new PrismaService();
  const passwordHash = new PasswordHashService();

  beforeEach(async () => {
    await prisma.client.session.deleteMany({
      where: { user: { username: { startsWith: TEST_PREFIX } } },
    });
    await prisma.client.user.deleteMany({
      where: {
        OR: [
          { username: { startsWith: TEST_PREFIX } },
          { username: UNRELATED_USERNAME },
        ],
      },
    });
  });

  afterAll(async () => {
    await prisma.client.session.deleteMany({
      where: { user: { username: { startsWith: TEST_PREFIX } } },
    });
    await prisma.client.user.deleteMany({
      where: {
        OR: [
          { username: { startsWith: TEST_PREFIX } },
          { username: UNRELATED_USERNAME },
        ],
      },
    });
    await prisma.onModuleDestroy();
  });

  it('refuses production execution before database mutation', async () => {
    await expect(
      provisionDevelopmentUsers(
        prisma,
        passwordHash,
        PASSWORD_ONE,
        'production',
        definitions,
      ),
    ).rejects.toThrow('Development user provisioning is disabled in production.');

    expect(
      await prisma.client.user.count({
        where: { username: { startsWith: TEST_PREFIX } },
      }),
    ).toBe(0);
  });

  it('provisions all roles with current independent Argon2id hashes and no plaintext', async () => {
    const result = await provisionDevelopmentUsers(
      prisma,
      passwordHash,
      PASSWORD_ONE,
      'development',
      definitions,
    );
    const users = await prisma.client.user.findMany({
      where: { username: { startsWith: TEST_PREFIX } },
      orderBy: { username: 'asc' },
    });

    expect(result.every(({ status }) => status === 'created')).toBe(true);
    expect(new Set(users.map(({ role }) => role))).toEqual(
      new Set(Object.values(UserRole)),
    );
    expect(users.every(({ isActive }) => isActive)).toBe(true);
    expect(new Set(users.map(({ passwordHash: hash }) => hash)).size).toBe(4);
    for (const user of users) {
      expect(user.passwordHash).toMatch(/^\$argon2id\$v=19\$/);
      expect(user.passwordHash).not.toContain(PASSWORD_ONE);
      expect(passwordHash.needsRehash(user.passwordHash)).toBe(false);
      expect(await argon2.verify(user.passwordHash, PASSWORD_ONE)).toBe(true);
    }
  });

  it('reruns idempotently, preserves unrelated and Phase 2 data, and revokes sessions on password update', async () => {
    const unrelatedHash = await passwordHash.hashPassword('unrelated-fictional-passphrase');
    await prisma.client.user.create({
      data: {
        username: UNRELATED_USERNAME,
        passwordHash: unrelatedHash,
        role: UserRole.QUALITY,
      },
    });
    const phase2CountsBefore = {
      productModels: await prisma.client.productModel.count(),
      traceableUnits: await prisma.client.traceableUnit.count(),
    };
    await provisionDevelopmentUsers(
      prisma,
      passwordHash,
      PASSWORD_ONE,
      'development',
      definitions,
    );
    const admin = await prisma.client.user.findUniqueOrThrow({
      where: { username: definitions[0].username },
    });
    await prisma.client.session.create({
      data: {
        userId: admin.id,
        tokenDigest: 'a'.repeat(64),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const rerun = await provisionDevelopmentUsers(
      prisma,
      passwordHash,
      PASSWORD_TWO,
      'development',
      definitions,
    );
    const updatedAdmin = await prisma.client.user.findUniqueOrThrow({
      where: { username: definitions[0].username },
    });
    const session = await prisma.client.session.findUniqueOrThrow({
      where: { tokenDigest: 'a'.repeat(64) },
    });

    expect(rerun.every(({ status }) => status === 'updated')).toBe(true);
    expect(await argon2.verify(updatedAdmin.passwordHash, PASSWORD_TWO)).toBe(true);
    expect(session.revokedAt).not.toBeNull();
    expect(await prisma.client.user.findUnique({ where: { username: UNRELATED_USERNAME } })).toMatchObject({
      passwordHash: unrelatedHash,
      role: UserRole.QUALITY,
      isActive: true,
    });
    expect(await prisma.client.productModel.count()).toBe(
      phase2CountsBefore.productModels,
    );
    expect(await prisma.client.traceableUnit.count()).toBe(
      phase2CountsBefore.traceableUnits,
    );
  });
});
