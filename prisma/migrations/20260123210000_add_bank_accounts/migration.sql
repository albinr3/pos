-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'DOP',
    "bankLogo" TEXT,
    "instructions" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- AlterTable BillingPayment
ALTER TABLE "BillingPayment" ADD COLUMN "bankAccountId" TEXT;

-- CreateIndex
CREATE INDEX "BankAccount_isActive_displayOrder_idx" ON "BankAccount"("isActive", "displayOrder");

-- CreateIndex
CREATE INDEX "BillingPayment_bankAccountId_idx" ON "BillingPayment"("bankAccountId");

-- AddForeignKey
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
