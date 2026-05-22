-- AlterTable
ALTER TABLE "DailyEntry" ADD COLUMN "isLocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DailyEntry" ADD COLUMN "lockedAt" TIMESTAMP(3);
ALTER TABLE "DailyEntry" ADD COLUMN "lockedByStaffId" TEXT;
ALTER TABLE "DailyEntry" ADD COLUMN "lockedByName" TEXT;

-- AddForeignKey
ALTER TABLE "DailyEntry" ADD CONSTRAINT "DailyEntry_lockedByStaffId_fkey" FOREIGN KEY ("lockedByStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
