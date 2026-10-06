import type { TraceableUnitType } from '../generated/prisma/enums.js';

export const GENEALOGY_DEFAULT_DEPTH = 1;
export const GENEALOGY_MAX_DEPTH = 8;
export const GENEALOGY_DEFAULT_LIMIT = 50;
export const GENEALOGY_MAX_LIMIT = 100;

export type GenealogyDirection = 'descendants' | 'ancestors';
export type GenealogyReadScope =
  | { mode: 'current'; at: null }
  | { mode: 'historical'; at: null }
  | { mode: 'asOf'; at: Date };

export interface GenealogyRequest {
  direction: GenealogyDirection;
  scope: GenealogyReadScope;
  depth: number;
  limit: number;
  cursor: string | null;
}

export interface GenealogyNode {
  traceCode: string;
  unitType: TraceableUnitType;
  directParentCount: number;
  directChildCount: number;
  selected: boolean;
}

export interface GenealogyEdgeResponse {
  relationId: string;
  depth: number;
  parent: GenealogyNode;
  child: GenealogyNode;
  positionCode: string | null;
  installedAt: string;
  removedAt: string | null;
  relationshipState: 'CURRENT' | 'HISTORICAL';
}

export interface GenealogyResponse {
  root: GenealogyNode;
  direction: GenealogyDirection;
  scope: { mode: GenealogyReadScope['mode']; at: string | null };
  edges: GenealogyEdgeResponse[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
    returnedEdgeCount: number;
    requestedDepth: number;
    reachedDepth: number;
    isPartial: boolean;
    partialReasons: Array<
      'EDGE_LIMIT' | 'DEPTH_LIMIT' | 'CYCLE_PATH_SKIPPED'
    >;
  };
  integrityWarnings: Array<{ code: 'CYCLE_PATH_SKIPPED' }>;
}

export interface UnitDetailResponse {
  unit: {
    traceCode: string;
    unitType: TraceableUnitType;
    productModel: { code: string; name: string } | null;
    createdAt: string;
    updatedAt: string;
  };
  sections: {
    genealogy: { hasRecords: boolean; directRelationCount: number };
    processHistory: { hasRecords: boolean; recordCount: number };
    qualityHistory: { hasRecords: boolean; recordCount: number };
    nonconformance: { hasRecords: boolean; recordCount: number };
  };
}

export interface GenealogyRow {
  relationId: string;
  depth: number;
  parentUnitId: string;
  parentTraceCode: string;
  parentUnitType: TraceableUnitType;
  childUnitId: string;
  childTraceCode: string;
  childUnitType: TraceableUnitType;
  positionCode: string | null;
  installedAt: Date;
  removedAt: Date | null;
  cycleDetected: boolean;
}
