import {
  cleanupSyntheticSubset,
  persistSyntheticSubset,
  planSyntheticPersistenceSubset,
} from './synthetic-generator-persistence.js';
import {
  cleanupSyntheticQuality,
  planSyntheticQuality,
} from './synthetic-generator-quality.js';
import {
  cleanupSyntheticNc,
  planSyntheticNc,
} from './synthetic-generator-nc.js';

const base = {
  profile: 'SMALL',
  seed: 'phase5g2a-unit-seed',
  namespace: 'SYN5G_PERSIST_UNIT',
  packCount: 3,
  dryRun: false,
};

describe('Phase 5G-2A persistence boundary', () => {
  it('plans stable exact identities for the supported subset', () => {
    const first = planSyntheticPersistenceSubset(base);
    const second = planSyntheticPersistenceSubset(base);
    expect(second).toEqual(first);
    expect(first.productModel.code).toMatch(/^SYN5G_PERSIST_UNIT-/);
    expect(first.units.packs).toHaveLength(3);
    expect(first.units.modules).toHaveLength(3);
    expect(first.units.cells).toHaveLength(12);
    expect(first.units.components).toHaveLength(3);
    expect(first.units.materials).toHaveLength(3);
    expect(first.genealogyRelations).toHaveLength(21);
    const units = Object.values(first.units).flat();
    expect(new Set(units.map(({ id }) => id)).size).toBe(units.length);
    expect(new Set(units.map(({ traceCode }) => traceCode)).size).toBe(
      units.length,
    );
    expect(new Set(first.genealogyRelations.map(({ id }) => id)).size).toBe(21);
  });

  it('refuses dry-run and unsupported persistence profiles', () => {
    expect(() =>
      planSyntheticPersistenceSubset({ ...base, dryRun: true }),
    ).toThrow('Persistence requires dryRun=false.');
    expect(() =>
      planSyntheticPersistenceSubset({
        ...base,
        profile: 'LARGE',
        packCount: 3,
      }),
    ).toThrow('exact documented MEDIUM profiles only');
  });

  it('accepts only the exact documented MEDIUM profile', () => {
    const medium = planSyntheticPersistenceSubset({
      profile: 'MEDIUM',
      seed: 'phase5g3a-medium-unit-seed',
      namespace: 'SYN5G_MEDIUM_UNIT',
      dryRun: false,
    });
    expect(medium.config.packCount).toBe(2_000);
    expect(medium.units.packs).toHaveLength(2_000);
    expect(medium.units.modules).toHaveLength(4_000);
    expect(medium.units.cells).toHaveLength(32_000);
    expect(medium.units.components).toHaveLength(8_000);
    expect(medium.units.materials).toHaveLength(4_000);
    expect(() =>
      planSyntheticPersistenceSubset({
        profile: 'MEDIUM',
        seed: 'phase5g3a-medium-unit-seed',
        namespace: 'SYN5G_MEDIUM_UNIT',
        packCount: 1_999,
        dryRun: false,
      }),
    ).toThrow('exact documented MEDIUM profiles only');
  });

  it('rejects development and unknown targets through the actual mutation path', async () => {
    await expect(
      persistSyntheticSubset(
        'postgresql://local.invalid/battery_quality_traceability_dev',
        base,
      ),
    ).rejects.toThrow('restricted to battery_quality_traceability_test');
    await expect(
      persistSyntheticSubset('postgresql://local.invalid/unknown', base),
    ).rejects.toThrow('restricted to battery_quality_traceability_test');
  });

  it('requires exact cleanup confirmation before database access', async () => {
    await expect(
      cleanupSyntheticSubset(undefined, base, {
        operation: 'CLEANUP',
        planFingerprint: 'incorrect',
      }),
    ).rejects.toMatchObject({ reason: 'PLAN_CONFIRMATION_MISMATCH' });
  });

  it.each([
    ['quality', planSyntheticQuality, cleanupSyntheticQuality],
    ['NC', planSyntheticNc, cleanupSyntheticNc],
  ] as const)(
    'rejects invalid %s cleanup operations before database access',
    async (_label, planFor, cleanup) => {
      const fingerprint = planFor(base).planFingerprint;
      for (const operation of ['GENERATE', undefined, null, 42]) {
        await expect(
          cleanup(undefined, base, {
            operation,
            planFingerprint: fingerprint,
          } as never),
        ).rejects.toMatchObject({ reason: 'PLAN_CONFIRMATION_MISMATCH' });
      }
    },
  );

  it.each([
    ['quality', cleanupSyntheticQuality],
    ['NC', cleanupSyntheticNc],
  ] as const)(
    'preserves %s cleanup fingerprint rejection before database access',
    async (_label, cleanup) => {
      await expect(
        cleanup(undefined, base, {
          operation: 'CLEANUP',
          planFingerprint: 'incorrect',
        }),
      ).rejects.toMatchObject({ reason: 'PLAN_CONFIRMATION_MISMATCH' });
    },
  );
});
