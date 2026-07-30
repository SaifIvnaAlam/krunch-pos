const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Calendar date in the device timezone (YYYY-MM-DD). */
export function todayDateKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** `dateKey` is YYYY-MM-DD; returns e.g. `09-Apr-2026`. */
export function formatDateKeyAsDisplay(dateKey: string): string {
  const parts = dateKey.split("-").map((x) => Number.parseInt(x, 10));
  const [y, m, d] = parts;
  if (!y || !m || m < 1 || m > 12 || !d || d < 1 || d > 31) return dateKey;
  const mon = MONTH_ABBR[m - 1];
  if (!mon) return dateKey;
  const dd = String(d).padStart(2, "0");
  return `${dd}-${mon}-${y}`;
}

/** `monthKey` is YYYY-MM; returns e.g. `Apr-2026`. */
export function formatMonthKeyAsDisplay(monthKey: string): string {
  const parts = monthKey.split("-").map((x) => Number.parseInt(x, 10));
  const [y, m] = parts;
  if (!y || !m || m < 1 || m > 12) return monthKey;
  const mon = MONTH_ABBR[m - 1];
  if (!mon) return monthKey;
  return `${mon}-${y}`;
}

/** First calendar day of `YYYY-MM` as `YYYY-MM-DD`. */
export function monthStartDateKey(monthKey: string): string {
  return /^\d{4}-\d{2}$/.test(monthKey) ? `${monthKey}-01` : monthKey;
}

/** Last calendar day of `YYYY-MM` as `YYYY-MM-DD`. */
export function monthEndDateKey(monthKey: string): string {
  const parts = monthKey.split("-").map((x) => Number.parseInt(x, 10));
  const [y, m] = parts;
  if (!y || !m || m < 1 || m > 12) return monthKey;
  const last = new Date(y, m, 0).getDate();
  return `${monthKey}-${String(last).padStart(2, "0")}`;
}
