-- AlterTable
ALTER TABLE "ErrorLog"
ADD COLUMN "userEmail" TEXT,
ADD COLUMN "userPhone" TEXT,
ADD COLUMN "urlPath" TEXT;

-- CreateIndex
CREATE INDEX "ErrorLog_urlPath_idx" ON "ErrorLog"("urlPath");
