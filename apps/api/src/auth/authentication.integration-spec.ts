import { UserRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthenticationService } from './authentication.service.js';
import { InvalidCredentialsError } from './invalid-credentials.error.js';
import { PasswordHashService } from './password-hash.service.js';

const TEST_USERNAME_PREFIX = 'phase3c.authentication.';
const VALID_USERNAME = `${TEST_USERNAME_PREFIX}active`;
const INACTIVE_USERNAME = `${TEST_USERNAME_PREFIX}inactive`;
const VALID_PASSWORD = 'fictional-quality-passphrase';

describe('Phase 3C credential authentication', () => {
  const prisma = new PrismaService();
  const passwordHash = new PasswordHashService();
  const authentication = new AuthenticationService(prisma, passwordHash);

  beforeAll(async () => {
    await prisma.client.user.deleteMany({
      where: { username: { startsWith: TEST_USERNAME_PREFIX } },
    });
    const storedHash = await passwordHash.hashPassword(VALID_PASSWORD);
    await prisma.client.user.createMany({
      data: [
        {
          username: VALID_USERNAME,
          passwordHash: storedHash,
          role: UserRole.QUALITY,
        },
        {
          username: INACTIVE_USERNAME,
          passwordHash: storedHash,
          role: UserRole.ENGINEERING,
          isActive: false,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.client.user.deleteMany({
      where: { username: { startsWith: TEST_USERNAME_PREFIX } },
    });
    await prisma.onModuleDestroy();
  });

  it('authenticates an active user and returns only a safe identity', async () => {
    const identity = await authentication.authenticateCredentials(
      VALID_USERNAME,
      VALID_PASSWORD,
    );

    expect(identity).toMatchObject({
      username: VALID_USERNAME,
      role: UserRole.QUALITY,
      isActive: true,
    });
    expect(identity).toHaveProperty('id');
    expect(identity).not.toHaveProperty('passwordHash');
  });

  it('normalizes surrounding whitespace and username case', async () => {
    const identity = await authentication.authenticateCredentials(
      `  ${VALID_USERNAME.toUpperCase()}  `,
      VALID_PASSWORD,
    );

    expect(identity.username).toBe(VALID_USERNAME);
  });

  it.each([
    ['unknown username', `${TEST_USERNAME_PREFIX}unknown`, VALID_PASSWORD],
    ['incorrect password', VALID_USERNAME, 'fictional-wrong-passphrase'],
    ['inactive user', INACTIVE_USERNAME, VALID_PASSWORD],
  ])('fails generically for %s', async (_case, username, password) => {
    await expect(
      authentication.authenticateCredentials(username, password),
    ).rejects.toMatchObject({
      name: InvalidCredentialsError.name,
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid username or password.',
    });
  });
});
