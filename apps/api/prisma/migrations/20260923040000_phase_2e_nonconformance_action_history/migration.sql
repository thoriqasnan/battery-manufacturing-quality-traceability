-- CreateEnum
CREATE TYPE "NonconformanceStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('CORRECTION', 'REWORK', 'REPLACEMENT', 'RETEST', 'BALANCING', 'ESCALATION');

-- CreateEnum
CREATE TYPE "DispositionType" AS ENUM ('CONTINUE', 'CONCESSION', 'RETURN_IQC', 'SCRAP');

-- CreateTable
CREATE TABLE "DefectCategory" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DefectCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nonconformance" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "traceableUnitId" UUID NOT NULL,
    "defectCategoryId" UUID NOT NULL,
    "sourceInspectionId" UUID,
    "sourceProcessExecutionId" UUID,
    "status" "NonconformanceStatus" NOT NULL DEFAULT 'OPEN',
    "description" TEXT,
    "detectedAt" TIMESTAMPTZ(3) NOT NULL,
    "resolvedAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Nonconformance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Nonconformance_lifecycle_check" CHECK (
        ("status" IN ('OPEN', 'IN_PROGRESS') AND "resolvedAt" IS NULL AND "closedAt" IS NULL)
        OR ("status" = 'RESOLVED' AND "resolvedAt" IS NOT NULL AND "closedAt" IS NULL)
        OR ("status" = 'CLOSED' AND "resolvedAt" IS NOT NULL AND "closedAt" IS NOT NULL)
    ),
    CONSTRAINT "Nonconformance_timestamp_check" CHECK (
        ("resolvedAt" IS NULL OR "resolvedAt" >= "detectedAt")
        AND ("closedAt" IS NULL OR "closedAt" >= "resolvedAt")
    )
);

-- CreateTable
CREATE TABLE "AbnormalCase" (
    "id" UUID NOT NULL,
    "nonconformanceId" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "reason" TEXT,
    "openedAt" TIMESTAMPTZ(3) NOT NULL,
    "closedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AbnormalCase_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AbnormalCase_timestamp_check" CHECK ("closedAt" IS NULL OR "closedAt" >= "openedAt")
);

