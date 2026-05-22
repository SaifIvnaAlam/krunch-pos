import type { DailyEntryMap, DailyEntryRow } from "./types";

/** Applied to `bankSale` (gross) when summing sales and closing balance. */
export const BANK_SALE_SERVICE_CHARGE_RATE = 0.0175;

export function bankSaleNetAfterServiceCharge(gross: number): number {
  const g = Number(gross);
  if (!Number.isFinite(g) || g <= 0) return 0;
  return g * (1 - BANK_SALE_SERVICE_CHARGE_RATE);
}

export function bankSaleServiceChargeAmount(gross: number): number {
  const g = Number(gross);
  if (!Number.isFinite(g) || g <= 0) return 0;
  return g * BANK_SALE_SERVICE_CHARGE_RATE;
}

/** Net bank sales (after service charge) minus expenses withdrawn from the bank. */
export function bankNetAfterWithdrawals(
  bankSaleGross: number,
  bankWithdrawn: number,
): number {
  return (
    bankSaleNetAfterServiceCharge(bankSaleGross) -
    Math.max(0, Number(bankWithdrawn) || 0)
  );
}

export function savedLineKind(line: { kind?: string }): "vendor" | "regular" {
  return line.kind === "regular" ? "regular" : "vendor";
}

export function listDailyEntriesDescendingFromMap(
  map: DailyEntryMap,
): DailyEntryRow[] {
  return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
}
