-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('invoice', 'payment', 'return_credit', 'adjustment');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('draft', 'sent', 'partial', 'received', 'cancelled');

-- CreateEnum
CREATE TYPE "ExpenseLineKind" AS ENUM ('purchase', 'vendor', 'staff', 'regular');

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'BDT';

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bookPurpose" TEXT NOT NULL,
    "contactPerson" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "ref" TEXT NOT NULL DEFAULT '',
    "memo" TEXT NOT NULL DEFAULT '',
    "amountMinor" INTEGER NOT NULL,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntryItem" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "ledgerEntryId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT '',
    "rateMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerEntryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "ref" TEXT NOT NULL DEFAULT '',
    "date" TEXT NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'draft',
    "note" TEXT NOT NULL DEFAULT '',
    "amountMinor" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT '',
    "rateMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "defaultBasicSalaryMinor" INTEGER NOT NULL DEFAULT 0,
    "serviceChargePct" DECIMAL(6,3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryMonth" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL DEFAULT '',
    "serviceChargePoolMinor" INTEGER,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryMonth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryLine" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "salaryMonthId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "basicMinor" INTEGER NOT NULL DEFAULT 0,
    "pct" DECIMAL(6,3),
    "serviceChargeMinor" INTEGER NOT NULL DEFAULT 0,
    "overtimeMinor" INTEGER NOT NULL DEFAULT 0,
    "eidBonusMinor" INTEGER NOT NULL DEFAULT 0,
    "finesMinor" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryPayment" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "salaryLineId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "dailyEntryLineId" TEXT,
    "dailyEntryDate" TEXT,
    "postedEmployeeLineKind" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyEntryExpenseLine" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "dailyEntryId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "kind" "ExpenseLineKind" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "vendor" TEXT NOT NULL DEFAULT '',
    "ledgerNote" TEXT NOT NULL DEFAULT '',
    "ledgerKind" "LedgerEntryType",
    "ledgerEntryId" TEXT,
    "purchaseOrderId" TEXT,
    "employeeId" TEXT,
    "employeeName" TEXT,
    "staffLineKind" TEXT,
    "salaryPaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyEntryExpenseLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyEntryExpenseItem" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "expenseLineId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT '',
    "rateMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyEntryExpenseItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Supplier_branchId_idx" ON "Supplier"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_branchId_name_key" ON "Supplier"("branchId", "name");

-- CreateIndex
CREATE INDEX "LedgerEntry_branchId_date_idx" ON "LedgerEntry"("branchId", "date");

-- CreateIndex
CREATE INDEX "LedgerEntry_supplierId_idx" ON "LedgerEntry"("supplierId");

-- CreateIndex
CREATE INDEX "LedgerEntryItem_branchId_idx" ON "LedgerEntryItem"("branchId");

-- CreateIndex
CREATE INDEX "LedgerEntryItem_ledgerEntryId_idx" ON "LedgerEntryItem"("ledgerEntryId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_branchId_idx" ON "PurchaseOrder"("branchId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_branchId_idx" ON "PurchaseOrderItem"("branchId");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_purchaseOrderId_idx" ON "PurchaseOrderItem"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "Employee_branchId_idx" ON "Employee"("branchId");

-- CreateIndex
CREATE INDEX "SalaryMonth_branchId_idx" ON "SalaryMonth"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "SalaryMonth_branchId_monthKey_key" ON "SalaryMonth"("branchId", "monthKey");

-- CreateIndex
CREATE INDEX "SalaryLine_branchId_idx" ON "SalaryLine"("branchId");

-- CreateIndex
CREATE INDEX "SalaryLine_salaryMonthId_idx" ON "SalaryLine"("salaryMonthId");

-- CreateIndex
CREATE INDEX "SalaryLine_employeeId_idx" ON "SalaryLine"("employeeId");

-- CreateIndex
CREATE INDEX "SalaryPayment_branchId_idx" ON "SalaryPayment"("branchId");

-- CreateIndex
CREATE INDEX "SalaryPayment_salaryLineId_idx" ON "SalaryPayment"("salaryLineId");

-- CreateIndex
CREATE INDEX "DailyEntryExpenseLine_branchId_idx" ON "DailyEntryExpenseLine"("branchId");

-- CreateIndex
CREATE INDEX "DailyEntryExpenseLine_dailyEntryId_idx" ON "DailyEntryExpenseLine"("dailyEntryId");

-- CreateIndex
CREATE INDEX "DailyEntryExpenseLine_lineId_idx" ON "DailyEntryExpenseLine"("lineId");

-- CreateIndex
CREATE INDEX "DailyEntryExpenseLine_ledgerEntryId_idx" ON "DailyEntryExpenseLine"("ledgerEntryId");

-- CreateIndex
CREATE INDEX "DailyEntryExpenseLine_purchaseOrderId_idx" ON "DailyEntryExpenseLine"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "DailyEntryExpenseLine_employeeId_idx" ON "DailyEntryExpenseLine"("employeeId");

-- CreateIndex
CREATE INDEX "DailyEntryExpenseItem_branchId_idx" ON "DailyEntryExpenseItem"("branchId");

-- CreateIndex
CREATE INDEX "DailyEntryExpenseItem_expenseLineId_idx" ON "DailyEntryExpenseItem"("expenseLineId");

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntryItem" ADD CONSTRAINT "LedgerEntryItem_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntryItem" ADD CONSTRAINT "LedgerEntryItem_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "LedgerEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryMonth" ADD CONSTRAINT "SalaryMonth_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryLine" ADD CONSTRAINT "SalaryLine_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryLine" ADD CONSTRAINT "SalaryLine_salaryMonthId_fkey" FOREIGN KEY ("salaryMonthId") REFERENCES "SalaryMonth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryLine" ADD CONSTRAINT "SalaryLine_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryPayment" ADD CONSTRAINT "SalaryPayment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryPayment" ADD CONSTRAINT "SalaryPayment_salaryLineId_fkey" FOREIGN KEY ("salaryLineId") REFERENCES "SalaryLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyEntryExpenseLine" ADD CONSTRAINT "DailyEntryExpenseLine_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyEntryExpenseLine" ADD CONSTRAINT "DailyEntryExpenseLine_dailyEntryId_fkey" FOREIGN KEY ("dailyEntryId") REFERENCES "DailyEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyEntryExpenseLine" ADD CONSTRAINT "DailyEntryExpenseLine_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "LedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyEntryExpenseLine" ADD CONSTRAINT "DailyEntryExpenseLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyEntryExpenseLine" ADD CONSTRAINT "DailyEntryExpenseLine_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyEntryExpenseItem" ADD CONSTRAINT "DailyEntryExpenseItem_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyEntryExpenseItem" ADD CONSTRAINT "DailyEntryExpenseItem_expenseLineId_fkey" FOREIGN KEY ("expenseLineId") REFERENCES "DailyEntryExpenseLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

