-- CreateEnum
CREATE TYPE "TraceableUnitType" AS ENUM ('PACK', 'MODULE', 'CELL', 'COMPONENT', 'MATERIAL');

-- CreateTable
CREATE TABLE "TraceableUnit" (
    "id" UUID NOT NULL,
    "traceCode" VARCHAR(128) NOT NULL,
    "unitType" "TraceableUnitType" NOT NULL,
    "productModelId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TraceableUnit_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TraceableUnit_productModel_check" CHECK (
        ("unitType" = 'PACK' AND "productModelId" IS NOT NULL)
        OR ("unitType" <> 'PACK' AND "productModelId" IS NULL)
    )
);

-- CreateTable
CREATE TABLE "GenealogyRelation" (
    "id" UUID NOT NULL,
    "parentUnitId" UUID NOT NULL,
    "childUnitId" UUID NOT NULL,
    "positionCode" VARCHAR(64),
    "installedAt" TIMESTAMPTZ(3) NOT NULL,
    "removedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GenealogyRelation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GenealogyRelation_distinct_units_check" CHECK ("parentUnitId" <> "childUnitId"),
    CONSTRAINT "GenealogyRelation_time_range_check" CHECK ("removedAt" IS NULL OR "removedAt" > "installedAt")
);

-- CreateIndex
CREATE UNIQUE INDEX "TraceableUnit_traceCode_key" ON "TraceableUnit"("traceCode");

-- CreateIndex
CREATE INDEX "TraceableUnit_unitType_idx" ON "TraceableUnit"("unitType");

-- CreateIndex
CREATE INDEX "TraceableUnit_productModelId_idx" ON "TraceableUnit"("productModelId");

-- CreateIndex
CREATE INDEX "GenealogyRelation_parentUnitId_installedAt_idx" ON "GenealogyRelation"("parentUnitId", "installedAt");

-- CreateIndex
CREATE INDEX "GenealogyRelation_childUnitId_installedAt_idx" ON "GenealogyRelation"("childUnitId", "installedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GenealogyRelation_parentUnitId_childUnitId_installedAt_key" ON "GenealogyRelation"("parentUnitId", "childUnitId", "installedAt");

-- One physical unit can have only one current direct parent.
CREATE UNIQUE INDEX "GenealogyRelation_active_child_key" ON "GenealogyRelation"("childUnitId") WHERE "removedAt" IS NULL;

-- A named position within a parent can hold only one current child.
CREATE UNIQUE INDEX "GenealogyRelation_active_position_key" ON "GenealogyRelation"("parentUnitId", "positionCode") WHERE "removedAt" IS NULL AND "positionCode" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "TraceableUnit" ADD CONSTRAINT "TraceableUnit_productModelId_fkey" FOREIGN KEY ("productModelId") REFERENCES "ProductModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenealogyRelation" ADD CONSTRAINT "GenealogyRelation_parentUnitId_fkey" FOREIGN KEY ("parentUnitId") REFERENCES "TraceableUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenealogyRelation" ADD CONSTRAINT "GenealogyRelation_childUnitId_fkey" FOREIGN KEY ("childUnitId") REFERENCES "TraceableUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
