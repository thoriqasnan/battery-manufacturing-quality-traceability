import {
  InspectionOutcome,
  TraceableUnitType,
} from '../generated/prisma/enums.js';
import { DashboardRepository } from './dashboard.repository.js';
import { DashboardService } from './dashboard.service.js';

describe('DashboardService', () => {
  it('represents an empty database with evidence-backed zeroes and empty activity', async () => {
    const repository = {
      getOverviewEvidence: vi.fn().mockResolvedValue({
        unitCounts: [],
        productModels: [],
        inProgressCount: 0,
        inspectionCounts: [],
        nonconformanceCounts: [],
        recent: [],
      }),
    } as unknown as DashboardRepository;

    const result = await new DashboardService(repository).getOverview();

    expect(result.inventory).toEqual({
      totalUnits: 0,
      byType: [
        { unitType: 'PACK', count: 0 },
        { unitType: 'MODULE', count: 0 },
        { unitType: 'CELL', count: 0 },
        { unitType: 'COMPONENT', count: 0 },
        { unitType: 'MATERIAL', count: 0 },
      ],
    });
    expect(result.productModels).toEqual([]);
    expect(result.process).toEqual({
      inProgressCount: 0,
      recent: [],
      recentLimit: 10,
    });
    expect(result.quality).toEqual({
      scope: { mode: 'ALL_RECORDS', from: null, to: null },
      inspectionCount: 0,
      byOutcome: [
        { outcome: 'PASS', count: 0 },
        { outcome: 'NG', count: 0 },
      ],
      available: true,
    });
    expect(result.nonconformance).toEqual({
      openCount: 0,
      inProgressCount: 0,
    });
  });

  it('maps evidence into stable group order and API-safe activity fields', async () => {
    const repository = {
      getOverviewEvidence: vi.fn().mockResolvedValue({
        unitCounts: [
          { unitType: TraceableUnitType.CELL, count: 2 },
          { unitType: TraceableUnitType.PACK, count: 1 },
        ],
        productModels: [
          { code: 'DEMO_ALPHA', name: 'Demo Alpha Product', packCount: 1 },
        ],
        inProgressCount: 1,
        inspectionCounts: [
          { outcome: InspectionOutcome.NG, count: 1 },
          { outcome: InspectionOutcome.PASS, count: 2 },
        ],
        nonconformanceCounts: [{ status: 'OPEN', count: 1 }],
        recent: [
          {
            traceCode: 'PACK-DEMO-TEST-01',
            unitType: TraceableUnitType.PACK,
            productModel: {
              code: 'DEMO_ALPHA',
              name: 'Demo Alpha Product',
            },
            process: { code: 'DEMO_VERIFY', name: 'Demo Verify' },
            attemptNumber: 1,
            status: 'IN_PROGRESS',
            startedAt: new Date('2026-01-01T00:00:00Z'),
            finishedAt: null,
          },
        ],
      }),
    } as unknown as DashboardRepository;

    const result = await new DashboardService(repository).getOverview();

    expect(result.inventory.totalUnits).toBe(3);
    expect(result.inventory.byType.map((item) => item.unitType)).toEqual([
      'PACK',
      'MODULE',
      'CELL',
      'COMPONENT',
      'MATERIAL',
    ]);
    expect(result.quality.byOutcome).toEqual([
      { outcome: 'PASS', count: 2 },
      { outcome: 'NG', count: 1 },
    ]);
    expect(result.process.recent[0]).toEqual({
      traceCode: 'PACK-DEMO-TEST-01',
      unitType: 'PACK',
      productModel: {
        code: 'DEMO_ALPHA',
        name: 'Demo Alpha Product',
      },
      process: { code: 'DEMO_VERIFY', name: 'Demo Verify' },
      attemptNumber: 1,
      status: 'IN_PROGRESS',
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: null,
    });
    expect(result).not.toHaveProperty('id');
  });
});
