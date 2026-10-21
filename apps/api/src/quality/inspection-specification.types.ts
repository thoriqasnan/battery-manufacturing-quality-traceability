import type {
  InspectionResultType,
  InspectionSpecificationLifecycle,
  TraceableUnitType,
} from '../generated/prisma/enums.js';

export const SPECIFICATION_DEFAULT_PAGE = 1;
export const SPECIFICATION_DEFAULT_PAGE_SIZE = 25;
export const SPECIFICATION_MAX_PAGE_SIZE = 100;

export type SpecificationListQuery = {
  query: string | null;
  normalizedCodeQuery: string | null;
  lifecycle: InspectionSpecificationLifecycle | null;
  resultType: InspectionResultType | null;
  targetUnitType: TraceableUnitType | null;
  processCode: string | null;
  page: number;
  pageSize: number;
};

export type SpecificationDiscoveryQuery = Omit<
  SpecificationListQuery,
  'lifecycle'
>;

export type PublicProcessIdentity = { code: string; name: string };
export type PublicRouteStepIdentity = {
  productModelCode: string;
  routeCode: string;
  routeVersion: number;
  stepOrder: number;
};

export type PublicSpecificationOption = {
  code: string;
  description: string | null;
  isAcceptable: boolean;
};

export type PublicSpecificationConfiguration =
  | {
      type: 'NUMERIC';
      lowerBound: string | null;
      upperBound: string | null;
      unitCode: string | null;
    }
  | { type: 'BOOLEAN'; expectedValue: boolean }
  | {
      type: 'CATEGORICAL' | 'VISUAL';
      options: PublicSpecificationOption[];
    }
  | { type: 'TEXT' };

export type ManagementSpecificationSummary = {
  code: string;
  version: number;
  name: string;
  lifecycle: InspectionSpecificationLifecycle;
  resultType: InspectionResultType;
  targetUnitType: TraceableUnitType;
  process: PublicProcessIdentity;
  routeStep: PublicRouteStepIdentity | null;
  createdAt: string;
  updatedAt: string;
};

export type DiscoverySpecificationSummary = Omit<
  ManagementSpecificationSummary,
  'lifecycle'
>;

export type ManagementSpecificationDetail = Omit<
  ManagementSpecificationSummary,
  'resultType'
> & {
  description: string | null;
  configuration: PublicSpecificationConfiguration;
};

export type DiscoverySpecificationDetail = Omit<
  ManagementSpecificationDetail,
  'lifecycle'
>;

export type PageMetadata = {
  number: number;
  size: number;
  totalItems: number;
  totalPages: number;
};

export type ManagementSpecificationListResponse = {
  items: ManagementSpecificationSummary[];
  page: PageMetadata;
};

export type DiscoverySpecificationListResponse = {
  items: DiscoverySpecificationSummary[];
  page: PageMetadata;
};
