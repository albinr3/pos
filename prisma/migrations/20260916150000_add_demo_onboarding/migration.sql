ALTER TABLE "Product"
  ADD COLUMN "isOnboardingDemo" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Product_accountId_isOnboardingDemo_idx"
  ON "Product"("accountId", "isOnboardingDemo");

ALTER TABLE "AccountOnboarding"
  ADD COLUMN "demoProductsSeededAt" TIMESTAMP(3),
  ADD COLUMN "demoCheckoutCompletedAt" TIMESTAMP(3),
  ADD COLUMN "firstRealProductId" TEXT,
  ADD COLUMN "firstRealProductCreatedAt" TIMESTAMP(3),
  ADD COLUMN "demoProductsRemovedAt" TIMESTAMP(3);

CREATE INDEX "AccountOnboarding_firstRealProductId_idx"
  ON "AccountOnboarding"("firstRealProductId");
