import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import {
  createExpenseCategory,
  listExpenseCategories,
  quickExpense,
  PAYMENT_METHOD_OPTIONS,
  type ExpenseCategory,
  type PaymentMethod,
} from "@/features/payables";
import { todayDateKey } from "../../lib/dateDisplay";
import {
  fieldLabel,
  formatMoney,
  payBody,
  payHead,
  payShell,
  paySubtitle,
  payTitle,
  primaryBtn,
  selectInput,
  textInput,
} from "./payablesUi";

export function QuickExpenseView() {
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [date, setDate] = useState(todayDateKey());
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [total, setTotal] = useState("");
  const [paidFull, setPaidFull] = useState(true);
  const [paidAmount, setPaidAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [transactionId, setTransactionId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  useEffect(() => {
    void listExpenseCategories()
      .then((c) => setCategories(c.filter((x) => x.active)))
      .catch(() => setCategories([]));
  }, []);

  const totalNum = Number.parseFloat(total) || 0;
  const paidNum = paidFull ? totalNum : Number.parseFloat(paidAmount) || 0;

  const submit = async () => {
    if (busy) return;
    setError(null);
    setOkMsg(null);
    if (totalNum <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (paidNum > totalNum) {
      setError("Amount paid cannot exceed the total.");
      return;
    }
    setBusy(true);
    try {
      await quickExpense({
        kind: "other_expense",
        date,
        description: description.trim() || undefined,
        expenseCategoryId: categoryId || undefined,
        total: totalNum,
        paidAmount: paidNum,
        method,
        transactionId: transactionId.trim() || undefined,
        note: note.trim() || undefined,
      });
      setOkMsg(`Saved ${formatMoney(totalNum)} expense (${formatMoney(paidNum)} paid).`);
      setDescription("");
      setTotal("");
      setPaidAmount("");
      setTransactionId("");
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save expense.");
    } finally {
      setBusy(false);
    }
  };

  const addCategoryInline = async () => {
    const name = window.prompt("New category name");
    if (!name?.trim()) return;
    try {
      const created = await createExpenseCategory(name.trim());
      setCategories((prev) => [...prev, created]);
      setCategoryId(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add category.");
    }
  };

  return (
    <div className={payShell}>
      <div className={payHead}>
        <div>
          <div className={payTitle}>Quick Expense</div>
          <div className={paySubtitle}>Record an expense and its payment in one step.</div>
        </div>
      </div>

      <div className={payBody}>
        <div className="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={fieldLabel} htmlFor="qe-date">Date</label>
            <input id="qe-date" type="date" className={textInput} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className={fieldLabel} htmlFor="qe-total">Total amount</label>
            <input
              id="qe-total"
              type="number"
              inputMode="decimal"
              min={0}
              className={textInput}
              value={total}
              placeholder="0"
              onChange={(e) => setTotal(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={fieldLabel} htmlFor="qe-desc">Description</label>
            <input
              id="qe-desc"
              className={textInput}
              value={description}
              placeholder="e.g. Kitchen gas refill"
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={fieldLabel} htmlFor="qe-cat">Category</label>
            <div className="flex gap-2">
              <select id="qe-cat" className={selectInput} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">— none —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button type="button" className={selectInput + " w-auto px-3"} onClick={() => void addCategoryInline()}>
                + New
              </button>
            </div>
          </div>

          <div className="sm:col-span-2 mt-1 flex items-center gap-2">
            <input
              id="qe-paidfull"
              type="checkbox"
              checked={paidFull}
              onChange={(e) => setPaidFull(e.target.checked)}
            />
            <label htmlFor="qe-paidfull" className="text-[13px] text-[var(--pos-text-1)]">
              Paid in full ({formatMoney(totalNum)})
            </label>
          </div>
          {!paidFull ? (
            <div>
              <label className={fieldLabel} htmlFor="qe-paid">Amount paid now</label>
              <input
                id="qe-paid"
                type="number"
                inputMode="decimal"
                min={0}
                className={textInput}
                value={paidAmount}
                placeholder="0"
                onChange={(e) => setPaidAmount(e.target.value)}
              />
            </div>
          ) : null}
          <div>
            <label className={fieldLabel} htmlFor="qe-method">Payment method</label>
            <select id="qe-method" className={selectInput} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {PAYMENT_METHOD_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={fieldLabel} htmlFor="qe-txn">Transaction ID (optional)</label>
            <input id="qe-txn" className={textInput} value={transactionId} onChange={(e) => setTransactionId(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className={fieldLabel} htmlFor="qe-note">Note (optional)</label>
            <input id="qe-note" className={textInput} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        {error ? <p className="mt-3 text-[12px] text-red-600">{error}</p> : null}
        {okMsg ? <p className="mt-3 text-[12px] text-emerald-600 dark:text-emerald-400">{okMsg}</p> : null}

        <div className="mt-4">
          <button type="button" className={primaryBtn} disabled={busy || totalNum <= 0} onClick={() => void submit()}>
            <Zap size={15} /> {busy ? "Saving…" : "Save expense"}
          </button>
        </div>
      </div>
    </div>
  );
}
