-- CreateTable
CREATE TABLE "SubUserLoginToken" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubUserLoginToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubUserLoginToken_accountId_idx" ON "SubUserLoginToken"("accountId");

-- CreateIndex
CREATE INDEX "SubUserLoginToken_userId_idx" ON "SubUserLoginToken"("userId");

-- CreateIndex
CREATE INDEX "SubUserLoginToken_expiresAt_idx" ON "SubUserLoginToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "SubUserLoginToken" ADD CONSTRAINT "SubUserLoginToken_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubUserLoginToken" ADD CONSTRAINT "SubUserLoginToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
