import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { dispatchPosSelectLeaf } from "../../lib/posNavEvents";
import { useSession } from "@/features/auth";
import { loadEmployeeDirectory } from "@/features/employees";
import {
  getSalaryBundle,
  getSalaryWorkspaceLoadState,
  loadSalaryWorkspace,
  reloadSalaryWorkspace,
  flushSalaryWorkspacePersist,
  postSalaryPayoutToDailyEntry,
  setSalaryBundle,
  subscribeSalaryBundle,
} from "@/features/payroll";
import {
  EMPLOYEE_LEDGER_LINE_OPTIONS,
  type EmployeeLedgerLineKind,
} from "./LedgerModuleView";
import {
  createSalaryPayment,
  defaultDocForNewMonth,
  distributeServiceChargePool,
  ensureMonthDoc,
  isMonthKey,
  isSalaryPaymentPosted,
  labelFromMonthKey,
  monthKeyFromDate,
  summarizeSalaryDocWithPosting,
  sumPaymentsForRow,
  totalPayableForRow,
  type SalaryPaymentEmployeeLineKind,
  type SalarySheetDoc,
  type SalarySheetRow,
} from "../../lib/salarySheetStorage";
import { getEmployeeById, useActiveEmployees } from "../../lib/employeeDirectoryStorage";

const border0 =
  "border-[0.5px] border-solid [border-color:var(--pos-border-hairline)]";

export const HR_PAYROLL_LEAF_IDS = new Set(["hr-payroll"]);

type PrimaryButtonProps = ComponentPropsWithoutRef<"button"> & {
  children: ReactNode;
  showPlus?: boolean;
};

