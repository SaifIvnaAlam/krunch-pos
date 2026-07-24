import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  fetchExpenseReportSummary,
  type ExpenseReportSummary,
} from "@/features/payables";
import {
  fieldLabel,
  formatMoney,
  payBody,
  payHead,
  payShell,
  paySubtitle,
  payTitle,
  secondaryBtn,
  statCard,
  statLabel,
  statValue,
  textInput,
} from "./payablesUi";
import { sheetTableWrap, sheetTd, sheetTdNum, sheetTh, sheetThNum } from "./salaryUiShared";

export function PayablesDashboardView() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<ExpenseReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchExpenseReportSummary({ from: from || undefined, to: to || undefined }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report.");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={payShell}>
      <div className={payHead}>
        <div>
          <div className={payTitle}>Payables Dashboard</div>
          <div className={paySubtitle}>Total incurred, paid, and still due — including salary.</div>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className={fieldLabel} htmlFor="db-from">From</label>
            <input id="db-from" type="date" className={textInput} value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className={fieldLabel} htmlFor="db-to">To</label>
            <input id="db-to" type="date" className={textInput} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <button type="button" className={secondaryBtn} onClick={() => void load()}>
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>

      <div className={payBody}>
        {error ? <p className="mb-3 text-[12px] text-red-600">{error}</p> : null}
        {loading ? (
          <p className={paySubtitle}>Loading…</p>
        ) : !data ? (
          <p className={paySubtitle}>No data.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className={statCard}>
                <div className={statLabel}>Total incurred</div>
                <div className={statValue}>{formatMoney(data.totals.total)}</div>
              </div>
              <div className={statCard}>
                <div className={statLabel}>Paid</div>
                <div className={`${statValue} text-emerald-700 dark:text-emerald-400`}>{formatMoney(data.totals.paid)}</div>
              </div>
              <div className={statCard}>
                <div className={statLabel}>Still due</div>
                <div className={`${statValue} ${data.totals.due > 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                  {formatMoney(data.totals.due)}
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-[14px] font-semibold text-[var(--pos-text-1)]">By category</h3>
                <div className={sheetTableWrap}>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className={sheetTh}>Category</th>
                        <th className={sheetThNum}>Total</th>
                        <th className={sheetThNum}>Paid</th>
                        <th className={sheetThNum}>Due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byCategory.length === 0 ? (
                        <tr><td className={sheetTd} colSpan={4}>No expenses.</td></tr>
                      ) : (
                        data.byCategory.map((c) => (
                          <tr key={c.key}>
                            <td className={sheetTd}>{c.label}</td>
                            <td className={sheetTdNum}>{formatMoney(c.total)}</td>
                            <td className={sheetTdNum}>{formatMoney(c.paid)}</td>
                            <td className={sheetTdNum}>{formatMoney(c.due)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-[14px] font-semibold text-[var(--pos-text-1)]">By month</h3>
                <div className={sheetTableWrap}>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className={sheetTh}>Month</th>
                        <th className={sheetThNum}>Total</th>
                        <th className={sheetThNum}>Paid</th>
                        <th className={sheetThNum}>Due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byMonth.length === 0 ? (
                        <tr><td className={sheetTd} colSpan={4}>No expenses.</td></tr>
                      ) : (
                        data.byMonth.map((m) => (
                          <tr key={m.month}>
                            <td className={sheetTd}>{m.month}</td>
                            <td className={sheetTdNum}>{formatMoney(m.total)}</td>
                            <td className={sheetTdNum}>{formatMoney(m.paid)}</td>
                            <td className={sheetTdNum}>{formatMoney(m.due)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
