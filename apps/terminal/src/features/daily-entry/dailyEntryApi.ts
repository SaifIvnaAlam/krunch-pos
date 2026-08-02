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
      bankWithdrawn: row.bankWithdrawn ?? 0,
      cashIn: row.cashIn ?? 0,
      expenseLines: row.expenseLines,
      remainingBalance: row.remainingBalance,
      enteredBy: row.enteredBy,
    }),
  });
}

export type LedgerCommitPayload = {
  suppliers: unknown[];
  moves: unknown[];
  ledger: unknown[];
};
export type SalaryCommitPayload = {
  selectedMonthKey: string;
  months: Record<string, unknown>;
};

/**
 * I3 — atomic cross-module save. Sends the daily entry together with the derived
 * ledger workspace and salary bundle so the server commits all three in one
 * transaction (all-or-nothing). Replaces the legacy three separate PUTs.
 */
export async function commitDailyEntryOnApi(
  row: DailyEntryRow,
  ledger?: LedgerCommitPayload,
  salary?: SalaryCommitPayload,
): Promise<DailyEntryRow> {
  const token = requireToken();
  return apiFetch<DailyEntryRow>(
    `/daily-entries/${encodeURIComponent(row.date)}/commit`,
    {
      method: "PUT",
      token,
      body: JSON.stringify({
        entry: {
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
          bankWithdrawn: row.bankWithdrawn ?? 0,
          cashIn: row.cashIn ?? 0,
          expenseLines: row.expenseLines,
          remainingBalance: row.remainingBalance,
          enteredBy: row.enteredBy,
        },
        ...(ledger ? { ledger } : {}),
        ...(salary ? { salary } : {}),
      }),
    },
  );
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
