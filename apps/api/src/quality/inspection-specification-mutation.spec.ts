import {
  advisoryLockKey,
  assertPublishable,
  exactVersionLockInput,
  familyLockInput,
  parseCreateSpecification,
  parseCreateSpecificationVersion,
  parseReplaceSpecification,
  parseRequiredIfMatch,
  nextSpecificationVersion,
} from './inspection-specification-mutation.js';

const base = {
  code: ' qc_voltage ',
  name: ' Voltage check ',
  description: null,
  targetUnitType: 'cell',
  processCode: ' verify ',
  configuration: {
    type: 'NUMERIC',
    lowerBound: null,
    upperBound: null,
    unitCode: ' V ',
  },
};

describe('inspection specification mutation contract', () => {
  it('parses and normalizes version-one creation', () => {
    expect(parseCreateSpecification(base)).toMatchObject({
      code: 'QC_VOLTAGE',
      name: 'Voltage check',
      targetUnitType: 'CELL',
      processCode: 'VERIFY',
      configuration: {
        type: 'NUMERIC',
        lowerBound: null,
        upperBound: null,
        unitCode: 'V',
      },
    });
  });

  it('rejects unknown and cross-discriminator fields', () => {
    expect(() =>
      parseCreateSpecification({ ...base, id: 'private' }),
    ).toThrow();
    expect(() =>
      parseCreateSpecification({
        ...base,
        configuration: { type: 'TEXT', lowerBound: '1' },
      }),
    ).toThrow();
    expect(() =>
      parseReplaceSpecification({ ...base, code: undefined }),
    ).toThrow();
  });

  it('normalizes options and rejects normalized duplicates', () => {
    const categorical = {
      ...base,
      configuration: {
        type: 'CATEGORICAL',
        options: [
          { code: ' pass ', isAcceptable: true },
          { code: 'FAIL', description: ' no ', isAcceptable: false },
        ],
      },
    };
    expect(parseCreateSpecification(categorical).configuration).toMatchObject({
      options: [{ code: 'PASS' }, { code: 'FAIL', description: 'no' }],
    });
    expect(() =>
      parseCreateSpecification({
        ...categorical,
        configuration: {
          type: 'VISUAL',
          options: [
            { code: 'ok', isAcceptable: true },
            { code: ' OK ', isAcceptable: false },
          ],
        },
      }),
    ).toThrow();
  });

  it('validates decimal precision, range, and ordering', () => {
    expect(() =>
      parseCreateSpecification({
        ...base,
        configuration: {
          type: 'NUMERIC',
          lowerBound: '2',
          upperBound: '1',
          unitCode: null,
        },
      }),
    ).toThrow();
    expect(() =>
      parseCreateSpecification({
        ...base,
        configuration: {
          type: 'NUMERIC',
          lowerBound: '1.1234567',
          upperBound: null,
          unitCode: null,
        },
      }),
    ).toThrow();
    expect(() =>
      parseCreateSpecification({
        ...base,
        configuration: {
          type: 'NUMERIC',
          lowerBound: '1234567890123.123456',
          upperBound: null,
          unitCode: null,
        },
      }),
    ).toThrow();
  });

  it('requires Boolean evidence and forbids TEXT criteria', () => {
    expect(() =>
      parseCreateSpecification({ ...base, configuration: { type: 'BOOLEAN' } }),
    ).toThrow();
    expect(() =>
      parseCreateSpecification({
        ...base,
        configuration: { type: 'TEXT', options: [] },
      }),
    ).toThrow();
  });

  it('enforces publication completeness for typed drafts', () => {
    const numeric = parseCreateSpecification(base);
    expect(() => assertPublishable(numeric)).toThrow();
    const categorical = parseCreateSpecification({
      ...base,
      configuration: { type: 'CATEGORICAL', options: [] },
    });
    expect(() => assertPublishable(categorical)).toThrow();
    for (const configuration of [
      { type: 'NUMERIC', lowerBound: '0', upperBound: null, unitCode: null },
      { type: 'BOOLEAN', expectedValue: false },
      { type: 'CATEGORICAL', options: [{ code: 'OK', isAcceptable: true }] },
      { type: 'VISUAL', options: [{ code: 'OK', isAcceptable: true }] },
      { type: 'TEXT' },
    ])
      expect(() =>
        assertPublishable(parseCreateSpecification({ ...base, configuration })),
      ).not.toThrow();
  });

  it('accepts only one strong canonical If-Match validator', () => {
    const valid = `"spec-v1-${'A'.repeat(43)}"`;
    expect(parseRequiredIfMatch(valid)).toBe(valid);
    for (const invalid of [
      undefined,
      '*',
      `W/${valid}`,
      'malformed',
      `${valid}, ${valid}`,
    ])
      expect(() => parseRequiredIfMatch(invalid)).toThrow();
  });

  it('has stable signed 64-bit advisory-lock vectors', () => {
    expect(advisoryLockKey(exactVersionLockInput('QC_VOLTAGE', 1))).toBe(
      -8900033941685281479n,
    );
    expect(advisoryLockKey(familyLockInput('QC_VOLTAGE'))).toBe(
      418345767448378251n,
    );
  });

  it('parses only a positive safe source version', () => {
    expect(parseCreateSpecificationVersion({ sourceVersion: 2 })).toEqual({
      sourceVersion: 2,
    });
    for (const body of [
      {},
      { sourceVersion: 0 },
      { sourceVersion: -1 },
      { sourceVersion: 1.5 },
      { sourceVersion: '1' },
      { sourceVersion: 1, version: 2 },
      { sourceVersion: 1, lifecycle: 'DRAFT' },
    ])
      expect(() => parseCreateSpecificationVersion(body)).toThrow();
  });

  it('allocates max plus one without filling gaps and guards database integer overflow', () => {
    expect(nextSpecificationVersion(4)).toBe(5);
    expect(() => nextSpecificationVersion(2_147_483_647)).toThrow();
    expect(() => nextSpecificationVersion(Number.MAX_SAFE_INTEGER)).toThrow();
  });
});
