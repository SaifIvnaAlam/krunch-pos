/**
 * @deprecated Import from `@/features/daily-entry` instead.
 * Re-exports for legacy imports during migration.
 */
export type {
  DailyEntryMap,
  DailyEntryRow,
  ExpenseLineSaved,
  LedgerExpenseLink,
} from "@/features/daily-entry";
export {
  BANK_SALE_SERVICE_CHARGE_RATE,
  bankSaleNetAfterServiceCharge,
  bankSaleServiceChargeAmount,
  DAILY_ENTRY_STORAGE_KEY,
  DAILY_ENTRY_STORAGE_UPDATE_EVENT,
  listDailyEntriesDescendingFromMap as listDailyEntriesDescending,
  savedLineKind,
} from "@/features/daily-entry";
export { readLocalDailyEntryMap as readDailyEntryMap } from "@/features/daily-entry/localDailyEntryStorage";
export { writeLocalDailyEntryMap as writeDailyEntryMap } from "@/features/daily-entry/localDailyEntryStorage";
