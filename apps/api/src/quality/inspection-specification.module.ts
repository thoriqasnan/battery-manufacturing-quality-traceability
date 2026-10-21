import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { InspectionSpecificationController } from './inspection-specification.controller.js';
import { InspectionSpecificationRepository } from './inspection-specification.repository.js';
import { InspectionSpecificationService } from './inspection-specification.service.js';
import { InspectionEntryService } from './inspection-entry.service.js';
import { InspectionEntryController } from './inspection-entry.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [InspectionSpecificationController, InspectionEntryController],
  providers: [
    InspectionSpecificationRepository,
    InspectionSpecificationService,
    InspectionEntryService,
  ],
  exports: [InspectionEntryService],
})
export class InspectionSpecificationModule {}