-- CreateTable
CREATE TABLE "ActionHistory" (
    "id" UUID NOT NULL,
    "nonconformanceId" UUID NOT NULL,
    "traceableUnitId" UUID NOT NULL,
    "abnormalCaseId" UUID,
    "resultingInspectionId" UUID,
    "relatedUnitId" UUID,
    "actionType" "ActionType" NOT NULL,
    "note" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" UUID NOT NULL,
    "nonconformanceId" UUID NOT NULL,
    "traceableUnitId" UUID NOT NULL,
    "actionHistoryId" UUID,
    "inspectionId" UUID NOT NULL,
    "note" TEXT,
    "verifiedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispositionHistory" (
    "id" UUID NOT NULL,
    "nonconformanceId" UUID NOT NULL,
    "dispositionType" "DispositionType" NOT NULL,
    "note" TEXT,
    "decidedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DispositionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DefectCategory_code_key" ON "DefectCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Nonconformance_code_key" ON "Nonconformance"("code");

-- CreateIndex
CREATE INDEX "Nonconformance_traceableUnitId_detectedAt_idx" ON "Nonconformance"("traceableUnitId", "detectedAt");

-- CreateIndex
CREATE INDEX "Nonconformance_status_detectedAt_idx" ON "Nonconformance"("status", "detectedAt");

-- CreateIndex
CREATE INDEX "Nonconformance_defectCategoryId_detectedAt_idx" ON "Nonconformance"("defectCategoryId", "detectedAt");

-- CreateIndex
CREATE INDEX "Nonconformance_sourceInspectionId_idx" ON "Nonconformance"("sourceInspectionId");

-- CreateIndex
CREATE INDEX "Nonconformance_sourceProcessExecutionId_idx" ON "Nonconformance"("sourceProcessExecutionId");

-- CreateIndex
CREATE UNIQUE INDEX "Nonconformance_id_traceableUnitId_key" ON "Nonconformance"("id", "traceableUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "AbnormalCase_code_key" ON "AbnormalCase"("code");

-- CreateIndex
CREATE INDEX "AbnormalCase_nonconformanceId_openedAt_idx" ON "AbnormalCase"("nonconformanceId", "openedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AbnormalCase_id_nonconformanceId_key" ON "AbnormalCase"("id", "nonconformanceId");

-- CreateIndex
CREATE INDEX "ActionHistory_nonconformanceId_occurredAt_idx" ON "ActionHistory"("nonconformanceId", "occurredAt");

-- CreateIndex
CREATE INDEX "ActionHistory_abnormalCaseId_occurredAt_idx" ON "ActionHistory"("abnormalCaseId", "occurredAt");

-- CreateIndex
CREATE INDEX "ActionHistory_resultingInspectionId_idx" ON "ActionHistory"("resultingInspectionId");

-- CreateIndex
CREATE INDEX "ActionHistory_relatedUnitId_idx" ON "ActionHistory"("relatedUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "ActionHistory_id_nonconformanceId_traceableUnitId_key" ON "ActionHistory"("id", "nonconformanceId", "traceableUnitId");

-- CreateIndex
CREATE INDEX "Verification_nonconformanceId_verifiedAt_idx" ON "Verification"("nonconformanceId", "verifiedAt");

-- CreateIndex
CREATE INDEX "Verification_actionHistoryId_idx" ON "Verification"("actionHistoryId");

-- CreateIndex
CREATE INDEX "Verification_inspectionId_idx" ON "Verification"("inspectionId");

-- CreateIndex
CREATE UNIQUE INDEX "Verification_nonconformanceId_inspectionId_key" ON "Verification"("nonconformanceId", "inspectionId");

-- CreateIndex
CREATE INDEX "DispositionHistory_nonconformanceId_decidedAt_idx" ON "DispositionHistory"("nonconformanceId", "decidedAt");

-- CreateIndex
CREATE INDEX "DispositionHistory_dispositionType_decidedAt_idx" ON "DispositionHistory"("dispositionType", "decidedAt");

-- Composite key supports same-unit evidence relationships.
CREATE UNIQUE INDEX "Inspection_id_traceableUnitId_key" ON "Inspection"("id", "traceableUnitId");

-- AddForeignKey
ALTER TABLE "Nonconformance" ADD CONSTRAINT "Nonconformance_traceableUnitId_fkey" FOREIGN KEY ("traceableUnitId") REFERENCES "TraceableUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nonconformance" ADD CONSTRAINT "Nonconformance_defectCategoryId_fkey" FOREIGN KEY ("defectCategoryId") REFERENCES "DefectCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nonconformance" ADD CONSTRAINT "Nonconformance_sourceInspectionId_traceableUnitId_fkey" FOREIGN KEY ("sourceInspectionId", "traceableUnitId") REFERENCES "Inspection"("id", "traceableUnitId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nonconformance" ADD CONSTRAINT "Nonconformance_sourceProcessExecutionId_traceableUnitId_fkey" FOREIGN KEY ("sourceProcessExecutionId", "traceableUnitId") REFERENCES "ProcessExecution"("id", "traceableUnitId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbnormalCase" ADD CONSTRAINT "AbnormalCase_nonconformanceId_fkey" FOREIGN KEY ("nonconformanceId") REFERENCES "Nonconformance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionHistory" ADD CONSTRAINT "ActionHistory_nonconformanceId_traceableUnitId_fkey" FOREIGN KEY ("nonconformanceId", "traceableUnitId") REFERENCES "Nonconformance"("id", "traceableUnitId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionHistory" ADD CONSTRAINT "ActionHistory_abnormalCaseId_nonconformanceId_fkey" FOREIGN KEY ("abnormalCaseId", "nonconformanceId") REFERENCES "AbnormalCase"("id", "nonconformanceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionHistory" ADD CONSTRAINT "ActionHistory_resultingInspectionId_traceableUnitId_fkey" FOREIGN KEY ("resultingInspectionId", "traceableUnitId") REFERENCES "Inspection"("id", "traceableUnitId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionHistory" ADD CONSTRAINT "ActionHistory_relatedUnitId_fkey" FOREIGN KEY ("relatedUnitId") REFERENCES "TraceableUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_nonconformanceId_traceableUnitId_fkey" FOREIGN KEY ("nonconformanceId", "traceableUnitId") REFERENCES "Nonconformance"("id", "traceableUnitId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_actionHistoryId_nonconformanceId_traceableUni_fkey" FOREIGN KEY ("actionHistoryId", "nonconformanceId", "traceableUnitId") REFERENCES "ActionHistory"("id", "nonconformanceId", "traceableUnitId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_inspectionId_traceableUnitId_fkey" FOREIGN KEY ("inspectionId", "traceableUnitId") REFERENCES "Inspection"("id", "traceableUnitId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispositionHistory" ADD CONSTRAINT "DispositionHistory_nonconformanceId_fkey" FOREIGN KEY ("nonconformanceId") REFERENCES "Nonconformance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
