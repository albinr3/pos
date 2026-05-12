CREATE TABLE "AccountOnboarding" (
  "accountId" TEXT NOT NULL,
  "firstSeenAt" TIMESTAMP(3),
  "lastSkippedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "firstProductId" TEXT,
  "firstSaleId" TEXT,
  "productExpressCreatedAt" TIMESTAMP(3),
  "firstSaleCreatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AccountOnboarding_pkey" PRIMARY KEY ("accountId")
);

ALTER TABLE "AccountOnboarding"
ADD CONSTRAINT "AccountOnboarding_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "Account"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "AccountOnboarding_completedAt_idx" ON "AccountOnboarding"("completedAt");
CREATE INDEX "AccountOnboarding_firstProductId_idx" ON "AccountOnboarding"("firstProductId");
CREATE INDEX "AccountOnboarding_firstSaleId_idx" ON "AccountOnboarding"("firstSaleId");
