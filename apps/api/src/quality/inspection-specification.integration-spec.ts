import { PrismaService } from '../prisma/prisma.service.js';
import {
  parseDiscoverySpecificationQuery,
  parseManagementSpecificationQuery,
} from './inspection-specification-query.js';
import { InspectionSpecificationRepository } from './inspection-specification.repository.js';
import { InspectionSpecificationService } from './inspection-specification.service.js';

const PREFIX = 'PHASE5C2_';

describe('Phase 5C-2 inspection specification reads', () => {
  const prisma = new PrismaService();
  const repository = new InspectionSpecificationRepository(prisma);
  const service = new InspectionSpecificationService(repository, prisma);

  async function cleanup() {
    const specifications = await prisma.client.inspectionSpecification.findMany(
      {
        where: { code: { startsWith: PREFIX } },
        select: { id: true },
      },
    );
    await prisma.client.inspectionSpecificationOption.deleteMany({
      where: { specificationId: { in: specifications.map(({ id }) => id) } },
    });
    await prisma.client.inspectionSpecification.deleteMany({
      where: { id: { in: specifications.map(({ id }) => id) } },
    });
  }

  beforeAll(async () => {
    await cleanup();
    const routeStep = await prisma.client.processRouteStep.findFirstOrThrow({
      orderBy: { id: 'asc' },
      select: { id: true, processDefinitionId: true },
    });
    const common = {
      targetUnitType: 'PACK' as const,
      processDefinitionId: routeStep.processDefinitionId,
    };
    await prisma.client.inspectionSpecification.createMany({
      data: [
        {
          ...common,
          code: `${PREFIX}ALPHA`,
          version: 1,
          name: 'Alpha numeric',
          description: 'Synthetic numeric.',
          resultType: 'NUMERIC',
          processRouteStepId: routeStep.id,
          lowerBound: '1.250000',
          upperBound: '2.500000',
          unitCode: 'DEMO_UNIT',
          lifecycle: 'PUBLISHED',
        },
        {
          ...common,
          code: `${PREFIX}ALPHA`,
          version: 2,
          name: 'Alpha draft category',
          resultType: 'CATEGORICAL',
          lifecycle: 'DRAFT',
        },
        {
          ...common,
          code: `${PREFIX}ALPHA`,
          version: 3,
          name: 'Alpha retired text',
          resultType: 'TEXT',
          lifecycle: 'RETIRED',
        },
        {
          ...common,
          code: `${PREFIX}BOOLEAN`,
          version: 1,
          name: 'Boolean expectation',
          resultType: 'BOOLEAN',
          expectedBooleanValue: true,
          lifecycle: 'PUBLISHED',
        },
        {
          ...common,
          code: `${PREFIX}BOOLEAN`,
          version: 2,
          name: 'Boolean expectation revision',
          resultType: 'BOOLEAN',
          expectedBooleanValue: false,
          lifecycle: 'PUBLISHED',
        },
        {
          ...common,
          code: `${PREFIX}CATEGORY`,
          version: 1,
          name: 'Category evidence',
          resultType: 'CATEGORICAL',
          lifecycle: 'PUBLISHED',
        },
        {
          ...common,
          code: `${PREFIX}TEXT`,
          version: 1,
          name: 'Text evidence',
          resultType: 'TEXT',
          lifecycle: 'PUBLISHED',
        },
        {
          ...common,
          code: `${PREFIX}VISUAL`,
          version: 1,
          name: 'Visual evidence',
          resultType: 'VISUAL',
          lifecycle: 'PUBLISHED',
        },
      ],
    });
    const optionOwners = await prisma.client.inspectionSpecification.findMany({
      where: {
        code: {
          in: [`${PREFIX}ALPHA`, `${PREFIX}CATEGORY`, `${PREFIX}VISUAL`],
        },
      },
      select: { id: true, code: true, version: true, resultType: true },
    });
    for (const owner of optionOwners.filter(({ resultType }) =>
      ['CATEGORICAL', 'VISUAL'].includes(resultType),
    )) {
      await prisma.client.inspectionSpecificationOption.createMany({
        data: [
          {
            specificationId: owner.id,
            resultType: owner.resultType,
            code: 'Z_REVIEW',
            description: 'Synthetic review state.',
            isAcceptable: false,
          },
          {
            specificationId: owner.id,
            resultType: owner.resultType,
            code: 'A_ACCEPT',
            description: 'Synthetic accepted state.',
            isAcceptable: true,
          },
        ],
      });
    }
  });

  afterAll(async () => {
    await cleanup();
    await prisma.onModuleDestroy();
  });

  it('returns all matching versions in deterministic order with bounded pages', async () => {
    const first = await service.listManagement(
      parseManagementSpecificationQuery({
        query: 'phase5c2_alpha',
        pageSize: '2',
      }),
    );
    expect(
      first.items.map(({ code, version }) => `${code}:${version}`),
    ).toEqual([`${PREFIX}ALPHA:3`, `${PREFIX}ALPHA:2`]);
    expect(first.page).toEqual({
      number: 1,
      size: 2,
      totalItems: 3,
      totalPages: 2,
    });
    const beyond = await service.listManagement(
      parseManagementSpecificationQuery({
        query: PREFIX,
        page: '20',
        pageSize: '2',
      }),
    );
    expect(beyond.items).toEqual([]);
    expect(beyond.page.totalItems).toBe(8);
  });

  it('filters management reads by lifecycle, type, target and process', async () => {
    const process = await prisma.client.processDefinition.findFirstOrThrow({
      where: { inspectionSpecifications: { some: { code: `${PREFIX}ALPHA` } } },
      select: { code: true },
    });
    const result = await service.listManagement(
      parseManagementSpecificationQuery({
        query: 'evidence',
        lifecycle: 'PUBLISHED',
        resultType: 'TEXT',
        targetUnitType: 'PACK',
        processCode: process.code.toLowerCase(),
      }),
    );
    expect(result.items.map(({ code }) => code)).toEqual([`${PREFIX}TEXT`]);
  });

  it('resolves equivalent-case exact identity and public route-step identity', async () => {
    const { detail } = await service.getManagementDetail(`${PREFIX}ALPHA`, 1);
    expect(detail.configuration).toEqual({
      type: 'NUMERIC',
      lowerBound: '1.25',
      upperBound: '2.5',
      unitCode: 'DEMO_UNIT',
    });
    expect(detail.routeStep).toMatchObject({
      productModelCode: expect.any(String),
      routeCode: expect.any(String),
      routeVersion: expect.any(Number),
      stepOrder: expect.any(Number),
    });
    expect(JSON.stringify(detail)).not.toMatch(
      /(?:^|["_])(id|Id|UUID|uuid)(?:["_:]|$)/,
    );
  });

  it('maps all five typed configurations and orders exact-version options', async () => {
    const identities = [
      [`${PREFIX}ALPHA`, 1, 'NUMERIC'],
      [`${PREFIX}BOOLEAN`, 1, 'BOOLEAN'],
      [`${PREFIX}CATEGORY`, 1, 'CATEGORICAL'],
      [`${PREFIX}VISUAL`, 1, 'VISUAL'],
      [`${PREFIX}TEXT`, 1, 'TEXT'],
    ] as const;
    for (const [code, version, type] of identities) {
      const { detail } = await service.getManagementDetail(code, version);
      expect(detail.configuration.type).toBe(type);
      if ('options' in detail.configuration) {
        expect(
          detail.configuration.options.map((option) => option.code),
        ).toEqual(['A_ACCEPT', 'Z_REVIEW']);
      }
    }
  });

  it('forces discovery to PUBLISHED without collapsing published families', async () => {
    const result = await service.listDiscovery(
      parseDiscoverySpecificationQuery({ query: PREFIX, pageSize: '100' }),
    );
    expect(result.items).toHaveLength(6);
    expect(result.items.every((item) => !('lifecycle' in item))).toBe(true);
    expect(
      result.items
        .filter(({ code }) => code === `${PREFIX}BOOLEAN`)
        .map(({ version }) => version),
    ).toEqual([2, 1]);
    await expect(
      service.getDiscoveryDetail(`${PREFIX}ALPHA`, 2),
    ).rejects.toMatchObject({
      response: { code: 'INSPECTION_SPECIFICATION_NOT_FOUND' },
    });
    await expect(
      service.getDiscoveryDetail(`${PREFIX}ALPHA`, 3),
    ).rejects.toMatchObject({
      response: { code: 'INSPECTION_SPECIFICATION_NOT_FOUND' },
    });
    expect(
      (await service.getDiscoveryDetail(`${PREFIX}ALPHA`, 1)).configuration
        .type,
    ).toBe('NUMERIC');
  });

  it('does not mutate specifications, options, inspections, or results', async () => {
    const before = await Promise.all([
      prisma.client.inspectionSpecification.count(),
      prisma.client.inspectionSpecificationOption.count(),
      prisma.client.inspection.count(),
      prisma.client.inspectionResult.count(),
    ]);
    await service.listManagement(
      parseManagementSpecificationQuery({ query: PREFIX }),
    );
    await service.listDiscovery(
      parseDiscoverySpecificationQuery({ query: PREFIX }),
    );
    await service.getManagementDetail(`${PREFIX}CATEGORY`, 1);
    await service.getDiscoveryDetail(`${PREFIX}CATEGORY`, 1);
    const after = await Promise.all([
      prisma.client.inspectionSpecification.count(),
      prisma.client.inspectionSpecificationOption.count(),
      prisma.client.inspection.count(),
      prisma.client.inspectionResult.count(),
    ]);
    expect(after).toEqual(before);
  });
});
