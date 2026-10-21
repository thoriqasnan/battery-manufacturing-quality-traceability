import { PrismaClient, type Prisma } from '../src/generated/prisma/client.js';
import { createPrismaPgAdapter } from '../src/prisma/prisma-pg.js';
import {
  assertSyntheticGeneratorMutationTarget,
  planSyntheticGeneration,
  syntheticEntityId,
  syntheticOwnershipFingerprint,
  syntheticGeneratorProfiles,
  syntheticScenarioFor,
  syntheticTimestamp,
  syntheticTraceCode,
  type SyntheticGeneratorConfig,
  type SyntheticGeneratorConfigInput,
} from './synthetic-generator-contract.js';

const PERSISTENCE_BATCH_SIZE = 100;
const OWNERSHIP_READ_BATCH_SIZE = 500;

type ProductRecord = {
  id: string;
  code: string;
  name: string;
  description: string;
  isActive: true;
  createdAt: Date;
  updatedAt: Date;
};

type UnitRecord = {
  id: string;
  traceCode: string;
  unitType: 'PACK' | 'MODULE' | 'CELL' | 'COMPONENT' | 'MATERIAL';
  productModelId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type GenealogyRecord = {
  id: string;
  parentUnitId: string;
  childUnitId: string;
  positionCode: string;
  installedAt: Date;
  removedAt: null;
  createdAt: Date;
  updatedAt: Date;
};

type ProcessDefinitionRecord = {
  id: string;
  code: string;
  name: string;
  description: string;
  isActive: true;
  createdAt: Date;
  updatedAt: Date;
};

type ProcessRouteRecord = {
  id: string;
  productModelId: string;
  code: string;
  name: string;
  description: string;
  version: 1;
  isActive: true;
  createdAt: Date;
  updatedAt: Date;
};

type ProcessRouteStepRecord = {
  id: string;
  processRouteId: string;
  processDefinitionId: string;
  stepOrder: number;
  executionMethod: 'MANUAL' | 'AUTOMATED' | 'HYBRID';
  createdAt: Date;
  updatedAt: Date;
};

type ProcessExecutionRecord = {
  id: string;
  traceableUnitId: string;
  processDefinitionId: string;
  processRouteStepId: string | null;
  attemptNumber: number;
  status: 'COMPLETED';
  executionMethod: 'MANUAL' | 'AUTOMATED' | 'HYBRID';
  startedAt: Date;
  finishedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type SyntheticPersistenceSubsetPlan = {
  planFingerprint: string;
  config: SyntheticGeneratorConfig;
  productModel: ProductRecord;
  units: {
    packs: UnitRecord[];
    modules: UnitRecord[];
    cells: UnitRecord[];
    components: UnitRecord[];
    materials: UnitRecord[];
  };
  genealogyRelations: GenealogyRecord[];
  processDefinitions: ProcessDefinitionRecord[];
  processRoute: ProcessRouteRecord;
  processRouteSteps: ProcessRouteStepRecord[];
  processExecutions: ProcessExecutionRecord[];
};

export class SyntheticOwnershipConflictError extends Error {
  constructor(readonly identities: string[]) {
    super('Synthetic generator ownership conflict.');
    this.name = 'SyntheticOwnershipConflictError';
  }
}

export class SyntheticCleanupRefusedError extends Error {
  constructor(readonly reason: string) {
    super('Synthetic generator cleanup refused.');
    this.name = 'SyntheticCleanupRefusedError';
  }
}

function exactProductValue(row: ProductRecord) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function exactUnitValue(row: UnitRecord) {
  return {
    id: row.id,
    traceCode: row.traceCode,
    unitType: row.unitType,
    productModelId: row.productModelId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function exactGenealogyValue(row: GenealogyRecord) {
  return {
    id: row.id,
    parentUnitId: row.parentUnitId,
    childUnitId: row.childUnitId,
    positionCode: row.positionCode,
    installedAt: row.installedAt.toISOString(),
    removedAt: row.removedAt,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function exactDatedValue<T extends { createdAt: Date; updatedAt: Date }>(
  row: T,
) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function exactExecutionValue(row: ProcessExecutionRecord) {
  return {
    ...exactDatedValue(row),
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt.toISOString(),
  };
}

function valuesMatch(planned: unknown, existing: unknown): boolean {
  return (
    syntheticOwnershipFingerprint(planned) ===
    syntheticOwnershipFingerprint(existing)
  );
}

function requireSupportedSubset(config: SyntheticGeneratorConfig): void {
  const medium = syntheticGeneratorProfiles.MEDIUM;
  const isSmall = config.profile === 'SMALL' && config.packCount <= 100;
  const isExactMedium =
    config.profile === 'MEDIUM' &&
    config.packCount === medium.packCount &&
    config.relatedVolume.modulesPerPack === medium.modulesPerPack &&
    config.relatedVolume.cellsPerModule === medium.cellsPerModule &&
    config.relatedVolume.componentsPerModule === medium.componentsPerModule &&
    config.relatedVolume.materialsPerModule === medium.materialsPerModule;
  if (!isSmall && !isExactMedium) {
    throw new Error(
      'Persistence supports bounded SMALL or exact documented MEDIUM profiles only.',
    );
  }
  if (config.dryRun) {
    throw new Error('Persistence requires dryRun=false.');
  }
}

function transactionOptions(plan: SyntheticPersistenceSubsetPlan) {
  return {
    maxWait: 10_000,
    timeout: plan.config.profile === 'MEDIUM' ? 900_000 : 30_000,
  };
}

export function planSyntheticPersistenceSubset(
  input: SyntheticGeneratorConfigInput,
): SyntheticPersistenceSubsetPlan {
  const generatorPlan = planSyntheticGeneration(input);
  const { config } = generatorPlan;
  requireSupportedSubset(config);
  const productTimestamp = new Date(syntheticTimestamp(config, 1));
  const productModel: ProductRecord = {
    id: syntheticEntityId(config, 'product-model', 1),
    code: `${config.resolvedNamespace}-MODEL`,
    name: `Synthetic ${config.resolvedNamespace} product`,
    description:
      'Fictional Phase 5G generator-owned product model for isolated testing.',
    isActive: true,
    createdAt: productTimestamp,
    updatedAt: productTimestamp,
  };
  const units: SyntheticPersistenceSubsetPlan['units'] = {
    packs: [],
    modules: [],
    cells: [],
    components: [],
    materials: [],
  };
  const genealogyRelations: GenealogyRecord[] = [];
  const unitCounts = {
    packs: config.packCount,
    modules: config.packCount * config.relatedVolume.modulesPerPack,
    cells:
      config.packCount *
      config.relatedVolume.modulesPerPack *
      config.relatedVolume.cellsPerModule,
    components:
      config.packCount *
      config.relatedVolume.modulesPerPack *
      config.relatedVolume.componentsPerModule,
    materials:
      config.packCount *
      config.relatedVolume.modulesPerPack *
      config.relatedVolume.materialsPerModule,
  };
  let timestampOrdinal = 1;
  const addUnit = (
    collection: UnitRecord[],
    unitType: UnitRecord['unitType'],
    entityType: string,
    ordinal: number,
    productModelId: string | null,
  ): UnitRecord => {
    const timestamp = new Date(syntheticTimestamp(config, timestampOrdinal));
    timestampOrdinal += 1;
    const unit = {
      id: syntheticEntityId(config, entityType, ordinal),
      traceCode: syntheticTraceCode(config, unitType, ordinal),
      unitType,
      productModelId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    collection.push(unit);
    return unit;
  };
  for (let packOrdinal = 1; packOrdinal <= unitCounts.packs; packOrdinal += 1) {
    const pack = addUnit(
      units.packs,
      'PACK',
      'pack',
      packOrdinal,
      productModel.id,
    );
    for (
      let modulePosition = 1;
      modulePosition <= config.relatedVolume.modulesPerPack;
      modulePosition += 1
    ) {
      const moduleOrdinal =
        (packOrdinal - 1) * config.relatedVolume.modulesPerPack +
        modulePosition;
      const module = addUnit(
        units.modules,
        'MODULE',
        'module',
        moduleOrdinal,
        null,
      );
      const children: Array<{
        unit: UnitRecord;
        positionCode: string;
      }> = [];
      for (
        let cellPosition = 1;
        cellPosition <= config.relatedVolume.cellsPerModule;
        cellPosition += 1
      ) {
        const ordinal =
          (moduleOrdinal - 1) * config.relatedVolume.cellsPerModule +
          cellPosition;
        children.push({
          unit: addUnit(units.cells, 'CELL', 'cell', ordinal, null),
          positionCode: `CELL-${String(cellPosition).padStart(2, '0')}`,
        });
      }
      for (
        let componentPosition = 1;
        componentPosition <= config.relatedVolume.componentsPerModule;
        componentPosition += 1
      ) {
        const ordinal =
          (moduleOrdinal - 1) * config.relatedVolume.componentsPerModule +
          componentPosition;
        children.push({
          unit: addUnit(
            units.components,
            'COMPONENT',
            'component',
            ordinal,
            null,
          ),
          positionCode: `COMPONENT-${String(componentPosition).padStart(2, '0')}`,
        });
      }
      for (
        let materialPosition = 1;
        materialPosition <= config.relatedVolume.materialsPerModule;
        materialPosition += 1
      ) {
        const ordinal =
          (moduleOrdinal - 1) * config.relatedVolume.materialsPerModule +
          materialPosition;
        children.push({
          unit: addUnit(units.materials, 'MATERIAL', 'material', ordinal, null),
          positionCode: `MATERIAL-${String(materialPosition).padStart(2, '0')}`,
        });
      }
      children.unshift({
        unit: module,
        positionCode: `MODULE-${String(modulePosition).padStart(2, '0')}`,
      });
      for (const { unit, positionCode } of children) {
        const parentUnitId = unit.unitType === 'MODULE' ? pack.id : module.id;
        const relationOrdinal = genealogyRelations.length + 1;
        const timestamp = new Date(
          syntheticTimestamp(config, timestampOrdinal),
        );
        timestampOrdinal += 1;
        genealogyRelations.push({
          id: syntheticEntityId(config, 'genealogy-relation', relationOrdinal),
          parentUnitId,
          childUnitId: unit.id,
          positionCode,
          installedAt: timestamp,
          removedAt: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
    }
  }
  if (
    units.modules.length !== unitCounts.modules ||
    units.cells.length !== unitCounts.cells ||
    units.components.length !== unitCounts.components ||
    units.materials.length !== unitCounts.materials
  ) {
    throw new Error('Synthetic genealogy planning count mismatch.');
  }
  const processKinds = [
    {
      key: 'prepare',
      suffix: 'PREPARE',
      name: 'Synthetic preparation',
      method: 'MANUAL' as const,
    },
    {
      key: 'assemble',
      suffix: 'ASSEMBLE',
      name: 'Synthetic assembly',
      method: 'HYBRID' as const,
    },
    {
      key: 'verify',
      suffix: 'VERIFY',
      name: 'Synthetic verification',
      method: 'AUTOMATED' as const,
    },
    {
      key: 'release',
      suffix: 'RELEASE',
      name: 'Synthetic release',
      method: 'MANUAL' as const,
    },
  ];
  const processDefinitions = processKinds.map((kind, index) => {
    const timestamp = new Date(syntheticTimestamp(config, 2_000_000 + index));
    return {
      id: syntheticEntityId(config, 'process-definition', index + 1),
      code: `${config.resolvedNamespace}-${kind.suffix}`,
      name: kind.name,
      description: `Fictional generator-owned ${kind.key} process.`,
      isActive: true as const,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });
  const routeTimestamp = new Date(syntheticTimestamp(config, 2_000_010));
  const processRoute: ProcessRouteRecord = {
    id: syntheticEntityId(config, 'process-route', 1),
    productModelId: productModel.id,
    code: `${config.resolvedNamespace}-ROUTE`,
    name: `Synthetic ${config.resolvedNamespace} route`,
    description: 'Fictional prepare, assemble, verify, and release route.',
    version: 1,
    isActive: true,
    createdAt: routeTimestamp,
    updatedAt: routeTimestamp,
  };
  const processRouteSteps = processKinds.map((kind, index) => {
    const timestamp = new Date(syntheticTimestamp(config, 2_000_020 + index));
    return {
      id: syntheticEntityId(config, 'process-route-step', index + 1),
      processRouteId: processRoute.id,
      processDefinitionId: processDefinitions[index].id,
      stepOrder: index + 1,
      executionMethod: kind.method,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });
  const processExecutions: ProcessExecutionRecord[] = [];
  const addExecution = (
    pack: UnitRecord,
    processIndex: number,
    attemptNumber: number,
    routeContext: boolean,
  ) => {
    const ordinal = processExecutions.length + 1;
    const startedAt = new Date(
      syntheticTimestamp(config, 3_000_000 + ordinal * 15),
    );
    const finishedAt = new Date(startedAt.getTime() + 10 * 60_000);
    processExecutions.push({
      id: syntheticEntityId(config, 'process-execution', ordinal),
      traceableUnitId: pack.id,
      processDefinitionId: processDefinitions[processIndex].id,
      processRouteStepId: routeContext
        ? processRouteSteps[processIndex].id
        : null,
      attemptNumber,
      status: 'COMPLETED',
      executionMethod: processKinds[processIndex].method,
      startedAt,
      finishedAt,
      createdAt: startedAt,
      updatedAt: startedAt,
    });
  };
  for (const [index, pack] of units.packs.entries()) {
    const scenario = syntheticScenarioFor(config, index + 1);
    addExecution(pack, 0, 1, true);
    addExecution(pack, 1, 1, true);
    if (scenario === 'NC_REWORK') addExecution(pack, 1, 2, false);
    addExecution(pack, 2, 1, true);
    if (scenario !== 'CLEAN_PASS') addExecution(pack, 2, 2, false);
    addExecution(pack, 3, 1, true);
  }
  if (
    processExecutions.length !== generatorPlan.expectedRecords.processExecutions
  ) {
    throw new Error('Synthetic process execution planning count mismatch.');
  }
  const planFingerprint = syntheticOwnershipFingerprint({
    purpose: 'phase5g-connected-genealogy-plan',
    generatorPlanFingerprint: generatorPlan.ownership.planFingerprint,
    productModel: exactProductValue(productModel),
    units: Object.values(units).flat().map(exactUnitValue),
    genealogyRelations: genealogyRelations.map(exactGenealogyValue),
    processDefinitions: processDefinitions.map(exactDatedValue),
    processRoute: exactDatedValue(processRoute),
    processRouteSteps: processRouteSteps.map(exactDatedValue),
    processExecutions: processExecutions.map(exactExecutionValue),
  });
  return {
    planFingerprint,
    config,
    productModel,
    units,
    genealogyRelations,
    processDefinitions,
    processRoute,
    processRouteSteps,
    processExecutions,
  };
}

function advisoryKey(fingerprint: string): bigint {
  const unsigned = BigInt(`0x${fingerprint.slice(0, 16)}`);
  return unsigned >= 2n ** 63n ? unsigned - 2n ** 64n : unsigned;
}

function namespaceLockKey(plan: SyntheticPersistenceSubsetPlan): bigint {
  return advisoryKey(
    syntheticOwnershipFingerprint({
      purpose: 'synthetic-generator-namespace-mutation',
      resolvedNamespace: plan.config.resolvedNamespace,
    }),
  );
}

function chunks<T>(items: T[]): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += PERSISTENCE_BATCH_SIZE) {
    result.push(items.slice(index, index + PERSISTENCE_BATCH_SIZE));
  }
  return result;
}

function ownershipReadChunks<T>(items: T[]): T[][] {
  const result: T[][] = [];
  for (
    let index = 0;
    index < items.length;
    index += OWNERSHIP_READ_BATCH_SIZE
  ) {
    result.push(items.slice(index, index + OWNERSHIP_READ_BATCH_SIZE));
  }
  return result;
}

function allUnits(plan: SyntheticPersistenceSubsetPlan): UnitRecord[] {
  return Object.values(plan.units).flat();
}

function relationKey(
  relation: Pick<
    GenealogyRecord,
    'parentUnitId' | 'childUnitId' | 'installedAt'
  >,
): string {
  return `${relation.parentUnitId}:${relation.childUnitId}:${relation.installedAt.toISOString()}`;
}

function executionKey(
  execution: Pick<
    ProcessExecutionRecord,
    'traceableUnitId' | 'processDefinitionId' | 'attemptNumber'
  >,
): string {
  return `${execution.traceableUnitId}:${execution.processDefinitionId}:${execution.attemptNumber}`;
}

async function classifyExisting(
  tx: Prisma.TransactionClient,
  plan: SyntheticPersistenceSubsetPlan,
): Promise<{
  createProduct: boolean;
  unitsToCreate: UnitRecord[];
  reusedUnits: number;
  relationsToCreate: GenealogyRecord[];
  reusedRelations: number;
  processDefinitionsToCreate: ProcessDefinitionRecord[];
  reusedProcessDefinitions: number;
  createProcessRoute: boolean;
  processRouteStepsToCreate: ProcessRouteStepRecord[];
  reusedProcessRouteSteps: number;
  processExecutionsToCreate: ProcessExecutionRecord[];
  reusedProcessExecutions: number;
}> {
  const products = await tx.productModel.findMany({
    where: {
      OR: [{ id: plan.productModel.id }, { code: plan.productModel.code }],
    },
  });
  const conflicts: string[] = [];
  const product = products[0];
  if (
    products.length > 1 ||
    (product &&
      !valuesMatch(exactProductValue(plan.productModel), {
        ...product,
        createdAt: product.createdAt.toISOString(),
        updatedAt: product.updatedAt.toISOString(),
      }))
  ) {
    conflicts.push(plan.productModel.code);
  }

  const unitsToCreate: UnitRecord[] = [];
  let reusedUnits = 0;
  for (const batch of ownershipReadChunks(allUnits(plan))) {
    const existingUnits = await tx.traceableUnit.findMany({
      where: {
        OR: [
          { id: { in: batch.map(({ id }) => id) } },
          { traceCode: { in: batch.map(({ traceCode }) => traceCode) } },
        ],
      },
    });
    const byId = new Map(existingUnits.map((row) => [row.id, row]));
    const byCode = new Map(existingUnits.map((row) => [row.traceCode, row]));
    for (const planned of batch) {
      const idMatch = byId.get(planned.id);
      const codeMatch = byCode.get(planned.traceCode);
      if (!idMatch && !codeMatch) {
        unitsToCreate.push(planned);
        continue;
      }
      if (
        !idMatch ||
        !codeMatch ||
        idMatch.id !== codeMatch.id ||
        !valuesMatch(exactUnitValue(planned), {
          ...idMatch,
          createdAt: idMatch.createdAt.toISOString(),
          updatedAt: idMatch.updatedAt.toISOString(),
        })
      ) {
        conflicts.push(planned.traceCode);
        continue;
      }
      reusedUnits += 1;
    }
  }

  const relationsToCreate: GenealogyRecord[] = [];
  let reusedRelations = 0;
  for (const batch of ownershipReadChunks(plan.genealogyRelations)) {
    const existingRelations = await tx.genealogyRelation.findMany({
      where: {
        OR: [
          { id: { in: batch.map(({ id }) => id) } },
          ...batch.map(({ parentUnitId, childUnitId, installedAt }) => ({
            parentUnitId,
            childUnitId,
            installedAt,
          })),
        ],
      },
    });
    const byId = new Map(existingRelations.map((row) => [row.id, row]));
    const byRelationship = new Map(
      existingRelations.map((row) => [relationKey(row), row]),
    );
    for (const planned of batch) {
      const idMatch = byId.get(planned.id);
      const relationshipMatch = byRelationship.get(relationKey(planned));
      if (!idMatch && !relationshipMatch) {
        relationsToCreate.push(planned);
        continue;
      }
      if (
        !idMatch ||
        !relationshipMatch ||
        idMatch.id !== relationshipMatch.id ||
        !valuesMatch(exactGenealogyValue(planned), {
          ...idMatch,
          installedAt: idMatch.installedAt.toISOString(),
          removedAt: idMatch.removedAt?.toISOString() ?? null,
          createdAt: idMatch.createdAt.toISOString(),
          updatedAt: idMatch.updatedAt.toISOString(),
        })
      ) {
        conflicts.push(planned.id);
        continue;
      }
      reusedRelations += 1;
    }
  }

  const processDefinitionsToCreate: ProcessDefinitionRecord[] = [];
  let reusedProcessDefinitions = 0;
  const existingDefinitions = await tx.processDefinition.findMany({
    where: {
      OR: [
        { id: { in: plan.processDefinitions.map(({ id }) => id) } },
        { code: { in: plan.processDefinitions.map(({ code }) => code) } },
      ],
    },
  });
  const definitionsById = new Map(
    existingDefinitions.map((row) => [row.id, row]),
  );
  const definitionsByCode = new Map(
    existingDefinitions.map((row) => [row.code, row]),
  );
  for (const planned of plan.processDefinitions) {
    const idMatch = definitionsById.get(planned.id);
    const codeMatch = definitionsByCode.get(planned.code);
    if (!idMatch && !codeMatch) {
      processDefinitionsToCreate.push(planned);
      continue;
    }
    if (
      !idMatch ||
      !codeMatch ||
      idMatch.id !== codeMatch.id ||
      !valuesMatch(exactDatedValue(planned), exactDatedValue(idMatch))
    ) {
      conflicts.push(planned.code);
      continue;
    }
    reusedProcessDefinitions += 1;
  }

  const existingRoutes = await tx.processRoute.findMany({
    where: {
      OR: [
        { id: plan.processRoute.id },
        {
          productModelId: plan.processRoute.productModelId,
          code: plan.processRoute.code,
          version: plan.processRoute.version,
        },
      ],
    },
  });
  const existingRoute = existingRoutes[0];
  if (
    existingRoutes.length > 1 ||
    (existingRoute &&
      !valuesMatch(
        exactDatedValue(plan.processRoute),
        exactDatedValue(existingRoute),
      ))
  ) {
    conflicts.push(plan.processRoute.code);
  }

  const processRouteStepsToCreate: ProcessRouteStepRecord[] = [];
  let reusedProcessRouteSteps = 0;
  const existingSteps = await tx.processRouteStep.findMany({
    where: {
      OR: [
        { id: { in: plan.processRouteSteps.map(({ id }) => id) } },
        ...plan.processRouteSteps.map(({ processRouteId, stepOrder }) => ({
          processRouteId,
          stepOrder,
        })),
      ],
    },
  });
  const stepsById = new Map(existingSteps.map((row) => [row.id, row]));
  const stepsByOrder = new Map(
    existingSteps.map((row) => [`${row.processRouteId}:${row.stepOrder}`, row]),
  );
  for (const planned of plan.processRouteSteps) {
    const idMatch = stepsById.get(planned.id);
    const orderMatch = stepsByOrder.get(
      `${planned.processRouteId}:${planned.stepOrder}`,
    );
    if (!idMatch && !orderMatch) {
      processRouteStepsToCreate.push(planned);
      continue;
    }
    if (
      !idMatch ||
      !orderMatch ||
      idMatch.id !== orderMatch.id ||
      !valuesMatch(exactDatedValue(planned), exactDatedValue(idMatch))
    ) {
      conflicts.push(planned.id);
      continue;
    }
    reusedProcessRouteSteps += 1;
  }

  const processExecutionsToCreate: ProcessExecutionRecord[] = [];
  let reusedProcessExecutions = 0;
  for (const batch of ownershipReadChunks(plan.processExecutions)) {
    const existingExecutions = await tx.processExecution.findMany({
      where: {
        OR: [
          { id: { in: batch.map(({ id }) => id) } },
          ...batch.map(
            ({ traceableUnitId, processDefinitionId, attemptNumber }) => ({
              traceableUnitId,
              processDefinitionId,
              attemptNumber,
            }),
          ),
        ],
      },
    });
    const executionsById = new Map(
      existingExecutions.map((row) => [row.id, row]),
    );
    const executionsByAttempt = new Map(
      existingExecutions.map((row) => [executionKey(row), row]),
    );
    for (const planned of batch) {
      const idMatch = executionsById.get(planned.id);
      const attemptMatch = executionsByAttempt.get(executionKey(planned));
      if (!idMatch && !attemptMatch) {
        processExecutionsToCreate.push(planned);
        continue;
      }
      if (
        !idMatch ||
        !attemptMatch ||
        idMatch.id !== attemptMatch.id ||
        !valuesMatch(exactExecutionValue(planned), {
          ...exactDatedValue(idMatch),
          startedAt: idMatch.startedAt.toISOString(),
          finishedAt: idMatch.finishedAt?.toISOString() ?? null,
        })
      ) {
        conflicts.push(planned.id);
        continue;
      }
      reusedProcessExecutions += 1;
    }
  }
  if (conflicts.length > 0) {
    throw new SyntheticOwnershipConflictError(conflicts);
  }
  return {
    createProduct: product === undefined,
    unitsToCreate,
    reusedUnits,
    relationsToCreate,
    reusedRelations,
    processDefinitionsToCreate,
    reusedProcessDefinitions,
    createProcessRoute: existingRoute === undefined,
    processRouteStepsToCreate,
    reusedProcessRouteSteps,
    processExecutionsToCreate,
    reusedProcessExecutions,
  };
}

async function withGuardedClient<T>(
  databaseUrl: string | undefined,
  operation: (client: PrismaClient) => Promise<T>,
): Promise<T> {
  await assertSyntheticGeneratorMutationTarget(databaseUrl);
  const client = new PrismaClient({
    adapter: createPrismaPgAdapter(databaseUrl as string),
  });
  try {
    return await operation(client);
  } finally {
    await client.$disconnect();
  }
}

export async function persistSyntheticSubset(
  databaseUrl: string | undefined,
  input: SyntheticGeneratorConfigInput,
): Promise<{
  planFingerprint: string;
  created: {
    productModels: number;
    processDefinitions: number;
    processRoutes: number;
    processRouteSteps: number;
    traceableUnits: number;
    genealogyRelations: number;
    processExecutions: number;
  };
  reused: {
    productModels: number;
    processDefinitions: number;
    processRoutes: number;
    processRouteSteps: number;
    traceableUnits: number;
    genealogyRelations: number;
    processExecutions: number;
  };
}> {
  const plan = planSyntheticPersistenceSubset(input);
  return withGuardedClient(databaseUrl, (client) =>
    client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${namespaceLockKey(plan)})`;
      const classification = await classifyExisting(tx, plan);
      if (classification.createProduct) {
        await tx.productModel.create({ data: plan.productModel });
      }
      if (classification.processDefinitionsToCreate.length > 0) {
        await tx.processDefinition.createMany({
          data: classification.processDefinitionsToCreate,
        });
      }
      if (classification.createProcessRoute) {
        await tx.processRoute.create({ data: plan.processRoute });
      }
      if (classification.processRouteStepsToCreate.length > 0) {
        await tx.processRouteStep.createMany({
          data: classification.processRouteStepsToCreate,
        });
      }
      for (const batch of chunks(classification.unitsToCreate)) {
        await tx.traceableUnit.createMany({ data: batch });
      }
      for (const batch of chunks(classification.relationsToCreate)) {
        await tx.genealogyRelation.createMany({ data: batch });
      }
      for (const batch of chunks(classification.processExecutionsToCreate)) {
        await tx.processExecution.createMany({ data: batch });
      }
      return {
        planFingerprint: plan.planFingerprint,
        created: {
          productModels: classification.createProduct ? 1 : 0,
          processDefinitions: classification.processDefinitionsToCreate.length,
          processRoutes: classification.createProcessRoute ? 1 : 0,
          processRouteSteps: classification.processRouteStepsToCreate.length,
          traceableUnits: classification.unitsToCreate.length,
          genealogyRelations: classification.relationsToCreate.length,
          processExecutions: classification.processExecutionsToCreate.length,
        },
        reused: {
          productModels: classification.createProduct ? 0 : 1,
          processDefinitions: classification.reusedProcessDefinitions,
          processRoutes: classification.createProcessRoute ? 0 : 1,
          processRouteSteps: classification.reusedProcessRouteSteps,
          traceableUnits: classification.reusedUnits,
          genealogyRelations: classification.reusedRelations,
          processExecutions: classification.reusedProcessExecutions,
        },
      };
    }, transactionOptions(plan)),
  );
}

export async function cleanupSyntheticSubset(
  databaseUrl: string | undefined,
  input: SyntheticGeneratorConfigInput,
  confirmation: { operation: 'CLEANUP'; planFingerprint: string },
): Promise<{
  deleted: {
    productModels: number;
    processDefinitions: number;
    processRoutes: number;
    processRouteSteps: number;
    traceableUnits: number;
    genealogyRelations: number;
    processExecutions: number;
  };
}> {
  const plan = planSyntheticPersistenceSubset(input);
  if (
    confirmation.operation !== 'CLEANUP' ||
    confirmation.planFingerprint !== plan.planFingerprint
  ) {
    throw new SyntheticCleanupRefusedError('PLAN_CONFIRMATION_MISMATCH');
  }
  return withGuardedClient(databaseUrl, (client) =>
    client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${namespaceLockKey(plan)})`;
      const classification = await classifyExisting(tx, plan);
      if (
        classification.createProduct ||
        classification.processDefinitionsToCreate.length > 0 ||
        classification.createProcessRoute ||
        classification.processRouteStepsToCreate.length > 0 ||
        classification.unitsToCreate.length > 0 ||
        classification.relationsToCreate.length > 0 ||
        classification.processExecutionsToCreate.length > 0
      ) {
        throw new SyntheticCleanupRefusedError('PLAN_IS_NOT_FULLY_PERSISTED');
      }
      const plannedUnits = allUnits(plan);
      const units: Array<{
        id: string;
        _count: {
          parentRelations: number;
          childRelations: number;
          executions: number;
          inspections: number;
          nonconformances: number;
          relatedActions: number;
        };
      }> = [];
      for (const unitBatch of ownershipReadChunks(plannedUnits)) {
        units.push(
          ...(await tx.traceableUnit.findMany({
            where: { id: { in: unitBatch.map(({ id }) => id) } },
            select: {
              id: true,
              _count: {
                select: {
                  parentRelations: true,
                  childRelations: true,
                  executions: true,
                  inspections: true,
                  nonconformances: true,
                  relatedActions: true,
                },
              },
            },
          })),
        );
      }
      const expectedParentCounts = new Map<string, number>();
      const expectedChildCounts = new Map<string, number>();
      const expectedUnitExecutionCounts = new Map<string, number>();
      for (const relation of plan.genealogyRelations) {
        expectedParentCounts.set(
          relation.parentUnitId,
          (expectedParentCounts.get(relation.parentUnitId) ?? 0) + 1,
        );
        expectedChildCounts.set(
          relation.childUnitId,
          (expectedChildCounts.get(relation.childUnitId) ?? 0) + 1,
        );
      }
      for (const execution of plan.processExecutions) {
        expectedUnitExecutionCounts.set(
          execution.traceableUnitId,
          (expectedUnitExecutionCounts.get(execution.traceableUnitId) ?? 0) + 1,
        );
      }
      const hasUnexpectedDependent = units.some(
        ({ id, _count }) =>
          _count.parentRelations !== (expectedParentCounts.get(id) ?? 0) ||
          _count.childRelations !== (expectedChildCounts.get(id) ?? 0) ||
          _count.executions !== (expectedUnitExecutionCounts.get(id) ?? 0) ||
          _count.inspections !== 0 ||
          _count.nonconformances !== 0 ||
          _count.relatedActions !== 0,
      );
      const product = await tx.productModel.findUniqueOrThrow({
        where: { id: plan.productModel.id },
        select: { _count: { select: { routes: true, packs: true } } },
      });
      const executions = await tx.processExecution.findMany({
        where: { id: { in: plan.processExecutions.map(({ id }) => id) } },
        select: {
          id: true,
          _count: {
            select: { inspections: true, sourceNonconformances: true },
          },
        },
      });
      const hasExecutionDependants =
        executions.length !== plan.processExecutions.length ||
        executions.some(
          ({ _count }) =>
            _count.inspections !== 0 || _count.sourceNonconformances !== 0,
        );
      const expectedStepExecutionCounts = new Map<string, number>();
      const expectedDefinitionExecutionCounts = new Map<string, number>();
      for (const execution of plan.processExecutions) {
        if (execution.processRouteStepId) {
          expectedStepExecutionCounts.set(
            execution.processRouteStepId,
            (expectedStepExecutionCounts.get(execution.processRouteStepId) ??
              0) + 1,
          );
        }
        expectedDefinitionExecutionCounts.set(
          execution.processDefinitionId,
          (expectedDefinitionExecutionCounts.get(
            execution.processDefinitionId,
          ) ?? 0) + 1,
        );
      }
      const steps = await tx.processRouteStep.findMany({
        where: { id: { in: plan.processRouteSteps.map(({ id }) => id) } },
        select: {
          id: true,
          _count: {
            select: { executions: true, inspectionSpecifications: true },
          },
        },
      });
      const hasUnexpectedStepDependants =
        steps.length !== plan.processRouteSteps.length ||
        steps.some(
          ({ id, _count }) =>
            _count.executions !== (expectedStepExecutionCounts.get(id) ?? 0) ||
            _count.inspectionSpecifications !== 0,
        );
      const definitions = await tx.processDefinition.findMany({
        where: { id: { in: plan.processDefinitions.map(({ id }) => id) } },
        select: {
          id: true,
          _count: {
            select: {
              routeSteps: true,
              executions: true,
              inspectionSpecifications: true,
            },
          },
        },
      });
      const hasUnexpectedDefinitionDependants =
        definitions.length !== plan.processDefinitions.length ||
        definitions.some(
          ({ id, _count }) =>
            _count.routeSteps !== 1 ||
            _count.executions !==
              (expectedDefinitionExecutionCounts.get(id) ?? 0) ||
            _count.inspectionSpecifications !== 0,
        );
      const route = await tx.processRoute.findUniqueOrThrow({
        where: { id: plan.processRoute.id },
        select: { _count: { select: { steps: true } } },
      });
      if (
        hasUnexpectedDependent ||
        hasExecutionDependants ||
        hasUnexpectedStepDependants ||
        hasUnexpectedDefinitionDependants ||
        product._count.routes !== 1 ||
        product._count.packs !== plan.units.packs.length ||
        route._count.steps !== plan.processRouteSteps.length
      ) {
        throw new SyntheticCleanupRefusedError('DEPENDENT_OR_UNOWNED_RECORDS');
      }
      let deletedExecutions = 0;
      for (const batch of chunks(plan.processExecutions)) {
        const result = await tx.processExecution.deleteMany({
          where: { id: { in: batch.map(({ id }) => id) } },
        });
        deletedExecutions += result.count;
      }
      let deletedRelations = 0;
      for (const batch of chunks(plan.genealogyRelations)) {
        const result = await tx.genealogyRelation.deleteMany({
          where: { id: { in: batch.map(({ id }) => id) } },
        });
        deletedRelations += result.count;
      }
      let deletedUnits = 0;
      for (const batch of chunks(plannedUnits)) {
        const result = await tx.traceableUnit.deleteMany({
          where: { id: { in: batch.map(({ id }) => id) } },
        });
        deletedUnits += result.count;
      }
      const deletedSteps = await tx.processRouteStep.deleteMany({
        where: { id: { in: plan.processRouteSteps.map(({ id }) => id) } },
      });
      const deletedRoute = await tx.processRoute.deleteMany({
        where: { id: plan.processRoute.id },
      });
      const deletedDefinitions = await tx.processDefinition.deleteMany({
        where: { id: { in: plan.processDefinitions.map(({ id }) => id) } },
      });
      const deletedProduct = await tx.productModel.deleteMany({
        where: { id: plan.productModel.id },
      });
      return {
        deleted: {
          productModels: deletedProduct.count,
          processDefinitions: deletedDefinitions.count,
          processRoutes: deletedRoute.count,
          processRouteSteps: deletedSteps.count,
          traceableUnits: deletedUnits,
          genealogyRelations: deletedRelations,
          processExecutions: deletedExecutions,
        },
      };
    }, transactionOptions(plan)),
  );
}
