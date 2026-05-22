import { useEffect, useMemo, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { Plus, Trash2, Wallet, X } from "lucide-react";
import {
  createSalaryPayment,
  defaultDocForNewMonth,
  distributeServiceChargePool,
  emptySalaryRow,
  isMonthKey,
  labelFromMonthKey,
  readSalarySheetBundle,
  summarizeSalaryDoc,
  sumPaymentsForRow,
  totalPayableForRow,
  writeSalarySheetBundle,
  type SalaryPayment,
  type SalarySheetDoc,
  type SalarySheetRow,
} from "../../lib/salarySheetStorage";

const border0 =
  "border-[0.5px] border-solid [border-color:var(--pos-border-hairline)]";

export const HR_LEAF_IDS = new Set(["hr-payroll"]);

function Toolbar({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`flex flex-wrap items-center gap-2 ${className}`}>{children}</div>;
}

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

function SalaryPaymentsModal({
  row,
  open,
  onClose,
  onSave,
}: {
  row: SalarySheetRow | null;
  open: boolean;
  onClose: () => void;
  onSave: (payments: SalaryPayment[]) => void;
}) {
  const [local, setLocal] = useState<SalaryPayment[]>([]);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open || !row) return;
    setLocal(row.payments.map((p) => ({ ...p })));
    setDate(new Date().toISOString().slice(0, 10));
    setAmount("");
    setNote("");
  }, [open, row?.id, row?.payments.length]);

  const sorted = useMemo(
    () => [...local].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
    [local],
  );

  if (!open || !row) return null;

  const addPayment = () => {
    const amt = parseMoneyInput(amount);
    if (amt <= 0) return;
    setLocal((list) => [...list, createSalaryPayment(amt, date, note)]);
    setAmount("");
    setNote("");
  };

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
              Payout transactions
            </p>
            <p className="mt-0.5 truncate text-[12px] text-[var(--pos-text-2)]">
              {row.name.trim() || "Unnamed employee"} · sum {formatWhole(sumPaymentsForRow({ ...row, payments: local }))}
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

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {sorted.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-[var(--pos-text-2)]">No payouts recorded yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {sorted.map((p) => (
                <li
                  key={p.id}
                  className={`flex items-start justify-between gap-3 rounded-[10px] bg-[var(--pos-sidebar)]/70 px-3 py-2.5 ${border0}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[12px] font-semibold text-[var(--pos-text-1)]">
                      {formatWhole(p.amount)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--pos-text-2)]">{p.date}</p>
                    {p.note ? (
                      <p className="mt-1 text-[11px] leading-snug text-[var(--pos-text-2)]">{p.note}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setLocal((list) => list.filter((x) => x.id !== p.id))}
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-[6px] text-[var(--pos-text-2)] hover:bg-[var(--pos-card)] hover:text-[var(--pos-text-1)]"
                    aria-label="Remove payout"
                  >
                    <Trash2 className="size-3.5" strokeWidth={2} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
            Add payout
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="flex min-w-[140px] flex-1 flex-col gap-1">
              <span className="text-[10px] text-[var(--pos-text-2)]">Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-9 w-full rounded-[8px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2 font-mono text-[12px] text-[var(--pos-text-1)] focus:border-[var(--pos-text-1)] focus:outline-none"
              />
            </label>
            <label className="flex min-w-[100px] flex-1 flex-col gap-1">
              <span className="text-[10px] text-[var(--pos-text-2)]">Amount</span>
              <input
                type="text"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="h-9 w-full rounded-[8px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2 text-right font-mono text-[12px] text-[var(--pos-text-1)] focus:border-[var(--pos-text-1)] focus:outline-none"
              />
            </label>
            <label className="min-w-[200px] flex-[2] basis-full sm:basis-auto flex-col gap-1">
              <span className="text-[10px] text-[var(--pos-text-2)]">Note (optional)</span>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Cash, bank transfer…"
                className="h-9 w-full rounded-[8px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2 text-[12px] text-[var(--pos-text-1)] focus:border-[var(--pos-text-1)] focus:outline-none"
              />
            </label>
            <PrimaryButton type="button" showPlus={false} className="shrink-0" onClick={addPayment}>
              Add
            </PrimaryButton>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-solid [border-color:var(--pos-divider)] px-4 py-3">
          <GhostButton type="button" onClick={onClose}>
            Cancel
          </GhostButton>
          <PrimaryButton
            type="button"
            showPlus={false}
            onClick={() => {
              onSave(local);
              onClose();
            }}
          >
            Save payouts
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function PayrollSalaries() {
  const [bundle, setBundle] = useState(() => readSalarySheetBundle());
  const [poolDraft, setPoolDraft] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [paymentEditorRowId, setPaymentEditorRowId] = useState<string | null>(null);

  const activeKey = bundle.selectedMonthKey;
  const doc = bundle.months[activeKey] ?? defaultDocForNewMonth(activeKey);
  const paymentEditorRow = paymentEditorRowId
    ? doc.rows.find((x) => x.id === paymentEditorRowId) ?? null
    : null;

  useEffect(() => {
    const res = writeSalarySheetBundle(bundle);
    if (!res.ok) setSaveMessage(res.message);
    else setSaveMessage(null);
  }, [bundle]);

  const patchDoc = (updater: (d: SalarySheetDoc) => SalarySheetDoc) => {
    setBundle((b) => {
      const key = b.selectedMonthKey;
      const cur = b.months[key] ?? defaultDocForNewMonth(key);
      const nextDoc = updater(cur);
      return {
        ...b,
        months: { ...b.months, [key]: { ...nextDoc, updatedAt: new Date().toISOString() } },
      };
    });
  };

  const selectMonth = (monthKey: string) => {
    if (!isMonthKey(monthKey)) return;
    setBundle((b) => ({
      ...b,
      selectedMonthKey: monthKey,
      months: b.months[monthKey]
        ? b.months
        : { ...b.months, [monthKey]: defaultDocForNewMonth(monthKey) },
    }));
  };

  const monthOverviewRows = useMemo(() => {
    return Object.keys(bundle.months)
      .filter(isMonthKey)
      .sort((a, b) => b.localeCompare(a))
      .map((monthKey) => {
        const d = bundle.months[monthKey]!;
        const s = summarizeSalaryDoc(d);
        const label = d.periodLabel.trim() || labelFromMonthKey(monthKey);
        return { monthKey, label, ...s };
      });
  }, [bundle.months]);

  const totals = useMemo(() => {
    let basic = 0;
    let sc = 0;
    let ot = 0;
    let eid = 0;
    let payable = 0;
    let paid = 0;
    for (const r of doc.rows) {
      basic += r.basic;
      sc += r.serviceCharge;
      ot += r.overtime;
      eid += r.eidBonus;
      payable += totalPayableForRow(r);
      paid += sumPaymentsForRow(r);
    }
    return { basic, sc, ot, eid, payable, paid };
  }, [doc.rows]);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden pr-1">
      <h1 className="shrink-0 text-[16px] font-semibold text-[var(--pos-text-1)]">
        Employee Salaries
      </h1>
      <SalaryPaymentsModal
        row={paymentEditorRow}
        open={paymentEditorRowId != null && paymentEditorRow != null}
        onClose={() => setPaymentEditorRowId(null)}
        onSave={(payments) => {
          if (!paymentEditorRowId) return;
          patchDoc((d) => ({
            ...d,
            rows: d.rows.map((row) =>
              row.id === paymentEditorRowId ? { ...row, payments } : row,
            ),
          }));
        }}
      />
      <Toolbar className="shrink-0 flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">
          <label className="flex min-w-[168px] max-w-[200px] flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
              Salary month
            </span>
            <input
              type="month"
              value={activeKey}
              onChange={(e) => {
                const v = e.target.value;
                if (v) selectMonth(v);
              }}
              className={`${inputName} font-mono text-[12px]`}
              aria-label="Salary month"
            />
          </label>
          <label className="flex min-w-[140px] max-w-[220px] flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
              Period label
            </span>
            <input
              type="text"
              value={doc.periodLabel}
              onChange={(e) => patchDoc((d) => ({ ...d, periodLabel: e.target.value }))}
              className={inputName}
              aria-label="Pay period label"
            />
          </label>
          <label className="flex min-w-[120px] max-w-[160px] flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
              SC pool
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
        <Toolbar className="gap-2">
          <GhostButton
            type="button"
            onClick={() => {
              setBundle((b) => ({
                ...b,
                months: {
                  ...b.months,
                  [b.selectedMonthKey]: defaultDocForNewMonth(b.selectedMonthKey),
                },
              }));
              setPoolDraft("");
            }}
          >
            Restore example
          </GhostButton>
          <PrimaryButton type="button" onClick={() => patchDoc((d) => ({ ...d, rows: [...d.rows, emptySalaryRow()] }))}>
            Add row
          </PrimaryButton>
        </Toolbar>
      </Toolbar>
      <div className={`shrink-0 overflow-hidden rounded-[14px] bg-[var(--pos-card)] ${border0}`}>
        <div className="border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--pos-text-2)]">
            Disbursement by month
          </p>
          <p className="mt-1 text-[11px] leading-snug text-[var(--pos-text-2)]">
            Totals per saved month (payable vs recorded paid). Click a row to open that month&apos;s register.
          </p>
        </div>
        <div className="max-h-[220px] overflow-auto">
          <table className="w-full min-w-[520px] text-left text-[12px]">
            <thead className="sticky top-0 z-[1] bg-[var(--pos-card)] shadow-[inset_0_-1px_0_var(--pos-border-hairline)]">
              <tr className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                <th className="px-4 py-2.5">Month</th>
                <th className="px-4 py-2.5 text-right">Total payable</th>
                <th className="px-4 py-2.5 text-right">Total paid</th>
                <th className="px-4 py-2.5 text-right">Outstanding</th>
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
                      <span className="ml-2 font-mono text-[10px] text-[var(--pos-text-2)]">{row.monthKey}</span>
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
      </div>
      {saveMessage ? (
        <p className="text-[12px] text-red-600 dark:text-red-400" role="status">
          {saveMessage}
        </p>
      ) : null}
      <div className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] bg-[var(--pos-card)] ${border0}`}>
        <div className="shrink-0 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--pos-text-2)]">
            Salary register · BDT (whole amounts)
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[920px] border-collapse text-[12px]">
            <thead className="sticky top-0 z-[1] bg-[var(--pos-card)] shadow-[inset_0_-1px_0_var(--pos-border-hairline)]">
              <tr className="border-b border-solid [border-color:var(--pos-divider)] text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--pos-text-2)]">
                <th className="sticky left-0 z-[2] min-w-[120px] bg-[var(--pos-card)] px-3 py-2.5 text-left">
                  Name
                </th>
                <th className={thNum}>Basic</th>
                <th className={`${thNum} w-[56px]`} title="Weight for splitting the service charge pool">
                  %
                </th>
                <th className={thNum}>Service charge</th>
                <th className={thNum}>Overtime</th>
                <th className={thNum}>Eid bonus</th>
                <th className={thNum}>Total payable</th>
                <th className={`${thNum} min-w-[128px]`} title="Sum of dated payout lines for this employee">
                  Paid (sum)
                </th>
                <th className="w-10 px-1 py-2.5" aria-label="Row actions" />
              </tr>
            </thead>
            <tbody>
              {doc.rows.map((r) => {
                const tp = totalPayableForRow(r);
                return (
                  <tr
                    key={r.id}
                    className="border-b border-solid [border-color:var(--pos-border-hairline)] transition-colors hover:bg-[var(--pos-sidebar)]/50"
                  >
                    <td className={`sticky left-0 z-[1] bg-[var(--pos-card)] px-2 py-1.5 ${tdNum}`}>
                      <input
                        type="text"
                        value={r.name}
                        onChange={(e) => updateRow(r.id, { name: e.target.value })}
                        className={inputName}
                        aria-label={`Name row ${r.id}`}
                      />
                    </td>
                    <td className={tdNum}>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={r.basic}
                        onChange={(e) => updateRow(r.id, { basic: parseMoneyInput(e.target.value) })}
                        className={inputMoney}
                        aria-label={`Basic pay for ${r.name || "row"}`}
                      />
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
                        className={inputMoney}
                        aria-label={`Service charge for ${r.name || "row"}`}
                      />
                    </td>
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
                    <td className={`${tdNum} text-right font-mono text-[11px] font-semibold text-[var(--pos-text-1)]`}>
                      {formatWhole(tp)}
                    </td>
                    <td className={`${tdNum} text-right`}>
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-mono text-[11px] font-semibold text-[var(--pos-text-1)]">
                          {formatWhole(sumPaymentsForRow(r))}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPaymentEditorRowId(r.id)}
                          className="inline-flex items-center gap-1 rounded-[8px] border border-solid [border-color:var(--pos-border-medium)] bg-[var(--pos-sidebar)] px-2 py-1 text-[10px] font-medium text-[var(--pos-text-1)] transition-colors hover:bg-[var(--pos-card)]"
                          aria-label={`Payout transactions for ${r.name || "row"}`}
                        >
                          <Wallet className="size-3" strokeWidth={2} />
                          {r.payments.length} payout{r.payments.length === 1 ? "" : "s"}
                        </button>
                      </div>
                    </td>
                    <td className="px-1 py-1.5 text-center align-middle">
                      <button
                        type="button"
                        onClick={() =>
                          patchDoc((d) =>
                            d.rows.length <= 1 ? d : { ...d, rows: d.rows.filter((x) => x.id !== r.id) },
                          )
                        }
                        className="inline-flex size-8 items-center justify-center rounded-[6px] text-[var(--pos-text-2)] transition-colors hover:bg-[var(--pos-sidebar)] hover:text-[var(--pos-text-1)]"
                        aria-label={`Remove ${r.name || "row"}`}
                      >
                        <Trash2 className="size-3.5" strokeWidth={2} />
                      </button>
                    </td>
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
                <td className={`${tdNum} border-t border-solid [border-color:var(--pos-divider)]`} />
                <td className={`${tdNum} border-t border-solid [border-color:var(--pos-divider)] text-right font-mono text-[11px]`}>
                  {formatWhole(totals.sc)}
                </td>
                <td className={`${tdNum} border-t border-solid [border-color:var(--pos-divider)] text-right font-mono text-[11px]`}>
                  {formatWhole(totals.ot)}
                </td>
                <td className={`${tdNum} border-t border-solid [border-color:var(--pos-divider)] text-right font-mono text-[11px]`}>
                  {formatWhole(totals.eid)}
                </td>
                <td className={`${tdNum} border-t border-solid [border-color:var(--pos-divider)] text-right font-mono text-[11px]`}>
                  {formatWhole(totals.payable)}
                </td>
                <td className={`${tdNum} border-t border-solid [border-color:var(--pos-divider)] text-right font-mono text-[11px]`}>
                  {formatWhole(totals.paid)}
                </td>
                <td className="border-t border-solid [border-color:var(--pos-divider)]" />
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
