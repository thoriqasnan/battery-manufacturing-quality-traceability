import {
  NONCONFORMANCE_NESTED_MAX_ITEMS,
  TRACEABILITY_HISTORY_ORDERING,
  TraceabilityHistoryIntegrityError,
  toPublicQualityEvidence,
  type NonconformanceHistoryItem,
  type ProcessHistoryItem,
  type QualityHistoryItem,
  type StoredInspectionEvidence,
} from './traceability-history.types.js';
import { traceabilityPublicReference } from './traceability-public-reference.js';

const emptyEvidence = (): StoredInspectionEvidence => ({
  numericValue: null,
  booleanValue: null,
  textValue: null,
  selectedOption: null,
});

describe('Phase 4H public history contracts', () => {
  it('represents all process statuses, methods, and nullable route/finish evidence without an internal id field', () => {
    const statuses = ['IN_PROGRESS', 'COMPLETED', 'ABORTED'] as const;
    const methods = ['MANUAL', 'AUTOMATED', 'HYBRID'] as const;
    const items: ProcessHistoryItem[] = statuses.map((status, index) => ({
      recordId: `exec_public_${index}`,
      process: { code: 'DEMO_PROCESS', name: 'Demo Process' },
      route: index === 0 ? null : { code: 'DEMO_ROUTE', version: 1, stepOrder: 2 },
      attemptNumber: index + 1,
      status,
      executionMethod: methods[index]!,
      startedAt: '2026-01-10T09:00:00.000Z',
      finishedAt: index === 0 ? null : '2026-01-10T09:10:00.000Z',
    }));
    expect(items.map(({ status }) => status)).toEqual(statuses);
    expect(items.map(({ executionMethod }) => executionMethod)).toEqual(methods);
    expect(items[0]).not.toHaveProperty('id');
  });

  it('maps every quality evidence type without flattening it', () => {
    expect(toPublicQualityEvidence('NUMERIC', { ...emptyEvidence(), numericValue: { toString: () => '15.250000' } }, 'DEMO_UNIT')).toEqual({
      type: 'NUMERIC', value: '15.250000', unitCode: 'DEMO_UNIT',
    });
    expect(toPublicQualityEvidence('BOOLEAN', { ...emptyEvidence(), booleanValue: false }, null)).toEqual({
      type: 'BOOLEAN', value: false,
    });
    expect(toPublicQualityEvidence('CATEGORICAL', { ...emptyEvidence(), selectedOption: { resultType: 'CATEGORICAL', code: 'READY', isAcceptable: true } }, null)).toEqual({
      type: 'CATEGORICAL', optionCode: 'READY', isAcceptable: true,
    });
    expect(toPublicQualityEvidence('VISUAL', { ...emptyEvidence(), selectedOption: { resultType: 'VISUAL', code: 'DEMO_MARK', isAcceptable: false } }, null)).toEqual({
      type: 'VISUAL', optionCode: 'DEMO_MARK', isAcceptable: false,
    });
    expect(toPublicQualityEvidence('TEXT', { ...emptyEvidence(), textValue: 'Recorded observation.' }, null)).toEqual({
      type: 'TEXT', value: 'Recorded observation.',
    });
  });

  it.each([
    ['BOOLEAN', null],
    ['TEXT', { ...emptyEvidence(), textValue: '' }],
    ['NUMERIC', { ...emptyEvidence(), booleanValue: false }],
    ['NUMERIC', { ...emptyEvidence(), numericValue: { toString: (): string => 'not-a-number' } }],
    ['BOOLEAN', { ...emptyEvidence(), booleanValue: false, textValue: 'extra' }],
    ['CATEGORICAL', { ...emptyEvidence(), selectedOption: { resultType: 'VISUAL', code: 'READY', isAcceptable: true } }],
    ['VISUAL', { ...emptyEvidence(), selectedOption: { resultType: 'VISUAL', code: ' ', isAcceptable: false } }],
  ] as const)('fails safely for incomplete or mismatched %s evidence', (resultType, result) => {
    expect(() => toPublicQualityEvidence(resultType, result, null)).toThrow(TraceabilityHistoryIntegrityError);
  });

  it('keeps PASS/NG and nullable execution references in the quality contract', () => {
    const items: QualityHistoryItem[] = ['PASS', 'NG'].map((outcome, index) => ({
      recordId: `insp_public_${index}`,
      specification: { code: 'DEMO_NUMERIC_LEVEL', version: 1 },
      processCode: 'DEMO_VERIFY',
      processExecutionRecordId: index === 0 ? null : 'exec_public_1',
      resultType: 'NUMERIC',
      attemptNumber: index + 1,
      outcome: outcome as 'PASS' | 'NG',
      inspectedAt: '2026-01-10T10:00:00.000Z',
      evidence: { type: 'NUMERIC', value: '15.000000', unitCode: 'DEMO_UNIT' },
    }));
    expect(items.map(({ outcome }) => outcome)).toEqual(['PASS', 'NG']);
    expect(items[0]).not.toHaveProperty('id');
  });

  it('keeps NC current state separate from bounded nested evidence', () => {
    const metadata = { returnedCount: 0, totalCount: 0, isPartial: false };
    const item: NonconformanceHistoryItem = {
      code: 'NC-DEMO-SIMPLE-001',
      status: 'CLOSED',
      defectCategory: { code: 'DEMO_RANGE_NG', name: 'Demo Range Nonconformance' },
      description: null,
      detectedAt: '2026-01-11T10:01:00.000Z',
      resolvedAt: '2026-01-11T11:40:00.000Z',
      closedAt: '2026-01-11T11:45:00.000Z',
      source: { inspectionRecordId: null, processExecutionRecordId: null },
      abnormalCases: [],
      actions: [],
      verifications: [],
      dispositions: [],
      nestedPageInfo: {
        abnormalCases: metadata,
        actions: metadata,
        verifications: metadata,
        dispositions: metadata,
      },
    };
    expect(item.status).toBe('CLOSED');
    expect(item.actions).toEqual([]);
    expect(item.nestedPageInfo.actions).toEqual(metadata);
    expect(NONCONFORMANCE_NESTED_MAX_ITEMS).toBe(100);
    expect(item).not.toHaveProperty('id');
  });

  it('defines every NC nested evidence group and explicit partial metadata', () => {
    const item: NonconformanceHistoryItem = {
      code: 'NC-DEMO-ESCALATED-001', status: 'IN_PROGRESS',
      defectCategory: { code: 'DEMO_VISUAL_NG', name: 'Demo Visual Nonconformance' },
      description: 'Synthetic evidence.', detectedAt: '2026-01-12T09:31:00.000Z', resolvedAt: null, closedAt: null,
      source: { inspectionRecordId: 'insp_public', processExecutionRecordId: 'exec_public' },
      abnormalCases: [{ code: 'ABNORMAL-DEMO-001', reason: null, openedAt: '2026-01-12T09:40:00.000Z', closedAt: null }],
      actions: [{ recordId: 'act_public', actionType: 'REPLACEMENT', abnormalCaseCode: 'ABNORMAL-DEMO-001', note: null, occurredAt: '2026-01-12T10:10:00.000Z', resultingInspectionRecordId: null, relatedUnitTraceCode: 'COMP-DEMO-BETA-01' }],
      verifications: [{ recordId: 'ver_public', inspectionRecordId: 'insp_public', actionRecordId: 'act_public', note: null, verifiedAt: '2026-01-12T11:20:00.000Z' }],
      dispositions: [{ recordId: 'disp_public', dispositionType: 'CONTINUE', note: null, decidedAt: '2026-01-12T11:25:00.000Z' }],
      nestedPageInfo: {
        abnormalCases: { returnedCount: 1, totalCount: 1, isPartial: false },
        actions: { returnedCount: 1, totalCount: 101, isPartial: true },
        verifications: { returnedCount: 1, totalCount: 1, isPartial: false },
        dispositions: { returnedCount: 1, totalCount: 1, isPartial: false },
      },
    };
    expect(item.actions[0]?.actionType).toBe('REPLACEMENT');
    expect(item.nestedPageInfo.actions.isPartial).toBe(true);
  });

  it('creates stable namespaced references without leaking raw UUIDs', () => {
    const internalId = '123e4567-e89b-12d3-a456-426614174000';
    const first = traceabilityPublicReference('inspection', internalId);
    expect(first).toBe(traceabilityPublicReference('inspection', internalId));
    expect(first).toMatch(/^insp_[a-f0-9]{24}$/);
    expect(first).not.toContain(internalId);
    expect(traceabilityPublicReference('execution', internalId)).not.toBe(first);
  });

  it('publishes deterministic ordering assumptions for the repository phase', () => {
    expect(TRACEABILITY_HISTORY_ORDERING).toMatchObject({
      process: ['startedAt DESC', 'attemptNumber DESC', 'internalId DESC'],
      quality: ['inspectedAt DESC', 'attemptNumber DESC', 'internalId DESC'],
      nonconformance: ['detectedAt DESC', 'code ASC', 'internalId DESC'],
      abnormalCases: ['openedAt ASC', 'internalId ASC'],
      actions: ['occurredAt ASC', 'internalId ASC'],
      verifications: ['verifiedAt ASC', 'internalId ASC'],
      dispositions: ['decidedAt ASC', 'internalId ASC'],
    });
  });
});
