-- S2 foundation (additive): mark who owns each payables row.
-- `manual` = created in the Payables module (never touched by the sync).
-- `purchase` / `daily` / `ledger` = auto-derived + maintained by RelationalSyncService.

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual';

-- CreateIndex
CREATE INDEX "Expense_branchId_source_idx" ON "Expense"("branchId", "source");

-- CreateIndex
CREATE INDEX "Payment_branchId_source_idx" ON "Payment"("branchId", "source");
