-- CreateTable
CREATE TABLE "PushDeviceToken" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expoPushToken" TEXT NOT NULL,
    "platform" TEXT,
    "deviceName" TEXT,
    "appVersion" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushDeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushNotificationLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sentForDate" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushNotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushDeviceToken_expoPushToken_key" ON "PushDeviceToken"("expoPushToken");

-- CreateIndex
CREATE INDEX "PushDeviceToken_accountId_idx" ON "PushDeviceToken"("accountId");

-- CreateIndex
CREATE INDEX "PushDeviceToken_userId_idx" ON "PushDeviceToken"("userId");

-- CreateIndex
CREATE INDEX "PushDeviceToken_enabled_idx" ON "PushDeviceToken"("enabled");

-- CreateIndex
CREATE INDEX "PushDeviceToken_lastSeenAt_idx" ON "PushDeviceToken"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushNotificationLog_accountId_type_sentForDate_key" ON "PushNotificationLog"("accountId", "type", "sentForDate");

-- CreateIndex
CREATE INDEX "PushNotificationLog_accountId_idx" ON "PushNotificationLog"("accountId");

-- CreateIndex
CREATE INDEX "PushNotificationLog_type_sentForDate_idx" ON "PushNotificationLog"("type", "sentForDate");

-- AddForeignKey
ALTER TABLE "PushDeviceToken" ADD CONSTRAINT "PushDeviceToken_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushDeviceToken" ADD CONSTRAINT "PushDeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushNotificationLog" ADD CONSTRAINT "PushNotificationLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
