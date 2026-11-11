ALTER TABLE "AccountPayable" ALTER COLUMN "purchaseId" DROP NOT NULL;
ALTER TABLE "AccountPayable" ADD COLUMN "description" TEXT, ADD COLUMN "notes" TEXT;
ALTER TABLE "AccountPayable" ADD CONSTRAINT "AccountPayable_source_check" CHECK (
  ("purchaseId" IS NOT NULL AND "description" IS NULL) OR
  ("purchaseId" IS NULL AND "description" IS NOT NULL AND length(trim("description")) > 0)
);
