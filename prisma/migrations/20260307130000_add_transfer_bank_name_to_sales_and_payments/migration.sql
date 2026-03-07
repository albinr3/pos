ALTER TABLE "Sale"
ADD COLUMN "transferBankName" TEXT;

ALTER TABLE "SalePayment"
ADD COLUMN "transferBankName" TEXT;

ALTER TABLE "Payment"
ADD COLUMN "transferBankName" TEXT;
