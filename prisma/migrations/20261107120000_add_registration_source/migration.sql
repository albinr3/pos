CREATE TYPE "RegistrationSource" AS ENUM ('APP', 'WEB', 'UNKNOWN');
ALTER TABLE "Account" ADD COLUMN "registrationSource" "RegistrationSource" NOT NULL DEFAULT 'UNKNOWN';
