-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "oldValue" JSONB;
ALTER TABLE "AuditLog" ADD COLUMN "newValue" JSONB;
