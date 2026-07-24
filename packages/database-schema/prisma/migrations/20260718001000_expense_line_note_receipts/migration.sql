-- D2b: capture expense-line note, ledgerEmployeeLineKind, receiptDataUrls. Additive.

-- AlterTable
ALTER TABLE "DailyEntryExpenseLine" ADD COLUMN     "ledgerEmployeeLineKind" TEXT,
ADD COLUMN     "note" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "receiptDataUrls" JSONB;

