import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { specificationEtag } from './inspection-specification-etag.js';
import {
  advisoryLockKey,
  assertPublishable,
  exactVersionLockInput,
  familyLockInput,
  type CreateSpecificationInput,
  type CreateSpecificationVersionInput,
  nextSpecificationVersion,
  type SpecificationDraftInput,
} from './inspection-specification-mutation.js';
import {
  InspectionSpecificationRepository,
  SPECIFICATION_DETAIL_SELECT,
  type SpecificationDetailRow,
  type SpecificationSummaryRow,
} from './inspection-specification.repository.js';
import type {
  DiscoverySpecificationDetail,
  DiscoverySpecificationListResponse,
  DiscoverySpecificationSummary,
  ManagementSpecificationDetail,
  ManagementSpecificationListResponse,
  ManagementSpecificationSummary,
  PublicRouteStepIdentity,
  PublicSpecificationConfiguration,
  SpecificationDiscoveryQuery,
  SpecificationListQuery,
} from './inspection-specification.types.js';

@Injectable()
export class InspectionSpecificationService {
  constructor(
    private readonly repository: InspectionSpecificationRepository,
    private readonly prisma: PrismaService,
  ) {}

  async create(input: CreateSpecificationInput) {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        await this.lock(tx, familyLockInput(input.code));
        if (
          await tx.inspectionSpecification.count({
            where: { code: input.code },
          })
        )
          this.codeConflict();
        const context = await this.resolveContext(tx, input);
        const row = await tx.inspectionSpecification.create({
          data: {
            code: input.code,
            version: 1,
            name: input.name,
            description: input.description,
            targetUnitType: input.targetUnitType,
            processDefinitionId: context.processDefinitionId,
            processRouteStepId: context.processRouteStepId,
            lifecycle: 'DRAFT',
            ...this.configurationData(input),
            ...(this.optionData(input).length
              ? { options: { create: this.optionData(input) } }
              : {}),
          },
          select: SPECIFICATION_DETAIL_SELECT,
        });
        return this.mutationResult(row);
      });
    } catch (error) {
      if (this.isPublicException(error)) throw error;
      if (this.prismaCode(error) === 'P2002') this.codeConflict();
      this.persistenceFailure();
    }
  }

  async createVersion(code: string, input: CreateSpecificationVersionInput) {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        await this.lock(tx, familyLockInput(code));
        const source = await tx.inspectionSpecification.findUnique({
          where: { code_version: { code, version: input.sourceVersion } },
          select: SPECIFICATION_DETAIL_SELECT,
        });
        if (!source) this.notFound();
        if (source.lifecycle === 'DRAFT') this.invalidTransition();
        const aggregate = await tx.inspectionSpecification.aggregate({
          where: { code },
          _max: { version: true },
        });
        const nextVersion = nextSpecificationVersion(
          aggregate._max.version ?? source.version,
        );
        const copied = this.inputFromRow(source);
        const row = await tx.inspectionSpecification.create({
          data: {
            code,
            version: nextVersion,
            name: source.name,
            description: source.description,
            resultType: source.resultType,
            targetUnitType: source.targetUnitType,
            processDefinitionId: source.processDefinitionId,
            processRouteStepId: source.processRouteStepId,
            lowerBound: source.lowerBound,
            upperBound: source.upperBound,
            unitCode: source.unitCode,
            expectedBooleanValue: source.expectedBooleanValue,
            lifecycle: 'DRAFT',
            ...(this.optionData(copied).length
              ? { options: { create: this.optionData(copied) } }
              : {}),
          },
          select: SPECIFICATION_DETAIL_SELECT,
        });
        return this.mutationResult(row);
      });
    } catch (error) {
      if (this.isPublicException(error)) throw error;
      this.persistenceFailure();
    }
  }

  replace(
    code: string,
    version: number,
    input: SpecificationDraftInput,
    ifMatch: string,
  ) {
    return this.mutate(code, version, ifMatch, async (tx, current) => {
      if (current.lifecycle !== 'DRAFT') this.invalidTransition();
      const context = await this.resolveContext(tx, input);
      await tx.inspectionSpecificationOption.deleteMany({
        where: { specificationId: current.id },
      });
      return tx.inspectionSpecification.update({
        where: { id: current.id },
        data: {
          name: input.name,
          description: input.description,
          targetUnitType: input.targetUnitType,
          processDefinitionId: context.processDefinitionId,
          processRouteStepId: context.processRouteStepId,
          ...this.configurationData(input),
          ...(this.optionData(input).length
            ? { options: { create: this.optionData(input) } }
            : {}),
        },
        select: SPECIFICATION_DETAIL_SELECT,
      });
    });
  }

  publish(code: string, version: number, ifMatch: string) {
    return this.mutate(code, version, ifMatch, async (tx, current) => {
      if (current.lifecycle !== 'DRAFT') this.invalidTransition();
      const input = this.inputFromRow(current);
      assertPublishable(input);
      await this.resolveContext(tx, input);
      return tx.inspectionSpecification.update({
        where: { id: current.id },
        data: { lifecycle: 'PUBLISHED' },
        select: SPECIFICATION_DETAIL_SELECT,
      });
    });
  }

  retire(code: string, version: number, ifMatch: string) {
    return this.mutate(code, version, ifMatch, async (tx, current) => {
      if (current.lifecycle !== 'PUBLISHED') this.invalidTransition();
      return tx.inspectionSpecification.update({
        where: { id: current.id },
        data: { lifecycle: 'RETIRED' },
        select: SPECIFICATION_DETAIL_SELECT,
      });
    });
  }

  private async mutate(
    code: string,
    version: number,
    ifMatch: string,
    operation: (
      tx: Prisma.TransactionClient,
      row: SpecificationDetailRow,
    ) => Promise<SpecificationDetailRow>,
  ) {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        await this.lock(tx, exactVersionLockInput(code, version));
        const current = await tx.inspectionSpecification.findUnique({
          where: { code_version: { code, version } },
          select: SPECIFICATION_DETAIL_SELECT,
        });
        if (!current) this.notFound();
        const currentResult = this.mutationResult(current);
        if (currentResult.etag !== ifMatch)
          throw new ConflictException({
            code: 'SPECIFICATION_WRITE_CONFLICT',
            message: 'The inspection specification has changed.',
          });
        return this.mutationResult(await operation(tx, current));
      });
    } catch (error) {
      if (this.isPublicException(error)) throw error;
      this.persistenceFailure();
    }
  }

  private async lock(tx: Prisma.TransactionClient, input: string) {
    const key = advisoryLockKey(input);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${key})`;
  }

  private async resolveContext(
    tx: Prisma.TransactionClient,
    input: SpecificationDraftInput,
  ) {
    const process = await tx.processDefinition.findUnique({
      where: { code: input.processCode },
      select: { id: true },
    });
    if (!process) this.incompatibleContext();
    if (!input.routeStep)
      return { processDefinitionId: process.id, processRouteStepId: null };
    const step = await tx.processRouteStep.findFirst({
      where: {
        stepOrder: input.routeStep.stepOrder,
        processDefinitionId: process.id,
        processRoute: {
          code: input.routeStep.routeCode,
          version: input.routeStep.routeVersion,
          productModel: { code: input.routeStep.productModelCode },
        },
      },
      select: { id: true },
    });
    if (!step) this.incompatibleContext();
    return { processDefinitionId: process.id, processRouteStepId: step.id };
  }

  private configurationData(input: SpecificationDraftInput) {
    const config = input.configuration;
    return {
      resultType: config.type,
      lowerBound: config.type === 'NUMERIC' ? config.lowerBound : null,
      upperBound: config.type === 'NUMERIC' ? config.upperBound : null,
      unitCode: config.type === 'NUMERIC' ? config.unitCode : null,
      expectedBooleanValue:
        config.type === 'BOOLEAN' ? config.expectedValue : null,
    };
  }

  private optionData(input: SpecificationDraftInput) {
    const config = input.configuration;
    if (config.type !== 'CATEGORICAL' && config.type !== 'VISUAL') return [];
    return config.options;
  }

  private inputFromRow(row: SpecificationDetailRow): SpecificationDraftInput {
    return {
      name: row.name,
      description: row.description,
      targetUnitType: row.targetUnitType,
      processCode: row.processDefinition.code,
      routeStep: this.routeStep(row),
      configuration: this.configuration(row),
    };
  }

  private mutationResult(row: SpecificationDetailRow) {
    const detail = this.managementDetail(row);
    return { detail, etag: specificationEtag(this.etagSource(detail)) };
  }

  async listManagement(
    query: SpecificationListQuery,
  ): Promise<ManagementSpecificationListResponse> {
    const result = await this.repository.listManagement(query);
    return {
      items: result.items.map((row) => this.managementSummary(row)),
      page: this.page(query.page, query.pageSize, result.totalItems),
    };
  }

  async listDiscovery(
    query: SpecificationDiscoveryQuery,
  ): Promise<DiscoverySpecificationListResponse> {
    const result = await this.repository.listDiscovery(query);
    return {
      items: result.items.map((row) => this.discoverySummary(row)),
      page: this.page(query.page, query.pageSize, result.totalItems),
    };
  }

  async getManagementDetail(code: string, version: number) {
    const row = await this.repository.findManagementDetail(code, version);
    if (!row) this.notFound();
    const detail = this.managementDetail(row);
    return { detail, etag: specificationEtag(this.etagSource(detail)) };
  }

  async getDiscoveryDetail(
    code: string,
    version: number,
  ): Promise<DiscoverySpecificationDetail> {
    const row = await this.repository.findDiscoveryDetail(code, version);
    if (!row) this.notFound();
    return this.discoveryDetail(row);
  }

  private managementSummary(
    row: SpecificationSummaryRow,
  ): ManagementSpecificationSummary {
    return {
      code: row.code,
      version: row.version,
      name: row.name,
      lifecycle: row.lifecycle,
      resultType: row.resultType,
      targetUnitType: row.targetUnitType,
      process: row.processDefinition,
      routeStep: this.routeStep(row),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private discoverySummary(
    row: SpecificationSummaryRow,
  ): DiscoverySpecificationSummary {
    const { lifecycle: _lifecycle, ...summary } = this.managementSummary(row);
    return summary;
  }

  private managementDetail(
    row: SpecificationDetailRow,
  ): ManagementSpecificationDetail {
    const { resultType: _resultType, ...summary } = this.managementSummary(row);
    return {
      ...summary,
      description: row.description,
      configuration: this.configuration(row),
    };
  }

  private discoveryDetail(
    row: SpecificationDetailRow,
  ): DiscoverySpecificationDetail {
    const { lifecycle: _lifecycle, ...detail } = this.managementDetail(row);
    return detail;
  }

  private configuration(
    row: SpecificationDetailRow,
  ): PublicSpecificationConfiguration {
    switch (row.resultType) {
      case 'NUMERIC':
        return {
          type: 'NUMERIC',
          lowerBound: row.lowerBound?.toString() ?? null,
          upperBound: row.upperBound?.toString() ?? null,
          unitCode: row.unitCode,
        };
      case 'BOOLEAN':
        if (row.expectedBooleanValue === null) this.integrityFailure();
        return { type: 'BOOLEAN', expectedValue: row.expectedBooleanValue };
      case 'CATEGORICAL':
      case 'VISUAL':
        if (row.options.some((option) => option.resultType !== row.resultType))
          this.integrityFailure();
        return {
          type: row.resultType,
          options: row.options.map(({ code, description, isAcceptable }) => ({
            code,
            description,
            isAcceptable,
          })),
        };
      case 'TEXT':
        if (row.options.length > 0) this.integrityFailure();
        return { type: 'TEXT' };
      default:
        return this.unreachableResultType(row.resultType);
    }
  }

  private routeStep(
    row: SpecificationSummaryRow,
  ): PublicRouteStepIdentity | null {
    const step = row.processRouteStep;
    if (!step) return null;
    return {
      productModelCode: step.processRoute.productModel.code,
      routeCode: step.processRoute.code,
      routeVersion: step.processRoute.version,
      stepOrder: step.stepOrder,
    };
  }

  private page(number: number, size: number, totalItems: number) {
    return {
      number,
      size,
      totalItems,
      totalPages: Math.ceil(totalItems / size),
    };
  }

  private etagSource(detail: ManagementSpecificationDetail) {
    const { createdAt: _createdAt, updatedAt: _updatedAt, ...source } = detail;
    return source;
  }

  private notFound(): never {
    throw new NotFoundException({
      code: 'INSPECTION_SPECIFICATION_NOT_FOUND',
      message: 'Inspection specification not found.',
    });
  }

  private integrityFailure(): never {
    throw new InternalServerErrorException({
      code: 'INSPECTION_SPECIFICATION_INTEGRITY_ERROR',
      message: 'Stored inspection specification could not be read safely.',
    });
  }

  private codeConflict(): never {
    throw new ConflictException({
      code: 'SPECIFICATION_CODE_CONFLICT',
      message: 'The specification code already exists.',
    });
  }
  private invalidTransition(): never {
    throw new ConflictException({
      code: 'INVALID_SPECIFICATION_LIFECYCLE_TRANSITION',
      message: 'The lifecycle transition is not allowed.',
    });
  }
  private incompatibleContext(): never {
    throw new ConflictException({
      code: 'INCOMPATIBLE_INSPECTION_CONTEXT',
      message: 'The inspection context is incompatible.',
    });
  }
  private persistenceFailure(): never {
    throw new InternalServerErrorException({
      code: 'INSPECTION_PERSISTENCE_ERROR',
      message: 'The inspection specification could not be persisted.',
    });
  }
  private prismaCode(error: unknown): string | undefined {
    return error && typeof error === 'object' && 'code' in error
      ? String((error as { code: unknown }).code)
      : undefined;
  }
  private isPublicException(error: unknown): boolean {
    return (
      error instanceof BadRequestException ||
      error instanceof ConflictException ||
      error instanceof NotFoundException
    );
  }

  private unreachableResultType(value: never): never {
    void value;
    return this.integrityFailure();
  }
}
