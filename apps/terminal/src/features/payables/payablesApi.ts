import { apiFetch } from "@/features/api-client";
import { readValidAccessToken } from "@/features/auth/authSession";
import type {
  CreateExpenseInput,
  CreatePaymentInput,
  ExpenseCategory,
  ExpenseDetail,
  ExpenseReportSummary,
  ExpenseSummary,
  ListExpensesQuery,
  Payment,
  QuickExpenseInput,
  UpdateExpenseInput,
} from "./types";

function requireToken(): string {
  const token = readValidAccessToken();
  if (!token) throw new Error("Session expired — sign out and sign in again.");
  return token;
}

function toQuery(params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") qs.set(k, v);
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

// ---------- expenses ----------

export function listExpenses(query: ListExpensesQuery = {}): Promise<ExpenseSummary[]> {
  const token = requireToken();
  return apiFetch<ExpenseSummary[]>(`/expenses${toQuery(query)}`, {
    method: "GET",
    token,
  });
}

export function getExpense(id: string): Promise<ExpenseDetail> {
  const token = requireToken();
  return apiFetch<ExpenseDetail>(`/expenses/${encodeURIComponent(id)}`, {
    method: "GET",
    token,
  });
}

export function createExpense(body: CreateExpenseInput): Promise<ExpenseDetail> {
  const token = requireToken();
  return apiFetch<ExpenseDetail>("/expenses", {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
}

export function updateExpense(id: string, body: UpdateExpenseInput): Promise<ExpenseDetail> {
  const token = requireToken();
  return apiFetch<ExpenseDetail>(`/expenses/${encodeURIComponent(id)}`, {
    method: "PUT",
    token,
    body: JSON.stringify(body),
  });
}

export function deleteExpense(id: string): Promise<void> {
  const token = requireToken();
  return apiFetch<void>(`/expenses/${encodeURIComponent(id)}`, {
    method: "DELETE",
    token,
  });
}

export function quickExpense(body: QuickExpenseInput): Promise<ExpenseDetail> {
  const token = requireToken();
  return apiFetch<ExpenseDetail>("/expenses/quick", {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
}

// ---------- payments ----------

export function listPayments(
  query: {
    from?: string;
    to?: string;
    method?: string;
    expenseId?: string;
    salaryLineId?: string;
  } = {},
): Promise<Payment[]> {
  const token = requireToken();
  return apiFetch<Payment[]>(`/payments${toQuery(query)}`, { method: "GET", token });
}

export function createPayment(body: CreatePaymentInput): Promise<Payment> {
  const token = requireToken();
  return apiFetch<Payment>("/payments", {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
}

export function deletePayment(id: string): Promise<void> {
  const token = requireToken();
  return apiFetch<void>(`/payments/${encodeURIComponent(id)}`, {
    method: "DELETE",
    token,
  });
}

// ---------- categories ----------

export function listExpenseCategories(): Promise<ExpenseCategory[]> {
  const token = requireToken();
  return apiFetch<ExpenseCategory[]>("/expense-categories", { method: "GET", token });
}

export function createExpenseCategory(name: string): Promise<ExpenseCategory> {
  const token = requireToken();
  return apiFetch<ExpenseCategory>("/expense-categories", {
    method: "POST",
    token,
    body: JSON.stringify({ name }),
  });
}

export function updateExpenseCategory(
  id: string,
  body: { name?: string; active?: boolean; sortIndex?: number },
): Promise<ExpenseCategory> {
  const token = requireToken();
  return apiFetch<ExpenseCategory>(`/expense-categories/${encodeURIComponent(id)}`, {
    method: "PUT",
    token,
    body: JSON.stringify(body),
  });
}

export function deleteExpenseCategory(id: string): Promise<void> {
  const token = requireToken();
  return apiFetch<void>(`/expense-categories/${encodeURIComponent(id)}`, {
    method: "DELETE",
    token,
  });
}

// ---------- suppliers (read from the ledger workspace) ----------

export type SupplierOption = { id: string; name: string };

export async function listSuppliers(): Promise<SupplierOption[]> {
  const token = requireToken();
  const ws = await apiFetch<{ suppliers?: { id: string; name?: string }[] }>(
    "/ledger/workspace",
    { method: "GET", token },
  );
  return (ws.suppliers ?? []).map((s) => ({ id: s.id, name: s.name ?? s.id }));
}

// ---------- reports ----------

export function fetchExpenseReportSummary(
  query: { from?: string; to?: string } = {},
): Promise<ExpenseReportSummary> {
  const token = requireToken();
  return apiFetch<ExpenseReportSummary>(`/expense-reports/summary${toQuery(query)}`, {
    method: "GET",
    token,
  });
}
