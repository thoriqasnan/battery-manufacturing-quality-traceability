import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUserIdentity } from '../auth/authentication.types.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { exactVersionLockInput } from './inspection-specification-mutation.js';
import { advisoryLockKey } from './inspection-specification-mutation.js';
import {
  INSPECTION_OPERATION,
  INSPECTION_OPERATION_VERSION,
  INSPECTION_RESPONSE_CONTRACT_VERSION,
  type ParsedInspectionRequest,
  evaluateInspection,
  inspectionAttemptLockKey,
  inspectionIdempotencyLockKey,
  inspectionRequestFingerprint,
} from './inspection-entry.js';

const RESPONSE_SELECT = {
  attemptNumber: true,
  outcome: true,
  inspectedAt: true,
  createdAt: true,
  resultType: true,
  traceableUnit: { select: { traceCode: true } },
  specification: {
    select: {
      code: true,
      version: true,
      unitCode: true,
      processDefinition: { select: { code: true } },
    },
  },
  processExecution: {
    select: {
      attemptNumber: true,
      processDefinition: { select: { code: true } },
    },
  },
  result: {
    select: {
      numericValue: true,
      booleanValue: true,
      textValue: true,
      selectedOption: { select: { code: true } },
    },
  },
} as const;

type ResponseRow = Prisma.InspectionGetPayload<{
  select: typeof RESPONSE_SELECT;
}>;
export type InspectionSubmissionResponse = {
  traceCode: string;
  specification: { code: string; version: number };
  processCode: string;
  execution: { processCode: string; attempt: number } | null;
  attemptNumber: number;
  inspectedAt: string;
  createdAt: string;
  evidence:
    | { type: 'NUMERIC'; value: string; unitCode: string | null }
    | { type: 'BOOLEAN'; value: boolean }
    | { type: 'CATEGORICAL' | 'VISUAL'; optionCode: string }
    | { type: 'TEXT'; value: string };
  outcome: 'PASS' | 'NG';
};

export type InspectionSubmissionResult = {
  status: 201;
  replayed: boolean;
  response: InspectionSubmissionResponse;
};

@Injectable()
export class InspectionEntryService {
  constructor(private readonly prisma: PrismaService) {}

