-- Drop legacy JSON workspace blobs. Relational tables are the only store.
-- Shadow-deploy strategy: prod v1 keeps its JSON DB untouched; this app does not dual-write.

DROP TABLE IF EXISTS "BranchLedgerWorkspace";
DROP TABLE IF EXISTS "BranchSalaryWorkspace";
DROP TABLE IF EXISTS "BranchEmployeeDirectory";

ALTER TABLE "DailyEntry" DROP COLUMN IF EXISTS "expenseLines";
