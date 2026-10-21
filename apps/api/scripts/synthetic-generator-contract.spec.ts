import {
  SYNTHETIC_GENERATOR_MAX_PACKS,
  SyntheticGeneratorConfigError,
  assertSyntheticGeneratorMutationTarget,
  classifySyntheticIdentity,
  parseSyntheticGeneratorConfig,
  planSyntheticGeneration,
  syntheticEntityId,
  syntheticGeneratorProfiles,
  syntheticTraceCode,
  validateSyntheticGeneratorConfig,
} from './synthetic-generator-contract.js';

const base = {
  profile: 'SMALL',
  seed: 'portfolio-seed-001',
  namespace: 'SYN5G_PORTFOLIO',
  dryRun: true,
};

describe('Phase 5G synthetic generator configuration', () => {
  it('defines documented bounded profiles from hundreds through thousands of packs', () => {
    expect(syntheticGeneratorProfiles).toEqual({
      SMALL: {
        packCount: 100,
        modulesPerPack: 1,
        cellsPerModule: 4,
        componentsPerModule: 1,
        materialsPerModule: 1,
      },
      MEDIUM: {
        packCount: 2_000,
        modulesPerPack: 2,
        cellsPerModule: 8,
        componentsPerModule: 2,
        materialsPerModule: 1,
      },
      LARGE: {
        packCount: 10_000,
        modulesPerPack: 2,
        cellsPerModule: 10,
        componentsPerModule: 3,
        materialsPerModule: 2,
      },
    });
    expect(SYNTHETIC_GENERATOR_MAX_PACKS).toBe(25_000);
  });

  it('applies profile defaults and accepts bounded explicit volume overrides', () => {
    expect(parseSyntheticGeneratorConfig(base)).toMatchObject({
      profile: 'SMALL',
      packCount: 100,
      relatedVolume: {
        modulesPerPack: 1,
        cellsPerModule: 4,
        componentsPerModule: 1,
        materialsPerModule: 1,
      },
      dryRun: true,
    });
    expect(
      parseSyntheticGeneratorConfig({
        ...base,
        packCount: 12,
        relatedVolume: {
          modulesPerPack: 2,
          cellsPerModule: 6,
          componentsPerModule: 2,
          materialsPerModule: 0,
        },
      }),
    ).toMatchObject({
      packCount: 12,
      relatedVolume: {
        modulesPerPack: 2,
        cellsPerModule: 6,
        componentsPerModule: 2,
        materialsPerModule: 0,
      },
    });
  });

  it.each([
    [{ ...base, profile: 'HUGE' }, 'INVALID_PROFILE'],
    [{ ...base, seed: 'short' }, 'INVALID_SEED'],
    [{ ...base, seed: 'Uppercase-is-not-stable' }, 'INVALID_SEED'],
    [{ ...base, namespace: 'DEMO_COLLISION' }, 'UNSAFE_NAMESPACE'],
    [{ ...base, namespace: 'SYN5G_DEMO_DATA' }, 'UNSAFE_NAMESPACE'],
    [{ ...base, packCount: -1 }, 'INVALID_PACK_COUNT'],
    [{ ...base, packCount: 25_001 }, 'INVALID_PACK_COUNT'],
    [
      { ...base, relatedVolume: { cellsPerModule: 17 } },
      'INVALID_RELATED_VOLUME:cellsPerModule',
    ],
    [{ ...base, surprise: true }, 'UNKNOWN_FIELD:surprise'],
  ])('rejects invalid or unsafe configuration %#', (input, issue) => {
    const result = validateSyntheticGeneratorConfig(input);
    expect(result).toMatchObject({ valid: false });
    if (!result.valid) expect(result.issues).toContain(issue);
    expect(() => parseSyntheticGeneratorConfig(input)).toThrow(
      SyntheticGeneratorConfigError,
    );
  });
});

