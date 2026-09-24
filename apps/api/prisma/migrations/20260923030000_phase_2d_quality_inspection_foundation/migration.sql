-- CreateEnum
CREATE TYPE "InspectionResultType" AS ENUM ('NUMERIC', 'BOOLEAN', 'CATEGORICAL', 'VISUAL', 'TEXT');

-- CreateEnum
CREATE TYPE "InspectionOutcome" AS ENUM ('PASS', 'NG');

-- CreateTable
CREATE TABLE "InspectionSpecification" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "version" INTEGER NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "resultType" "InspectionResultType" NOT NULL,
    "targetUnitType" "TraceableUnitType" NOT NULL,
    "processDefinitionId" UUID NOT NULL,
    "processRouteStepId" UUID,
    "lowerBound" DECIMAL(18,6),
    "upperBound" DECIMAL(18,6),
    "unitCode" VARCHAR(32),
    "expectedBooleanValue" BOOLEAN,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InspectionSpecification_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InspectionSpecification_version_check" CHECK ("version" > 0),
    CONSTRAINT "InspectionSpecification_bounds_check" CHECK (
        "lowerBound" IS NULL OR "upperBound" IS NULL OR "lowerBound" <= "upperBound"
    ),
    CONSTRAINT "InspectionSpecification_configuration_check" CHECK (
        ("resultType" = 'NUMERIC' AND "expectedBooleanValue" IS NULL)
        OR (
            "resultType" = 'BOOLEAN'
            AND "lowerBound" IS NULL
            AND "upperBound" IS NULL
            AND "unitCode" IS NULL
            AND "expectedBooleanValue" IS NOT NULL
        )
        OR (
            "resultType" IN ('CATEGORICAL', 'VISUAL', 'TEXT')
            AND "lowerBound" IS NULL
            AND "upperBound" IS NULL
            AND "unitCode" IS NULL
            AND "expectedBooleanValue" IS NULL
        )
    )
);

-- CreateTable
CREATE TABLE "InspectionSpecificationOption" (
    "id" UUID NOT NULL,
    "specificationId" UUID NOT NULL,
    "resultType" "InspectionResultType" NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "description" TEXT,
    "isAcceptable" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspectionSpecificationOption_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InspectionSpecificationOption_resultType_check" CHECK ("resultType" IN ('CATEGORICAL', 'VISUAL'))
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" UUID NOT NULL,
    "traceableUnitId" UUID NOT NULL,
    "specificationId" UUID NOT NULL,
    "processDefinitionId" UUID NOT NULL,
    "processExecutionId" UUID,
    "resultType" "InspectionResultType" NOT NULL,
    "targetUnitType" "TraceableUnitType" NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "outcome" "InspectionOutcome" NOT NULL,
    "inspectedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Inspection_attemptNumber_check" CHECK ("attemptNumber" > 0)
);

-- CreateTable
CREATE TABLE "InspectionResult" (
    "id" UUID NOT NULL,
    "inspectionId" UUID NOT NULL,
    "specificationId" UUID NOT NULL,
    "resultType" "InspectionResultType" NOT NULL,
    "numericValue" DECIMAL(18,6),
    "booleanValue" BOOLEAN,
    "optionId" UUID,
    "textValue" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspectionResult_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InspectionResult_typed_value_check" CHECK (
        (
            "resultType" = 'NUMERIC'
            AND "numericValue" IS NOT NULL
            AND "booleanValue" IS NULL
            AND "optionId" IS NULL
            AND "textValue" IS NULL
        )
        OR (
            "resultType" = 'BOOLEAN'
            AND "numericValue" IS NULL
            AND "booleanValue" IS NOT NULL
            AND "optionId" IS NULL
            AND "textValue" IS NULL
        )
        OR (
            "resultType" IN ('CATEGORICAL', 'VISUAL')
            AND "numericValue" IS NULL
            AND "booleanValue" IS NULL
            AND "optionId" IS NOT NULL
            AND "textValue" IS NULL
        )
        OR (
            "resultType" = 'TEXT'
            AND "numericValue" IS NULL
            AND "booleanValue" IS NULL
            AND "optionId" IS NULL
            AND "textValue" IS NOT NULL
            AND btrim("textValue") <> ''
        )
    )
);

-- CreateIndex
CREATE INDEX "InspectionSpecification_processDefinitionId_isActive_idx" ON "InspectionSpecification"("processDefinitionId", "isActive");

