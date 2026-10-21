import { createHash } from 'node:crypto';
import {
  assertIsolatedTestDatabase,
  ISOLATED_TEST_DATABASE,
} from './test-database-identity.js';

export const SYNTHETIC_GENERATOR_CONTRACT_VERSION = 1;
export const SYNTHETIC_GENERATOR_MAX_PACKS = 25_000;

export const syntheticGeneratorProfiles = {
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
} as const;

export type SyntheticGeneratorProfile = keyof typeof syntheticGeneratorProfiles;
export type SyntheticScenario = 'CLEAN_PASS' | 'NG_RETEST' | 'NC_REWORK';

export type SyntheticGeneratorConfigInput = {
  profile: unknown;
  seed: unknown;
  namespace: unknown;
  packCount?: unknown;
  relatedVolume?: unknown;
  dryRun?: unknown;
};

type RelatedVolume = {
  modulesPerPack: number;
  cellsPerModule: number;
  componentsPerModule: number;
  materialsPerModule: number;
};

export type SyntheticGeneratorConfig = {
  profile: SyntheticGeneratorProfile;
  seed: string;
  namespace: string;
  resolvedNamespace: string;
  packCount: number;
  relatedVolume: RelatedVolume;
  dryRun: boolean;
};

export type SyntheticGeneratorPlan = {
  contractVersion: 1;
  kind: 'PLANNED_NOT_PERSISTED';
  validation: { valid: true; issues: [] };
  config: SyntheticGeneratorConfig;
  scenarioDistribution: Record<SyntheticScenario, number>;
  expectedRecords: {
    productModels: number;
    packs: number;
    modules: number;
    cells: number;
    components: number;
    materials: number;
    traceableUnits: number;
    genealogyRelations: number;
    processDefinitions: number;
    processRoutes: number;
    processRouteSteps: number;
    processExecutions: number;
    users: number;
    inspectionSpecifications: number;
    inspectionSpecificationOptions: number;
    inspections: number;
    inspectionResults: number;
    inspectionSubmissions: number;
    defectCategories: number;
    nonconformances: number;
    abnormalCases: number;
    actions: number;
    verifications: number;
    dispositions: number;
    total: number;
  };
  samples: {
    firstPackTraceCode: string;
    lastPackTraceCode: string;
    firstPackId: string;
    firstTimestamp: string;
  };
  ownership: {
    strategy: 'VERSIONED_PLAN_FINGERPRINT_AND_EXACT_IDENTITIES';
    planFingerprint: string;
    cleanupImplemented: false;
  };
};

export class SyntheticGeneratorConfigError extends Error {
  constructor(readonly issues: string[]) {
    super('Invalid synthetic generator configuration.');
    this.name = 'SyntheticGeneratorConfigError';
  }
}

const allowedInputKeys = new Set([
  'profile',
  'seed',
  'namespace',
  'packCount',
  'relatedVolume',
  'dryRun',
]);
const allowedRelatedKeys = new Set([
  'modulesPerPack',
  'cellsPerModule',
  'componentsPerModule',
  'materialsPerModule',
]);
const bounds: Record<keyof RelatedVolume, readonly [number, number]> = {
  modulesPerPack: [1, 4],
  cellsPerModule: [1, 16],
  componentsPerModule: [0, 8],
  materialsPerModule: [0, 4],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= minimum &&
    (value as number) <= maximum
  );
}

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function syntheticOwnershipFingerprint(value: unknown): string {
  return digest(
    canonical({
      contractVersion: SYNTHETIC_GENERATOR_CONTRACT_VERSION,
      value,
    }),
  );
}

