-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'BASIC', 'PREMIUM', 'ENTERPRISE');

-- AlterTable: add password with temp default for existing rows, then drop default
ALTER TABLE "Client" ADD COLUMN "password" TEXT NOT NULL DEFAULT 'PLACEHOLDER_CHANGE_ME',
ADD COLUMN "plan" "Plan" NOT NULL DEFAULT 'FREE',
ADD COLUMN "planExpiresAt" TIMESTAMP(3),
ADD COLUMN "suspended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "suspendedAt" TIMESTAMP(3);

ALTER TABLE "Client" ALTER COLUMN "password" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
