-- CreateEnum
CREATE TYPE "ExecutionMethod" AS ENUM ('MANUAL', 'AUTOMATED', 'HYBRID');

-- CreateTable
CREATE TABLE "ProductModel" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProductModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessDefinition" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProcessDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessRoute" (
    "id" UUID NOT NULL,
    "productModelId" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProcessRoute_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProcessRoute_version_check" CHECK ("version" > 0)
);

-- CreateTable
CREATE TABLE "ProcessRouteStep" (
    "id" UUID NOT NULL,
    "processRouteId" UUID NOT NULL,
    "processDefinitionId" UUID NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "executionMethod" "ExecutionMethod" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProcessRouteStep_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProcessRouteStep_stepOrder_check" CHECK ("stepOrder" > 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductModel_code_key" ON "ProductModel"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessDefinition_code_key" ON "ProcessDefinition"("code");

-- CreateIndex
CREATE INDEX "ProcessRoute_productModelId_isActive_idx" ON "ProcessRoute"("productModelId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessRoute_productModelId_code_version_key" ON "ProcessRoute"("productModelId", "code", "version");

-- CreateIndex
CREATE INDEX "ProcessRouteStep_processDefinitionId_idx" ON "ProcessRouteStep"("processDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessRouteStep_processRouteId_stepOrder_key" ON "ProcessRouteStep"("processRouteId", "stepOrder");

-- AddForeignKey
ALTER TABLE "ProcessRoute" ADD CONSTRAINT "ProcessRoute_productModelId_fkey" FOREIGN KEY ("productModelId") REFERENCES "ProductModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessRouteStep" ADD CONSTRAINT "ProcessRouteStep_processRouteId_fkey" FOREIGN KEY ("processRouteId") REFERENCES "ProcessRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessRouteStep" ADD CONSTRAINT "ProcessRouteStep_processDefinitionId_fkey" FOREIGN KEY ("processDefinitionId") REFERENCES "ProcessDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
