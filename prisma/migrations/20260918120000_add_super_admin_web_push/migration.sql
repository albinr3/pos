-- Alertas del registro de nuevas cuentas en el panel de superadministración.
ALTER TYPE "SuperAdminNotificationType" ADD VALUE IF NOT EXISTS 'NEW_ACCOUNT_REGISTERED';

CREATE TABLE "SuperAdminWebPushSubscription" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "superAdminId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuperAdminWebPushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SuperAdminWebPushSubscription_endpoint_key"
ON "SuperAdminWebPushSubscription"("endpoint");

CREATE INDEX "SuperAdminWebPushSubscription_superAdminId_idx"
ON "SuperAdminWebPushSubscription"("superAdminId");

CREATE INDEX "SuperAdminWebPushSubscription_enabled_idx"
ON "SuperAdminWebPushSubscription"("enabled");

ALTER TABLE "SuperAdminWebPushSubscription"
ADD CONSTRAINT "SuperAdminWebPushSubscription_superAdminId_fkey"
FOREIGN KEY ("superAdminId") REFERENCES "SuperAdmin"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
