import { apiFetch } from "@/features/api-client";
import { readValidAccessToken } from "@/features/auth/authSession";
import type { DailyEntryRow } from "./types";

function requireToken(): string {
  const token = readValidAccessToken();
  if (!token) throw new Error("Session expired — sign out and sign in again.");
  return token;
}

export async function fetchDailyEntriesFromApi(): Promise<DailyEntryRow[]> {
  const token = requireToken();
  return apiFetch<DailyEntryRow[]>("/daily-entries", {
    method: "GET",
    token,
  });
}

export async function upsertDailyEntryOnApi(
  row: DailyEntryRow,
): Promise<DailyEntryRow> {
  const token = requireToken();
  return apiFetch<DailyEntryRow>(`/daily-entries/${encodeURIComponent(row.date)}`, {
    method: "PUT",
    token,
    body: JSON.stringify({
      date: row.date,
      openingBalance: row.openingBalance,
      cashSale: row.cashSale,
      bankSale: row.bankSale,
      bkashSale: row.bkashSale,
      nagadSale: row.nagadSale,
      pathaoSale: row.pathaoSale,
      foodiSale: row.foodiSale,
      foodpandaSale: row.foodpandaSale,
      voidSale: row.voidSale,
      voidSaleRemarks: row.voidSaleRemarks,
      voidSaleAttachmentDataUrls: row.voidSaleAttachmentDataUrls,
      expenses: row.expenses,
      bankWithdrawn: row.bankWithdrawn,
      expenseLines: row.expenseLines,
      remainingBalance: row.remainingBalance,
      enteredBy: row.enteredBy,
    }),
  });
}

export async function deleteDailyEntryOnApi(date: string): Promise<void> {
  const token = requireToken();
  await apiFetch<void>(`/daily-entries/${encodeURIComponent(date)}`, {
    method: "DELETE",
    token,
  });
}

export async function lockDailyEntryOnApi(
  date: string,
  lockedBy?: string,
): Promise<DailyEntryRow> {
  const token = requireToken();
  return apiFetch<DailyEntryRow>(`/daily-entries/${encodeURIComponent(date)}/lock`, {
    method: "POST",
    token,
    body: JSON.stringify({ lockedBy }),
  });
}

export async function unlockDailyEntryOnApi(
  date: string,
  unlockedBy?: string,
): Promise<DailyEntryRow> {
  const token = requireToken();
  return apiFetch<DailyEntryRow>(`/daily-entries/${encodeURIComponent(date)}/unlock`, {
    method: "POST",
    token,
    body: JSON.stringify({ unlockedBy }),
  });
}
