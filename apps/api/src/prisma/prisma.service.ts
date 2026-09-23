import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService implements OnModuleDestroy {
  private prismaClient: PrismaClient | undefined;

  get client(): PrismaClient {
    if (!this.prismaClient) {
      const connectionString = process.env.DATABASE_URL;

      if (!connectionString) {
        throw new Error('DATABASE_URL is required before database access.');
      }

      const adapter = new PrismaPg({ connectionString });
      this.prismaClient = new PrismaClient({ adapter });
    }

    return this.prismaClient;
  }

  async onModuleDestroy(): Promise<void> {
    await this.prismaClient?.$disconnect();
  }
}
