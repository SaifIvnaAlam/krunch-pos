-- Regular daily-entry expenses: category + partial pay (Other Expenses parity).
ALTER TABLE "DailyEntryExpenseLine" ADD COLUMN IF NOT EXISTS "paidAmountMinor" INTEGER;
ALTER TABLE "DailyEntryExpenseLine" ADD COLUMN IF NOT EXISTS "expenseCategoryId" TEXT;

CREATE INDEX IF NOT EXISTS "DailyEntryExpenseLine_expenseCategoryId_idx"
  ON "DailyEntryExpenseLine"("expenseCategoryId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DailyEntryExpenseLine_expenseCategoryId_fkey'
  ) THEN
    ALTER TABLE "DailyEntryExpenseLine"
      ADD CONSTRAINT "DailyEntryExpenseLine_expenseCategoryId_fkey"
      FOREIGN KEY ("expenseCategoryId") REFERENCES "ExpenseCategory"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
