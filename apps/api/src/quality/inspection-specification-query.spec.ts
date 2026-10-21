import {
  normalizeSpecificationCode,
  parseDiscoverySpecificationQuery,
  parseManagementSpecificationQuery,
  parsePositiveSpecificationVersion,
} from './inspection-specification-query.js';

describe('inspection specification query parsing', () => {
  it.each(['qc_voltage', ' Qc_Voltage ', 'QC_VOLTAGE'])(
    'normalizes equivalent code input %s',
    (input) => {
      expect(normalizeSpecificationCode(input)).toBe('QC_VOLTAGE');
    },
  );

  it.each(['', ' ', 'QC VOLTAGE', 'QC.VOLTAGE', 'A'.repeat(65)])(
    'rejects invalid specification code %s',
    (input) => {
      expect(() => normalizeSpecificationCode(input)).toThrow();
    },
  );

  it('parses positive versions and rejects invalid versions', () => {
    expect(parsePositiveSpecificationVersion('12')).toBe(12);
    for (const value of ['0', '-1', '1.5', 'abc', '9007199254740992']) {
      expect(() => parsePositiveSpecificationVersion(value)).toThrow();
    }
  });

  it('applies bounded pagination defaults', () => {
    expect(parseManagementSpecificationQuery({})).toMatchObject({
      page: 1,
      pageSize: 25,
      lifecycle: null,
      resultType: null,
      targetUnitType: null,
      processCode: null,
      query: null,
    });
    expect(
      parseDiscoverySpecificationQuery({ page: '2', pageSize: '100' }),
    ).toMatchObject({ page: 2, pageSize: 100 });
  });

  it.each([
    { page: '0' },
    { page: '1.5' },
    { pageSize: '101' },
    { pageSize: '-1' },
  ])('rejects malformed pagination %#', (query) => {
    expect(() => parseManagementSpecificationQuery(query)).toThrow();
  });

  it('normalizes supported enum and technical filters', () => {
    expect(
      parseManagementSpecificationQuery({
        query: 'demo',
        lifecycle: ' published ',
        resultType: ' numeric ',
        targetUnitType: ' pack ',
        processCode: ' verify ',
      }),
    ).toMatchObject({
      query: 'demo',
      normalizedCodeQuery: 'DEMO',
      lifecycle: 'PUBLISHED',
      resultType: 'NUMERIC',
      targetUnitType: 'PACK',
      processCode: 'VERIFY',
    });
  });

  it.each([
    { lifecycle: 'ACTIVE' },
    { resultType: 'NUMBER' },
    { targetUnitType: 'DEVICE' },
    { processCode: 'bad code' },
  ])('rejects unsupported filters %#', (query) => {
    expect(() => parseManagementSpecificationQuery(query)).toThrow();
  });
});
