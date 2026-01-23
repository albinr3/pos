-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('TRIALING', 'ACTIVE', 'GRACE', 'BLOCKED', 'CANCELED');

-- CreateEnum
CREATE TYPE "BillingCurrency" AS ENUM ('DOP', 'USD');

-- CreateEnum
CREATE TYPE "BillingProvider" AS ENUM ('MANUAL', 'LEMON');

-- CreateEnum
CREATE TYPE "BillingPaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ManualVerificationStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'BILLING_SUBSCRIPTION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'BILLING_SUBSCRIPTION_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'BILLING_PAYMENT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'BILLING_PAYMENT_APPROVED';
ALTER TYPE "AuditAction" ADD VALUE 'BILLING_PAYMENT_REJECTED';
ALTER TYPE "AuditAction" ADD VALUE 'BILLING_PROOF_UPLOADED';
ALTER TYPE "AuditAction" ADD VALUE 'BILLING_STATUS_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'BILLING_CURRENCY_CHANGED';

-- CreateTable
CREATE TABLE "BillingSubscription" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accountId" TEXT NOT NULL,
    "status" "BillingStatus" NOT NULL DEFAULT 'TRIALING',
    "currency" "BillingCurrency" NOT NULL DEFAULT 'DOP',
    "provider" "BillingProvider" NOT NULL DEFAULT 'MANUAL',
    "trialStartedAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStartsAt" TIMESTAMP(3),
    "currentPeriodEndsAt" TIMESTAMP(3),
    "graceEndsAt" TIMESTAMP(3),
    "pendingCurrency" "BillingCurrency",
    "pendingProvider" "BillingProvider",
    "manualVerificationStatus" "ManualVerificationStatus" NOT NULL DEFAULT 'NONE',
    "manualAccessGrantedAt" TIMESTAMP(3),
    "lemonCustomerId" TEXT,
    "lemonSubscriptionId" TEXT,
    "priceUsdCents" INTEGER NOT NULL DEFAULT 999,
    "priceDopCents" INTEGER NOT NULL DEFAULT 130000,

    CONSTRAINT "BillingSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingProfile" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accountId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "taxId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,

    CONSTRAINT "BillingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingPayment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" "BillingCurrency" NOT NULL,
    "provider" "BillingProvider" NOT NULL,
    "status" "BillingPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "reference" TEXT,
    "externalId" TEXT,
    "periodStartsAt" TIMESTAMP(3),
    "periodEndsAt" TIMESTAMP(3),

    CONSTRAINT "BillingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingPaymentProof" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amountCents" INTEGER,
    "note" TEXT,

    CONSTRAINT "BillingPaymentProof_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingReceipt" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailSentAt" TIMESTAMP(3),
    "legalName" TEXT NOT NULL,
    "taxId" TEXT NOT NULL,
    "address" TEXT NOT NULL,

    CONSTRAINT "BillingReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingNotification" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "BillingNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingSubscription_accountId_key" ON "BillingSubscription"("accountId");

-- CreateIndex
CREATE INDEX "BillingSubscription_accountId_idx" ON "BillingSubscription"("accountId");

-- CreateIndex
CREATE INDEX "BillingSubscription_status_idx" ON "BillingSubscription"("status");

-- CreateIndex
CREATE INDEX "BillingSubscription_trialEndsAt_idx" ON "BillingSubscription"("trialEndsAt");

-- CreateIndex
CREATE INDEX "BillingSubscription_currentPeriodEndsAt_idx" ON "BillingSubscription"("currentPeriodEndsAt");

-- CreateIndex
CREATE INDEX "BillingSubscription_graceEndsAt_idx" ON "BillingSubscription"("graceEndsAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingProfile_accountId_key" ON "BillingProfile"("accountId");

-- CreateIndex
CREATE INDEX "BillingProfile_accountId_idx" ON "BillingProfile"("accountId");

-- CreateIndex
CREATE INDEX "BillingPayment_subscriptionId_idx" ON "BillingPayment"("subscriptionId");

-- CreateIndex
CREATE INDEX "BillingPayment_status_idx" ON "BillingPayment"("status");

-- CreateIndex
CREATE INDEX "BillingPayment_createdAt_idx" ON "BillingPayment"("createdAt");

-- CreateIndex
CREATE INDEX "BillingPayment_externalId_idx" ON "BillingPayment"("externalId");

-- CreateIndex
CREATE INDEX "BillingPaymentProof_paymentId_idx" ON "BillingPaymentProof"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingReceipt_receiptNumber_key" ON "BillingReceipt"("receiptNumber");

-- CreateIndex
CREATE INDEX "BillingReceipt_paymentId_idx" ON "BillingReceipt"("paymentId");

-- CreateIndex
CREATE INDEX "BillingReceipt_receiptNumber_idx" ON "BillingReceipt"("receiptNumber");

-- CreateIndex
CREATE INDEX "BillingNotification_accountId_idx" ON "BillingNotification"("accountId");

-- CreateIndex
CREATE INDEX "BillingNotification_accountId_type_idx" ON "BillingNotification"("accountId", "type");

-- CreateIndex
CREATE INDEX "BillingNotification_sentAt_idx" ON "BillingNotification"("sentAt");

-- AddForeignKey
ALTER TABLE "BillingSubscription" ADD CONSTRAINT "BillingSubscription_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingProfile" ADD CONSTRAINT "BillingProfile_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "BillingSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPaymentProof" ADD CONSTRAINT "BillingPaymentProof_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "BillingPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingReceipt" ADD CONSTRAINT "BillingReceipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "BillingPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingNotification" ADD CONSTRAINT "BillingNotification_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
