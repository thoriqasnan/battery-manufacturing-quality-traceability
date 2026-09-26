import { UserRole } from '../src/generated/prisma/enums.js';
import { PasswordHashService } from '../src/auth/password-hash.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { provisionDevelopmentUsers } from '../src/users/development-user-provisioner.js';

const ACCEPTANCE_USERS = Object.freeze([
  { username: 'accept_admin', role: UserRole.ADMIN },
  { username: 'accept_quality', role: UserRole.QUALITY },
  { username: 'accept_production', role: UserRole.PRODUCTION },
  { username: 'accept_engineering', role: UserRole.ENGINEERING },
]);

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Development user provisioning is disabled in production.');
  }

  const password = process.env.BMQT_ACCEPTANCE_PASSWORD;
  if (!password) {
    throw new Error(
      'BMQT_ACCEPTANCE_PASSWORD is required and must be supplied temporarily.',
    );
  }

  const prisma = new PrismaService();
  try {
    const results = await provisionDevelopmentUsers(
      prisma,
      new PasswordHashService(),
      password,
      process.env.NODE_ENV,
      ACCEPTANCE_USERS,
    );

    for (const result of results) {
      console.log(`${result.username} ${result.role} ${result.status}`);
    }
  } finally {
    await prisma.onModuleDestroy();
  }
}

await main();
