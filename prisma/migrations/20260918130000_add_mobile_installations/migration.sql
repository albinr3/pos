-- CreateTable
CREATE TABLE "MobileInstallation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "installationId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "appVersion" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobileInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MobileInstallation_installationId_key" ON "MobileInstallation"("installationId");

-- CreateIndex
CREATE INDEX "MobileInstallation_firstSeenAt_idx" ON "MobileInstallation"("firstSeenAt");

-- CreateIndex
CREATE INDEX "MobileInstallation_lastSeenAt_idx" ON "MobileInstallation"("lastSeenAt");

-- CreateIndex
CREATE INDEX "MobileInstallation_platform_idx" ON "MobileInstallation"("platform");
