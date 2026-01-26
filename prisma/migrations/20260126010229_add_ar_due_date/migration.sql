-- AlterTable
ALTER TABLE "AccountReceivable" ADD COLUMN     "dueDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "AccountReceivable_dueDate_idx" ON "AccountReceivable"("dueDate");