export function validateSyntheticGeneratorConfig(input: unknown):
  | { valid: true; value: SyntheticGeneratorConfig; issues: [] }
  | {
      valid: false;
      issues: string[];
    } {
  const issues: string[] = [];
  if (!isRecord(input))
    return { valid: false, issues: ['CONFIG_OBJECT_REQUIRED'] };
  for (const key of Object.keys(input)) {
    if (!allowedInputKeys.has(key)) issues.push(`UNKNOWN_FIELD:${key}`);
  }

  const profile = input.profile;
  if (
    typeof profile !== 'string' ||
    !Object.hasOwn(syntheticGeneratorProfiles, profile)
  ) {
    issues.push('INVALID_PROFILE');
  }
  const seed = input.seed;
  if (typeof seed !== 'string' || !/^[a-z0-9][a-z0-9._-]{7,63}$/.test(seed)) {
    issues.push('INVALID_SEED');
  }
  const namespace = input.namespace;
  if (
    typeof namespace !== 'string' ||
    !/^SYN5G_[A-Z][A-Z0-9_]{2,23}$/.test(namespace) ||
    namespace.includes('DEMO')
  ) {
    issues.push('UNSAFE_NAMESPACE');
  }
  if (input.dryRun !== undefined && typeof input.dryRun !== 'boolean') {
    issues.push('INVALID_DRY_RUN');
  }

  const knownProfile =
    typeof profile === 'string' &&
    Object.hasOwn(syntheticGeneratorProfiles, profile)
      ? (profile as SyntheticGeneratorProfile)
      : 'SMALL';
  const defaults = syntheticGeneratorProfiles[knownProfile];
  const packCount = input.packCount ?? defaults.packCount;
  if (!isBoundedInteger(packCount, 1, SYNTHETIC_GENERATOR_MAX_PACKS)) {
    issues.push('INVALID_PACK_COUNT');
  }

  const relatedInput = input.relatedVolume;
  if (relatedInput !== undefined && !isRecord(relatedInput)) {
    issues.push('INVALID_RELATED_VOLUME');
  }
  const relatedRecord = isRecord(relatedInput) ? relatedInput : {};
  for (const key of Object.keys(relatedRecord)) {
    if (!allowedRelatedKeys.has(key))
      issues.push(`UNKNOWN_RELATED_FIELD:${key}`);
  }
  const relatedVolume = {} as RelatedVolume;
  for (const key of Object.keys(bounds) as Array<keyof RelatedVolume>) {
    const value = relatedRecord[key] ?? defaults[key];
    const [minimum, maximum] = bounds[key];
    if (!isBoundedInteger(value, minimum, maximum)) {
      issues.push(`INVALID_RELATED_VOLUME:${key}`);
      relatedVolume[key] = defaults[key];
    } else {
      relatedVolume[key] = value;
    }
  }

  if (issues.length > 0) return { valid: false, issues };
  const validSeed = seed as string;
  const validNamespace = namespace as string;
  const dryRun = input.dryRun === undefined ? true : (input.dryRun as boolean);
  const resolvedNamespace = `${validNamespace}-${digest(validSeed).slice(0, 8).toUpperCase()}`;
  return {
    valid: true,
    issues: [],
    value: {
      profile: knownProfile,
      seed: validSeed,
      namespace: validNamespace,
      resolvedNamespace,
      packCount: packCount as number,
      relatedVolume,
      dryRun,
    },
  };
}

export function parseSyntheticGeneratorConfig(
  input: unknown,
): SyntheticGeneratorConfig {
  const result = validateSyntheticGeneratorConfig(input);
  if (!result.valid) throw new SyntheticGeneratorConfigError(result.issues);
  return result.value;
}

