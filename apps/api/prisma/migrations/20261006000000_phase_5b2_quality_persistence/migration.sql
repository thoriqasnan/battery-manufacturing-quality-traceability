-- Specification lifecycle replaces the former eligibility Boolean.
CREATE TYPE "InspectionSpecificationLifecycle" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

ALTER TABLE "InspectionSpecification"
ADD COLUMN "lifecycle" "InspectionSpecificationLifecycle" NOT NULL DEFAULT 'PUBLISHED';

-- Existing Phase 2 reference specifications already have historical evidence and
-- therefore represent published acceptance configuration.
ALTER TABLE "InspectionSpecification"
ALTER COLUMN "lifecycle" SET DEFAULT 'DRAFT';

DROP INDEX "InspectionSpecification_processDefinitionId_isActive_idx";
DROP INDEX "InspectionSpecification_processRouteStepId_isActive_idx";

ALTER TABLE "InspectionSpecification"
DROP COLUMN "isActive";

CREATE INDEX "InspectionSpecification_processDefinitionId_lifecycle_idx"
ON "InspectionSpecification"("processDefinitionId", "lifecycle");

CREATE INDEX "InspectionSpecification_processRouteStepId_lifecycle_idx"
ON "InspectionSpecification"("processRouteStepId", "lifecycle");

-- Legacy/reference inspections remain honestly unattributed. Future Phase 5
-- application writes require an authenticated inspector in the transaction.
ALTER TABLE "Inspection"
ADD COLUMN "inspectorUserId" UUID;

CREATE INDEX "Inspection_inspectorUserId_idx"
ON "Inspection"("inspectorUserId");

ALTER TABLE "Inspection"
ADD CONSTRAINT "Inspection_inspectorUserId_fkey"
FOREIGN KEY ("inspectorUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Durable persistence for future Idempotency-Key replay. Fingerprint creation,
-- advisory locking, and replay behavior remain Phase 5D application concerns.
CREATE TABLE "InspectionSubmission" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "operation" VARCHAR(64) NOT NULL,
    "operationVersion" INTEGER NOT NULL,
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "requestFingerprint" CHAR(64) NOT NULL,
    "inspectionId" UUID NOT NULL,
    "responseContractVersion" INTEGER NOT NULL,
    "responseStatus" SMALLINT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InspectionSubmission_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InspectionSubmission_operation_format_check"
      CHECK ("operation" ~ '^[a-z][a-z0-9._:-]{0,63}$'),
    CONSTRAINT "InspectionSubmission_operationVersion_check"
      CHECK ("operationVersion" > 0),
    CONSTRAINT "InspectionSubmission_idempotencyKey_format_check"
      CHECK ("idempotencyKey" ~ '^[A-Za-z0-9._:-]{16,128}$'),
    CONSTRAINT "InspectionSubmission_requestFingerprint_format_check"
      CHECK ("requestFingerprint" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "InspectionSubmission_responseContractVersion_check"
      CHECK ("responseContractVersion" > 0),
    CONSTRAINT "InspectionSubmission_responseStatus_check"
      CHECK ("responseStatus" BETWEEN 200 AND 299)
);

CREATE UNIQUE INDEX "InspectionSubmission_inspectionId_key"
ON "InspectionSubmission"("inspectionId");

CREATE UNIQUE INDEX "InspectionSubmission_scope_key"
ON "InspectionSubmission"("userId", "operation", "operationVersion", "idempotencyKey");

ALTER TABLE "InspectionSubmission"
ADD CONSTRAINT "InspectionSubmission_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InspectionSubmission"
ADD CONSTRAINT "InspectionSubmission_inspectionId_fkey"
FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
