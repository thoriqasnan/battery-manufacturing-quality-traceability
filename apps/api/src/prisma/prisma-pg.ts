import { PrismaPg } from '@prisma/adapter-pg';

export function createPrismaPgAdapter(connectionString: string): PrismaPg {
  return new PrismaPg({
    connectionString,
    options: '-c timezone=UTC',
  });
}
