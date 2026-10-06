import { PrismaService } from '../prisma/prisma.service.js';
import { TraceabilityHistoryRepository } from './traceability-history.repository.js';
import { TraceabilityHistoryService } from './traceability-history.service.js';

describe('Phase 4H-2 bounded history reads', () => {
  const prisma = new PrismaService();
  const repository = new TraceabilityHistoryRepository(prisma);
  const service = new TraceabilityHistoryService(repository);

  afterAll(async () => prisma.onModuleDestroy());

  it('returns direct process evidence newest first with bounded pagination', async () => {
    const pass = await service.getProcessHistory('PACK-DEMO-ALPHA-PASS', { page: 1, pageSize: 25 });
    const retest = await service.getProcessHistory('PACK-DEMO-ALPHA-RETEST', { page: 1, pageSize: 25 });
    expect(pass.page).toEqual({ number: 1, size: 25, totalItems: 4, totalPages: 1 });
    expect(retest.page.totalItems).toBe(5);
    expect(retest.items.map((item) => item.startedAt)).toEqual(
      retest.items.map((item) => item.startedAt).sort().reverse(),
    );
    expect(retest.items.filter((item) => item.process.code === 'DEMO_VERIFY').map((item) => item.attemptNumber)).toEqual([2, 1]);
    expect(pass.items.every((item) => /^exec_[a-f0-9]{24}$/.test(item.recordId))).toBe(true);
    expect(pass.items.every((item) => item.route !== null)).toBe(true);
    expect(JSON.stringify(pass)).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27}/i);

    const page = await service.getProcessHistory('PACK-DEMO-ALPHA-RETEST', { page: 2, pageSize: 2 });
    expect(page.page).toEqual({ number: 2, size: 2, totalItems: 5, totalPages: 3 });
    expect(page.items).toHaveLength(2);
  });

  it('does not aggregate parent process evidence into a module', async () => {
    const result = await service.getProcessHistory('MODULE-DEMO-ALPHA-PASS-01', { page: 1, pageSize: 25 });
    expect(result.items).toEqual([]);
    expect(result.page.totalItems).toBe(0);
  });

  it('returns all five typed quality forms across deterministic fixtures', async () => {
    const pass = await service.getQualityHistory('PACK-DEMO-ALPHA-PASS', { page: 1, pageSize: 25, outcome: null });
    const escalated = await service.getQualityHistory('PACK-DEMO-BETA-ESCALATED', { page: 1, pageSize: 25, outcome: null });
    expect(pass.page.totalItems).toBe(4);
    expect(pass.items.map((item) => item.evidence.type).sort()).toEqual(['BOOLEAN', 'CATEGORICAL', 'NUMERIC', 'TEXT']);
    expect(pass.items.find((item) => item.evidence.type === 'NUMERIC')?.evidence).toEqual({ type: 'NUMERIC', value: '15', unitCode: 'DEMO_UNIT' });
    expect(pass.items.find((item) => item.evidence.type === 'BOOLEAN')?.evidence).toEqual({ type: 'BOOLEAN', value: true });
    expect(pass.items.find((item) => item.evidence.type === 'CATEGORICAL')?.evidence).toEqual({ type: 'CATEGORICAL', optionCode: 'READY', isAcceptable: true });
    expect(pass.items.find((item) => item.evidence.type === 'TEXT')?.evidence).toEqual({ type: 'TEXT', value: 'Synthetic demo release note.' });
    expect(escalated.items.map((item) => item.evidence)).toEqual([
      { type: 'VISUAL', optionCode: 'CLEAR', isAcceptable: true },
      { type: 'VISUAL', optionCode: 'DEMO_MARK', isAcceptable: false },
    ]);
  });

  it('filters quality outcomes without losing NG or later PASS evidence', async () => {
    const all = await service.getQualityHistory('PACK-DEMO-ALPHA-RETEST', { page: 1, pageSize: 25, outcome: null });
    const pass = await service.getQualityHistory('PACK-DEMO-ALPHA-RETEST', { page: 1, pageSize: 25, outcome: 'PASS' });
    const ng = await service.getQualityHistory('PACK-DEMO-ALPHA-RETEST', { page: 1, pageSize: 25, outcome: 'NG' });
    expect(all.items.map((item) => [item.attemptNumber, item.outcome])).toEqual([[2, 'PASS'], [1, 'NG']]);
    expect(pass.items).toHaveLength(1);
    expect(ng.items).toHaveLength(1);
    expect(all.items.every((item) => /^insp_[a-f0-9]{24}$/.test(item.recordId))).toBe(true);
    expect(all.items.every((item) => item.processExecutionRecordId?.startsWith('exec_'))).toBe(true);
    expect(JSON.stringify(all)).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27}/i);
  });

  it('paginates quality and keeps module quality evidence direct-only', async () => {
    const page = await service.getQualityHistory('PACK-DEMO-ALPHA-PASS', { page: 2, pageSize: 2, outcome: null });
    expect(page.page).toEqual({ number: 2, size: 2, totalItems: 4, totalPages: 2 });
    expect(page.items).toHaveLength(2);
    const empty = await service.getQualityHistory('MODULE-DEMO-ALPHA-PASS-01', { page: 1, pageSize: 25, outcome: null });
    expect(empty.items).toEqual([]);
  });

  it('maps the simple NC aggregate and consistent source/result references', async () => {
    const nc = await service.getNonconformanceHistory('PACK-DEMO-ALPHA-RETEST', { page: 1, pageSize: 10, status: null });
    const quality = await service.getQualityHistory('PACK-DEMO-ALPHA-RETEST', { page: 1, pageSize: 25, outcome: null });
    const processes = await service.getProcessHistory('PACK-DEMO-ALPHA-RETEST', { page: 1, pageSize: 25 });
    const item = nc.items[0]!;
    expect(item.code).toBe('NC-DEMO-SIMPLE-001');
    expect(item.status).toBe('CLOSED');
    expect(item.abnormalCases).toEqual([]);
    expect(item.actions.map((action) => action.actionType)).toEqual(['CORRECTION', 'RETEST']);
    expect(item.dispositions.map((entry) => entry.dispositionType)).toEqual(['CONTINUE']);
    expect(quality.items.map((entry) => entry.recordId)).toContain(item.source.inspectionRecordId);
    expect(processes.items.map((entry) => entry.recordId)).toContain(item.source.processExecutionRecordId);
    expect(quality.items.map((entry) => entry.recordId)).toContain(item.actions[1]?.resultingInspectionRecordId);
    expect(item.verifications[0]?.inspectionRecordId).toBe(item.actions[1]?.resultingInspectionRecordId);
    expect(item.verifications[0]?.actionRecordId).toBe(item.actions[1]?.recordId);
    expect(item.nestedPageInfo.actions).toEqual({ returnedCount: 2, totalCount: 2, isPartial: false });
  });

  it('maps escalated NC evidence in chronological nested order', async () => {
    const result = await service.getNonconformanceHistory('PACK-DEMO-BETA-ESCALATED', { page: 1, pageSize: 10, status: 'CLOSED' });
    const item = result.items[0]!;
    expect(item.abnormalCases.map((entry) => entry.code)).toEqual(['ABNORMAL-DEMO-001']);
    expect(item.actions.map((entry) => entry.actionType)).toEqual(['ESCALATION', 'REPLACEMENT', 'RETEST']);
    expect(item.actions[1]?.relatedUnitTraceCode).toBe('COMP-DEMO-BETA-01');
    expect(item.dispositions.map((entry) => entry.dispositionType)).toEqual(['RETURN_IQC', 'CONTINUE']);
    expect(item.nestedPageInfo).toEqual({
      abnormalCases: { returnedCount: 1, totalCount: 1, isPartial: false },
      actions: { returnedCount: 3, totalCount: 3, isPartial: false },
      verifications: { returnedCount: 1, totalCount: 1, isPartial: false },
      dispositions: { returnedCount: 2, totalCount: 2, isPartial: false },
    });
    expect(JSON.stringify(result)).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27}/i);
  });

  it('filters and paginates NCs and keeps module evidence direct-only', async () => {
    const filtered = await service.getNonconformanceHistory('PACK-DEMO-ALPHA-RETEST', { page: 1, pageSize: 1, status: 'OPEN' });
    expect(filtered.items).toEqual([]);
    expect(filtered.page).toEqual({ number: 1, size: 1, totalItems: 0, totalPages: 0 });
    const empty = await service.getNonconformanceHistory('MODULE-DEMO-ALPHA-PASS-01', { page: 1, pageSize: 10, status: null });
    expect(empty.items).toEqual([]);
    expect(empty.page.totalItems).toBe(0);
  });
});