function PrimaryButton({
  children,
  showPlus = true,
  className = "",
  type = "button",
  ...rest
}: PrimaryButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center gap-1.5 rounded-[8px] bg-[var(--pos-text-1)] px-3 py-2 text-[12px] font-medium text-[var(--pos-page)] transition-opacity hover:opacity-90 ${className}`}
      {...rest}
    >
      {showPlus ? <Plus className="size-3.5" strokeWidth={2} /> : null}
      {children}
    </button>
  );
}

function GhostButton({
  children,
  className = "",
  type = "button",
  ...rest
}: ComponentPropsWithoutRef<"button"> & { children: ReactNode }) {
  return (
    <button
      type={type}
      className={`rounded-[8px] border border-solid [border-color:var(--pos-border-medium)] bg-[var(--pos-card)] px-3 py-2 text-[12px] font-medium text-[var(--pos-text-1)] transition-colors hover:bg-[var(--pos-sidebar)] ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

function formatWhole(n: number): string {
  return n.toLocaleString("en-BD");
}

function parseMoneyInput(raw: string): number {
  const t = raw.replace(/,/g, "").trim();
  if (t === "") return 0;
  const n = Number(t);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

function parsePctInput(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(100, Math.round(n * 100) / 100);
}

function employeeLineKindLabel(kind: SalaryPaymentEmployeeLineKind | undefined): string {
  if (!kind) return "Salary";
  return EMPLOYEE_LEDGER_LINE_OPTIONS.find((o) => o.value === kind)?.label ?? kind;
}

function shiftMonthKey(monthKey: string, delta: number): string {
  const [ys, ms] = monthKey.split("-");
  const y = Number(ys);
  const mo = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(mo)) return monthKeyFromDate();
  return monthKeyFromDate(new Date(y, mo - 1 + delta, 1));
}

function stillOwedForRow(row: SalarySheetRow): number {
  return Math.max(0, totalPayableForRow(row) - sumPaymentsForRow(row));
}

function stillOwedTone(shouldPay: number, paid: number, stillOwed: number): string {
  if (shouldPay <= 0) return "text-[var(--pos-text-2)]";
  if (stillOwed <= 0) return "text-emerald-700 dark:text-emerald-400";
  if (paid > 0) return "text-amber-700 dark:text-amber-400";
  return "text-[var(--pos-text-1)]";
}

function SalaryPaymentsModal({
  row,
  open,
  onClose,
  onRecordPayout,
}: {
  row: SalarySheetRow | null;
  open: boolean;
  onClose: () => void;
  onRecordPayout: (draft: {
    amount: number;
    date: string;
    note?: string;
    lineKind: EmployeeLedgerLineKind;
  }) => Promise<void>;
}) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [lineKind, setLineKind] = useState<EmployeeLedgerLineKind>("salary");
  const [recording, setRecording] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const shouldPay = row ? totalPayableForRow(row) : 0;
  const paidSoFar = row ? sumPaymentsForRow(row) : 0;
  const stillOwed = row ? stillOwedForRow(row) : 0;

  useEffect(() => {
    if (!open || !row) return;
    setDate(new Date().toISOString().slice(0, 10));
    setAmount(stillOwedForRow(row) > 0 ? String(stillOwedForRow(row)) : "");
    setNote("");
    setLineKind("salary");
    setFormError(null);
    setSuccessMessage(null);
  }, [open, row?.id]);

  const history = useMemo(
    () =>
      [...(row?.payments ?? [])].sort(
        (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
      ),
    [row?.payments],
  );

  if (!open || !row) return null;

  const handleRecord = () => {
    void (async () => {
      const parsedAmount = parseMoneyInput(amount);
      if (parsedAmount <= 0) {
        setFormError("Enter an amount greater than zero.");
        return;
      }
      setRecording(true);
      setFormError(null);
      setSuccessMessage(null);
      try {
        await onRecordPayout({
          amount: parsedAmount,
          date,
          note: note.trim() || undefined,
          lineKind,
        });
        setSuccessMessage(
          `Paid ৳${formatWhole(parsedAmount)} on ${date}. Added to your cash book for that day.`,
        );
        setAmount("");
        setNote("");
      } catch (e) {
        setFormError(e instanceof Error ? e.message : "Could not record payment.");
      } finally {
        setRecording(false);
      }
    })();
  };

  const inputClass =
    "h-9 w-full rounded-[8px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2 text-[12px] text-[var(--pos-text-1)] focus:border-[var(--pos-text-1)] focus:outline-none";

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/45"
        aria-label="Dismiss"
        onClick={onClose}
      />
      <div
        className={`relative z-[1] flex max-h-[88vh] w-full max-w-[440px] flex-col overflow-hidden rounded-[14px] bg-[var(--pos-card)] ${border0} shadow-lg`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="salary-payments-title"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
          <div className="min-w-0">
            <p id="salary-payments-title" className="text-[15px] font-semibold text-[var(--pos-text-1)]">
              Pay staff
            </p>
            <p className="mt-0.5 truncate text-[12px] text-[var(--pos-text-2)]">
              {row.name.trim() || "Unnamed employee"}
            </p>
            <p className="mt-1 text-[11px] text-[var(--pos-text-2)]">
              Should pay{" "}
              <span className="font-mono font-medium text-[var(--pos-text-1)]">
                ৳{formatWhole(shouldPay)}
              </span>
              {" · "}
              Paid{" "}
              <span className="font-mono font-medium text-[var(--pos-text-1)]">
                ৳{formatWhole(paidSoFar)}
              </span>
              {stillOwed > 0 ? (
                <>
                  {" · "}
                  Still owed{" "}
                  <span className="font-mono font-medium text-amber-700 dark:text-amber-400">
                    ৳{formatWhole(stillOwed)}
                  </span>
                </>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-[8px] text-[var(--pos-text-2)] transition-colors hover:bg-[var(--pos-sidebar)] hover:text-[var(--pos-text-1)]"
            aria-label="Close"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>

        <div className="shrink-0 border-b border-solid [border-color:var(--pos-divider)] px-4 py-4">
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-1 flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                Date
              </span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </label>
            <label className="col-span-1 flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                Amount (BDT)
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className={`${inputClass} text-right font-mono`}
                autoFocus
              />
            </label>
            <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                Expense type
              </span>
              <select
                value={lineKind}
                onChange={(e) => setLineKind(e.target.value as EmployeeLedgerLineKind)}
                className={inputClass}
              >
                {EMPLOYEE_LEDGER_LINE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                Note (optional)
              </span>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Cash, bank transfer…"
                className={inputClass}
              />
            </label>
          </div>
          {formError ? (
            <p className="mt-3 text-[11px] leading-snug text-red-600 dark:text-red-400" role="alert">
              {formError}
            </p>
          ) : null}
          {successMessage ? (
            <p
              className="mt-3 flex items-start gap-1.5 text-[11px] leading-snug text-emerald-700 dark:text-emerald-400"
              role="status"
            >
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} aria-hidden />
              {successMessage}
            </p>
          ) : null}
          <PrimaryButton
            type="button"
            showPlus={false}
            disabled={recording}
            className="mt-3 w-full justify-center py-2.5"
            onClick={handleRecord}
          >
            {recording ? "Saving…" : "Pay"}
          </PrimaryButton>
          <p className="mt-2 text-center text-[10px] leading-snug text-[var(--pos-text-2)]">
            Updates this month&apos;s register and adds the expense to Daily Entry for the date you pick.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
            Payment history
          </p>
          {history.length === 0 ? (
            <p className="py-4 text-center text-[12px] text-[var(--pos-text-2)]">No payments yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {history.map((p) => (
                <li
                  key={p.id}
                  className={`rounded-[10px] bg-[var(--pos-sidebar)]/70 px-3 py-2.5 ${border0}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[12px] font-semibold text-[var(--pos-text-1)]">
                        {formatWhole(p.amount)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--pos-text-2)]">{p.date}</p>
                      {p.note ? (
                        <p className="mt-1 text-[11px] leading-snug text-[var(--pos-text-2)]">{p.note}</p>
                      ) : null}
                    </div>
                    {isSalaryPaymentPosted(p) ? (
                      <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="size-3" strokeWidth={2} aria-hidden />
                        Daily Entry
                      </span>
                    ) : null}
                  </div>
                  {isSalaryPaymentPosted(p) ? (
                    <p className="mt-1.5 text-[10px] text-[var(--pos-text-2)]">
                      {employeeLineKindLabel(p.postedEmployeeLineKind)} · {p.dailyEntryDate}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function PayrollSalaries() {
  const { userName, isSignedIn } = useSession();
  const employees = useActiveEmployees();
  const employeeSyncKey = employees
    .map(
      (e) =>
        `${e.id}\t${e.name}\t${e.active}\t${e.serviceChargePct}\t${e.defaultBasicSalary}`,
    )
    .join("\n");

  const bundle = useSyncExternalStore(
    subscribeSalaryBundle,
    getSalaryBundle,
    getSalaryBundle,
  );
  const loadState = useSyncExternalStore(
    subscribeSalaryBundle,
    getSalaryWorkspaceLoadState,
    getSalaryWorkspaceLoadState,
  );
  const [poolDraft, setPoolDraft] = useState("");
  const [paymentEditorRowId, setPaymentEditorRowId] = useState<string | null>(null);
  const [showAdjustColumns, setShowAdjustColumns] = useState(false);
  const [showAllMonths, setShowAllMonths] = useState(false);

  const activeKey = bundle.selectedMonthKey;
  const doc = bundle.months[activeKey] ?? ensureMonthDoc(activeKey, undefined, employees);
  const paymentEditorRow = paymentEditorRowId
    ? doc.rows.find((x) => x.id === paymentEditorRowId) ?? null
    : null;

  useEffect(() => {
    void loadEmployeeDirectory();
    void loadSalaryWorkspace();
  }, []);

  useEffect(() => {
    if (!isSignedIn) return;
    void reloadSalaryWorkspace();
  }, [isSignedIn]);

  const flushSalaryEdits = () => {
    void flushSalaryWorkspacePersist().catch(() => {
      /* loadError surfaced in UI */
    });
  };

  useEffect(() => {
    setSalaryBundle((b) => {
      const key = b.selectedMonthKey;
      const cur = b.months[key];
      const next = ensureMonthDoc(key, cur, employees);
      if (
        cur &&
        cur.rows.length === next.rows.length &&
        cur.rows.every((row, i) => row.employeeId === next.rows[i]?.employeeId)
      ) {
        return b;
      }
      return { ...b, months: { ...b.months, [key]: next } };
    });
  }, [employeeSyncKey, activeKey, employees]);

  const patchDoc = (updater: (d: SalarySheetDoc) => SalarySheetDoc) => {
    setSalaryBundle((b) => {
      const key = b.selectedMonthKey;
      const cur = ensureMonthDoc(key, b.months[key], employees);
      const nextDoc = updater(cur);
      return {
        ...b,
        months: {
          ...b.months,
          [key]: {
            ...nextDoc,
            periodLabel: labelFromMonthKey(key),
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  };

  const selectMonth = (monthKey: string) => {
    if (!isMonthKey(monthKey)) return;
    setSalaryBundle((b) => ({
      ...b,
      selectedMonthKey: monthKey,
      months: {
        ...b.months,
        [monthKey]: ensureMonthDoc(monthKey, b.months[monthKey], employees),
      },
    }));
  };

  const monthOverviewRows = useMemo(() => {
    return Object.keys(bundle.months)
      .filter(isMonthKey)
      .sort((a, b) => b.localeCompare(a))
      .map((monthKey) => {
        const d = bundle.months[monthKey]!;
        const s = summarizeSalaryDocWithPosting(d);
        return { monthKey, label: labelFromMonthKey(monthKey), ...s };
      });
  }, [bundle.months]);

  const totals = useMemo(() => {
    let basic = 0;
    let sc = 0;
    let ot = 0;
    let eid = 0;
    let fines = 0;
    let payable = 0;
    let paid = 0;
    for (const r of doc.rows) {
      basic += r.basic;
      sc += r.serviceCharge;
      ot += r.overtime;
      eid += r.eidBonus;
      fines += r.fines;
      payable += totalPayableForRow(r);
      paid += sumPaymentsForRow(r);
    }
    return { basic, sc, ot, eid, fines, payable, paid };
  }, [doc.rows]);

  const stillOwedTotal = Math.max(0, totals.payable - totals.paid);
  const monthLabel = labelFromMonthKey(activeKey);
  const needsTeamSetup = employees.length === 0;
  const showMonthOverview = monthOverviewRows.length > 1;

  const updateRow = (id: string, patch: Partial<SalarySheetRow>) => {
    patchDoc((d) => ({
      ...d,
      rows: d.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  };

  const applyPool = () => {
    const pool = parseMoneyInput(poolDraft);
    if (pool <= 0) return;
    const shares = distributeServiceChargePool(doc.rows, pool);
    patchDoc((d) => ({
      ...d,
      rows: d.rows.map((r) =>
        shares.has(r.id) ? { ...r, serviceCharge: shares.get(r.id) ?? 0 } : r,
      ),
    }));
  };

  const thNum = "px-2 py-2.5 text-right font-semibold text-[var(--pos-text-1)]";
  const tdNum = "px-2 py-1.5 align-middle";
  const inputMoney =
    "h-8 w-full min-w-[72px] rounded-[6px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2 text-right font-mono text-[11px] text-[var(--pos-text-1)] focus:border-[var(--pos-text-1)] focus:outline-none";
  const inputName =
    "h-8 w-full min-w-[100px] rounded-[6px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2 text-left text-[12px] text-[var(--pos-text-1)] focus:border-[var(--pos-text-1)] focus:outline-none";

  if (needsTeamSetup && !loadState.loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-1">
        <div className="shrink-0">
          <h1 className="text-[16px] font-semibold text-[var(--pos-text-1)]">Pay staff</h1>
          <p className="mt-1 text-[12px] text-[var(--pos-text-2)]">
            Track what each person should earn and record when you pay them.
          </p>
        </div>
        <div
          className={`flex flex-1 flex-col items-center justify-center rounded-[14px] bg-[var(--pos-card)] px-6 py-12 text-center ${border0}`}
        >
          <div className="flex size-12 items-center justify-center rounded-full bg-[var(--pos-sidebar)]">
            <Users className="size-6 text-[var(--pos-text-2)]" strokeWidth={1.75} aria-hidden />
          </div>
          <h2 className="mt-4 text-[15px] font-semibold text-[var(--pos-text-1)]">
            Add your team first
          </h2>
          <p className="mt-2 max-w-[360px] text-[13px] leading-relaxed text-[var(--pos-text-2)]">
            Employee Salaries pulls names from Employee Management. Add your staff there, then come
            back to set monthly amounts and record payments.
          </p>
          <PrimaryButton
            type="button"
            showPlus={false}
            className="mt-6"
            onClick={() => dispatchPosSelectLeaf("hr-employees")}
          >
            Go to Employee Management
            <ArrowRight className="size-3.5" strokeWidth={2} />
          </PrimaryButton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-1">
      <div className="shrink-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[16px] font-semibold text-[var(--pos-text-1)]">Pay staff</h1>
            <p className="mt-1 text-[12px] text-[var(--pos-text-2)]">
              {employees.length} active staff · manage roster in{" "}
              <button
                type="button"
                onClick={() => dispatchPosSelectLeaf("hr-employees")}
                className="font-medium text-[var(--pos-text-1)] underline-offset-2 hover:underline"
              >
                Employee Management
              </button>
            </p>
          </div>
        </div>
      </div>
      <SalaryPaymentsModal
        row={paymentEditorRow}
        open={paymentEditorRowId != null && paymentEditorRow != null}
        onClose={() => setPaymentEditorRowId(null)}
        onRecordPayout={async ({ amount, date, note, lineKind }) => {
          if (!paymentEditorRowId || !paymentEditorRow) return;

          const payment = createSalaryPayment(amount, date, note);
          const priorPayments = paymentEditorRow.payments;
          const withNew = [...priorPayments, payment];

          patchDoc((d) => ({
            ...d,
            rows: d.rows.map((row) =>
              row.id === paymentEditorRowId ? { ...row, payments: withNew } : row,
            ),
          }));
          await flushSalaryWorkspacePersist();

          const postResult = await postSalaryPayoutToDailyEntry({
            employeeName: paymentEditorRow.name,
            employeePhone: paymentEditorRow.employeeId
              ? getEmployeeById(paymentEditorRow.employeeId)?.phone
              : undefined,
            payment,
            employeeLineKind: lineKind,
            enteredBy: userName.trim() || "Unknown",
          });

          if (!postResult.ok) {
            patchDoc((d) => ({
              ...d,
              rows: d.rows.map((row) =>
                row.id === paymentEditorRowId ? { ...row, payments: priorPayments } : row,
              ),
            }));
            await flushSalaryWorkspacePersist();
            throw new Error(postResult.message);
          }

          patchDoc((d) => ({
            ...d,
            rows: d.rows.map((row) =>
              row.id === paymentEditorRowId
                ? {
                    ...row,
                    payments: withNew.map((p) =>
                      p.id === payment.id ? postResult.payment : p,
                    ),
                  }
                : row,
            ),
          }));
          await flushSalaryWorkspacePersist();
        }}
      />
      <div className={`shrink-0 rounded-[14px] bg-[var(--pos-card)] ${border0}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => selectMonth(shiftMonthKey(activeKey, -1))}
              className="inline-flex size-8 items-center justify-center rounded-[8px] text-[var(--pos-text-2)] transition-colors hover:bg-[var(--pos-sidebar)] hover:text-[var(--pos-text-1)]"
              aria-label="Previous month"
            >
              <ChevronLeft className="size-4" strokeWidth={2} />
            </button>
            <div className="px-1">
              <p className="text-[14px] font-semibold text-[var(--pos-text-1)]">{monthLabel}</p>
              <p className="text-[10px] text-[var(--pos-text-2)]">Editing this month&apos;s payroll</p>
            </div>
            <button
              type="button"
              onClick={() => selectMonth(shiftMonthKey(activeKey, 1))}
              className="inline-flex size-8 items-center justify-center rounded-[8px] text-[var(--pos-text-2)] transition-colors hover:bg-[var(--pos-sidebar)] hover:text-[var(--pos-text-1)]"
              aria-label="Next month"
            >
              <ChevronRight className="size-4" strokeWidth={2} />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="salary-month-picker">
              Jump to month
            </label>
            <input
              id="salary-month-picker"
              type="month"
              value={activeKey}
              onChange={(e) => {
                const v = e.target.value;
                if (v) selectMonth(v);
              }}
              className={`${inputName} h-9 max-w-[148px] font-mono text-[11px]`}
              aria-label="Jump to month"
            />
            <GhostButton
              type="button"
              onClick={() => {
                const msg =
                  "Reset all amounts and payments for this month? This cannot be undone.";
                if (!window.confirm(msg)) return;
                setSalaryBundle((b) => ({
                  ...b,
                  months: {
                    ...b.months,
                    [b.selectedMonthKey]: defaultDocForNewMonth(b.selectedMonthKey, employees),
                  },
                }));
                setPoolDraft("");
              }}
            >
              Reset month
            </GhostButton>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-px bg-[var(--pos-divider)] sm:grid-cols-3">
          <div className="bg-[var(--pos-card)] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
              Should pay
            </p>
            <p className="mt-1 font-mono text-[18px] font-semibold text-[var(--pos-text-1)]">
              ৳{formatWhole(totals.payable)}
            </p>
          </div>
          <div className="bg-[var(--pos-card)] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
              Already paid
            </p>
            <p className="mt-1 font-mono text-[18px] font-semibold text-[var(--pos-text-1)]">
              ৳{formatWhole(totals.paid)}
            </p>
          </div>
          <div className="bg-[var(--pos-card)] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
              Still owed
            </p>
            <p
              className={`mt-1 font-mono text-[18px] font-semibold ${stillOwedTone(totals.payable, totals.paid, stillOwedTotal)}`}
            >
              ৳{formatWhole(stillOwedTotal)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3 border-t border-solid [border-color:var(--pos-divider)] px-4 py-3">
          <label className="flex min-w-[140px] max-w-[200px] flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
              Service charge pool
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={poolDraft}
              onChange={(e) => setPoolDraft(e.target.value)}
              placeholder="e.g. 54681"
              className={inputMoney}
              aria-label="Service charge pool to split"
            />
          </label>
          <GhostButton type="button" onClick={applyPool}>
            Split by %
          </GhostButton>
        </div>
      </div>
      {showMonthOverview ? (
        <div className={`shrink-0 overflow-hidden rounded-[14px] bg-[var(--pos-card)] ${border0}`}>
          <button
            type="button"
            onClick={() => setShowAllMonths((v) => !v)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--pos-sidebar)]/40"
          >
            <div>
              <p className="text-[12px] font-semibold text-[var(--pos-text-1)]">All months</p>
              <p className="mt-0.5 text-[11px] text-[var(--pos-text-2)]">
                {monthOverviewRows.length} months with saved data
              </p>
            </div>
            <ChevronDown
              className={`size-4 shrink-0 text-[var(--pos-text-2)] transition-transform ${showAllMonths ? "rotate-180" : ""}`}
              strokeWidth={2}
              aria-hidden
            />
          </button>
          {showAllMonths ? (
            <div className="border-t border-solid [border-color:var(--pos-divider)]">
              <table className="w-full min-w-[480px] text-left text-[12px]">
                <thead className="sticky top-0 z-[1] bg-[var(--pos-card)] shadow-[inset_0_-1px_0_var(--pos-border-hairline)]">
                  <tr className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                    <th className="px-4 py-2.5">Month</th>
                    <th className="px-4 py-2.5 text-right">Should pay</th>
                    <th className="px-4 py-2.5 text-right">Paid</th>
                    <th className="px-4 py-2.5 text-right">Still owed</th>
                  </tr>
                </thead>
                <tbody>
                  {monthOverviewRows.map((row) => {
                    const active = row.monthKey === activeKey;
                    return (
                      <tr
                        key={row.monthKey}
                        role="button"
                        tabIndex={0}
                        onClick={() => selectMonth(row.monthKey)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            selectMonth(row.monthKey);
                          }
                        }}
                        className={`cursor-pointer border-b border-solid [border-color:var(--pos-border-hairline)] transition-colors hover:bg-[var(--pos-sidebar)]/60 ${
                          active ? "bg-[var(--pos-nav-active-bg)]/12" : ""
                        }`}
                      >
                        <td className="px-4 py-2.5">
                          <span className="font-medium text-[var(--pos-text-1)]">{row.label}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-[11px] text-[var(--pos-text-1)]">
                          {formatWhole(row.totalPayable)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-[11px] text-[var(--pos-text-1)]">
                          {formatWhole(row.totalPaidRecorded)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-[11px] text-[var(--pos-text-1)]">
                          {formatWhole(row.outstanding)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
      {loadState.loading ? (
        <p className="text-[12px] text-[var(--pos-text-2)]" role="status">
          Loading salary registers...
        </p>
      ) : null}
      {loadState.error ? (
        <p className="text-[12px] text-red-600 dark:text-red-400" role="status">
          {loadState.error}
        </p>
      ) : null}
      <div className={`shrink-0 rounded-[14px] bg-[var(--pos-card)] ${border0}`}>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
          <div>
            <p className="text-[12px] font-semibold text-[var(--pos-text-1)]">This month&apos;s staff</p>
            <p className="mt-0.5 text-[11px] text-[var(--pos-text-2)]">
              Basic salary comes from Employee Management. Adjust service charge, overtime, bonus,
              and fines here each month.
            </p>
          </div>
          <GhostButton type="button" onClick={() => setShowAdjustColumns((v) => !v)}>
            {showAdjustColumns ? "Hide OT / bonus" : "Show OT / bonus"}
          </GhostButton>
        </div>
        <div>
          <table className="w-full min-w-[820px] border-collapse text-[12px]">
            <thead className="sticky top-0 z-[1] bg-[var(--pos-card)] shadow-[inset_0_-1px_0_var(--pos-border-hairline)]">
              <tr className="border-b border-solid [border-color:var(--pos-divider)] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--pos-text-2)]">
                <th className="sticky left-0 z-[2] min-w-[120px] bg-[var(--pos-card)] px-3 py-2.5 text-left">
                  Name
                </th>
                <th className={thNum} title="Fixed monthly basic from Employee Management">
                  Basic
                </th>
                <th className={thNum} title="Basic + service charge + overtime + bonus minus fines">
                  Should pay
                </th>
                <th className={thNum} title="Total paid so far this month">
                  Paid
                </th>
                <th className={thNum} title="Should pay minus paid">
                  Still owed
                </th>
                <th className="min-w-[88px] px-2 py-2.5 text-center">Pay</th>
                <th className={`${thNum} w-[56px]`} title="Weight for splitting the service charge pool">
                  %
                </th>
                <th className={thNum} title="Service charge share for this month">
                  Service charge
                </th>
                <th className={thNum} title="Damage or policy fines deducted from pay">
                  Fines
                </th>
                {showAdjustColumns ? (
                  <>
                    <th className={thNum}>Overtime</th>
                    <th className={thNum}>Eid bonus</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {doc.rows.map((r) => {
                const shouldPay = totalPayableForRow(r);
                const paid = sumPaymentsForRow(r);
                const stillOwed = stillOwedForRow(r);
                return (
                  <tr
                    key={r.id}
                    className="border-b border-solid [border-color:var(--pos-border-hairline)] transition-colors hover:bg-[var(--pos-sidebar)]/50"
                  >
                    <td className="sticky left-0 z-[1] bg-[var(--pos-card)] px-3 py-1.5 align-middle">
                      <span className="text-[12px] font-medium text-[var(--pos-text-1)]">
                        {r.name.trim() || "—"}
                      </span>
                    </td>
                    <td className={`${tdNum} text-right font-mono text-[11px] text-[var(--pos-text-1)]`}>
                      {formatWhole(r.basic)}
                    </td>
                    <td className={`${tdNum} text-right font-mono text-[11px] font-semibold text-[var(--pos-text-1)]`}>
                      {formatWhole(shouldPay)}
                    </td>
                    <td className={`${tdNum} text-right font-mono text-[11px] text-[var(--pos-text-1)]`}>
                      {formatWhole(paid)}
                    </td>
                    <td
                      className={`${tdNum} text-right font-mono text-[11px] font-semibold ${stillOwedTone(shouldPay, paid, stillOwed)}`}
                    >
                      {formatWhole(stillOwed)}
                    </td>
                    <td className={`${tdNum} text-center`}>
                      <button
                        type="button"
                        onClick={() => setPaymentEditorRowId(r.id)}
                        className="inline-flex items-center gap-1 rounded-[8px] bg-[var(--pos-text-1)] px-2.5 py-1.5 text-[10px] font-medium text-[var(--pos-page)] transition-opacity hover:opacity-90"
                        aria-label={`Pay ${r.name || "employee"}`}
                      >
                        <Wallet className="size-3" strokeWidth={2} />
                        Pay
                      </button>
                    </td>
                    <td className={tdNum}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={r.pct === null ? "" : String(r.pct)}
                        onChange={(e) => updateRow(r.id, { pct: parsePctInput(e.target.value) })}
                        className={`${inputMoney} min-w-[48px]`}
                        aria-label={`Service charge percent for ${r.name || "row"}`}
                      />
                    </td>
                    <td className={tdNum}>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={r.serviceCharge}
                        onChange={(e) =>
                          updateRow(r.id, { serviceCharge: parseMoneyInput(e.target.value) })
                        }
                        onBlur={flushSalaryEdits}
                        className={inputMoney}
                        aria-label={`Service charge for ${r.name || "row"}`}
                      />
                    </td>
                    <td className={tdNum}>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={r.fines}
                        onChange={(e) =>
                          updateRow(r.id, { fines: parseMoneyInput(e.target.value) })
                        }
                        onBlur={flushSalaryEdits}
                        className={inputMoney}
                        aria-label={`Fines for ${r.name || "row"}`}
                      />
                    </td>
                    {showAdjustColumns ? (
                      <>
                        <td className={tdNum}>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={r.overtime}
                            onChange={(e) => updateRow(r.id, { overtime: parseMoneyInput(e.target.value) })}
                            className={inputMoney}
                            aria-label={`Overtime for ${r.name || "row"}`}
                          />
                        </td>
                        <td className={tdNum}>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={r.eidBonus}
                            onChange={(e) => updateRow(r.id, { eidBonus: parseMoneyInput(e.target.value) })}
                            className={inputMoney}
                            aria-label={`Eid bonus for ${r.name || "row"}`}
                          />
                        </td>
                      </>
                    ) : null}
                  </tr>
                );
              })}
              <tr className="bg-[var(--pos-sidebar)]/80 font-semibold text-[var(--pos-text-1)]">
                <td className="sticky left-0 z-[1] border-t border-solid [border-color:var(--pos-divider)] bg-[var(--pos-sidebar)] px-3 py-2.5 text-left text-[11px] uppercase tracking-[0.06em]">
                  Total
                </td>
                <td className={`${tdNum} border-t border-solid [border-color:var(--pos-divider)] text-right font-mono text-[11px]`}>
                  {formatWhole(totals.basic)}
                </td>
                <td className={`${tdNum} border-t border-solid [border-color:var(--pos-divider)] text-right font-mono text-[11px]`}>
                  {formatWhole(totals.payable)}
                </td>
                <td className={`${tdNum} border-t border-solid [border-color:var(--pos-divider)] text-right font-mono text-[11px]`}>
                  {formatWhole(totals.paid)}
                </td>
                <td
                  className={`${tdNum} border-t border-solid [border-color:var(--pos-divider)] text-right font-mono text-[11px] ${stillOwedTone(totals.payable, totals.paid, stillOwedTotal)}`}
                >
                  {formatWhole(stillOwedTotal)}
                </td>
                <td className={`${tdNum} border-t border-solid [border-color:var(--pos-divider)]`} />
                <td className={`${tdNum} border-t border-solid [border-color:var(--pos-divider)]`} />
                <td className={`${tdNum} border-t border-solid [border-color:var(--pos-divider)] text-right font-mono text-[11px]`}>
                  {formatWhole(totals.sc)}
                </td>
                <td className={`${tdNum} border-t border-solid [border-color:var(--pos-divider)] text-right font-mono text-[11px]`}>
                  {formatWhole(totals.fines)}
                </td>
                {showAdjustColumns ? (
                  <>
                    <td className={`${tdNum} border-t border-solid [border-color:var(--pos-divider)] text-right font-mono text-[11px]`}>
                      {formatWhole(totals.ot)}
                    </td>
                    <td className={`${tdNum} border-t border-solid [border-color:var(--pos-divider)] text-right font-mono text-[11px]`}>
                      {formatWhole(totals.eid)}
                    </td>
                  </>
                ) : null}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function EmployeeModuleView() {
  return <PayrollSalaries />;
}
