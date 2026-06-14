-- CreateTable
CREATE TABLE "BranchLedgerWorkspace" (
    "branchId" TEXT NOT NULL,
    "suppliers" JSONB NOT NULL DEFAULT '[]',
    "moves" JSONB NOT NULL DEFAULT '[]',
    "ledger" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchLedgerWorkspace_pkey" PRIMARY KEY ("branchId")
);

-- AddForeignKey
ALTER TABLE "BranchLedgerWorkspace" ADD CONSTRAINT "BranchLedgerWorkspace_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
