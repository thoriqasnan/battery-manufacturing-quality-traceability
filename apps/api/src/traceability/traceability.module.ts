import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { TraceabilityIntegrityService } from './traceability-integrity.service.js';
import { TraceabilityRepository } from './traceability.repository.js';
import { TraceabilityService } from './traceability.service.js';

@Module({
  imports: [PrismaModule],
  providers: [
    TraceabilityRepository,
    TraceabilityService,
    TraceabilityIntegrityService,
  ],
  exports: [TraceabilityService, TraceabilityIntegrityService],
})
export class TraceabilityModule {}
