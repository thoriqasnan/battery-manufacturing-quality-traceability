import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { TraceabilityModule } from './traceability/traceability.module.js';

@Module({
  imports: [PrismaModule, TraceabilityModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
