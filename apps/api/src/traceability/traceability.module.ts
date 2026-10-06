import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { TraceabilityIntegrityService } from './traceability-integrity.service.js';
import { TraceabilityRepository } from './traceability.repository.js';
import { TraceabilityService } from './traceability.service.js';
import { TraceabilityController } from './traceability.controller.js';
import { TraceabilitySearchRepository } from './traceability-search.repository.js';
import { TraceabilitySearchService } from './traceability-search.service.js';
import { TraceabilityDetailRepository } from './traceability-detail.repository.js';
import { TraceabilityDetailService } from './traceability-detail.service.js';
import { TraceabilityHistoryRepository } from './traceability-history.repository.js';
import { TraceabilityHistoryService } from './traceability-history.service.js';

@Module({
  imports: [PrismaModule],
  providers: [
    TraceabilityRepository,
    TraceabilityService,
    TraceabilityIntegrityService,
    TraceabilitySearchRepository,
    TraceabilitySearchService,
    TraceabilityDetailRepository,
    TraceabilityDetailService,
    TraceabilityHistoryRepository,
    TraceabilityHistoryService,
  ],
  controllers: [TraceabilityController],
  exports: [TraceabilityService, TraceabilityIntegrityService],
})
export class TraceabilityModule {}
