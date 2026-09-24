import { Injectable } from '@nestjs/common';
import { TraceabilityRepository } from './traceability.repository.js';
import type { GenealogyScope } from './traceability.types.js';

@Injectable()
export class TraceabilityService {
  constructor(private readonly repository: TraceabilityRepository) {}

  forwardGenealogy(
    traceCode: string,
    scope: GenealogyScope = { mode: 'current' },
  ) {
    return this.repository.getForwardGenealogy(traceCode, scope);
  }

  reverseGenealogy(
    traceCode: string,
    scope: GenealogyScope = { mode: 'current' },
  ) {
    return this.repository.getReverseGenealogy(traceCode, scope);
  }

  replacementHistory(parentTraceCode: string, positionCode: string) {
    return this.repository.getPositionHistory(parentTraceCode, positionCode);
  }

  processHistory(traceCode: string) {
    return this.repository.getProcessHistory(traceCode);
  }

  qualityHistory(traceCode: string) {
    return this.repository.getQualityHistory(traceCode);
  }

  nonconformanceHistory(traceCode: string) {
    return this.repository.getNonconformanceHistory(traceCode);
  }

  async completeTraceability(
    traceCode: string,
    scope: GenealogyScope = { mode: 'current' },
  ) {
    const identity = await this.repository.getIdentity(traceCode);
    const [genealogy, processes, quality, nonconformances] = await Promise.all([
      this.repository.getForwardGenealogy(traceCode, scope),
      this.repository.getProcessHistory(traceCode),
      this.repository.getQualityHistory(traceCode),
      this.repository.getNonconformanceHistory(traceCode),
    ]);
    return { identity, genealogy, processes, quality, nonconformances };
  }
}
