-- El comprobante recibido conserva su origen y no reserva una secuencia propia.
ALTER TABLE "Purchase" ADD COLUMN "supplierReceiptNumber" TEXT;
