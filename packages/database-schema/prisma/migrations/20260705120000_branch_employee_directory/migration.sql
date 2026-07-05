-- CreateTable
CREATE TABLE "BranchEmployeeDirectory" (
    "branchId" TEXT NOT NULL,
    "employees" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchEmployeeDirectory_pkey" PRIMARY KEY ("branchId")
);

-- AddForeignKey
ALTER TABLE "BranchEmployeeDirectory" ADD CONSTRAINT "BranchEmployeeDirectory_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
