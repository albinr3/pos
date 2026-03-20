-- CreateEnum
CREATE TYPE "SuperAdminNotificationType" AS ENUM (
    'TRANSFER_PENDING_REVIEW',
    'CARD_PAYMENT_SUCCESS',
    'CARD_PAYMENT_FAILED',
    'ERROR_HIGH',
    'ERROR_CRITICAL'
);

-- CreateTable
CREATE TABLE "SuperAdminNotification" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "SuperAdminNotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "metadata" JSONB,
    "sourceId" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "readBySuperAdminId" TEXT,

    CONSTRAINT "SuperAdminNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SuperAdminNotification_type_sourceId_key" ON "SuperAdminNotification"("type", "sourceId");

-- CreateIndex
CREATE INDEX "SuperAdminNotification_createdAt_idx" ON "SuperAdminNotification"("createdAt");

-- CreateIndex
CREATE INDEX "SuperAdminNotification_isRead_idx" ON "SuperAdminNotification"("isRead");

-- CreateIndex
CREATE INDEX "SuperAdminNotification_type_idx" ON "SuperAdminNotification"("type");

-- AddForeignKey
ALTER TABLE "SuperAdminNotification"
ADD CONSTRAINT "SuperAdminNotification_readBySuperAdminId_fkey"
FOREIGN KEY ("readBySuperAdminId") REFERENCES "SuperAdmin"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
