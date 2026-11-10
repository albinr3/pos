-- Los rangos antiguos inactivos no se convierten en relevo sin decisión expresa del usuario.
ALTER TABLE "FiscalSequence" ADD COLUMN "readyForRollover" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FiscalSequence" ADD CONSTRAINT "FiscalSequence_rollover_inactive" CHECK (NOT ("active" AND "readyForRollover"));
