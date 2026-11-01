-- El detalle del turno usa A4 por defecto sin alterar los demás formatos.
ALTER TABLE "CompanySettings" ADD COLUMN "shiftReportPrintFormat" TEXT NOT NULL DEFAULT 'CARTA';
