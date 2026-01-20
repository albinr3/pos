-- CreateTable: Account (Tenant)
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_clerkUserId_key" ON "Account"("clerkUserId");
CREATE INDEX "Account_clerkUserId_idx" ON "Account"("clerkUserId");

-- Create a default account for existing data
-- We'll use a placeholder clerkUserId that should be updated after migration
INSERT INTO "Account" ("id", "createdAt", "updatedAt", "name", "clerkUserId")
VALUES ('default_account', NOW(), NOW(), 'Mi Negocio', 'pending_clerk_setup');

-- ===============================
-- ADD accountId TO ALL TABLES
-- ===============================

-- User: Add accountId and isOwner
ALTER TABLE "User" ADD COLUMN "accountId" TEXT;
ALTER TABLE "User" ADD COLUMN "isOwner" BOOLEAN NOT NULL DEFAULT false;

-- Update existing users to belong to default account
UPDATE "User" SET "accountId" = 'default_account';

-- Make the first user (or admin) the owner
UPDATE "User" SET "isOwner" = true WHERE "id" = (
    SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1
);

-- Make accountId required
ALTER TABLE "User" ALTER COLUMN "accountId" SET NOT NULL;

-- Remove global unique constraints and add account-scoped ones
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_username_key";
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_email_key";
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_whatsappNumber_key";
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_clerkUserId_key";

-- Add account-scoped unique constraint for username
CREATE UNIQUE INDEX "User_accountId_username_key" ON "User"("accountId", "username");
CREATE INDEX "User_accountId_idx" ON "User"("accountId");

