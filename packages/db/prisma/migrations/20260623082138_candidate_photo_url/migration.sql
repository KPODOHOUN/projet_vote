-- DropForeignKey
ALTER TABLE "Payout" DROP CONSTRAINT "Payout_periodId_fkey";

-- DropForeignKey
ALTER TABLE "PayoutLine" DROP CONSTRAINT "PayoutLine_payoutId_fkey";

-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "photoUrl" TEXT;

-- AlterTable
ALTER TABLE "Payout" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "PayoutPeriod" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayoutPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutLine" ADD CONSTRAINT "PayoutLine_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "Payout_period_kind_beneficiary_key" RENAME TO "Payout_periodId_kind_beneficiaryTenantId_key";
