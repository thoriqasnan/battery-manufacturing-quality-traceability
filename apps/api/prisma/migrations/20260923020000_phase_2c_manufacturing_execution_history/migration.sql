-- CreateEnum
CREATE TYPE "ProcessExecutionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABORTED');

-- CreateTable
CREATE TABLE "ProcessExecution" (
    "id" UUID NOT NULL,
    "traceableUnitId" UUID NOT NULL,
    "processDefinitionId" UUID NOT NULL,
    "processRouteStepId" UUID,
    "attemptNumber" INTEGER NOT NULL,
    "status" "ProcessExecutionStatus" NOT NULL,
    "executionMethod" "ExecutionMethod" NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "finishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProcessExecution_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProcessExecution_attemptNumber_check" CHECK ("attemptNumber" > 0),
    CONSTRAINT "ProcessExecution_time_range_check" CHECK ("finishedAt" IS NULL OR "finishedAt" >= "startedAt"),
    CONSTRAINT "ProcessExecution_lifecycle_check" CHECK (
        ("status" = 'IN_PROGRESS' AND "finishedAt" IS NULL)
        OR ("status" IN ('COMPLETED', 'ABORTED') AND "finishedAt" IS NOT NULL)
    )
);

-- CreateIndex
CREATE INDEX "ProcessExecution_traceableUnitId_startedAt_idx" ON "ProcessExecution"("traceableUnitId", "startedAt");

-- CreateIndex
CREATE INDEX "ProcessExecution_processDefinitionId_startedAt_idx" ON "ProcessExecution"("processDefinitionId", "startedAt");

-- CreateIndex
CREATE INDEX "ProcessExecution_processRouteStepId_startedAt_idx" ON "ProcessExecution"("processRouteStepId", "startedAt");

-- CreateIndex
CREATE INDEX "ProcessExecution_status_startedAt_idx" ON "ProcessExecution"("status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessExecution_traceableUnitId_processDefinitionId_attemp_key" ON "ProcessExecution"("traceableUnitId", "processDefinitionId", "attemptNumber");

-- The composite key lets an execution prove that its route step configures
-- the same process definition referenced directly by the execution.
CREATE UNIQUE INDEX "ProcessRouteStep_id_processDefinitionId_key" ON "ProcessRouteStep"("id", "processDefinitionId");

-- AddForeignKey
ALTER TABLE "ProcessExecution" ADD CONSTRAINT "ProcessExecution_traceableUnitId_fkey" FOREIGN KEY ("traceableUnitId") REFERENCES "TraceableUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessExecution" ADD CONSTRAINT "ProcessExecution_processDefinitionId_fkey" FOREIGN KEY ("processDefinitionId") REFERENCES "ProcessDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessExecution" ADD CONSTRAINT "ProcessExecution_processRouteStepId_processDefinitionId_fkey" FOREIGN KEY ("processRouteStepId", "processDefinitionId") REFERENCES "ProcessRouteStep"("id", "processDefinitionId") ON DELETE RESTRICT ON UPDATE CASCADE;
