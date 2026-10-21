import type { AuthenticatedUserIdentity } from '../auth/authentication.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  parseIdempotencyKey,
  parseInspectionRequest,
} from './inspection-entry.js';
import { InspectionEntryService } from './inspection-entry.service.js';
import { InspectionSpecificationRepository } from './inspection-specification.repository.js';
import { InspectionSpecificationService } from './inspection-specification.service.js';

const PREFIX = 'PHASE5D3_';
const USER_PREFIX = 'phase5d3.';

describe('Phase 5D-3 atomic inspection persistence', () => {
  const prisma = new PrismaService();
  const service = new InspectionEntryService(prisma);
  const specificationService = new InspectionSpecificationService(
    new InspectionSpecificationRepository(prisma),
    prisma,
  );
  let actor: AuthenticatedUserIdentity;
  let process: { id: string; code: string };
  let productModelId: string;

  async function cleanup() {
    await prisma.client.inspectionSubmission.deleteMany({
      where: { user: { username: { startsWith: USER_PREFIX } } },
    });
    const specs = await prisma.client.inspectionSpecification.findMany({
      where: { code: { startsWith: PREFIX } },
      select: { id: true },
    });
    await prisma.client.inspectionResult.deleteMany({
      where: { specificationId: { in: specs.map(({ id }) => id) } },
    });
    await prisma.client.inspection.deleteMany({
      where: { specificationId: { in: specs.map(({ id }) => id) } },
    });
    await prisma.client.inspectionSpecificationOption.deleteMany({
      where: { specificationId: { in: specs.map(({ id }) => id) } },
    });
    await prisma.client.inspectionSpecification.deleteMany({
      where: { id: { in: specs.map(({ id }) => id) } },
    });
    await prisma.client.processExecution.deleteMany({
      where: { traceableUnit: { traceCode: { startsWith: PREFIX } } },
    });
    await prisma.client.traceableUnit.deleteMany({
      where: { traceCode: { startsWith: PREFIX } },
    });
    await prisma.client.user.deleteMany({
      where: { username: { startsWith: USER_PREFIX } },
    });
  }

  beforeAll(async () => {
    await cleanup();
    process = await prisma.client.processDefinition.findFirstOrThrow({
      orderBy: { id: 'asc' },
      select: { id: true, code: true },
    });
    productModelId = (
      await prisma.client.productModel.findFirstOrThrow({
        orderBy: { id: 'asc' },
        select: { id: true },
      })
    ).id;
    const user = await prisma.client.user.create({
      data: {
        username: `${USER_PREFIX}quality`,
        passwordHash: 'synthetic-test-hash',
        role: 'QUALITY',
      },
    });
    actor = {
      id: user.id,
      username: user.username,
      role: 'QUALITY',
      isActive: true,
    };
  });
  afterAll(async () => {
    await cleanup();
    await prisma.onModuleDestroy();
  });

  async function unit(suffix: string, unitType: 'PACK' | 'MODULE' = 'PACK') {
    return prisma.client.traceableUnit.create({
      data: {
        traceCode: `${PREFIX}${suffix}`,
        unitType,
        ...(unitType === 'PACK' ? { productModelId } : {}),
      },
    });
  }

  async function specification(
    code: string,
    resultType: 'NUMERIC' | 'BOOLEAN' | 'CATEGORICAL' | 'VISUAL' | 'TEXT',
    lifecycle: 'DRAFT' | 'PUBLISHED' | 'RETIRED' = 'PUBLISHED',
  ) {
    return prisma.client.inspectionSpecification.create({
      data: {
        code: `${PREFIX}${code}`,
        version: 1,
        name: `${code} inspection`,
        lifecycle,
        resultType,
        targetUnitType: 'PACK',
        processDefinitionId: process.id,
        ...(resultType === 'NUMERIC'
          ? { lowerBound: '10', upperBound: '20', unitCode: 'SYNTH' }
          : {}),
        ...(resultType === 'BOOLEAN' ? { expectedBooleanValue: true } : {}),
        ...(resultType === 'CATEGORICAL' || resultType === 'VISUAL'
          ? {
              options: {
                create: [
                  { code: 'PASS', isAcceptable: true },
                  { code: 'FAIL', isAcceptable: false },
                ],
              },
            }
          : {}),
      },
      include: { options: true },
    });
  }

  function request(
    traceCode: string,
    code: string,
    evidence: Record<string, unknown>,
    execution?: { processCode: string; attempt: number },
  ) {
    return parseInspectionRequest({
      traceCode,
      specification: { code: `${PREFIX}${code}`, version: 1 },
      ...(execution ? { execution } : {}),
      inspectedAt: '2026-10-07T00:00:00Z',
      evidence,
    });
  }

  it('atomically persists and reconstructs all five result types with inspector attribution', async () => {
    const cases = [
      ['NUM', 'NUMERIC', { type: 'NUMERIC', value: '10.000000' }, 'PASS'],
      ['BOOL', 'BOOLEAN', { type: 'BOOLEAN', value: false }, 'NG'],
      [
        'CAT',
        'CATEGORICAL',
        { type: 'CATEGORICAL', optionCode: 'PASS' },
        'PASS',
      ],
      ['VIS', 'VISUAL', { type: 'VISUAL', optionCode: 'FAIL' }, 'NG'],
      [
        'TEXT',
        'TEXT',
        { type: 'TEXT', value: ' synthetic note ', outcome: 'NG' },
        'NG',
      ],
    ] as const;
    const ncBefore = await prisma.client.nonconformance.count();
    for (const [suffix, type, evidence, outcome] of cases) {
      const storedUnit = await unit(`UNIT_${suffix}`);
      await specification(`SPEC_${suffix}`, type);
      const result = await service.submit(
        actor,
        parseIdempotencyKey(`phase5d3-${suffix.toLowerCase()}-key-0001`),
        request(storedUnit.traceCode, `SPEC_${suffix}`, evidence),
      );
      expect(result).toMatchObject({
        status: 201,
        replayed: false,
        response: { attemptNumber: 1, outcome, execution: null },
      });
      const stored = await prisma.client.inspection.findFirstOrThrow({
        where: { traceableUnitId: storedUnit.id },
        include: { result: true, submission: true },
      });
      expect(stored.inspectorUserId).toBe(actor.id);
      expect(stored.result).not.toBeNull();
      expect(stored.submission).toMatchObject({
        operation: 'inspection.submit',
        operationVersion: 1,
        responseContractVersion: 1,
        responseStatus: 201,
      });
      if (type === 'NUMERIC')
        expect(stored.result?.numericValue?.toString()).toBe('10');
    }
    expect(await prisma.client.nonconformance.count()).toBe(ncBefore);
  });

  it('resolves optional execution and rejects incompatible or ineligible context safely', async () => {
    const storedUnit = await unit('CONTEXT');
    await specification('CONTEXT', 'TEXT');
    await prisma.client.processExecution.create({
      data: {
        traceableUnitId: storedUnit.id,
        processDefinitionId: process.id,
        attemptNumber: 1,
        status: 'COMPLETED',
        executionMethod: 'MANUAL',
        startedAt: new Date('2026-10-06T23:00:00Z'),
        finishedAt: new Date('2026-10-06T23:01:00Z'),
      },
    });
    const result = await service.submit(
      actor,
      'phase5d3-context-key',
      request(
        storedUnit.traceCode,
        'CONTEXT',
        { type: 'TEXT', value: 'ok', outcome: 'PASS' },
        { processCode: process.code, attempt: 1 },
      ),
    );
    expect(result.response.execution).toEqual({
      processCode: process.code,
      attempt: 1,
    });

    const module = await unit('WRONG_TYPE', 'MODULE');
    await expect(
      service.submit(
        actor,
        'phase5d3-wrong-type',
        request(module.traceCode, 'CONTEXT', {
          type: 'TEXT',
          value: 'x',
          outcome: 'PASS',
        }),
      ),
    ).rejects.toMatchObject({
      response: { code: 'INCOMPATIBLE_INSPECTION_CONTEXT' },
    });
    await expect(
      service.submit(
        actor,
        'phase5d3-unknown-unit',
        request(`${PREFIX}UNKNOWN`, 'CONTEXT', {
          type: 'TEXT',
          value: 'x',
          outcome: 'PASS',
        }),
      ),
    ).rejects.toMatchObject({ response: { code: 'TRACE_UNIT_NOT_FOUND' } });
    await expect(
      service.submit(
        actor,
        'phase5d3-unknown-spec',
        request(storedUnit.traceCode, 'UNKNOWN', {
          type: 'TEXT',
          value: 'x',
          outcome: 'PASS',
        }),
      ),
    ).rejects.toMatchObject({
      response: { code: 'INSPECTION_SPECIFICATION_NOT_FOUND' },
    });
    await specification('DRAFT', 'TEXT', 'DRAFT');
    await specification('RETIRED', 'TEXT', 'RETIRED');
    for (const code of ['DRAFT', 'RETIRED'])
      await expect(
        service.submit(
          actor,
          `phase5d3-${code.toLowerCase()}-key`,
          request(storedUnit.traceCode, code, {
            type: 'TEXT',
            value: 'x',
            outcome: 'PASS',
          }),
        ),
      ).rejects.toMatchObject({
        response: { code: 'INSPECTION_SPECIFICATION_NOT_PUBLISHED' },
      });
    await expect(
      service.submit(
        actor,
        'phase5d3-wrong-result',
        request(storedUnit.traceCode, 'CONTEXT', {
          type: 'BOOLEAN',
          value: true,
        }),
      ),
    ).rejects.toMatchObject({ response: { code: 'INVALID_TYPED_RESULT' } });
  });

  it('provides durable replay and safe same-key conflict without extra history', async () => {
    const storedUnit = await unit('REPLAY');
    await specification('REPLAY', 'NUMERIC');
    const parsed = request(storedUnit.traceCode, 'REPLAY', {
      type: 'NUMERIC',
      value: '15',
    });
    const first = await service.submit(actor, 'phase5d3-replay-key', parsed);
    const replay = await service.submit(actor, 'phase5d3-replay-key', parsed);
    expect(replay).toEqual({ ...first, replayed: true });
    await expect(
      service.submit(
        actor,
        'phase5d3-replay-key',
        request(storedUnit.traceCode, 'REPLAY', {
          type: 'NUMERIC',
          value: '16',
        }),
      ),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_CONFLICT' } });
    expect(
      await prisma.client.inspection.count({
        where: { traceableUnitId: storedUnit.id },
      }),
    ).toBe(1);
    expect(
      await prisma.client.inspectionResult.count({
        where: { inspection: { traceableUnitId: storedUnit.id } },
      }),
    ).toBe(1);
  });

  it('serializes concurrent same-key conflicts to one write and one safe conflict', async () => {
    const storedUnit = await unit('KEY_CONFLICT');
    await specification('KEY_CONFLICT', 'NUMERIC');
    const calls = await Promise.allSettled([
      service.submit(
        actor,
        'phase5d3-conflict-key',
        request(storedUnit.traceCode, 'KEY_CONFLICT', {
          type: 'NUMERIC',
          value: '11',
        }),
      ),
      service.submit(
        actor,
        'phase5d3-conflict-key',
        request(storedUnit.traceCode, 'KEY_CONFLICT', {
          type: 'NUMERIC',
          value: '12',
        }),
      ),
    ]);
    expect(calls.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(calls.find(({ status }) => status === 'rejected')).toMatchObject({
      status: 'rejected',
      reason: { response: { code: 'IDEMPOTENCY_CONFLICT' } },
    });
    expect(
      await prisma.client.inspection.count({
        where: { traceableUnitId: storedUnit.id },
      }),
    ).toBe(1);
  });

  it('serializes identical and different-key concurrent requests and allocates max plus one', async () => {
    const storedUnit = await unit('CONCURRENT');
    const spec = await specification('CONCURRENT', 'BOOLEAN');
    const parsed = request(storedUnit.traceCode, 'CONCURRENT', {
      type: 'BOOLEAN',
      value: true,
    });
    const identical = await Promise.all([
      service.submit(actor, 'phase5d3-identical-key', parsed),
      service.submit(actor, 'phase5d3-identical-key', parsed),
    ]);
    expect(
      identical
        .map(({ replayed }) => replayed)
        .sort((left, right) => Number(left) - Number(right)),
    ).toEqual([false, true]);
    const different = await Promise.all([
      service.submit(actor, 'phase5d3-different-a', parsed),
      service.submit(actor, 'phase5d3-different-b', parsed),
    ]);
    expect(
      different
        .map(({ response }) => response.attemptNumber)
        .sort((a, b) => a - b),
    ).toEqual([2, 3]);
    const gapInspection = await prisma.client.inspection.create({
      data: {
        traceableUnitId: storedUnit.id,
        specificationId: spec.id,
        processDefinitionId: process.id,
        inspectorUserId: actor.id,
        resultType: 'BOOLEAN',
        targetUnitType: 'PACK',
        attemptNumber: 8,
        outcome: 'PASS',
        inspectedAt: new Date('2026-10-06T00:00:00Z'),
      },
    });
    await prisma.client.inspectionResult.create({
      data: {
        inspectionId: gapInspection.id,
        specificationId: spec.id,
        resultType: 'BOOLEAN',
        booleanValue: true,
      },
    });
    const afterGap = await service.submit(
      actor,
      'phase5d3-after-gap-key',
      parsed,
    );
    expect(afterGap.response.attemptNumber).toBe(9);
  });

  it('coordinates submission with retirement through the exact specification lock', async () => {
    const storedUnit = await unit('RETIRE_RACE');
    await specification('RETIRE_RACE', 'TEXT');
    const code = `${PREFIX}RETIRE_RACE`;
    const current = await specificationService.getManagementDetail(code, 1);
    const [submission, retirement] = await Promise.allSettled([
      service.submit(
        actor,
        'phase5d3-retire-race',
        request(storedUnit.traceCode, 'RETIRE_RACE', {
          type: 'TEXT',
          value: 'race',
          outcome: 'PASS',
        }),
      ),
      specificationService.retire(code, 1, current.etag),
    ]);
    expect(retirement.status).toBe('fulfilled');
    if (submission.status === 'rejected')
      expect(submission.reason).toMatchObject({
        response: { code: 'INSPECTION_SPECIFICATION_NOT_PUBLISHED' },
      });
    else expect(submission.value.response.outcome).toBe('PASS');
    expect(
      (await specificationService.getManagementDetail(code, 1)).detail
        .lifecycle,
    ).toBe('RETIRED');
    expect(
      await prisma.client.inspection.count({
        where: { traceableUnitId: storedUnit.id },
      }),
    ).toBe(submission.status === 'fulfilled' ? 1 : 0);
  });

  it('rolls back a failed write and permits an unpoisoned retry with attempt one', async () => {
    const storedUnit = await unit('ROLLBACK');
    await specification('ROLLBACK', 'BOOLEAN');
    const userId = '55555555-5555-4555-8555-555555555555';
    const retryActor = {
      id: userId,
      username: `${USER_PREFIX}retry`,
      role: 'QUALITY' as const,
      isActive: true as const,
    };
    const parsed = request(storedUnit.traceCode, 'ROLLBACK', {
      type: 'BOOLEAN',
      value: true,
    });
    await expect(
      service.submit(retryActor, 'phase5d3-rollback-key', parsed),
    ).rejects.toMatchObject({
      response: { code: 'INSPECTION_PERSISTENCE_ERROR' },
    });
    expect(
      await prisma.client.inspection.count({
        where: { traceableUnitId: storedUnit.id },
      }),
    ).toBe(0);
    expect(
      await prisma.client.inspectionSubmission.count({ where: { userId } }),
    ).toBe(0);
    await prisma.client.user.create({
      data: {
        id: userId,
        username: retryActor.username,
        passwordHash: 'synthetic-test-hash',
        role: 'QUALITY',
      },
    });
    const retried = await service.submit(
      retryActor,
      'phase5d3-rollback-key',
      parsed,
    );
    expect(retried.response.attemptNumber).toBe(1);
  });

  it('uses PostgreSQL transaction time for the five-minute future boundary', async () => {
    const storedUnit = await unit('TIME');
    await specification('TIME', 'TEXT');
    const now = Date.now();
    const accepted = parseInspectionRequest({
      traceCode: storedUnit.traceCode,
      specification: { code: `${PREFIX}TIME`, version: 1 },
      inspectedAt: new Date(now + 4 * 60_000).toISOString(),
      evidence: { type: 'TEXT', value: 'time', outcome: 'PASS' },
    });
    await expect(
      service.submit(actor, 'phase5d3-time-valid', accepted),
    ).resolves.toMatchObject({ status: 201 });
    const rejected = parseInspectionRequest({
      traceCode: storedUnit.traceCode,
      specification: { code: `${PREFIX}TIME`, version: 1 },
      inspectedAt: new Date(now + 6 * 60_000).toISOString(),
      evidence: { type: 'TEXT', value: 'future', outcome: 'PASS' },
    });
    await expect(
      service.submit(actor, 'phase5d3-time-future', rejected),
    ).rejects.toMatchObject({ response: { code: 'INVALID_REQUEST' } });
    expect(
      await prisma.client.inspectionSubmission.count({
        where: { idempotencyKey: 'phase5d3-time-future' },
      }),
    ).toBe(0);
  });
});
