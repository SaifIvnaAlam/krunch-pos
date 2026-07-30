import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  createExpenseCategory,
  deleteExpenseCategory,
  listExpenseCategories,
  updateExpenseCategory,
  type ExpenseCategory,
} from "@/features/payables";
import {
  fieldLabel,
  payBody,
  payHead,
  payShell,
  paySubtitle,
  payTitle,
  primaryBtn,
  secondaryBtn,
  textInput,
} from "./payablesUi";

export function ExpenseCategoriesView() {
  const [rows, setRows] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listExpenseCategories());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load categories.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const add = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await createExpenseCategory(name);
      setNewName("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add category.");
    } finally {
      setBusy(false);
    }
  };

  const rename = async (row: ExpenseCategory, name: string) => {
    if (name.trim() === row.name || !name.trim()) return;
    try {
      await updateExpenseCategory(row.id, { name: name.trim() });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to rename category.");
    }
  };

  const toggleActive = async (row: ExpenseCategory) => {
    try {
      await updateExpenseCategory(row.id, { active: !row.active });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update category.");
    }
  };

  const remove = async (row: ExpenseCategory) => {
    if (!window.confirm(`Delete category "${row.name}"? Expenses keep their record but lose this label.`))
      return;
    try {
      await deleteExpenseCategory(row.id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete category.");
    }
  };

  return (
    <div className={payShell}>
      <div className={payHead}>
        <div>
          <div className={payTitle}>Expense Categories</div>
          <div className={paySubtitle}>Custom labels for grouping expenses in reports.</div>
        </div>
      </div>

      <div className={payBody}>
        <div className="mb-4 flex items-end gap-2">
          <div className="flex-1 max-w-sm">
            <label className={fieldLabel} htmlFor="new-cat">
              New category
            </label>
            <input
              id="new-cat"
              className={textInput}
              value={newName}
              placeholder="e.g. Staff Snacks"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void add();
              }}
            />
          </div>
          <button type="button" className={primaryBtn} disabled={busy || !newName.trim()} onClick={() => void add()}>
            <Plus size={15} /> Add
          </button>
        </div>

        {error ? <p className="mb-3 text-[12px] text-red-600">{error}</p> : null}

        {loading ? (
          <p className={paySubtitle}>Loading…</p>
        ) : rows.length === 0 ? (
          <p className={paySubtitle}>No categories yet. Add one above.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex items-center gap-2 rounded-[10px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)] px-3 py-2"
              >
                <input
                  className={`${textInput} mt-0 flex-1 ${row.active ? "" : "opacity-60"}`}
                  defaultValue={row.name}
                  onBlur={(e) => void rename(row, e.target.value)}
                />
                <button
                  type="button"
                  className={secondaryBtn}
                  onClick={() => void toggleActive(row)}
                  title={row.active ? "Hide from pickers" : "Show in pickers"}
                >
                  {row.active ? "Active" : "Hidden"}
                </button>
                <button type="button" className={secondaryBtn} onClick={() => void remove(row)} aria-label="Delete">
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
