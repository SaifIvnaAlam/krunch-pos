-- CreateTable
CREATE TABLE "BranchSalaryWorkspace" (
    "branchId" TEXT NOT NULL,
    "bundle" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchSalaryWorkspace_pkey" PRIMARY KEY ("branchId")
);

-- AddForeignKey
ALTER TABLE "BranchSalaryWorkspace" ADD CONSTRAINT "BranchSalaryWorkspace_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
