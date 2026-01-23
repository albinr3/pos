-- CreateEnum
CREATE TYPE "SuperAdminRole" AS ENUM ('OWNER', 'ADMIN', 'FINANCE', 'SUPPORT');

-- CreateTable
CREATE TABLE "SuperAdmin" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "SuperAdminRole" NOT NULL DEFAULT 'SUPPORT',
    "lastLoginAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "canManageAccounts" BOOLEAN NOT NULL DEFAULT false,
    "canApprovePayments" BOOLEAN NOT NULL DEFAULT false,
    "canModifyPricing" BOOLEAN NOT NULL DEFAULT false,
    "canSendEmails" BOOLEAN NOT NULL DEFAULT false,
    "canDeleteAccounts" BOOLEAN NOT NULL DEFAULT false,
    "canViewFinancials" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SuperAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuperAdminAuditLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "superAdminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetAccountId" TEXT,
    "targetPaymentId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,

    CONSTRAINT "SuperAdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SuperAdmin_email_key" ON "SuperAdmin"("email");

-- CreateIndex
CREATE INDEX "SuperAdmin_email_idx" ON "SuperAdmin"("email");

-- CreateIndex
CREATE INDEX "SuperAdmin_isActive_idx" ON "SuperAdmin"("isActive");

-- CreateIndex
CREATE INDEX "SuperAdminAuditLog_superAdminId_idx" ON "SuperAdminAuditLog"("superAdminId");

-- CreateIndex
CREATE INDEX "SuperAdminAuditLog_createdAt_idx" ON "SuperAdminAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "SuperAdminAuditLog_action_idx" ON "SuperAdminAuditLog"("action");

-- AddForeignKey
ALTER TABLE "SuperAdminAuditLog" ADD CONSTRAINT "SuperAdminAuditLog_superAdminId_fkey" FOREIGN KEY ("superAdminId") REFERENCES "SuperAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
