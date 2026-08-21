-- CreateEnum
CREATE TYPE "Framing" AS ENUM ('CHEST_UP', 'HALF_BODY', 'CLOSE_SELFIE');

-- CreateEnum
CREATE TYPE "Mood" AS ENUM ('NONE', 'DISCREET', 'FLAGS', 'CROWD');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "framing" "Framing" NOT NULL DEFAULT 'CHEST_UP',
ADD COLUMN     "mood" "Mood" NOT NULL DEFAULT 'NONE';
