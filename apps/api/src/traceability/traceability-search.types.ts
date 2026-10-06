import type { TraceableUnitType } from '../generated/prisma/enums.js';

export const TRACEABILITY_DEFAULT_PAGE = 1;
export const TRACEABILITY_DEFAULT_PAGE_SIZE = 25;
export const TRACEABILITY_MAX_PAGE_SIZE = 100;

export interface TraceabilitySearchQuery {
  query: string | null;
  unitType: TraceableUnitType | null;
  productModel: string | null;
  page: number;
  pageSize: number;
}

export interface TraceabilitySearchItem {
  traceCode: string;
  unitType: TraceableUnitType;
  productModel: { code: string; name: string } | null;
  createdAt: string;
  lastActivityAt: string | null;
  match: 'EXACT' | 'PREFIX' | null;
}

export interface TraceabilitySearchResponse {
  items: TraceabilitySearchItem[];
  page: {
    number: number;
    size: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface TraceabilitySearchPageEvidence {
  items: Array<{
    id: string;
    traceCode: string;
    unitType: TraceableUnitType;
    productModel: { code: string; name: string } | null;
    createdAt: Date;
    match: 'EXACT' | 'PREFIX' | null;
    lastActivityAt: Date | null;
  }>;
  totalItems: number;
}