describe('Phase 5G deterministic planning and ownership', () => {
  it('returns an exact, pure, explicitly unpersisted plan', () => {
    const beforeEnvironment = { ...process.env };
    const plan = planSyntheticGeneration(base);
    expect(plan.kind).toBe('PLANNED_NOT_PERSISTED');
    expect(plan.validation).toEqual({ valid: true, issues: [] });
    expect(plan.expectedRecords.packs).toBe(100);
    expect(plan.expectedRecords.modules).toBe(100);
    expect(plan.expectedRecords.cells).toBe(400);
    expect(plan.expectedRecords.components).toBe(100);
    expect(plan.expectedRecords.nonconformances).toBe(
      plan.scenarioDistribution.NC_REWORK,
    );
    expect(plan.expectedRecords.inspectionSubmissions).toBe(
      plan.expectedRecords.inspections,
    );
    expect(plan.expectedRecords.total).toBeGreaterThan(1_000);
    expect(
      plan.scenarioDistribution.CLEAN_PASS +
        plan.scenarioDistribution.NG_RETEST +
        plan.scenarioDistribution.NC_REWORK,
    ).toBe(100);
    expect(plan.ownership.cleanupImplemented).toBe(false);
    expect(process.env).toEqual(beforeEnvironment);
  });

  it('is byte-stable for identical configuration and independent of wall-clock time', () => {
    const first = planSyntheticGeneration(base);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2040-12-31T23:59:59Z'));
    const second = planSyntheticGeneration(base);
    vi.useRealTimers();
    expect(second).toEqual(first);
    expect(second.ownership.planFingerprint).toBe(
      first.ownership.planFingerprint,
    );
  });

  it('isolates different seeds in public namespaces, IDs, timestamps, and fingerprints', () => {
    const first = planSyntheticGeneration(base);
    const second = planSyntheticGeneration({
      ...base,
      seed: 'portfolio-seed-002',
    });
    expect(second.config.resolvedNamespace).not.toBe(
      first.config.resolvedNamespace,
    );
    expect(second.samples.firstPackTraceCode).not.toBe(
      first.samples.firstPackTraceCode,
    );
    expect(second.samples.firstPackId).not.toBe(first.samples.firstPackId);
    expect(second.samples.firstTimestamp).not.toBe(
      first.samples.firstTimestamp,
    );
    expect(second.ownership.planFingerprint).not.toBe(
      first.ownership.planFingerprint,
    );
  });

  it('creates stable UUID-shaped internal IDs and non-DEMO public trace codes', () => {
    const config = parseSyntheticGeneratorConfig(base);
    expect(syntheticEntityId(config, 'pack', 1)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(syntheticTraceCode(config, 'PACK', 1)).toMatch(
      /^SYN5G_PORTFOLIO-[A-F0-9]{8}-PACK-00000001$/,
    );
    expect(syntheticTraceCode(config, 'PACK', 1)).not.toContain('DEMO');
  });

  it('classifies exact reruns for reuse and refuses incompatible identities', () => {
    const planned = {
      id: 'stable-id',
      publicCode: 'SYN5G_PORTFOLIO-ABC-PACK-00000001',
      ownershipFingerprint: 'fingerprint-a',
    };
    expect(classifySyntheticIdentity(planned, null)).toBe('CREATE');
    expect(classifySyntheticIdentity(planned, { ...planned })).toBe('REUSE');
    expect(
      classifySyntheticIdentity(planned, {
        ...planned,
        ownershipFingerprint: 'incompatible',
      }),
    ).toBe('CONFLICT');
  });
});

describe('Phase 5G database mutation boundary', () => {
  it.each([
    undefined,
    'not-a-url',
    'postgresql://local.invalid/battery_quality_traceability_dev',
    'postgresql://local.invalid/unknown_database',
  ])(
    'rejects absent, malformed, development, or unknown targets before verification',
    async (databaseUrl) => {
      const verify = vi.fn();
      await expect(
        assertSyntheticGeneratorMutationTarget(databaseUrl, verify),
      ).rejects.toThrow();
      expect(verify).not.toHaveBeenCalled();
    },
  );

  it('passes the same explicit isolated URL into the established identity guard', async () => {
    const verify = vi.fn().mockResolvedValue(undefined);
    const databaseUrl =
      'postgresql://local.invalid/battery_quality_traceability_test';
    await expect(
      assertSyntheticGeneratorMutationTarget(databaseUrl, verify),
    ).resolves.toBeUndefined();
    expect(verify).toHaveBeenCalledWith(databaseUrl);
  });
});
