import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { InspectionSpecificationLifecycle } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  SpecificationDiscoveryQuery,
  SpecificationListQuery,
} from './inspection-specification.types.js';

export const SPECIFICATION_SUMMARY_SELECT = {
  id: true,
  processDefinitionId: true,
  processRouteStepId: true,
  code: true,
  version: true,
  name: true,
  lifecycle: true,
  resultType: true,
  targetUnitType: true,
  createdAt: true,
  updatedAt: true,
  processDefinition: { select: { code: true, name: true } },
  processRouteStep: {
    select: {
      stepOrder: true,
      processRoute: {
        select: {
          code: true,
          version: true,
          productModel: { select: { code: true } },
        },
      },
    },
  },
} as const;

export const SPECIFICATION_DETAIL_SELECT = {
  ...SPECIFICATION_SUMMARY_SELECT,
  description: true,
  lowerBound: true,
  upperBound: true,
  unitCode: true,
  expectedBooleanValue: true,
  options: {
    select: {
      code: true,
      description: true,
      isAcceptable: true,
      resultType: true,
    },
    orderBy: { code: 'asc' as const },
  },
} as const;

export type SpecificationSummaryRow = Prisma.InspectionSpecificationGetPayload<{
  select: typeof SPECIFICATION_SUMMARY_SELECT;
}>;
export type SpecificationDetailRow = Prisma.InspectionSpecificationGetPayload<{
  select: typeof SPECIFICATION_DETAIL_SELECT;
}>;

@Injectable()
export class InspectionSpecificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listManagement(query: SpecificationListQuery) {
    return this.list(query, this.where(query));
  }

  async listDiscovery(query: SpecificationDiscoveryQuery) {
    return this.list(query, {
      ...this.where(query),
      lifecycle: InspectionSpecificationLifecycle.PUBLISHED,
    });
  }

  findManagementDetail(code: string, version: number) {
    return this.prisma.client.inspectionSpecification.findUnique({
      where: { code_version: { code, version } },
      select: SPECIFICATION_DETAIL_SELECT,
    });
  }

  findDiscoveryDetail(code: string, version: number) {
    return this.prisma.client.inspectionSpecification.findFirst({
      where: {
        code,
        version,
        lifecycle: InspectionSpecificationLifecycle.PUBLISHED,
      },
      select: SPECIFICATION_DETAIL_SELECT,
    });
  }

  private async list(
    query: SpecificationDiscoveryQuery,
    where: Prisma.InspectionSpecificationWhereInput,
  ) {
    const [totalItems, items] = await Promise.all([
      this.prisma.client.inspectionSpecification.count({ where }),
      this.prisma.client.inspectionSpecification.findMany({
        where,
        select: SPECIFICATION_SUMMARY_SELECT,
        orderBy: [{ code: 'asc' }, { version: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { totalItems, items };
  }

  private where(
    query: SpecificationDiscoveryQuery,
  ): Prisma.InspectionSpecificationWhereInput {
    return {
      ...(query.query
        ? {
            OR: [
              ...(query.normalizedCodeQuery
                ? [{ code: { startsWith: query.normalizedCodeQuery } }]
                : []),
              { name: { contains: query.query, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(query.resultType ? { resultType: query.resultType } : {}),
      ...(query.targetUnitType ? { targetUnitType: query.targetUnitType } : {}),
      ...(query.processCode
        ? { processDefinition: { is: { code: query.processCode } } }
        : {}),
      ...('lifecycle' in query && query.lifecycle
        ? { lifecycle: query.lifecycle }
        : {}),
    };
  }
}