  async submit(
    actor: AuthenticatedUserIdentity,
    idempotencyKey: string,
    request: ParsedInspectionRequest,
  ): Promise<InspectionSubmissionResult> {
    const fingerprint = inspectionRequestFingerprint(request);
    try {
      return await this.prisma.client.$transaction(
        async (tx) => {
          await this.lock(
            tx,
            inspectionIdempotencyLockKey(actor.id, idempotencyKey),
          );
          const existing = await tx.inspectionSubmission.findUnique({
            where: {
              userId_operation_operationVersion_idempotencyKey: {
                userId: actor.id,
                operation: INSPECTION_OPERATION,
                operationVersion: INSPECTION_OPERATION_VERSION,
                idempotencyKey,
              },
            },
            select: {
              requestFingerprint: true,
              responseStatus: true,
              inspection: { select: RESPONSE_SELECT },
            },
          });
          if (existing) {
            if (existing.requestFingerprint !== fingerprint)
              this.idempotencyConflict();
            if (existing.responseStatus !== 201) this.persistenceFailure();
            return {
              status: 201 as const,
              replayed: true,
              response: this.response(existing.inspection),
            };
          }

          const unit = await tx.traceableUnit.findUnique({
            where: { traceCode: request.traceCode },
            select: { id: true, unitType: true },
          });
          if (!unit) this.unitNotFound();
          const preliminary = await tx.inspectionSpecification.findUnique({
            where: { code_version: request.specification },
            select: { id: true },
          });
          if (!preliminary) this.specificationNotFound();

          await this.lock(
            tx,
            advisoryLockKey(
              exactVersionLockInput(
                request.specification.code,
                request.specification.version,
              ),
            ),
          );
          const specification = await tx.inspectionSpecification.findUnique({
            where: { code_version: request.specification },
            select: {
              id: true,
              lifecycle: true,
              resultType: true,
              targetUnitType: true,
              processDefinitionId: true,
              processRouteStepId: true,
              lowerBound: true,
              upperBound: true,
              expectedBooleanValue: true,
              options: {
                select: {
                  id: true,
                  code: true,
                  resultType: true,
                  isAcceptable: true,
                },
              },
            },
          });
          if (!specification) this.specificationNotFound();
          if (specification.lifecycle !== 'PUBLISHED') this.notPublished();
          if (unit.unitType !== specification.targetUnitType)
            this.incompatibleContext();

          const [{ now }] = await tx.$queryRaw<
            Array<{ now: Date }>
          >`SELECT transaction_timestamp() AS now`;
          if (
            request.inspectedAt.instant.getTime() >
            now.getTime() + 5 * 60_000
          )
            this.invalidFutureTime();

          let processExecutionId: string | null = null;
          if (request.execution) {
            const execution = await tx.processExecution.findFirst({
              where: {
                traceableUnitId: unit.id,
                attemptNumber: request.execution.attempt,
                processDefinition: { code: request.execution.processCode },
              },
              select: {
                id: true,
                processDefinitionId: true,
                processRouteStepId: true,
              },
            });
            if (
              !execution ||
              execution.processDefinitionId !==
                specification.processDefinitionId
            )
              this.incompatibleContext();
            if (
              specification.processRouteStepId &&
              execution.processRouteStepId !== specification.processRouteStepId
            )
              this.incompatibleContext();
            processExecutionId = execution.id;
          }

          if (request.evidence.type !== specification.resultType)
            this.invalidTypedResult();
          let option: { id: string; isAcceptable: boolean } | null = null;
          if (
            request.evidence.type === 'CATEGORICAL' ||
            request.evidence.type === 'VISUAL'
          ) {
            const evidence = request.evidence;
            const matched = specification.options.find(
              (item) =>
                item.code === evidence.optionCode &&
                item.resultType === evidence.type,
            );
            if (!matched) this.invalidTypedResult();
            option = matched;
          }
          if (
            specification.resultType === 'BOOLEAN' &&
            specification.expectedBooleanValue === null
          )
            this.persistenceFailure();

          const evaluation =
            specification.resultType === 'NUMERIC'
              ? {
                  type: 'NUMERIC' as const,
                  lowerBound: specification.lowerBound?.toString() ?? null,
                  upperBound: specification.upperBound?.toString() ?? null,
                }
              : specification.resultType === 'BOOLEAN'
                ? {
                    type: 'BOOLEAN' as const,
                    expectedValue: specification.expectedBooleanValue!,
                  }
                : specification.resultType === 'TEXT'
                  ? { type: 'TEXT' as const }
                  : {
                      type: specification.resultType,
                      isAcceptable: option!.isAcceptable,
                    };
          const outcome = evaluateInspection(request.evidence, evaluation);

          await this.lock(
            tx,
            inspectionAttemptLockKey(unit.id, specification.id),
          );
          const aggregate = await tx.inspection.aggregate({
            where: {
              traceableUnitId: unit.id,
              specificationId: specification.id,
            },
            _max: { attemptNumber: true },
          });
          const attemptNumber = (aggregate._max.attemptNumber ?? 0) + 1;
          if (attemptNumber > 2_147_483_647) this.writeConflict();

          const inspection = await tx.inspection.create({
            data: {
              traceableUnitId: unit.id,
              specificationId: specification.id,
              processDefinitionId: specification.processDefinitionId,
              processExecutionId,
              inspectorUserId: actor.id,
              resultType: specification.resultType,
              targetUnitType: specification.targetUnitType,
              attemptNumber,
              outcome,
              inspectedAt: request.inspectedAt.instant,
            },
            select: { id: true },
          });
          await tx.inspectionResult.create({
            data: {
              inspectionId: inspection.id,
              specificationId: specification.id,
              resultType: specification.resultType,
              numericValue:
                request.evidence.type === 'NUMERIC'
                  ? request.evidence.value
                  : null,
              booleanValue:
                request.evidence.type === 'BOOLEAN'
                  ? request.evidence.value
                  : null,
              optionId: option?.id ?? null,
              textValue:
                request.evidence.type === 'TEXT'
                  ? request.evidence.value
                  : null,
            },
          });
          await tx.inspectionSubmission.create({
            data: {
              userId: actor.id,
              operation: INSPECTION_OPERATION,
              operationVersion: INSPECTION_OPERATION_VERSION,
              idempotencyKey,
              requestFingerprint: fingerprint,
              inspectionId: inspection.id,
              responseContractVersion: INSPECTION_RESPONSE_CONTRACT_VERSION,
              responseStatus: 201,
            },
          });
          const persisted = await tx.inspection.findUniqueOrThrow({
            where: { id: inspection.id },
            select: RESPONSE_SELECT,
          });
          return {
            status: 201 as const,
            replayed: false,
            response: this.response(persisted),
          };
        },
        { timeout: 15_000 },
      );
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof NotFoundException ||
        error instanceof InternalServerErrorException
      )
        throw error;
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        String((error as { code: unknown }).code) === 'P2002'
      )
        this.writeConflict();
      this.persistenceFailure();
    }
  }

  private async lock(tx: Prisma.TransactionClient, key: bigint) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${key})`;
  }

  private response(row: ResponseRow): InspectionSubmissionResponse {
    if (!row.result) this.persistenceFailure();
    const evidence =
      row.resultType === 'NUMERIC' && row.result.numericValue !== null
        ? {
            type: 'NUMERIC' as const,
            value: row.result.numericValue.toString(),
            unitCode: row.specification.unitCode,
          }
        : row.resultType === 'BOOLEAN' && row.result.booleanValue !== null
          ? { type: 'BOOLEAN' as const, value: row.result.booleanValue }
          : (row.resultType === 'CATEGORICAL' || row.resultType === 'VISUAL') &&
              row.result.selectedOption
            ? {
                type: row.resultType,
                optionCode: row.result.selectedOption.code,
              }
            : row.resultType === 'TEXT' && row.result.textValue !== null
              ? { type: 'TEXT' as const, value: row.result.textValue }
              : this.persistenceFailure();
    return {
      traceCode: row.traceableUnit.traceCode,
      specification: {
        code: row.specification.code,
        version: row.specification.version,
      },
      processCode: row.specification.processDefinition.code,
      execution: row.processExecution
        ? {
            processCode: row.processExecution.processDefinition.code,
            attempt: row.processExecution.attemptNumber,
          }
        : null,
      attemptNumber: row.attemptNumber,
      inspectedAt: row.inspectedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      evidence,
      outcome: row.outcome,
    };
  }

  private unitNotFound(): never {
    throw new NotFoundException({
      code: 'TRACE_UNIT_NOT_FOUND',
      message: 'Traceable unit not found.',
    });
  }
  private specificationNotFound(): never {
    throw new NotFoundException({
      code: 'INSPECTION_SPECIFICATION_NOT_FOUND',
      message: 'Inspection specification not found.',
    });
  }
  private notPublished(): never {
    throw new ConflictException({
      code: 'INSPECTION_SPECIFICATION_NOT_PUBLISHED',
      message: 'Inspection specification is not published.',
    });
  }
  private incompatibleContext(): never {
    throw new ConflictException({
      code: 'INCOMPATIBLE_INSPECTION_CONTEXT',
      message: 'The inspection context is incompatible.',
    });
  }
  private idempotencyConflict(): never {
    throw new ConflictException({
      code: 'IDEMPOTENCY_CONFLICT',
      message: 'The idempotency key was used for a different request.',
    });
  }
  private invalidTypedResult(): never {
    throw new BadRequestException({
      code: 'INVALID_TYPED_RESULT',
      message: 'The inspection evidence is invalid for the specification.',
    });
  }
  private invalidFutureTime(): never {
    throw new BadRequestException({
      code: 'INVALID_REQUEST',
      message: 'The request is invalid.',
      details: [{ field: 'inspectedAt', code: 'TOO_FAR_IN_FUTURE' }],
    });
  }
  private writeConflict(): never {
    throw new ConflictException({
      code: 'INSPECTION_WRITE_CONFLICT',
      message:
        'The inspection could not be written due to a concurrent change.',
    });
  }
  private persistenceFailure(): never {
    throw new InternalServerErrorException({
      code: 'INSPECTION_PERSISTENCE_ERROR',
      message: 'The inspection could not be persisted.',
    });
  }
}
