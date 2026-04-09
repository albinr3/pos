CREATE TYPE "RegistrationDeviceType" AS ENUM ('DESKTOP', 'MOBILE', 'UNKNOWN');

CREATE TYPE "RegistrationMethod" AS ENUM ('EMAIL', 'GOOGLE', 'WHATSAPP', 'UNKNOWN');

ALTER TABLE "Account"
ADD COLUMN "registeredFromDevice" "RegistrationDeviceType" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "registeredWithMethod" "RegistrationMethod" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "registeredUserAgent" TEXT;
