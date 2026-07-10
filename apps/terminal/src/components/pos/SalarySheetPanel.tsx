import { useEffect, useMemo, useState } from "react";
import { getEmployeeMonthBalance } from "@/features/payroll";
import { dispatchPosSelectLeaf } from "../../lib/posNavEvents";
import {
  sumPaymentsForRow,
  totalPayableForRow,
  serviceChargePoolTargetTotal,
  type SalarySheetBundle,
  type SalarySheetDoc,
  type SalarySheetRow,
} from "../../lib/salarySheetStorage";
import {
  formatWhole,
  sheetInput,
  sheetInputLocked,
  sheetPlainInput,
  sheetPlainSelect,
  sheetTableWrap,
  sheetTd,
  sheetTdNum,
  sheetTdNumTotal,
  sheetTdTotal,
  sheetTh,
  sheetThNum,
  stillOwedLabel,
  stillOwedTone,
} from "./salaryUiShared";
import { StaffPayoutModal } from "./StaffPayoutModal";

type RowFilter = "all" | "still-owed" | "fully-paid";
type RowSort = "still-owed-desc" | "name" | "payable";

type PayoutModalTarget = {
  employeeId: string;
  employeeName: string;
};

function resolvePayoutTarget(
  row: SalarySheetRow,
  employees: { id: string; name: string }[],
): PayoutModalTarget | null {
  if (row.employeeId) {
    return { employeeId: row.employeeId, employeeName: row.name };
  }
  const norm = row.name.trim().toLowerCase();
  const hit = employees.find((e) => e.name.trim().toLowerCase() === norm);
  if (hit) return { employeeId: hit.id, employeeName: hit.name };
  return null;
}

export type SalarySheetTotals = {
  basic: number;
  sc: number;
  ot: number;
  eid: number;
  fines: number;
  payable: number;
  paid: number;
  stillOwed: number;
  unpaidCount?: number;
};

type RowMetrics = {
  row: SalarySheetRow;
  payable: number;
  paid: number;
  stillOwed: number;
  advanceOut: number;
  advanceApplied: number;
};