export function syntheticEntityId(
  config: SyntheticGeneratorConfig,
  entityType: string,
  ordinal: number,
): string {
  if (!/^[a-z][a-z0-9-]{1,31}$/.test(entityType)) {
    throw new SyntheticGeneratorConfigError(['INVALID_ENTITY_TYPE']);
  }
  if (!isBoundedInteger(ordinal, 1, 100_000_000)) {
    throw new SyntheticGeneratorConfigError(['INVALID_ENTITY_ORDINAL']);
  }
  const hex = digest(
    `bmqt-synthetic-generator:v${SYNTHETIC_GENERATOR_CONTRACT_VERSION}:${config.resolvedNamespace}:${entityType}:${ordinal}`,
  ).slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

export function syntheticTraceCode(
  config: SyntheticGeneratorConfig,
  unitType: 'PACK' | 'MODULE' | 'CELL' | 'COMPONENT' | 'MATERIAL',
  ordinal: number,
): string {
  if (!isBoundedInteger(ordinal, 1, 100_000_000)) {
    throw new SyntheticGeneratorConfigError(['INVALID_ENTITY_ORDINAL']);
  }
  const token = {
    PACK: 'PACK',
    MODULE: 'MODULE',
    CELL: 'CELL',
    COMPONENT: 'COMP',
    MATERIAL: 'MATERIAL',
  }[unitType];
  return `${config.resolvedNamespace}-${token}-${String(ordinal).padStart(8, '0')}`;
}

export function syntheticScenarioFor(
  config: SyntheticGeneratorConfig,
  packOrdinal: number,
): SyntheticScenario {
  const value =
    Number.parseInt(
      digest(`${config.seed}:scenario:${packOrdinal}`).slice(0, 8),
      16,
    ) % 100;
  if (value < 70) return 'CLEAN_PASS';
  if (value < 90) return 'NG_RETEST';
  return 'NC_REWORK';
}

export function syntheticTimestamp(
  config: SyntheticGeneratorConfig,
  ordinal: number,
): string {
  if (!isBoundedInteger(ordinal, 1, 100_000_000)) {
    throw new SyntheticGeneratorConfigError(['INVALID_ENTITY_ORDINAL']);
  }
  const seedOffsetMinutes =
    Number.parseInt(digest(`${config.seed}:time`).slice(0, 8), 16) %
    (365 * 24 * 60);
  return new Date(
    Date.UTC(2026, 0, 1) + (seedOffsetMinutes + ordinal - 1) * 60_000,
  ).toISOString();
}

export function planSyntheticGeneration(
  input: unknown,
): SyntheticGeneratorPlan {
  const config = parseSyntheticGeneratorConfig(input);
  const scenarioDistribution: Record<SyntheticScenario, number> = {
    CLEAN_PASS: 0,
    NG_RETEST: 0,
    NC_REWORK: 0,
  };
  for (let ordinal = 1; ordinal <= config.packCount; ordinal += 1) {
    scenarioDistribution[syntheticScenarioFor(config, ordinal)] += 1;
  }

  const modules = config.packCount * config.relatedVolume.modulesPerPack;
  const cells = modules * config.relatedVolume.cellsPerModule;
  const components = modules * config.relatedVolume.componentsPerModule;
  const materials = modules * config.relatedVolume.materialsPerModule;
  const traceableUnits =
    config.packCount + modules + cells + components + materials;
  const nonClean =
    scenarioDistribution.NG_RETEST + scenarioDistribution.NC_REWORK;
  const ncCount = scenarioDistribution.NC_REWORK;
  const resolvedNc = Math.floor((ncCount + 1) / 3);
  const closedNc = Math.floor(ncCount / 3);
  const expectedRecords = {
    productModels: 1,
    packs: config.packCount,
    modules,
    cells,
    components,
    materials,
    traceableUnits,
    genealogyRelations: traceableUnits - config.packCount,
    processDefinitions: 4,
    processRoutes: 1,
    processRouteSteps: 4,
    processExecutions:
      config.packCount * 4 +
      scenarioDistribution.NG_RETEST +
      scenarioDistribution.NC_REWORK * 2,
    users: 1,
    inspectionSpecifications: 5,
    inspectionSpecificationOptions: 4,
    inspections: config.packCount * 5 + nonClean,
    inspectionResults: config.packCount * 5 + nonClean,
    inspectionSubmissions: config.packCount * 5 + nonClean,
    defectCategories: 5,
    nonconformances: ncCount,
    abnormalCases: closedNc,
    actions: resolvedNc * 2 + closedNc * 3,
    verifications: resolvedNc + closedNc,
    dispositions: resolvedNc + closedNc * 2,
    total: 0,
  };
  expectedRecords.total = Object.entries(expectedRecords)
    .filter(([key]) => key !== 'total' && key !== 'traceableUnits')
    .reduce((sum, [, value]) => sum + value, 0);

  const fingerprintInput = {
    contractVersion: SYNTHETIC_GENERATOR_CONTRACT_VERSION,
    config,
    scenarioDistribution,
    expectedRecords,
  };
  return {
    contractVersion: SYNTHETIC_GENERATOR_CONTRACT_VERSION,
    kind: 'PLANNED_NOT_PERSISTED',
    validation: { valid: true, issues: [] },
    config,
    scenarioDistribution,
    expectedRecords,
    samples: {
      firstPackTraceCode: syntheticTraceCode(config, 'PACK', 1),
      lastPackTraceCode: syntheticTraceCode(config, 'PACK', config.packCount),
      firstPackId: syntheticEntityId(config, 'pack', 1),
      firstTimestamp: syntheticTimestamp(config, 1),
    },
    ownership: {
      strategy: 'VERSIONED_PLAN_FINGERPRINT_AND_EXACT_IDENTITIES',
      planFingerprint: digest(canonical(fingerprintInput)),
      cleanupImplemented: false,
    },
  };
}

export type ExistingSyntheticIdentity = {
  id: string;
  publicCode: string;
  ownershipFingerprint: string;
};

export function classifySyntheticIdentity(
  planned: ExistingSyntheticIdentity,
  existing: ExistingSyntheticIdentity | null,
): 'CREATE' | 'REUSE' | 'CONFLICT' {
  if (existing === null) return 'CREATE';
  return existing.id === planned.id &&
    existing.publicCode === planned.publicCode &&
    existing.ownershipFingerprint === planned.ownershipFingerprint
    ? 'REUSE'
    : 'CONFLICT';
}

export async function assertSyntheticGeneratorMutationTarget(
  databaseUrl: string | undefined,
  verify: (
    connectionString?: string,
  ) => Promise<void> = assertIsolatedTestDatabase,
): Promise<void> {
  if (!databaseUrl) {
    throw new Error(
      'Explicit DATABASE_URL is required for generator mutation.',
    );
  }
  let databaseName: string;
  try {
    const url = new URL(databaseUrl);
    databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  } catch {
    throw new Error('Generator DATABASE_URL is invalid.');
  }
  if (databaseName !== ISOLATED_TEST_DATABASE) {
    throw new Error(
      `Synthetic generator mutation is restricted to ${ISOLATED_TEST_DATABASE}.`,
    );
  }
  await verify(databaseUrl);
}
