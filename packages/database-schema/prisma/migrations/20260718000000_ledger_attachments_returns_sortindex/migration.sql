-- D2b: make relational lossless + order-preserving.
-- Adds ledger attachments, purchase returns, and sortIndex columns. Additive.

-- CreateEnum
CREATE TYPE "PurchaseReturnStatus" AS ENUM ('draft', 'credited', 'cancelled');

-- AlterTable
ALTER TABLE "DailyEntryExpenseItem" ADD COLUMN     "sortIndex" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "DailyEntryExpenseLine" ADD COLUMN     "sortIndex" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "sortIndex" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "LedgerEntry" ADD COLUMN     "sortIndex" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "LedgerEntryItem" ADD COLUMN     "sortIndex" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "sortIndex" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PurchaseOrderItem" ADD COLUMN     "sortIndex" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SalaryLine" ADD COLUMN     "sortIndex" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SalaryPayment" ADD COLUMN     "sortIndex" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "sortIndex" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "LedgerEntryAttachment" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "ledgerEntryId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL DEFAULT '',
    "mimeType" TEXT NOT NULL DEFAULT '',
    "dataUrl" TEXT NOT NULL,
    "sortIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerEntryAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReturn" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "ref" TEXT NOT NULL DEFAULT '',
    "linkedPurchaseId" TEXT,
    "date" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "status" "PurchaseReturnStatus" NOT NULL DEFAULT 'draft',
    "sortIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnLine" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "purchaseReturnId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "qty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT '',
    "creditMinor" INTEGER NOT NULL DEFAULT 0,
    "sortIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReturnLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LedgerEntryAttachment_branchId_idx" ON "LedgerEntryAttachment"("branchId");

-- CreateIndex
CREATE INDEX "LedgerEntryAttachment_ledgerEntryId_idx" ON "LedgerEntryAttachment"("ledgerEntryId");

-- CreateIndex
CREATE INDEX "PurchaseReturn_branchId_idx" ON "PurchaseReturn"("branchId");

-- CreateIndex
CREATE INDEX "PurchaseReturn_supplierId_idx" ON "PurchaseReturn"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseReturn_linkedPurchaseId_idx" ON "PurchaseReturn"("linkedPurchaseId");

-- CreateIndex
CREATE INDEX "ReturnLine_branchId_idx" ON "ReturnLine"("branchId");

-- CreateIndex
CREATE INDEX "ReturnLine_purchaseReturnId_idx" ON "ReturnLine"("purchaseReturnId");

-- AddForeignKey
ALTER TABLE "LedgerEntryAttachment" ADD CONSTRAINT "LedgerEntryAttachment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntryAttachment" ADD CONSTRAINT "LedgerEntryAttachment_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "LedgerEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_linkedPurchaseId_fkey" FOREIGN KEY ("linkedPurchaseId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnLine" ADD CONSTRAINT "ReturnLine_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnLine" ADD CONSTRAINT "ReturnLine_purchaseReturnId_fkey" FOREIGN KEY ("purchaseReturnId") REFERENCES "PurchaseReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

