-- AlterTable
ALTER TABLE "AccountPartnerRequest" ADD COLUMN     "signedAt" TIMESTAMP(3),
ADD COLUMN     "signedFullName" TEXT;

-- AlterTable
ALTER TABLE "PaymentTransaction" ADD COLUMN     "votesCount" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Vote" ADD COLUMN     "votesCount" INTEGER NOT NULL DEFAULT 1;
