import {
  INSPECTION_LOCK_ORDER,
  INSPECTION_OPERATION,
  INSPECTION_OPERATION_VERSION,
  INSPECTION_RESPONSE_CONTRACT_VERSION,
  compareInspectionDecimals,
  evaluateInspection,
  inspectionAttemptLockInput,
  inspectionAttemptLockKey,
  inspectionIdempotencyLockInput,
  inspectionIdempotencyLockKey,
  inspectionRequestFingerprint,
  parseIdempotencyKey,
  parseInspectionDecimal,
  parseInspectionRequest,
  parseInspectionTimestamp,
} from './inspection-entry.js';

const base = {
  traceCode: ' pack-synth-001 ',
  specification: { code: ' qc_level ', version: 2 },
  inspectedAt: '2026-10-07T08:00:00+07:00',
  evidence: { type: 'NUMERIC', value: '+0012.500000' },
};

describe('inspection entry pure contract', () => {
  it('strictly parses and normalizes the approved envelope', () => {
    expect(parseInspectionRequest(base)).toMatchObject({
      traceCode: 'PACK-SYNTH-001',
      specification: { code: 'QC_LEVEL', version: 2 },
      execution: null,
      inspectedAt: { canonical: '2026-10-07T01:00:00.000Z' },
      evidence: { type: 'NUMERIC', value: '12.5' },
    });
    expect(
      parseInspectionRequest({
        ...base,
        execution: { processCode: ' final_verify ', attempt: 3 },
      }).execution,
    ).toEqual({ processCode: 'FINAL_VERIFY', attempt: 3 });
  });

  it('rejects unknown fields and unsafe public identities at every level', () => {
    for (const request of [
      { ...base, id: 'private' },
      {
        ...base,
        specification: { ...base.specification, lifecycle: 'PUBLISHED' },
      },
      {
        ...base,
        execution: { processCode: 'VERIFY', attempt: 1, id: 'private' },
      },
      { ...base, specification: { code: 'QC', version: 0 } },
      {
        ...base,
        execution: {
          processCode: 'VERIFY',
          attempt: Number.MAX_SAFE_INTEGER + 1,
        },
      },
    ])
      expect(() => parseInspectionRequest(request)).toThrow();
  });

  it('validates Idempotency-Key without changing case', () => {
    expect(parseIdempotencyKey('AbCdEf0123456789')).toBe('AbCdEf0123456789');
    expect(parseIdempotencyKey('a'.repeat(128))).toHaveLength(128);
    for (const value of [
      undefined,
      'a'.repeat(15),
      'a'.repeat(129),
      'with whitespace____',
      'unicode-é-key-0001',
      'unsupported/key000',
    ])
      expect(() => parseIdempotencyKey(value)).toThrow();
    expect(INSPECTION_OPERATION).toBe('inspection.submit');
    expect(INSPECTION_OPERATION_VERSION).toBe(1);
    expect(INSPECTION_RESPONSE_CONTRACT_VERSION).toBe(1);
  });

  it('canonicalizes exact decimals and negative zero', () => {
    expect(parseInspectionDecimal('+0012.500000')).toBe('12.5');
    expect(parseInspectionDecimal('000')).toBe('0');
    expect(parseInspectionDecimal('-0')).toBe('0');
    expect(parseInspectionDecimal('-0.000000')).toBe('0');
    expect(parseInspectionDecimal('1.2300000')).toBe('1.23');
    expect(parseInspectionDecimal('999999999999.999999')).toBe(
      '999999999999.999999',
    );
  });

  it('rejects invalid or out-of-range decimals', () => {
    for (const value of [
      12.5,
      ' 1',
      '1 ',
      '.5',
      '1.',
      '1e3',
      'NaN',
      'Infinity',
      '-Infinity',
      '1000000000000',
      '0.0000001',
      '999999999999.9999991',
    ])
      expect(() => parseInspectionDecimal(value)).toThrow();
  });

  it('compares decimals exactly without binary floating point', () => {
    expect(compareInspectionDecimals('0.1', '0.100000')).toBe(0);
    expect(
      compareInspectionDecimals('900719925474.099999', '900719925474.1'),
    ).toBe(-1);
    expect(compareInspectionDecimals('-1.2', '-1.19')).toBe(-1);
  });

  it('strictly parses all five evidence variants and rejects cross-fields', () => {
    expect(
      parseInspectionRequest({
        ...base,
        evidence: { type: 'BOOLEAN', value: false },
      }).evidence,
    ).toEqual({ type: 'BOOLEAN', value: false });
    expect(
      parseInspectionRequest({
        ...base,
        evidence: { type: 'CATEGORICAL', optionCode: ' pass ' },
      }).evidence,
    ).toEqual({ type: 'CATEGORICAL', optionCode: 'PASS' });
    expect(
      parseInspectionRequest({
        ...base,
        evidence: { type: 'VISUAL', optionCode: ' clear ' },
      }).evidence,
    ).toEqual({ type: 'VISUAL', optionCode: 'CLEAR' });
    expect(
      parseInspectionRequest({
        ...base,
        evidence: {
          type: 'TEXT',
          value: '  retained internal   content  ',
          outcome: 'NG',
        },
      }).evidence,
    ).toEqual({
      type: 'TEXT',
      value: 'retained internal   content',
      outcome: 'NG',
    });
    for (const evidence of [
      { type: 'NUMERIC', value: '1', outcome: 'PASS' },
      { type: 'BOOLEAN', value: true, optionCode: 'YES' },
      { type: 'CATEGORICAL', value: 'PASS' },
      { type: 'VISUAL', optionCode: 'OK', outcome: 'PASS' },
      { type: 'TEXT', value: 'text', outcome: 'MAYBE' },
    ])
      expect(() => parseInspectionRequest({ ...base, evidence })).toThrow();
  });

  it('counts TEXT Unicode code points rather than UTF-16 units', () => {
    const accepted = '😀'.repeat(4_000);
    expect(
      parseInspectionRequest({
        ...base,
        evidence: { type: 'TEXT', value: ` ${accepted} `, outcome: 'PASS' },
      }).evidence,
    ).toMatchObject({ value: accepted });
    expect(() =>
      parseInspectionRequest({
        ...base,
        evidence: { type: 'TEXT', value: '😀'.repeat(4_001), outcome: 'PASS' },
      }),
    ).toThrow();
    expect(() =>
      parseInspectionRequest({
        ...base,
        evidence: { type: 'TEXT', value: '\u2003\n ', outcome: 'PASS' },
      }),
    ).toThrow();
  });

  it('requires timezone-qualified valid timestamps and normalizes offsets', () => {
    expect(
      parseInspectionTimestamp('2026-10-07T08:00:00+07:00').canonical,
    ).toBe('2026-10-07T01:00:00.000Z');
    expect(parseInspectionTimestamp('2024-02-29T23:59:59.123Z').canonical).toBe(
      '2024-02-29T23:59:59.123Z',
    );
    for (const value of [
      '2026-10-07T08:00:00',
      '2026-02-30T00:00:00Z',
      '2026-01-01T24:00:00Z',
      '2026-01-01',
      'not-a-date',
    ])
      expect(() => parseInspectionTimestamp(value)).toThrow();
  });

  it('evaluates every result type deterministically with inclusive bounds', () => {
    const numeric = { type: 'NUMERIC', value: '10' } as const;
    expect(
      evaluateInspection(numeric, {
        type: 'NUMERIC',
        lowerBound: '10',
        upperBound: '20',
      }),
    ).toBe('PASS');
    expect(
      evaluateInspection(
        { ...numeric, value: '20' },
        { type: 'NUMERIC', lowerBound: '10', upperBound: '20' },
      ),
    ).toBe('PASS');
    expect(
      evaluateInspection(
        { ...numeric, value: '9.999999' },
        { type: 'NUMERIC', lowerBound: '10', upperBound: null },
      ),
    ).toBe('NG');
    expect(
      evaluateInspection(
        { ...numeric, value: '20.000001' },
        { type: 'NUMERIC', lowerBound: null, upperBound: '20' },
      ),
    ).toBe('NG');
    expect(
      evaluateInspection(
        { type: 'BOOLEAN', value: false },
        { type: 'BOOLEAN', expectedValue: false },
      ),
    ).toBe('PASS');
    expect(
      evaluateInspection(
        { type: 'BOOLEAN', value: true },
        { type: 'BOOLEAN', expectedValue: false },
      ),
    ).toBe('NG');
    expect(
      evaluateInspection(
        { type: 'CATEGORICAL', optionCode: 'PASS' },
        { type: 'CATEGORICAL', isAcceptable: true },
      ),
    ).toBe('PASS');
    expect(
      evaluateInspection(
        { type: 'VISUAL', optionCode: 'DEFECT' },
        { type: 'VISUAL', isAcceptable: false },
      ),
    ).toBe('NG');
    expect(
      evaluateInspection(
        { type: 'TEXT', value: 'note', outcome: 'NG' },
        { type: 'TEXT' },
      ),
    ).toBe('NG');
    expect(() =>
      evaluateInspection({ type: 'BOOLEAN', value: true }, { type: 'TEXT' }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_TYPED_RESULT' }));
  });

  it('produces the fixed canonical fingerprint and semantic equivalences', () => {
    const parsed = parseInspectionRequest(base);
    expect(inspectionRequestFingerprint(parsed)).toBe(
      'c6c0c91f234c0e798fdcf87bb61512f5dd46a6946db75693b6acbc0bf43ef6cb',
    );
    const reordered = parseInspectionRequest({
      evidence: { value: '12.5000', type: 'NUMERIC' },
      inspectedAt: '2026-10-07T01:00:00Z',
      specification: { version: 2, code: 'QC_LEVEL' },
      traceCode: 'PACK-SYNTH-001',
    });
    expect(inspectionRequestFingerprint(reordered)).toBe(
      inspectionRequestFingerprint(parsed),
    );
    const execution = parseInspectionRequest({
      ...base,
      execution: { processCode: 'VERIFY', attempt: 1 },
    });
    expect(inspectionRequestFingerprint(execution)).not.toBe(
      inspectionRequestFingerprint(parsed),
    );
    const textA = parseInspectionRequest({
      ...base,
      evidence: { type: 'TEXT', value: 'alpha', outcome: 'PASS' },
    });
    const textB = parseInspectionRequest({
      ...base,
      evidence: { type: 'TEXT', value: 'beta', outcome: 'PASS' },
    });
    expect(inspectionRequestFingerprint(textA)).not.toBe(
      inspectionRequestFingerprint(textB),
    );
  });

  it('matches deterministic attempt and idempotency lock vectors', () => {
    const unit = '11111111-1111-4111-8111-111111111111';
    const specification = '22222222-2222-4222-8222-222222222222';
    expect(inspectionAttemptLockInput(unit.toUpperCase(), specification)).toBe(
      `inspection-attempt:v1:${unit}:${specification}`,
    );
    expect(inspectionAttemptLockKey(unit, specification)).toBe(
      5580127066200065418n,
    );
    const user = '33333333-3333-4333-8333-333333333333';
    expect(inspectionIdempotencyLockInput(user, '0123456789abcdef')).toBe(
      'inspection-submission:v1:33333333-3333-4333-8333-333333333333:inspection.submit:1:0123456789abcdef',
    );
    expect(inspectionIdempotencyLockKey(user, '0123456789abcdef')).toBe(
      1889336678262887837n,
    );
    expect(inspectionIdempotencyLockKey(user, '0123456789abcdeF')).not.toBe(
      inspectionIdempotencyLockKey(user, '0123456789abcdef'),
    );
    expect(INSPECTION_LOCK_ORDER).toEqual([
      'idempotency',
      'exact-specification',
      'attempt',
    ]);
  });
});
