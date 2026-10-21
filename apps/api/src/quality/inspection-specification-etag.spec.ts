import { specificationEtag } from './inspection-specification-etag.js';

const source = {
  code: 'DEMO_CATEGORY',
  version: 2,
  name: 'Demo category',
  description: 'Synthetic.',
  lifecycle: 'DRAFT' as const,
  targetUnitType: 'PACK' as const,
  process: { code: 'VERIFY', name: 'Verification' },
  routeStep: null,
  configuration: {
    type: 'CATEGORICAL' as const,
    options: [
      { code: 'A', description: 'First', isAcceptable: true },
      { code: 'B', description: 'Second', isAcceptable: false },
    ],
  },
};

describe('inspection specification ETag', () => {
  it('has a stable deterministic vector', () => {
    expect(specificationEtag(source)).toBe(
      '"spec-v1-OT5NyJdcP45BtpMobb05q1hbLcM6Vtqq6XbAuFIr3Ak"',
    );
    expect(specificationEtag(structuredClone(source))).toBe(
      specificationEtag(source),
    );
  });

  it('is independent of object insertion order', () => {
    const reordered = {
      ...source,
      process: { name: 'Verification', code: 'VERIFY' },
    };
    expect(specificationEtag(reordered)).toBe(specificationEtag(source));
    expect(
      specificationEtag({
        ...source,
        configuration: {
          ...source.configuration,
          options: [...source.configuration.options].reverse(),
        },
      }),
    ).toBe(specificationEtag(source));
  });

  it('changes for relevant lifecycle, configuration, and options', () => {
    expect(specificationEtag({ ...source, lifecycle: 'PUBLISHED' })).not.toBe(
      specificationEtag(source),
    );
    expect(specificationEtag({ ...source, name: 'Changed name' })).not.toBe(
      specificationEtag(source),
    );
    expect(
      specificationEtag({
        ...source,
        configuration: {
          ...source.configuration,
          options: source.configuration.options.map((option, index) =>
            index === 0 ? { ...option, isAcceptable: false } : option,
          ),
        },
      }),
    ).not.toBe(specificationEtag(source));
  });

  it('cannot incorporate an internal UUID through its typed public input', () => {
    const withIgnoredInternalIdentity = { ...source, id: 'private-uuid' };
    const { id: _id, ...publicSource } = withIgnoredInternalIdentity;
    expect(specificationEtag(publicSource)).toBe(specificationEtag(source));
  });
});
