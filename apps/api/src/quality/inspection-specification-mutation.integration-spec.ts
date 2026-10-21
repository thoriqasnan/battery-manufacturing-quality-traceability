import { PrismaService } from '../prisma/prisma.service.js';
import {
  parseCreateSpecification,
  parseReplaceSpecification,
} from './inspection-specification-mutation.js';
import { InspectionSpecificationRepository } from './inspection-specification.repository.js';
import { InspectionSpecificationService } from './inspection-specification.service.js';
import { normalizeSpecificationCode } from './inspection-specification-query.js';

const PREFIX = 'PHASE5C_DB_';

describe('Phase 5C-3 specification mutation transactions', () => {
  const prisma = new PrismaService();
  const service = new InspectionSpecificationService(
    new InspectionSpecificationRepository(prisma),
    prisma,
  );
  let processCode: string;

  async function cleanup() {
    const rows = await prisma.client.inspectionSpecification.findMany({
      where: { code: { startsWith: PREFIX } },
      select: { id: true },
    });
    await prisma.client.inspectionResult.deleteMany({
      where: { specificationId: { in: rows.map(({ id }) => id) } },
    });
    await prisma.client.inspection.deleteMany({
      where: { specificationId: { in: rows.map(({ id }) => id) } },
    });
    await prisma.client.inspectionSpecificationOption.deleteMany({
      where: { specificationId: { in: rows.map(({ id }) => id) } },
    });
    await prisma.client.inspectionSpecification.deleteMany({
      where: { id: { in: rows.map(({ id }) => id) } },
    });
  }

  beforeAll(async () => {
    await cleanup();
    processCode = (
      await prisma.client.processDefinition.findFirstOrThrow({
        orderBy: { id: 'asc' },
        select: { code: true },
      })
    ).code;
  });
  afterAll(async () => {
    await cleanup();
    await prisma.onModuleDestroy();
  });

  const input = (
    code: string,
    configuration: Record<string, unknown> = { type: 'TEXT' },
  ) =>
    parseCreateSpecification({
      code,
      name: 'Mutation test',
      targetUnitType: 'PACK',
      processCode,
      configuration,
    });

  it('serializes equivalent normalized initial creation to one success and one safe conflict', async () => {
    const results = await Promise.allSettled([
      service.create(input(`${PREFIX}race`)),
      service.create(input(` ${PREFIX}RACE `)),
    ]);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    const failure = results.find(({ status }) => status === 'rejected');
    expect(failure).toMatchObject({
      status: 'rejected',
      reason: {
        status: 409,
        response: { code: 'SPECIFICATION_CODE_CONFLICT' },
      },
    });
    expect(
      await prisma.client.inspectionSpecification.count({
        where: { code: `${PREFIX}RACE` },
      }),
    ).toBe(1);
  });

  it('fully replaces type and options atomically and rejects stale concurrent edits', async () => {
    const code = `${PREFIX}REPLACE`;
    const created = await service.create(
      input(code, {
        type: 'CATEGORICAL',
        options: [
          { code: 'YES', isAcceptable: true },
          { code: 'NO', isAcceptable: false },
        ],
      }),
    );
    const replacement = parseReplaceSpecification({
      name: 'Numeric replacement',
      description: null,
      targetUnitType: 'PACK',
      processCode,
      routeStep: null,
      configuration: {
        type: 'NUMERIC',
        lowerBound: '1.25',
        upperBound: '2.5',
        unitCode: 'SYNTH',
      },
    });
    const races = await Promise.allSettled([
      service.replace(code, 1, replacement, created.etag),
      service.replace(
        code,
        1,
        { ...replacement, name: 'Losing edit' },
        created.etag,
      ),
    ]);
    expect(races.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(races.find(({ status }) => status === 'rejected')).toMatchObject({
      status: 'rejected',
      reason: { response: { code: 'SPECIFICATION_WRITE_CONFLICT' } },
    });
    const stored =
      await prisma.client.inspectionSpecification.findUniqueOrThrow({
        where: { code_version: { code, version: 1 } },
        include: { options: true },
      });
    expect(stored.resultType).toBe('NUMERIC');
    expect(stored.options).toEqual([]);
    expect(stored.lowerBound?.toString()).toBe('1.25');
  });

  it('publishes all five complete types, rejects incomplete publication, and retires immutably', async () => {
    const configurations = [
      { type: 'NUMERIC', lowerBound: null, upperBound: '9', unitCode: null },
      { type: 'BOOLEAN', expectedValue: false },
      { type: 'CATEGORICAL', options: [{ code: 'PASS', isAcceptable: true }] },
      { type: 'VISUAL', options: [{ code: 'CLEAR', isAcceptable: true }] },
      { type: 'TEXT' },
    ];
    for (const [index, configuration] of configurations.entries()) {
      const code = `${PREFIX}TYPE_${index}`;
      const created = await service.create(input(code, configuration));
      const published = await service.publish(code, 1, created.etag);
      expect(published.detail.lifecycle).toBe('PUBLISHED');
      await expect(
        service.replace(code, 1, input(`${PREFIX}IGNORED`), published.etag),
      ).rejects.toMatchObject({
        response: { code: 'INVALID_SPECIFICATION_LIFECYCLE_TRANSITION' },
      });
      const retired = await service.retire(code, 1, published.etag);
      expect(retired.detail.lifecycle).toBe('RETIRED');
      await expect(service.retire(code, 1, retired.etag)).rejects.toMatchObject(
        { response: { code: 'INVALID_SPECIFICATION_LIFECYCLE_TRANSITION' } },
      );
    }
    const incomplete = await service.create(
      input(`${PREFIX}INCOMPLETE`, {
        type: 'NUMERIC',
        lowerBound: null,
        upperBound: null,
        unitCode: null,
      }),
    );
    await expect(
      service.publish(`${PREFIX}INCOMPLETE`, 1, incomplete.etag),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'INVALID_REQUEST' },
    });
    expect(
      (await service.getManagementDetail(`${PREFIX}INCOMPLETE`, 1)).detail
        .lifecycle,
    ).toBe('DRAFT');
  });

  it('copies exact PUBLISHED and RETIRED sources into server-allocated DRAFT versions', async () => {
    const code = `${PREFIX}COPY`;
    const source = await service.create(
      input(code, {
        type: 'CATEGORICAL',
        options: [
          { code: 'PASS', description: 'acceptable', isAcceptable: true },
          { code: 'FAIL', description: 'reject', isAcceptable: false },
        ],
      }),
    );
    const published = await service.publish(code, 1, source.etag);
    const sourceBefore =
      await prisma.client.inspectionSpecification.findUniqueOrThrow({
        where: { code_version: { code, version: 1 } },
        include: { options: { orderBy: { code: 'asc' } } },
      });
    const version2 = await service.createVersion(code, { sourceVersion: 1 });
    expect(version2.detail).toMatchObject({
      code,
      version: 2,
      lifecycle: 'DRAFT',
      name: sourceBefore.name,
      configuration: published.detail.configuration,
    });
    const copied =
      await prisma.client.inspectionSpecification.findUniqueOrThrow({
        where: { code_version: { code, version: 2 } },
        include: { options: { orderBy: { code: 'asc' } } },
      });
    expect(
      copied.options.map(({ code, description, isAcceptable }) => ({
        code,
        description,
        isAcceptable,
      })),
    ).toEqual(
      sourceBefore.options.map(({ code, description, isAcceptable }) => ({
        code,
        description,
        isAcceptable,
      })),
    );
    expect(copied.options.map(({ id }) => id)).not.toEqual(
      sourceBefore.options.map(({ id }) => id),
    );
    expect(
      copied.options.every((option) => option.specificationId === copied.id),
    ).toBe(true);
    expect(
      await prisma.client.inspectionSpecification.findUniqueOrThrow({
        where: { code_version: { code, version: 1 } },
        include: { options: { orderBy: { code: 'asc' } } },
      }),
    ).toEqual(sourceBefore);

    const retired = await service.retire(code, 1, published.etag);
    const version3 = await service.createVersion(code, { sourceVersion: 1 });
    expect(version3.detail).toMatchObject({
      version: 3,
      lifecycle: 'DRAFT',
      configuration: retired.detail.configuration,
    });
    expect((await service.getManagementDetail(code, 1)).detail.lifecycle).toBe(
      'RETIRED',
    );
  });

  it('rejects DRAFT and unknown exact sources safely', async () => {
    const code = `${PREFIX}SOURCE_RULES`;
    await service.create(input(code));
    await expect(
      service.createVersion(code, { sourceVersion: 1 }),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_SPECIFICATION_LIFECYCLE_TRANSITION' },
    });
    await expect(
      service.createVersion(code, { sourceVersion: 99 }),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'INSPECTION_SPECIFICATION_NOT_FOUND' },
    });
    await expect(
      service.createVersion(`${PREFIX}UNKNOWN`, { sourceVersion: 1 }),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'INSPECTION_SPECIFICATION_NOT_FOUND' },
    });
  });

  it('uses max plus one across gaps and serializes equivalent-case concurrent allocation', async () => {
    const code = `${PREFIX}CONCURRENT`;
    const created = await service.create(
      input(code, {
        type: 'VISUAL',
        options: [{ code: 'CLEAR', isAcceptable: true }],
      }),
    );
    await service.publish(code, 1, created.etag);
    const sourceRow =
      await prisma.client.inspectionSpecification.findUniqueOrThrow({
        where: { code_version: { code, version: 1 } },
      });
    await prisma.client.inspectionSpecification.create({
      data: {
        code,
        version: 4,
        name: sourceRow.name,
        description: sourceRow.description,
        resultType: sourceRow.resultType,
        targetUnitType: sourceRow.targetUnitType,
        processDefinitionId: sourceRow.processDefinitionId,
        processRouteStepId: sourceRow.processRouteStepId,
        lowerBound: sourceRow.lowerBound,
        upperBound: sourceRow.upperBound,
        unitCode: sourceRow.unitCode,
        expectedBooleanValue: sourceRow.expectedBooleanValue,
        lifecycle: 'PUBLISHED' as const,
      },
    });
    const first = await service.createVersion(code, { sourceVersion: 1 });
    expect(first.detail.version).toBe(5);
    const concurrent = await Promise.all([
      service.createVersion(normalizeSpecificationCode(code.toLowerCase()), {
        sourceVersion: 1,
      }),
      service.createVersion(code, { sourceVersion: 4 }),
    ]);
    expect(
      concurrent.map(({ detail }) => detail.version).sort((a, b) => a - b),
    ).toEqual([6, 7]);
    expect(
      await prisma.client.inspectionSpecification.count({ where: { code } }),
    ).toBe(5);
  });

  it('copies scalar configurations without fabricating options and preserves inspection history', async () => {
    for (const [suffix, configuration] of Object.entries({
      NUMERIC: {
        type: 'NUMERIC',
        lowerBound: '1.25',
        upperBound: '9.5',
        unitCode: 'SYNTH',
      },
      BOOLEAN: { type: 'BOOLEAN', expectedValue: false },
      TEXT: { type: 'TEXT' },
    })) {
      const code = `${PREFIX}${suffix}_COPY`;
      const created = await service.create(input(code, configuration));
      const published = await service.publish(code, 1, created.etag);
      const copy = await service.createVersion(code, { sourceVersion: 1 });
      expect(copy.detail.configuration).toEqual(published.detail.configuration);
      const stored =
        await prisma.client.inspectionSpecification.findUniqueOrThrow({
          where: { code_version: { code, version: 2 } },
          include: { options: true },
        });
      expect(stored.options).toEqual([]);
    }

    const historyCode = `${PREFIX}HISTORY_COPY`;
    const created = await service.create(input(historyCode));
    const published = await service.publish(historyCode, 1, created.etag);
    const source =
      await prisma.client.inspectionSpecification.findUniqueOrThrow({
        where: { code_version: { code: historyCode, version: 1 } },
      });
    const unit = await prisma.client.traceableUnit.findFirstOrThrow({
      where: { unitType: 'PACK' },
      select: { id: true },
    });
    const inspection = await prisma.client.inspection.create({
      data: {
        traceableUnitId: unit.id,
        specificationId: source.id,
        processDefinitionId: source.processDefinitionId,
        resultType: source.resultType,
        targetUnitType: source.targetUnitType,
        attemptNumber: 991,
        outcome: 'PASS',
        inspectedAt: new Date('2026-01-01T00:00:00Z'),
      },
    });
    const copy = await service.createVersion(historyCode, { sourceVersion: 1 });
    expect(
      (
        await prisma.client.inspection.findUniqueOrThrow({
          where: { id: inspection.id },
        })
      ).specificationId,
    ).toBe(source.id);
    expect(copy.detail.lifecycle).toBe('DRAFT');
    expect((await service.getManagementDetail(historyCode, 1)).detail).toEqual(
      published.detail,
    );
  });
});
