ALTER TABLE "Account"
  ADD COLUMN "ownerEmail" TEXT;

CREATE INDEX "Account_ownerEmail_idx" ON "Account"("ownerEmail");
