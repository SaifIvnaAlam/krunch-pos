import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatDateKeyAsDisplay, formatMonthKeyAsDisplay } from "../../lib/dateDisplay";

type DateRangeCalendarFieldProps = {
  from: string;
  to: string;
  min: string;
  max: string;
  onChange: (from: string, to: string) => void;
};

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

function monthKeyFromDateKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

function shiftMonthKey(monthKey: string, delta: number): string {
  const [ys, ms] = monthKey.split("-");
  const y = Number.parseInt(ys ?? "", 10);
  const m = Number.parseInt(ms ?? "", 10);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return monthKey;
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function daysInMonth(monthKey: string): number {
  const [ys, ms] = monthKey.split("-");
  const y = Number.parseInt(ys ?? "", 10);
  const m = Number.parseInt(ms ?? "", 10);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return 0;
  return new Date(y, m, 0).getDate();
}

function firstWeekday(monthKey: string): number {
  const [ys, ms] = monthKey.split("-");
  const y = Number.parseInt(ys ?? "", 10);
  const m = Number.parseInt(ms ?? "", 10);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return 0;
  return new Date(y, m - 1, 1).getDay();
}

function dateKeyInMonth(monthKey: string, day: number): string {
  return `${monthKey}-${String(day).padStart(2, "0")}`;
}

/** Single-field date range: one calendar, click start then end. */
export function DateRangeCalendarField({
  from,
  to,
  min,
  max,
  onChange,
}: DateRangeCalendarFieldProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => monthKeyFromDateKey(from || min));
  const [pickingStart, setPickingStart] = useState(true);

  useEffect(() => {
    if (!open) return;
    setViewMonth(monthKeyFromDateKey(from || min));
    setPickingStart(true);
  }, [open, from, min]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label =
    from && to
      ? from === to
        ? formatDateKeyAsDisplay(from)
        : `${formatDateKeyAsDisplay(from)} – ${formatDateKeyAsDisplay(to)}`
      : "Select dates";

  const minMonth = monthKeyFromDateKey(min);
  const maxMonth = monthKeyFromDateKey(max);
  const totalDays = daysInMonth(viewMonth);
  const lead = firstWeekday(viewMonth);

  function selectDay(dateKey: string) {
    if (dateKey < min || dateKey > max) return;
    if (pickingStart) {
      onChange(dateKey, dateKey);
      setPickingStart(false);
      return;
    }
    const start = from || dateKey;
    const a = dateKey < start ? dateKey : start;
    const b = dateKey < start ? start : dateKey;
    onChange(a, b);
    setPickingStart(true);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2.5 text-[12px] font-medium text-[var(--pos-text-1)] transition-colors hover:bg-[var(--pos-nav-hover)]/40"
        aria-label="Date range"
        aria-expanded={open}
        aria-haspopup="dialog"
        title={label}
      >
        <Calendar className="size-3.5 shrink-0 text-[var(--pos-text-2)]" strokeWidth={2.25} />
        <span className="whitespace-nowrap tabular-nums">{label}</span>
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Select date range"
          className="absolute right-0 top-full z-30 mt-1 w-[280px] rounded-[10px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between gap-1">
            <button
              type="button"
              disabled={viewMonth <= minMonth}
              onClick={() => setViewMonth((m) => shiftMonthKey(m, -1))}
              className="inline-flex size-7 items-center justify-center rounded-[6px] text-[var(--pos-text-2)] transition-colors hover:bg-[var(--pos-nav-hover)]/50 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Previous month"
            >
              <ChevronLeft className="size-4" strokeWidth={2.25} />
            </button>
            <span className="text-[13px] font-semibold text-[var(--pos-text-1)]">
              {formatMonthKeyAsDisplay(viewMonth)}
            </span>
            <button
              type="button"
              disabled={viewMonth >= maxMonth}
              onClick={() => setViewMonth((m) => shiftMonthKey(m, 1))}
              className="inline-flex size-7 items-center justify-center rounded-[6px] text-[var(--pos-text-2)] transition-colors hover:bg-[var(--pos-nav-hover)]/50 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Next month"
            >
              <ChevronRight className="size-4" strokeWidth={2.25} />
            </button>
          </div>
          <p className="mb-2 text-center text-[11px] text-[var(--pos-text-2)]">
            {pickingStart ? "Select start date" : "Select end date"}
          </p>
          <div className="grid grid-cols-7 gap-0.5 text-center text-[11px]">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-1 font-medium text-[var(--pos-text-2)]">
                {d}
              </div>
            ))}
            {Array.from({ length: lead }, (_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {Array.from({ length: totalDays }, (_, i) => {
              const day = i + 1;
              const dateKey = dateKeyInMonth(viewMonth, day);
              const disabled = dateKey < min || dateKey > max;
              const inRange = Boolean(from && to && dateKey >= from && dateKey <= to);
              const isEnd = dateKey === from || dateKey === to;
              return (
                <button
                  key={dateKey}
                  type="button"
                  disabled={disabled}
                  onClick={() => selectDay(dateKey)}
                  className={`flex size-8 items-center justify-center rounded-[6px] tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                    isEnd
                      ? "bg-[var(--pos-sb-base)] font-semibold text-white"
                      : inRange
                        ? "bg-[color-mix(in_srgb,var(--pos-sb-base)_18%,transparent)] font-medium text-[var(--pos-text-1)]"
                        : "text-[var(--pos-text-1)] hover:bg-[var(--pos-nav-hover)]/50"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
