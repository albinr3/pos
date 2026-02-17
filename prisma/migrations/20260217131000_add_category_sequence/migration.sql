-- CreateTable
CREATE TABLE "CategorySequence" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accountId" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CategorySequence_pkey" PRIMARY KEY ("id")
);

-- AddColumn
ALTER TABLE "Category" ADD COLUMN "categoryId" INTEGER;

-- Backfill incremental categoryId per account ordered by createdAt
WITH ranked_categories AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (PARTITION BY "accountId" ORDER BY "createdAt" ASC, "id" ASC) AS rn
    FROM "Category"
)
UPDATE "Category" c
SET "categoryId" = rc.rn
FROM ranked_categories rc
WHERE c."id" = rc."id";

-- Seed sequence table with current max categoryId by account
INSERT INTO "CategorySequence" ("id", "createdAt", "updatedAt", "accountId", "lastNumber")
SELECT
    md5(random()::text || clock_timestamp()::text || a."id") AS "id",
    NOW(),
    NOW(),
    a."id" AS "accountId",
    COALESCE(MAX(c."categoryId"), 0) AS "lastNumber"
FROM "Account" a
LEFT JOIN "Category" c ON c."accountId" = a."id"
GROUP BY a."id";

-- Set NOT NULL after backfill
ALTER TABLE "Category" ALTER COLUMN "categoryId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "CategorySequence_accountId_key" ON "CategorySequence"("accountId");
CREATE INDEX "CategorySequence_accountId_idx" ON "CategorySequence"("accountId");
CREATE UNIQUE INDEX "Category_accountId_categoryId_key" ON "Category"("accountId", "categoryId");
CREATE INDEX "Category_accountId_categoryId_idx" ON "Category"("accountId", "categoryId");

-- AddForeignKey
ALTER TABLE "CategorySequence" ADD CONSTRAINT "CategorySequence_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
