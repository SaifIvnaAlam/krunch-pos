-- Make SalaryLine.employeeId nullable and switch its FK to ON DELETE SET NULL,
-- so unlinked salary rows and removed employees no longer break the relational
-- projection (Stage D2). Additive: no data is modified.

-- DropForeignKey
ALTER TABLE "SalaryLine" DROP CONSTRAINT "SalaryLine_employeeId_fkey";

-- AlterTable
ALTER TABLE "SalaryLine" ALTER COLUMN "employeeId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "SalaryLine" ADD CONSTRAINT "SalaryLine_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
