ALTER TABLE "Account"
  ADD COLUMN "deletionRequestedAt" TIMESTAMP(3),
  ADD COLUMN "deletionPinAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "deletionPinWindowStartedAt" TIMESTAMP(3);

CREATE TYPE "AccountDeletionStage" AS ENUM (
  'CANCEL_SUBSCRIPTION', 'PURGE_DATA', 'DELETE_IDENTITY', 'DELETE_FILES', 'COMPLETED'
);

CREATE TABLE "AccountDeletion" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "clerkUserHash" TEXT NOT NULL,
  "clerkUserId" TEXT,
  "lemonSubscriptionId" TEXT,
  "fileKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "stage" "AccountDeletionStage" NOT NULL DEFAULT 'CANCEL_SUBSCRIPTION',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseToken" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "AccountDeletion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccountDeletion_accountId_key" ON "AccountDeletion"("accountId");
CREATE UNIQUE INDEX "AccountDeletion_clerkUserHash_key" ON "AccountDeletion"("clerkUserHash");
CREATE INDEX "AccountDeletion_stage_nextAttemptAt_idx" ON "AccountDeletion"("stage", "nextAttemptAt");
-- Solo el servidor accede a tareas de baja; nunca exponer IDs externos mediante la API pública de Supabase.
ALTER TABLE "AccountDeletion" ENABLE ROW LEVEL SECURITY;
