import { Prisma } from '../generated/prisma/client.js';
import { InspectionSpecificationService } from './inspection-specification.service.js';

const base = {
  id: 'private-specification-id',
  code: 'DEMO_SPEC',
  version: 1,
  name: 'Demo specification',
  description: null,
  lifecycle: 'PUBLISHED' as const,
  resultType: 'NUMERIC' as const,
  targetUnitType: 'PACK' as const,
  processDefinitionId: 'private-process-id',
  processRouteStepId: null,
  lowerBound: new Prisma.Decimal('10.250000'),
  upperBound: new Prisma.Decimal('20.500000'),
  unitCode: 'DEMO_UNIT',
  expectedBooleanValue: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
  processDefinition: { code: 'VERIFY', name: 'Verification' },
  processRouteStep: null,
  options: [],
};

describe('InspectionSpecificationService public mapping', () => {
  const repository = {
    findManagementDetail: vi.fn(),
    findDiscoveryDetail: vi.fn(),
    listManagement: vi.fn(),
    listDiscovery: vi.fn(),
  };
  const service = new InspectionSpecificationService(
    repository as never,
    {} as never,
  );

  beforeEach(() => vi.clearAllMocks());

  it('serializes Decimal bounds as strings without irrelevant fields', async () => {
    repository.findManagementDetail.mockResolvedValue(base);
    const { detail } = await service.getManagementDetail('DEMO_SPEC', 1);
    expect(detail.configuration).toEqual({
      type: 'NUMERIC',
      lowerBound: '10.25',
      upperBound: '20.5',
      unitCode: 'DEMO_UNIT',
    });
    expect(JSON.stringify(detail)).not.toContain('private-');
    expect(detail.configuration).not.toHaveProperty('expectedValue');
  });

  it('orders are preserved from repository and route identity is public', async () => {
    repository.findManagementDetail.mockResolvedValue({
      ...base,
      resultType: 'VISUAL',
      lowerBound: null,
      upperBound: null,
      unitCode: null,
      processRouteStepId: 'private-step-id',
      processRouteStep: {
        stepOrder: 3,
        processRoute: {
          code: 'DEMO_ROUTE',
          version: 2,
          productModel: { code: 'DEMO_MODEL' },
        },
      },
      options: [
        {
          resultType: 'VISUAL',
          code: 'A_CLEAR',
          description: null,
          isAcceptable: true,
        },
        {
          resultType: 'VISUAL',
          code: 'Z_MARK',
          description: null,
          isAcceptable: false,
        },
      ],
    });
    const { detail } = await service.getManagementDetail('DEMO_SPEC', 1);
    expect(detail.routeStep).toEqual({
      productModelCode: 'DEMO_MODEL',
      routeCode: 'DEMO_ROUTE',
      routeVersion: 2,
      stepOrder: 3,
    });
    expect(detail.configuration).toMatchObject({
      type: 'VISUAL',
      options: [{ code: 'A_CLEAR' }, { code: 'Z_MARK' }],
    });
  });

  it('rejects an impossible persisted Boolean shape safely', async () => {
    repository.findManagementDetail.mockResolvedValue({
      ...base,
      resultType: 'BOOLEAN',
      lowerBound: null,
      upperBound: null,
      unitCode: null,
      expectedBooleanValue: null,
    });
    await expect(
      service.getManagementDetail('DEMO_SPEC', 1),
    ).rejects.toMatchObject({
      response: {
        code: 'INSPECTION_SPECIFICATION_INTEGRITY_ERROR',
      },
    });
  });

  it('uses safe not-found semantics for management and discovery', async () => {
    repository.findManagementDetail.mockResolvedValue(null);
    repository.findDiscoveryDetail.mockResolvedValue(null);
    for (const operation of [
      service.getManagementDetail('UNKNOWN', 1),
      service.getDiscoveryDetail('UNKNOWN', 1),
    ]) {
      await expect(operation).rejects.toMatchObject({
        response: { code: 'INSPECTION_SPECIFICATION_NOT_FOUND' },
      });
    }
  });
});
