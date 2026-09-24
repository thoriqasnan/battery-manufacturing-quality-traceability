import { PrismaService } from '../prisma/prisma.service.js';
import { TraceableUnitNotFoundError } from './traceability.errors.js';
import { TraceabilityIntegrityService } from './traceability-integrity.service.js';
import { TraceabilityRepository } from './traceability.repository.js';
import { TraceabilityService } from './traceability.service.js';

describe('Phase 2G deterministic traceability queries', () => {
  const prisma = new PrismaService();
  const repository = new TraceabilityRepository(prisma);
  const service = new TraceabilityService(repository);
  const integrity = new TraceabilityIntegrityService(prisma);

  afterAll(async () => prisma.onModuleDestroy());

  it('traverses forward through multiple genealogy levels', async () => {
    const result = await service.forwardGenealogy('PACK-DEMO-ALPHA-PASS');
    expect(result.edges.map((edge) => edge.childTraceCode)).toEqual([
      'MODULE-DEMO-ALPHA-PASS-01',
      'CELL-DEMO-ALPHA-PASS-01',
      'CELL-DEMO-ALPHA-PASS-02',
      'MATERIAL-DEMO-ALPHA-01',
    ]);
    expect(Math.max(...result.edges.map((edge) => edge.depth))).toBe(2);
  });

  it('traverses reverse genealogy from cell to pack', async () => {
    const result = await service.reverseGenealogy('CELL-DEMO-ALPHA-PASS-01');
    expect(result.edges.map((edge) => edge.parentTraceCode)).toEqual([
      'MODULE-DEMO-ALPHA-PASS-01',
      'PACK-DEMO-ALPHA-PASS',
    ]);
  });

  it('distinguishes current and historical relationships', async () => {
    const current = await service.reverseGenealogy('COMP-DEMO-OLD');
    const historical = await service.reverseGenealogy('COMP-DEMO-OLD', {
      mode: 'historical',
    });
    expect(current.edges).toHaveLength(0);
    expect(historical.edges).toHaveLength(2);
    expect(historical.edges[0]?.isCurrent).toBe(false);
  });

  it('returns chronological replacement occupants', async () => {
    const history = await service.replacementHistory(
      'MODULE-DEMO-ALPHA-RETEST-01',
      'SENSOR-01',
    );
    expect(
      history.map((edge) => [edge.childTraceCode, edge.isCurrent]),
    ).toEqual([
      ['COMP-DEMO-OLD', false],
      ['COMP-DEMO-NEW', true],
    ]);
  });

  it('preserves chronological process attempts and method snapshots', async () => {
    const history = await service.processHistory('PACK-DEMO-ALPHA-RETEST');
    expect(history.map((entry) => entry.startedAt.getTime())).toEqual(
      [...history]
        .map((entry) => entry.startedAt.getTime())
        .sort((a, b) => a - b),
    );
    expect(
      history
        .filter((entry) => entry.processCode === 'DEMO_VERIFY')
        .map((entry) => entry.attemptNumber),
    ).toEqual([1, 2]);
    expect(history.every((entry) => entry.status === 'COMPLETED')).toBe(true);
  });

  it('preserves NG then PASS quality evidence', async () => {
    const history = await service.qualityHistory('PACK-DEMO-ALPHA-RETEST');
    expect(
      history.map((entry) => [entry.attemptNumber, entry.outcome]),
    ).toEqual([
      [1, 'NG'],
      [2, 'PASS'],
    ]);
  });

  it('reconstructs simple and escalated nonconformance histories', async () => {
    const simple = await service.nonconformanceHistory(
      'PACK-DEMO-ALPHA-RETEST',
    );
    expect(simple[0]?.abnormalCases).toHaveLength(0);
    expect(simple[0]?.actions.map((action) => action.actionType)).toEqual([
      'CORRECTION',
      'RETEST',
    ]);
    expect(simple[0]?.verifications[0]?.inspection.outcome).toBe('PASS');
    expect(simple[0]?.dispositions.map((item) => item.dispositionType)).toEqual(
      ['CONTINUE'],
    );

    const escalated = await service.nonconformanceHistory(
      'PACK-DEMO-BETA-ESCALATED',
    );
    expect(escalated[0]?.abnormalCases).toHaveLength(1);
    expect(escalated[0]?.actions.map((action) => action.actionType)).toEqual([
      'ESCALATION',
      'REPLACEMENT',
      'RETEST',
    ]);
    expect(escalated[0]?.verifications[0]?.inspection.outcome).toBe('PASS');
    expect(
      escalated[0]?.dispositions.map((item) => item.dispositionType),
    ).toEqual(['RETURN_IQC', 'CONTINUE']);
  });

  it('composes a complete pack traceability view without flattening histories', async () => {
    const result = await service.completeTraceability(
      'PACK-DEMO-BETA-ESCALATED',
      { mode: 'historical' },
    );
    expect(result.identity.productModel?.code).toBe('DEMO_BETA');
    expect(result.genealogy.edges.length).toBeGreaterThan(0);
    expect(result.processes.length).toBeGreaterThan(0);
    expect(result.quality.map((entry) => entry.outcome)).toEqual([
      'NG',
      'PASS',
    ]);
    expect(result.nonconformances).toHaveLength(1);
  });

  it('fails explicitly for an unknown trace code', async () => {
    await expect(
      service.completeTraceability('PACK-DEMO-UNKNOWN'),
    ).rejects.toBeInstanceOf(TraceableUnitNotFoundError);
  });

  it('validates the deterministic seed graph and histories', async () => {
    const report = await integrity.validateSeedDataset();
    expect(report.valid).toBe(true);
    expect(report.checks).toHaveLength(9);
    expect(report.checks.every((check) => check.passed)).toBe(true);
  });
});
