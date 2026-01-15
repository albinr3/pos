-- AlterTable: Add cancellation fields to Sale
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Sale' AND column_name = 'cancelledAt') THEN
    ALTER TABLE "Sale" ADD COLUMN "cancelledAt" TIMESTAMP(3);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Sale' AND column_name = 'cancelledBy') THEN
    ALTER TABLE "Sale" ADD COLUMN "cancelledBy" TEXT;
  END IF;
END $$;

-- AlterTable: Add cancellation fields to Payment
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Payment' AND column_name = 'cancelledAt') THEN
    ALTER TABLE "Payment" ADD COLUMN "cancelledAt" TIMESTAMP(3);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Payment' AND column_name = 'cancelledBy') THEN
    ALTER TABLE "Payment" ADD COLUMN "cancelledBy" TEXT;
  END IF;
END $$;

-- AlterTable: Add cancellation fields to Purchase
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Purchase' AND column_name = 'cancelledAt') THEN
    ALTER TABLE "Purchase" ADD COLUMN "cancelledAt" TIMESTAMP(3);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Purchase' AND column_name = 'cancelledBy') THEN
    ALTER TABLE "Purchase" ADD COLUMN "cancelledBy" TEXT;
  END IF;
END $$;

-- CreateIndex: Add indexes for cancellation fields
CREATE INDEX IF NOT EXISTS "Sale_cancelledAt_idx" ON "Sale"("cancelledAt");
CREATE INDEX IF NOT EXISTS "Payment_cancelledAt_idx" ON "Payment"("cancelledAt");
CREATE INDEX IF NOT EXISTS "Purchase_cancelledAt_idx" ON "Purchase"("cancelledAt");

-- AddForeignKey: Add foreign key for cancelledBy in Sale
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'Sale_cancelledBy_fkey'
  ) THEN
    ALTER TABLE "Sale" ADD CONSTRAINT "Sale_cancelledBy_fkey" 
    FOREIGN KEY ("cancelledBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey: Add foreign key for cancelledBy in Payment
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'Payment_cancelledBy_fkey'
  ) THEN
    ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cancelledBy_fkey" 
    FOREIGN KEY ("cancelledBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey: Add foreign key for cancelledBy in Purchase
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'Purchase_cancelledBy_fkey'
  ) THEN
    ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_cancelledBy_fkey" 
    FOREIGN KEY ("cancelledBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

