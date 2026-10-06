import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TraceableUnitNotFoundError } from './traceability.errors.js';
import type { TraceabilityHistoryRepository } from './traceability-history.repository.js';
import { TraceabilityHistoryService } from './traceability-history.service.js';
import { TraceabilityHistoryIntegrityError } from './traceability-history.types.js';

function repositoryMock() {
  return {
    getProcessHistory: vi.fn(),
    getQualityHistory: vi.fn(),
    getNonconformanceHistory: vi.fn(),
  };
}

describe('TraceabilityHistoryService', () => {
  it('normalizes the selected unit and preserves nullable process context', async () => {
    const repository = repositoryMock();
    repository.getProcessHistory.mockResolvedValue({
      totalItems: 1,
      rows: [{
        id: '11111111-1111-4111-8111-111111111111',
        processCode: 'DEMO_PREPARE', processName: 'Demo Prepare', route: null,
        attemptNumber: 1, status: 'IN_PROGRESS', executionMethod: 'MANUAL',
        startedAt: new Date('2026-01-10T09:00:00.000Z'), finishedAt: null,
      }],
    });
    const service = new TraceabilityHistoryService(repository as unknown as TraceabilityHistoryRepository);
    const result = await service.getProcessHistory(' pack-demo ', { page: 1, pageSize: 25 });
    expect(repository.getProcessHistory).toHaveBeenCalledWith('PACK-DEMO', { page: 1, pageSize: 25 });
    expect(result.items[0]).toMatchObject({ route: null, status: 'IN_PROGRESS', finishedAt: null });
    expect(JSON.stringify(result)).not.toContain('11111111-1111-4111-8111-111111111111');
  });

  it('reports truthful nested truncation metadata at the 100-record cap', async () => {
    const repository = repositoryMock();
    const actions = Array.from({ length: 100 }, (_, index) => ({
      id: `action-${index}`, actionType: 'CORRECTION' as const, abnormalCaseCode: null,
      note: null, occurredAt: new Date(`2026-01-11T10:${String(index % 60).padStart(2, '0')}:00.000Z`),
      resultingInspectionId: null, relatedUnitTraceCode: null,
    }));
    repository.getNonconformanceHistory.mockResolvedValue({
      totalItems: 1,
      rows: [{
        code: 'NC-DEMO-001', status: 'OPEN', defectCategory: { code: 'DEMO', name: 'Demo' },
        description: null, detectedAt: new Date('2026-01-11T10:00:00.000Z'), resolvedAt: null, closedAt: null,
        sourceInspectionId: null, sourceProcessExecutionId: null,
        abnormalCases: [], actions, verifications: [], dispositions: [],
        nestedCount: { abnormalCases: 0, actions: 125, verifications: 0, dispositions: 0 },
      }],
    });
    const service = new TraceabilityHistoryService(repository as unknown as TraceabilityHistoryRepository);
    const result = await service.getNonconformanceHistory('PACK-DEMO', { page: 1, pageSize: 10, status: null });
    expect(result.items[0]?.nestedPageInfo.actions).toEqual({ returnedCount: 100, totalCount: 125, isPartial: true });
  });

  it('propagates strict quality integrity failures without fabricating evidence', async () => {
    const repository = repositoryMock();
    repository.getQualityHistory.mockResolvedValue({
      totalItems: 1,
      rows: [{
        id: 'inspection-id', specificationCode: 'DEMO_BOOLEAN', specificationVersion: 1,
        unitCode: null, processCode: 'DEMO_VERIFY', processExecutionId: null,
        resultType: 'BOOLEAN', attemptNumber: 1, outcome: 'NG',
        inspectedAt: new Date('2026-01-11T10:00:00.000Z'), result: null,
      }],
    });
    const service = new TraceabilityHistoryService(repository as unknown as TraceabilityHistoryRepository);
    await expect(service.getQualityHistory('PACK-DEMO', { page: 1, pageSize: 25, outcome: null }))
      .rejects.toBeInstanceOf(TraceabilityHistoryIntegrityError);
  });

  it('preserves established malformed and unknown trace-code errors', async () => {
    const repository = repositoryMock();
    const service = new TraceabilityHistoryService(repository as unknown as TraceabilityHistoryRepository);
    await expect(service.getProcessHistory('PACK BAD', { page: 1, pageSize: 25 }))
      .rejects.toBeInstanceOf(BadRequestException);
    repository.getProcessHistory.mockRejectedValue(new TraceableUnitNotFoundError('PACK-UNKNOWN'));
    await expect(service.getProcessHistory('PACK-UNKNOWN', { page: 1, pageSize: 25 }))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});
