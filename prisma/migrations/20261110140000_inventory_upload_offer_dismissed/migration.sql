-- El cierre se guarda por cuenta para que sobreviva a nuevas sesiones y dispositivos.
ALTER TABLE "Account" ADD COLUMN "inventoryUploadOfferDismissed" BOOLEAN NOT NULL DEFAULT false;
