-- CreateEnum
CREATE TYPE "InventoryBulkSource" AS ENUM ('BULK_EXCEL', 'BULK_MANUAL');

-- CreateEnum
CREATE TYPE "InventoryBulkOperationStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED', 'REVERTED');

-- CreateTable
CREATE TABLE "InventoryBulkOperation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accountId" TEXT NOT NULL,
    "source" "InventoryBulkSource" NOT NULL,
    "status" "InventoryBulkOperationStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "reason" TEXT,
    "userId" TEXT,
    "revertedById" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "revertedAt" TIMESTAMP(3),
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,

    CONSTRAINT "InventoryBulkOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBulkSnapshot" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "existedBefore" BOOLEAN NOT NULL,
    "beforeState" JSONB,

    CONSTRAINT "InventoryBulkSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryBulkOperation_accountId_createdAt_idx" ON "InventoryBulkOperation"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryBulkOperation_accountId_status_createdAt_idx" ON "InventoryBulkOperation"("accountId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryBulkOperation_userId_createdAt_idx" ON "InventoryBulkOperation"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryBulkSnapshot_accountId_createdAt_idx" ON "InventoryBulkSnapshot"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryBulkSnapshot_operationId_idx" ON "InventoryBulkSnapshot"("operationId");

-- CreateIndex
CREATE INDEX "InventoryBulkSnapshot_productId_idx" ON "InventoryBulkSnapshot"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBulkSnapshot_operationId_productId_key" ON "InventoryBulkSnapshot"("operationId", "productId");

-- AddForeignKey
ALTER TABLE "InventoryBulkOperation" ADD CONSTRAINT "InventoryBulkOperation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryBulkOperation" ADD CONSTRAINT "InventoryBulkOperation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryBulkOperation" ADD CONSTRAINT "InventoryBulkOperation_revertedById_fkey" FOREIGN KEY ("revertedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryBulkSnapshot" ADD CONSTRAINT "InventoryBulkSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryBulkSnapshot" ADD CONSTRAINT "InventoryBulkSnapshot_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "InventoryBulkOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