-- Add foreign key
ALTER TABLE "User" ADD CONSTRAINT "User_accountId_fkey" 
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Make passwordHash required (we'll set a default for existing users)
UPDATE "User" SET "passwordHash" = '$2b$10$placeholder' WHERE "passwordHash" IS NULL;
ALTER TABLE "User" ALTER COLUMN "passwordHash" SET NOT NULL;

-- Remove clerkUserId from User (it's now on Account)
ALTER TABLE "User" DROP COLUMN IF EXISTS "clerkUserId";

-- ===============================
-- CompanySettings
-- ===============================
ALTER TABLE "CompanySettings" ADD COLUMN "accountId" TEXT;
UPDATE "CompanySettings" SET "accountId" = 'default_account';
ALTER TABLE "CompanySettings" ALTER COLUMN "accountId" SET NOT NULL;
CREATE UNIQUE INDEX "CompanySettings_accountId_key" ON "CompanySettings"("accountId");
CREATE INDEX "CompanySettings_accountId_idx" ON "CompanySettings"("accountId");
ALTER TABLE "CompanySettings" ADD CONSTRAINT "CompanySettings_accountId_fkey" 
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===============================
-- Customer
-- ===============================
ALTER TABLE "Customer" ADD COLUMN "accountId" TEXT;
UPDATE "Customer" SET "accountId" = 'default_account';
ALTER TABLE "Customer" ALTER COLUMN "accountId" SET NOT NULL;
CREATE INDEX "Customer_accountId_idx" ON "Customer"("accountId");
CREATE INDEX "Customer_accountId_name_idx" ON "Customer"("accountId", "name");
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_accountId_fkey" 
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===============================
-- Supplier
-- ===============================
ALTER TABLE "Supplier" ADD COLUMN "accountId" TEXT;
UPDATE "Supplier" SET "accountId" = 'default_account';
ALTER TABLE "Supplier" ALTER COLUMN "accountId" SET NOT NULL;
DROP INDEX IF EXISTS "Supplier_name_idx";
CREATE INDEX "Supplier_accountId_idx" ON "Supplier"("accountId");
CREATE INDEX "Supplier_accountId_name_idx" ON "Supplier"("accountId", "name");
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_accountId_fkey" 
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===============================
-- Category
-- ===============================
ALTER TABLE "Category" ADD COLUMN "accountId" TEXT;
UPDATE "Category" SET "accountId" = 'default_account';
ALTER TABLE "Category" ALTER COLUMN "accountId" SET NOT NULL;

-- Remove global unique and add account-scoped
ALTER TABLE "Category" DROP CONSTRAINT IF EXISTS "Category_name_key";
DROP INDEX IF EXISTS "Category_name_idx";
DROP INDEX IF EXISTS "Category_isActive_idx";
CREATE UNIQUE INDEX "Category_accountId_name_key" ON "Category"("accountId", "name");
CREATE INDEX "Category_accountId_idx" ON "Category"("accountId");
CREATE INDEX "Category_accountId_isActive_idx" ON "Category"("accountId", "isActive");
ALTER TABLE "Category" ADD CONSTRAINT "Category_accountId_fkey" 
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===============================
-- Product
-- ===============================
ALTER TABLE "Product" ADD COLUMN "accountId" TEXT;
UPDATE "Product" SET "accountId" = 'default_account';
ALTER TABLE "Product" ALTER COLUMN "accountId" SET NOT NULL;

-- Remove global unique constraints
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_productId_key";
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_sku_key";
DROP INDEX IF EXISTS "Product_name_idx";
DROP INDEX IF EXISTS "Product_sku_idx";
DROP INDEX IF EXISTS "Product_reference_idx";
DROP INDEX IF EXISTS "Product_productId_idx";

-- Add account-scoped constraints
CREATE UNIQUE INDEX "Product_accountId_productId_key" ON "Product"("accountId", "productId");
CREATE UNIQUE INDEX "Product_accountId_sku_key" ON "Product"("accountId", "sku") WHERE "sku" IS NOT NULL;
CREATE INDEX "Product_accountId_idx" ON "Product"("accountId");
CREATE INDEX "Product_accountId_name_idx" ON "Product"("accountId", "name");
CREATE INDEX "Product_accountId_reference_idx" ON "Product"("accountId", "reference");
ALTER TABLE "Product" ADD CONSTRAINT "Product_accountId_fkey" 
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===============================
-- Sale
-- ===============================
ALTER TABLE "Sale" ADD COLUMN "accountId" TEXT;
UPDATE "Sale" SET "accountId" = 'default_account';
ALTER TABLE "Sale" ALTER COLUMN "accountId" SET NOT NULL;

-- Remove global unique and add account-scoped
ALTER TABLE "Sale" DROP CONSTRAINT IF EXISTS "Sale_invoiceCode_key";
DROP INDEX IF EXISTS "Sale_soldAt_idx";
CREATE UNIQUE INDEX "Sale_accountId_invoiceCode_key" ON "Sale"("accountId", "invoiceCode");
CREATE INDEX "Sale_accountId_idx" ON "Sale"("accountId");
CREATE INDEX "Sale_accountId_soldAt_idx" ON "Sale"("accountId", "soldAt");
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_accountId_fkey" 
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===============================
-- Purchase
-- ===============================
ALTER TABLE "Purchase" ADD COLUMN "accountId" TEXT;
UPDATE "Purchase" SET "accountId" = 'default_account';
ALTER TABLE "Purchase" ALTER COLUMN "accountId" SET NOT NULL;
DROP INDEX IF EXISTS "Purchase_purchasedAt_idx";
CREATE INDEX "Purchase_accountId_idx" ON "Purchase"("accountId");
CREATE INDEX "Purchase_accountId_purchasedAt_idx" ON "Purchase"("accountId", "purchasedAt");
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_accountId_fkey" 
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===============================
-- OperatingExpense
-- ===============================
ALTER TABLE "OperatingExpense" ADD COLUMN "accountId" TEXT;
UPDATE "OperatingExpense" SET "accountId" = 'default_account';
ALTER TABLE "OperatingExpense" ALTER COLUMN "accountId" SET NOT NULL;
DROP INDEX IF EXISTS "OperatingExpense_expenseDate_idx";
CREATE INDEX "OperatingExpense_accountId_idx" ON "OperatingExpense"("accountId");
CREATE INDEX "OperatingExpense_accountId_expenseDate_idx" ON "OperatingExpense"("accountId", "expenseDate");
ALTER TABLE "OperatingExpense" ADD CONSTRAINT "OperatingExpense_accountId_fkey" 
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===============================
-- Return
-- ===============================
ALTER TABLE "Return" ADD COLUMN "accountId" TEXT;
UPDATE "Return" SET "accountId" = 'default_account';
ALTER TABLE "Return" ALTER COLUMN "accountId" SET NOT NULL;

-- Remove global unique and add account-scoped
ALTER TABLE "Return" DROP CONSTRAINT IF EXISTS "Return_returnNumber_key";
ALTER TABLE "Return" DROP CONSTRAINT IF EXISTS "Return_returnCode_key";
DROP INDEX IF EXISTS "Return_returnedAt_idx";
CREATE UNIQUE INDEX "Return_accountId_returnNumber_key" ON "Return"("accountId", "returnNumber");
CREATE UNIQUE INDEX "Return_accountId_returnCode_key" ON "Return"("accountId", "returnCode");
CREATE INDEX "Return_accountId_idx" ON "Return"("accountId");
CREATE INDEX "Return_accountId_returnedAt_idx" ON "Return"("accountId", "returnedAt");
ALTER TABLE "Return" ADD CONSTRAINT "Return_accountId_fkey" 
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===============================
-- Quote
-- ===============================
ALTER TABLE "Quote" ADD COLUMN "accountId" TEXT;
UPDATE "Quote" SET "accountId" = 'default_account';
ALTER TABLE "Quote" ALTER COLUMN "accountId" SET NOT NULL;

-- Remove global unique and add account-scoped
ALTER TABLE "Quote" DROP CONSTRAINT IF EXISTS "Quote_quoteNumber_key";
ALTER TABLE "Quote" DROP CONSTRAINT IF EXISTS "Quote_quoteCode_key";
DROP INDEX IF EXISTS "Quote_quotedAt_idx";
CREATE UNIQUE INDEX "Quote_accountId_quoteNumber_key" ON "Quote"("accountId", "quoteNumber");
CREATE UNIQUE INDEX "Quote_accountId_quoteCode_key" ON "Quote"("accountId", "quoteCode");
CREATE INDEX "Quote_accountId_idx" ON "Quote"("accountId");
CREATE INDEX "Quote_accountId_quotedAt_idx" ON "Quote"("accountId", "quotedAt");
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_accountId_fkey" 
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===============================
-- InvoiceSequence
-- ===============================
ALTER TABLE "InvoiceSequence" ADD COLUMN "accountId" TEXT;
UPDATE "InvoiceSequence" SET "accountId" = 'default_account';
ALTER TABLE "InvoiceSequence" ALTER COLUMN "accountId" SET NOT NULL;

-- Remove global unique and add account-scoped
ALTER TABLE "InvoiceSequence" DROP CONSTRAINT IF EXISTS "InvoiceSequence_series_key";
CREATE UNIQUE INDEX "InvoiceSequence_accountId_series_key" ON "InvoiceSequence"("accountId", "series");
CREATE INDEX "InvoiceSequence_accountId_idx" ON "InvoiceSequence"("accountId");
ALTER TABLE "InvoiceSequence" ADD CONSTRAINT "InvoiceSequence_accountId_fkey" 
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===============================
-- ReturnSequence
-- ===============================
ALTER TABLE "ReturnSequence" ADD COLUMN "accountId" TEXT;
UPDATE "ReturnSequence" SET "accountId" = 'default_account';
ALTER TABLE "ReturnSequence" ALTER COLUMN "accountId" SET NOT NULL;
CREATE UNIQUE INDEX "ReturnSequence_accountId_key" ON "ReturnSequence"("accountId");
CREATE INDEX "ReturnSequence_accountId_idx" ON "ReturnSequence"("accountId");
ALTER TABLE "ReturnSequence" ADD CONSTRAINT "ReturnSequence_accountId_fkey" 
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===============================
-- QuoteSequence
-- ===============================
ALTER TABLE "QuoteSequence" ADD COLUMN "accountId" TEXT;
UPDATE "QuoteSequence" SET "accountId" = 'default_account';
ALTER TABLE "QuoteSequence" ALTER COLUMN "accountId" SET NOT NULL;
CREATE UNIQUE INDEX "QuoteSequence_accountId_key" ON "QuoteSequence"("accountId");
CREATE INDEX "QuoteSequence_accountId_idx" ON "QuoteSequence"("accountId");
ALTER TABLE "QuoteSequence" ADD CONSTRAINT "QuoteSequence_accountId_fkey" 
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