-- CreateIndex
CREATE INDEX "InspectionSpecification_processRouteStepId_isActive_idx" ON "InspectionSpecification"("processRouteStepId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionSpecification_code_version_key" ON "InspectionSpecification"("code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionSpecification_id_resultType_key" ON "InspectionSpecification"("id", "resultType");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionSpecification_id_resultType_targetUnitType_key" ON "InspectionSpecification"("id", "resultType", "targetUnitType");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionSpecification_id_resultType_targetUnitType_proces_key" ON "InspectionSpecification"("id", "resultType", "targetUnitType", "processDefinitionId");

-- CreateIndex
CREATE INDEX "InspectionSpecificationOption_specificationId_isAcceptable_idx" ON "InspectionSpecificationOption"("specificationId", "isAcceptable");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionSpecificationOption_specificationId_code_key" ON "InspectionSpecificationOption"("specificationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionSpecificationOption_id_specificationId_resultType_key" ON "InspectionSpecificationOption"("id", "specificationId", "resultType");

-- CreateIndex
CREATE INDEX "Inspection_traceableUnitId_inspectedAt_idx" ON "Inspection"("traceableUnitId", "inspectedAt");

-- CreateIndex
CREATE INDEX "Inspection_specificationId_inspectedAt_idx" ON "Inspection"("specificationId", "inspectedAt");

-- CreateIndex
CREATE INDEX "Inspection_processExecutionId_inspectedAt_idx" ON "Inspection"("processExecutionId", "inspectedAt");

-- CreateIndex
CREATE INDEX "Inspection_outcome_inspectedAt_idx" ON "Inspection"("outcome", "inspectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Inspection_traceableUnitId_specificationId_attemptNumber_key" ON "Inspection"("traceableUnitId", "specificationId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Inspection_id_specificationId_resultType_key" ON "Inspection"("id", "specificationId", "resultType");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionResult_inspectionId_key" ON "InspectionResult"("inspectionId");

-- CreateIndex
CREATE INDEX "InspectionResult_specificationId_idx" ON "InspectionResult"("specificationId");

-- CreateIndex
CREATE INDEX "InspectionResult_optionId_idx" ON "InspectionResult"("optionId");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionResult_inspectionId_specificationId_resultType_key" ON "InspectionResult"("inspectionId", "specificationId", "resultType");

-- Composite keys support cross-entity consistency foreign keys.
CREATE UNIQUE INDEX "ProcessExecution_id_traceableUnitId_key" ON "ProcessExecution"("id", "traceableUnitId");
CREATE UNIQUE INDEX "ProcessExecution_id_traceableUnitId_processDefinitionId_key" ON "ProcessExecution"("id", "traceableUnitId", "processDefinitionId");
CREATE UNIQUE INDEX "TraceableUnit_id_unitType_key" ON "TraceableUnit"("id", "unitType");

-- AddForeignKey
ALTER TABLE "InspectionSpecification" ADD CONSTRAINT "InspectionSpecification_processDefinitionId_fkey" FOREIGN KEY ("processDefinitionId") REFERENCES "ProcessDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionSpecification" ADD CONSTRAINT "InspectionSpecification_processRouteStepId_processDefiniti_fkey" FOREIGN KEY ("processRouteStepId", "processDefinitionId") REFERENCES "ProcessRouteStep"("id", "processDefinitionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionSpecificationOption" ADD CONSTRAINT "InspectionSpecificationOption_specificationId_resultType_fkey" FOREIGN KEY ("specificationId", "resultType") REFERENCES "InspectionSpecification"("id", "resultType") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_traceableUnitId_targetUnitType_fkey" FOREIGN KEY ("traceableUnitId", "targetUnitType") REFERENCES "TraceableUnit"("id", "unitType") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_specificationId_resultType_targetUnitType_proce_fkey" FOREIGN KEY ("specificationId", "resultType", "targetUnitType", "processDefinitionId") REFERENCES "InspectionSpecification"("id", "resultType", "targetUnitType", "processDefinitionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_processExecutionId_traceableUnitId_processDefin_fkey" FOREIGN KEY ("processExecutionId", "traceableUnitId", "processDefinitionId") REFERENCES "ProcessExecution"("id", "traceableUnitId", "processDefinitionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionResult" ADD CONSTRAINT "InspectionResult_inspectionId_specificationId_resultType_fkey" FOREIGN KEY ("inspectionId", "specificationId", "resultType") REFERENCES "Inspection"("id", "specificationId", "resultType") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionResult" ADD CONSTRAINT "InspectionResult_optionId_specificationId_resultType_fkey" FOREIGN KEY ("optionId", "specificationId", "resultType") REFERENCES "InspectionSpecificationOption"("id", "specificationId", "resultType") ON DELETE RESTRICT ON UPDATE CASCADE;
