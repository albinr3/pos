-- CreateTable
CREATE TABLE "BillingPlan" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceUsdCents" INTEGER NOT NULL,
    "priceDopCents" INTEGER NOT NULL,
    "lemonVariantId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BillingPlan_pkey" PRIMARY KEY ("id")
);

-- Add billingPlanId to BillingSubscription
ALTER TABLE "BillingSubscription" ADD COLUMN "billingPlanId" TEXT;

-- CreateIndex
CREATE INDEX "BillingPlan_isActive_idx" ON "BillingPlan"("isActive");

-- CreateIndex
CREATE INDEX "BillingPlan_isDefault_idx" ON "BillingPlan"("isDefault");

-- CreateIndex
CREATE INDEX "BillingSubscription_billingPlanId_idx" ON "BillingSubscription"("billingPlanId");

-- AddForeignKey
ALTER TABLE "BillingSubscription" ADD CONSTRAINT "BillingSubscription_billingPlanId_fkey" FOREIGN KEY ("billingPlanId") REFERENCES "BillingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Insert default billing plan
INSERT INTO "BillingPlan" ("id", "createdAt", "updatedAt", "name", "description", "priceUsdCents", "priceDopCents", "lemonVariantId", "isDefault", "isActive")
VALUES (
    'default_plan_001',
    NOW(),
    NOW(),
    'Plan Estándar',
    'Plan mensual estándar con acceso completo a todas las funcionalidades',
    2000,
    130000,
    NULL,
    true,
    true
);
