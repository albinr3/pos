-- CreateIndex
CREATE INDEX "Sale_invoiceCode_idx" ON "Sale"("invoiceCode");

-- CreateIndex
CREATE INDEX "Product_accountId_stock_idx" ON "Product"("accountId", "stock");

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "stock" TYPE DECIMAL(10,3) USING ("stock"::DECIMAL(10,3));
ALTER TABLE "Product" ALTER COLUMN "minStock" TYPE DECIMAL(10,3) USING ("minStock"::DECIMAL(10,3));

-- AlterTable
ALTER TABLE "SaleItem" ALTER COLUMN "qty" TYPE DECIMAL(10,3) USING ("qty"::DECIMAL(10,3));
ALTER TABLE "PurchaseItem" ALTER COLUMN "qty" TYPE DECIMAL(10,3) USING ("qty"::DECIMAL(10,3));
ALTER TABLE "ReturnItem" ALTER COLUMN "qty" TYPE DECIMAL(10,3) USING ("qty"::DECIMAL(10,3));
ALTER TABLE "QuoteItem" ALTER COLUMN "qty" TYPE DECIMAL(10,3) USING ("qty"::DECIMAL(10,3));