function parseMoneyInput(raw: string): number {
  const t = raw.replace(/,/g, "").trim();
  if (t === "") return 0;
  const n = Number(t);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

function formatMoneyInputDisplay(amount: number): string {
  if (!Number.isFinite(amount) || amount === 0) return "";
  return String(Math.round(amount));
}

function normalizeMoneyDraft(raw: string): string {
  const t = raw.replace(/,/g, "").trim();
  if (t === "") return "";
  const digits = t.replace(/\D/g, "");
  if (digits === "") return "";
  const n = parseInt(digits, 10);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(n);
}

function buildRowMetrics(
  row: SalarySheetRow,
  bundle: SalarySheetBundle,
  activeKey: string,
): RowMetrics {
  const payable = totalPayableForRow(row);
  const paid = sumPaymentsForRow(row);
  const rolled = getEmployeeMonthBalance(bundle, activeKey, row.employeeId);
  const stillOwed = rolled?.stillOwed ?? Math.max(0, payable - paid);
  const advanceOut = rolled?.advanceCarriedOut ?? Math.max(0, paid - payable);
  const advanceApplied = rolled?.advanceApplied ?? 0;
  return { row, payable, paid, stillOwed, advanceOut, advanceApplied };
}

function matchesRowFilter(metrics: RowMetrics, filter: RowFilter): boolean {
  if (filter === "all") return true;
  if (filter === "still-owed") {
    return metrics.stillOwed > 0 || metrics.advanceOut > 0;
  }
  return metrics.stillOwed <= 0 && metrics.payable > 0;
}

function compareRows(a: RowMetrics, b: RowMetrics, sort: RowSort): number {
  if (sort === "name") {
    return a.row.name.localeCompare(b.row.name, undefined, { sensitivity: "base" });
  }
  if (sort === "payable") {
    return b.payable - a.payable || a.row.name.localeCompare(b.row.name);
  }
  return (
    b.stillOwed - a.stillOwed ||
    b.payable - a.payable ||
    a.row.name.localeCompare(b.row.name)
  );
}

function rowMatchesSearch(metrics: RowMetrics, query: string): boolean {
  if (!query) return true;
  return metrics.row.name.trim().toLowerCase().includes(query);
}

/** Fixed column widths so money cols stay even and OT/Bonus don't hog space. */
function SalarySheetColGroup() {
  return (
    <colgroup>
      <col className="w-[13%]" />
      <col className="w-[9%]" />
      <col className="w-[7%]" />
      <col className="w-[7%]" />
      <col className="w-[5%]" />
      <col className="w-[8%]" />
      <col className="w-[7%]" />
      <col className="w-[9%]" />
      <col className="w-[8%]" />
      <col className="w-[9%]" />
      <col className="w-[5%]" />
      <col className="w-[5%]" />
    </colgroup>
  );
}

export function SalarySheetPanel({
  doc,
  bundle,
  activeKey,
  monthLabel,
  totals,
  poolDraft,
  employees,
  isSheetLocked,
  saveState,
  onPoolDraftChange,
  onUpdateRow,
  onFlushEdits,
  onOpenHistory,
  onPayoutSaved,
}: {
  doc: SalarySheetDoc;
  bundle: SalarySheetBundle;
  activeKey: string;
  monthLabel: string;
  totals: SalarySheetTotals;
  poolDraft: string;
  employees: { id: string; name: string }[];
  isSheetLocked: boolean;
  saveState: { saving: boolean; error: string | null };
  onPoolDraftChange: (raw: string) => void;
  onUpdateRow: (id: string, patch: Partial<SalarySheetRow>) => void;
  onFlushEdits: () => void;
  onOpenHistory: (row: SalarySheetRow) => void;
  onPayoutSaved?: (result: { dailyEntryDate: string; amount: number; employeeName: string }) => void;
}) {
  const [rowFilter, setRowFilter] = useState<RowFilter>("all");
  const [rowSort, setRowSort] = useState<RowSort>("still-owed-desc");
  const [search, setSearch] = useState("");
  const [payoutTarget, setPayoutTarget] = useState<PayoutModalTarget | null>(null);

  useEffect(() => {
    setRowFilter("all");
    setRowSort("still-owed-desc");
    setSearch("");
  }, [activeKey]);

  const poolAmount = parseMoneyInput(poolDraft);
  const poolDistributed = totals.sc;
  const query = search.trim().toLowerCase();

  const displayRows = useMemo(() => {
    const metrics = doc.rows.map((row) => buildRowMetrics(row, bundle, activeKey));
    return metrics
      .filter((m) => matchesRowFilter(m, rowFilter))
      .filter((m) => rowMatchesSearch(m, query))
      .sort((a, b) => compareRows(a, b, rowSort));
  }, [doc.rows, bundle, activeKey, rowFilter, rowSort, query]);

  const inputMoney = isSheetLocked ? sheetInputLocked : sheetInput;

  function openPayoutModal(row: SalarySheetRow) {
    const target = resolvePayoutTarget(row, employees);
    if (!target) return;
    setPayoutTarget(target);
  }

  function renderMgmtLink(row: SalarySheetRow, display: string, editLabel: string) {
    if (!row.employeeId) {
      return <span>{display}</span>;
    }
    return (
      <button
        type="button"
        onClick={() => dispatchPosSelectLeaf("hr-employees")}
        className="cursor-pointer text-left underline-offset-2 hover:underline"
        aria-label={editLabel}
        title={editLabel}
      >
        {display}
      </button>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-solid [border-color:var(--pos-divider)] px-3 py-2 text-[13px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-[var(--pos-text-1)]">SC pool</span>
          <input
            type="text"
            inputMode="decimal"
            value={poolDraft}
            readOnly={isSheetLocked}
            tabIndex={isSheetLocked ? -1 : undefined}
            onChange={(e) => onPoolDraftChange(e.target.value)}
            onBlur={onFlushEdits}
            placeholder="0"
            className={`${sheetPlainInput} w-[100px] text-right font-mono font-semibold tabular-nums ${isSheetLocked ? "cursor-default opacity-60" : ""}`}
            aria-label="Service charge pool"
          />
          <span className="text-[var(--pos-text-2)]">Distributed</span>
          <span className="font-mono font-semibold tabular-nums text-[var(--pos-text-1)]">
            {formatWhole(poolDistributed)}
            {poolAmount > 0 && poolDistributed !== serviceChargePoolTargetTotal(doc.rows, poolAmount)
              ? ` / ${formatWhole(serviceChargePoolTargetTotal(doc.rows, poolAmount))}`
              : null}
          </span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className={`${sheetPlainInput} min-w-[120px]`}
          />
          <select
            value={rowFilter}
            onChange={(e) => setRowFilter(e.target.value as RowFilter)}
            className={sheetPlainSelect}
            aria-label="Filter rows"
          >
            <option value="all">All</option>
            <option value="still-owed">Due</option>
            <option value="fully-paid">Paid</option>
          </select>
          <select
            value={rowSort}
            onChange={(e) => setRowSort(e.target.value as RowSort)}
            className={sheetPlainSelect}
            aria-label="Sort rows"
          >
            <option value="still-owed-desc">Due (high first)</option>
            <option value="name">Name</option>
            <option value="payable">Payable</option>
          </select>
          <span className="text-[var(--pos-text-2)]">
            {saveState.saving ? (
              "Saving…"
            ) : saveState.error ? (
              <span className="text-red-600 dark:text-red-400">{saveState.error}</span>
            ) : (
              `${displayRows.length} / ${doc.rows.length}`
            )}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        <div className={sheetTableWrap}>
          <table className="w-full min-w-[880px] table-fixed border-collapse">
          <SalarySheetColGroup />
          <thead>
            <tr>
              <th className={sheetTh}>Employee</th>
              <th className={sheetThNum}>Basic</th>
              <th className={sheetThNum}>Overtime</th>
              <th className={sheetThNum}>Bonus</th>
              <th className={`${sheetThNum} px-1`}>SC %</th>
              <th className={sheetThNum}>SC</th>
              <th className={sheetThNum}>Fines</th>
              <th className={sheetThNum}>Payable</th>
              <th className={sheetThNum}>Paid</th>
              <th className={sheetThNum}>Due</th>
              <th className={`${sheetTh} px-1 text-center`}>Pay</th>
              <th className={`${sheetTh} px-1 text-center`}>Action</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 ? (
              <tr>
                <td colSpan={12} className={`${sheetTd} py-6 text-center text-[var(--pos-text-2)]`}>
                  {query
                    ? "No match."
                    : rowFilter === "still-owed"
                      ? "Everyone paid up."
                      : rowFilter === "fully-paid"
                        ? "No fully paid staff."
                        : "No staff."}
                </td>
              </tr>
            ) : (
              displayRows.map((m) => {
                const r = m.row;
                const canPay = resolvePayoutTarget(r, employees) !== null;
                return (
                  <tr key={r.id}>
                    <td className={`${sheetTd} max-w-0 truncate`}>
                      <button
                        type="button"
                        onClick={() => onOpenHistory(r)}
                        className="block max-w-full cursor-pointer truncate text-left underline-offset-2 hover:underline"
                        title={r.name.trim() || undefined}
                      >
                        {r.name.trim() || "—"}
                      </button>
                    </td>
                    <td className={sheetTdNum}>
                      {renderMgmtLink(r, formatWhole(r.basic), `Edit ${r.name} basic in Employee Management`)}
                    </td>
                    <td className={sheetTd}>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatMoneyInputDisplay(r.overtime)}
                        readOnly={isSheetLocked}
                        tabIndex={isSheetLocked ? -1 : undefined}
                        onChange={(e) =>
                          onUpdateRow(r.id, {
                            overtime: parseMoneyInput(normalizeMoneyDraft(e.target.value)),
                          })
                        }
                        onBlur={onFlushEdits}
                        className={inputMoney}
                      />
                    </td>
                    <td className={sheetTd}>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatMoneyInputDisplay(r.eidBonus)}
                        readOnly={isSheetLocked}
                        tabIndex={isSheetLocked ? -1 : undefined}
                        onChange={(e) =>
                          onUpdateRow(r.id, {
                            eidBonus: parseMoneyInput(normalizeMoneyDraft(e.target.value)),
                          })
                        }
                        onBlur={onFlushEdits}
                        className={inputMoney}
                      />
                    </td>
                    <td className={sheetTdNum}>
                      {renderMgmtLink(
                        r,
                        r.pct != null && r.pct > 0 ? String(r.pct) : "—",
                        `Edit ${r.name} SC % in Employee Management`,
                      )}
                    </td>
                    <td className={sheetTd}>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatMoneyInputDisplay(r.serviceCharge)}
                        readOnly={isSheetLocked}
                        tabIndex={isSheetLocked ? -1 : undefined}
                        onChange={(e) =>
                          onUpdateRow(r.id, {
                            serviceCharge: parseMoneyInput(normalizeMoneyDraft(e.target.value)),
                          })
                        }
                        onBlur={onFlushEdits}
                        className={inputMoney}
                        aria-label={`Service charge for ${r.name || "row"}`}
                      />
                    </td>
                    <td className={sheetTd}>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatMoneyInputDisplay(r.fines)}
                        readOnly={isSheetLocked}
                        tabIndex={isSheetLocked ? -1 : undefined}
                        onChange={(e) =>
                          onUpdateRow(r.id, {
                            fines: parseMoneyInput(normalizeMoneyDraft(e.target.value)),
                          })
                        }
                        onBlur={onFlushEdits}
                        className={inputMoney}
                      />
                    </td>
                    <td className={sheetTdNum}>{formatWhole(m.payable)}</td>
                    <td className={sheetTdNum}>{formatWhole(m.paid)}</td>
                    <td
                      className={`${sheetTdNum} ${stillOwedTone(m.payable, m.paid, m.stillOwed, m.advanceOut)}`}
                    >
                      {stillOwedLabel(m.stillOwed, m.advanceOut)}
                    </td>
                    <td className={`${sheetTd} text-center`}>
                      <button
                        type="button"
                        onClick={() => openPayoutModal(r)}
                        disabled={!canPay}
                        className="cursor-pointer text-[16px] underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
                      >
                        Pay
                      </button>
                    </td>
                    <td className={`${sheetTd} text-center`}>
                      <button
                        type="button"
                        onClick={() => onOpenHistory(r)}
                        className="cursor-pointer text-[16px] underline-offset-2 hover:underline"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
            {displayRows.length > 0 ? (
              <tr>
                <td className={`${sheetTdTotal} max-w-0 truncate`}>{monthLabel} total</td>
                <td className={sheetTdNumTotal}>{formatWhole(totals.basic)}</td>
                <td className={sheetTdNumTotal}>{formatWhole(totals.ot)}</td>
                <td className={sheetTdNumTotal}>{formatWhole(totals.eid)}</td>
                <td className={sheetTdNumTotal}>—</td>
                <td className={sheetTdNumTotal}>{formatWhole(totals.sc)}</td>
                <td className={sheetTdNumTotal}>{formatWhole(totals.fines)}</td>
                <td className={sheetTdNumTotal}>{formatWhole(totals.payable)}</td>
                <td className={sheetTdNumTotal}>{formatWhole(totals.paid)}</td>
                <td
                  className={`${sheetTdNumTotal} ${stillOwedTone(totals.payable, totals.paid, totals.stillOwed)}`}
                >
                  {formatWhole(totals.stillOwed)}
                </td>
                <td className={sheetTdTotal} />
                <td className={sheetTdTotal} />
              </tr>
            ) : null}
          </tbody>
        </table>
        </div>
      </div>

      <StaffPayoutModal
        open={payoutTarget !== null}
        onClose={() => setPayoutTarget(null)}
        employeeId={payoutTarget?.employeeId ?? ""}
        employeeName={payoutTarget?.employeeName ?? ""}
        onSaved={(result) => {
          onPayoutSaved?.({
            ...result,
            employeeName: payoutTarget?.employeeName ?? "",
          });
        }}
      />
    </>
  );
}
