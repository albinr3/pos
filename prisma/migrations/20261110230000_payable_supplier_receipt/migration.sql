-- El comprobante recibido se conserva como soporte ajeno, no como número E41 propio.
ALTER TABLE "AccountPayable" ADD COLUMN "supplierReceiptNumber" TEXT;
