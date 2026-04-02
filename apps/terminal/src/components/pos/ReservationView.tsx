import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Ban,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Pencil,
  Plus,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

const border0 =
  "border-[0.5px] border-solid [border-color:var(--pos-border-hairline)]";

export type ReservationTabId = "schedule" | "blackouts" | "tables";

const TABS: {
  id: ReservationTabId;
  label: string;
  description: string;
}[] = [
  {
    id: "schedule",
    label: "Bookings",
    description: "Calendar, list, and new holds",
  },
  {
    id: "blackouts",
    label: "Closures",
    description: "Days and blocks you do not take reservations",
  },
  {
    id: "tables",
    label: "Floor",
    description: "Table inventory and seating limits",
  },
];

type BookingSource = "phone" | "walk_in" | "web" | "pos";

type DemoBooking = {
  id: string;
  time: string;
  /** Short label for the booking (occasion, party name, etc.) */
  title: string;
  guest: string;
  phone: string;
  /** Number of guests for this reservation (drives day totals in the header) */
  headCount: number;
  /** Assigned or target table / section */
  table: string;
  /** How the booking was received */
  source: BookingSource;
  /** Host-facing notes (allergies, occasion, etc.) */
  notes: string;
  status: "confirmed" | "seated" | "late";
};

function sourceLabel(s: BookingSource): string {
  switch (s) {
    case "walk_in":
      return "Walk-in";
    case "web":
      return "Web";
    case "pos":
      return "POS";
    default:
      return "Phone";
  }
}

function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

function formatDayLabel(d: Date, today: Date): string {
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return "Today";
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

function formatFullDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

const INITIAL_BOOKINGS_BY_OFFSET: Record<number, DemoBooking[]> = {
  0: [
    {
      id: "1",
      time: "5:30 PM",
      title: "Anniversary dinner",
      guest: "Patel party",
      phone: "+1 (416) 555-0142",
      headCount: 6,
      table: "T7",
      source: "phone",
      notes: "Nut allergy — kitchen notified",
      status: "confirmed",
    },
    {
      id: "2",
      time: "6:00 PM",
      title: "Walk-in hold",
      guest: "Walk-in hold",
      phone: "—",
      headCount: 2,
      table: "T2",
      source: "walk_in",
      notes: "—",
      status: "seated",
    },
    {
      id: "3",
      time: "7:15 PM",
      title: "Quiet table",
      guest: "Nguyen",
      phone: "+1 (647) 555-0199",
      headCount: 4,
      table: "T5",
      source: "web",
      notes: "Prefers booth if free",
      status: "confirmed",
    },
    {
      id: "4",
      time: "8:30 PM",
      title: "Acme corporate",
      guest: "Corporate (Acme)",
      phone: "+1 (212) 555-0100",
      headCount: 8,
      table: "Combine",
      source: "pos",
      notes: "Separate checks · AV at 8:15",
      status: "late",
    },
  ],
  1: [
    {
      id: "5",
      time: "6:30 PM",
      title: "Birthday",
      guest: "Kim",
      phone: "+1 (416) 555-0177",
      headCount: 3,
      table: "T3",
      source: "phone",
      notes: "Small cake arriving 6:45",
      status: "confirmed",
    },
  ],
  2: [],
};

type Closure = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  /** Local time of day, `HH:mm` (24h), from `<input type="time" />` */
  startTime: string;
  endTime: string;
  note: string;
};

function closureId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function createInitialClosures(now: Date): Closure[] {
  const y = now.getFullYear();
  return [
    {
      id: "b1",
      title: "Christmas Day",
      startDate: `${y}-12-25`,
      endDate: `${y}-12-25`,
      startTime: "00:00",
      endTime: "23:59",
      note: "Full venue closed",
    },
    {
      id: "b2",
      title: "New Year's Eve",
      startDate: `${y}-12-31`,
      endDate: `${y}-12-31`,
      startTime: "00:00",
      endTime: "23:59",
      note: "Bar service only, no bookings",
    },
    {
      id: "b3",
      title: "Private buyout",
      startDate: `${y}-03-14`,
      endDate: `${y}-03-14`,
      startTime: "16:00",
      endTime: "23:59",
      note: "Evening buyout",
    },
  ];
}

function addCalendarMonths(monthStart: Date, delta: number): Date {
  return new Date(
    monthStart.getFullYear(),
    monthStart.getMonth() + delta,
    1,
  );
}

type MonthCell =
  | { kind: "pad" }
  | { kind: "day"; key: string; date: Date; inMonth: boolean };

function buildMonthGrid(viewMonthStart: Date): MonthCell[] {
  const year = viewMonthStart.getFullYear();
  const month = viewMonthStart.getMonth();
  const first = new Date(year, month, 1);
  const startPad = first.getDay();
  const dim = new Date(year, month + 1, 0).getDate();
  const cells: MonthCell[] = [];
  for (let i = 0; i < startPad; i++) cells.push({ kind: "pad" });
  for (let d = 1; d <= dim; d++) {
    const date = new Date(year, month, d);
    cells.push({ kind: "day", key: toYMD(date), date, inMonth: true });
  }
  while (cells.length % 7 !== 0) cells.push({ kind: "pad" });
  return cells;
}

function closuresTouchingDate(key: string, list: Closure[]): Closure[] {
  return list.filter((c) => c.startDate <= key && c.endDate >= key);
}

function closureIntersectsMonth(c: Closure, monthStart: Date): boolean {
  const y = monthStart.getFullYear();
  const m = monthStart.getMonth();
  const first = toYMD(new Date(y, m, 1));
  const last = toYMD(new Date(y, m + 1, 0));
  return c.startDate <= last && c.endDate >= first;
}

function closureAtLocal(dateYmd: string, timeHm: string): Date {
  const [y, mo, d] = dateYmd.split("-").map(Number);
  const [hh, mm] = timeHm.split(":").map(Number);
  return new Date(y, mo - 1, d, hh || 0, mm || 0, 0, 0);
}

function isAllDayClosure(c: Closure): boolean {
  return c.startTime === "00:00" && c.endTime === "23:59";
}

function formatTimeHmLocale(hm: string): string {
  const [h, m] = hm.split(":").map(Number);
  if (Number.isNaN(h)) return hm;
  return new Date(2000, 0, 1, h, m || 0, 0, 0).toLocaleTimeString(
    undefined,
    { hour: "numeric", minute: "2-digit" },
  );
}

function formatClosureDateOnly(c: Closure): string {
  if (c.startDate === c.endDate) {
    return parseYMDLocal(c.startDate).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  const a = parseYMDLocal(c.startDate).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const b = parseYMDLocal(c.endDate).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${a} – ${b}`;
}

/** Date + time for list and summaries; all-day closures omit clock times. */
function formatClosureWhen(c: Closure): string {
  if (isAllDayClosure(c)) {
    return formatClosureDateOnly(c);
  }
  const t0 = formatTimeHmLocale(c.startTime);
  const t1 = formatTimeHmLocale(c.endTime);
  if (c.startDate === c.endDate) {
    return `${formatClosureDateOnly(c)} · ${t0} – ${t1}`;
  }
  const d0 = parseYMDLocal(c.startDate).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const d1 = parseYMDLocal(c.endDate).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${d0} ${t0} – ${d1} ${t1}`;
}

function parseYMDLocal(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const DEMO_TABLES = [
  { id: "t1", name: "Table 1", seats: 2, zone: "Window", on: true },
  { id: "t2", name: "Table 2", seats: 4, zone: "Main", on: true },
  { id: "t3", name: "Table 3", seats: 4, zone: "Main", on: true },
  { id: "t4", name: "Table 4", seats: 6, zone: "Banquette", on: true },
  { id: "t5", name: "Table 5", seats: 8, zone: "Private", on: true },
  { id: "t6", name: "Bar 1–2", seats: 2, zone: "Bar", on: false },
];

function statusStyles(status: DemoBooking["status"]) {
  switch (status) {
    case "seated":
      return "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/25";
    case "late":
      return "bg-amber-500/12 text-amber-800 dark:text-amber-200 border-amber-500/25";
    default:
      return "bg-[var(--pos-page)] text-[var(--pos-text-2)] [border-color:var(--pos-border-medium)]";
  }
}

function statusLabel(status: DemoBooking["status"]) {
  switch (status) {
    case "seated":
      return "Seated";
    case "late":
      return "Running late";
    default:
      return "Confirmed";
  }
}

export function ReservationView({
  initialTab = "schedule",
  openNewBookingOnMount = false,
}: {
  initialTab?: ReservationTabId;
  openNewBookingOnMount?: boolean;
}) {
  const [tab, setTab] = useState<ReservationTabId>(initialTab);
  const [dayOffset, setDayOffset] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(openNewBookingOnMount);
  const [bookingsByOffset, setBookingsByOffset] = useState<
    Record<number, DemoBooking[]>
  >(() => {
    const copy: Record<number, DemoBooking[]> = {};
    for (const [k, arr] of Object.entries(INITIAL_BOOKINGS_BY_OFFSET)) {
      copy[Number(k)] = arr.map((b) => ({ ...b }));
    }
    return copy;
  });
  const [tables, setTables] = useState(DEMO_TABLES);
  const [closures, setClosures] = useState<Closure[]>(() =>
    createInitialClosures(new Date()),
  );
  const [closureCalMonth, setClosureCalMonth] = useState(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const [closureSheetOpen, setClosureSheetOpen] = useState(false);
  const [closureSelectedDayKey, setClosureSelectedDayKey] = useState<
    string | null
  >(null);
  const [closureFormTitle, setClosureFormTitle] = useState("");
  const [closureFormStart, setClosureFormStart] = useState("");
  const [closureFormEnd, setClosureFormEnd] = useState("");
  const [closureFormStartTime, setClosureFormStartTime] = useState("00:00");
  const [closureFormEndTime, setClosureFormEndTime] = useState("23:59");
  const [closureFormNote, setClosureFormNote] = useState("");
  const [closureFormError, setClosureFormError] = useState("");
  const [closureEditingId, setClosureEditingId] = useState<string | null>(null);
  const [bookingEditingId, setBookingEditingId] = useState<string | null>(null);
  const [bookingFormTitle, setBookingFormTitle] = useState("");
  const [bookingFormGuest, setBookingFormGuest] = useState("");
  const [bookingFormPhone, setBookingFormPhone] = useState("");
  const [bookingFormHeadCount, setBookingFormHeadCount] = useState("2");
  const [bookingFormDateTime, setBookingFormDateTime] = useState("");
  const [bookingFormTable, setBookingFormTable] = useState("Any");
  const [bookingFormNotes, setBookingFormNotes] = useState("");
  const [bookingFormError, setBookingFormError] = useState("");
  const [bookingEditingOffset, setBookingEditingOffset] = useState<number | null>(
    null,
  );
  const bookingDateTimeInputRef = useRef<HTMLInputElement>(null);

  const openBookingDateTimePicker = () => {
    const el = bookingDateTimeInputRef.current;
    if (!el || typeof el.showPicker !== "function") return;
    try {
      void el.showPicker();
    } catch {
      /* Safari / older engines may not support showPicker for datetime-local */
    }
  };

  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => toYMD(today), [today]);
  const closureMonthCells = useMemo(
    () => buildMonthGrid(closureCalMonth),
    [closureCalMonth],
  );
  const closuresInViewMonth = useMemo(
    () => closures.filter((c) => closureIntersectsMonth(c, closureCalMonth)),
    [closures, closureCalMonth],
  );
  const visibleDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(today, i));
  }, [today]);

  const selectedDate = addDays(today, dayOffset);
  const bookings = bookingsByOffset[dayOffset] ?? [];
  const totalHeadCount = bookings.reduce((s, b) => s + b.headCount, 0);

  const updateBookingStatus = (
    offset: number,
    id: string,
    status: DemoBooking["status"],
  ) => {
    setBookingsByOffset((prev) => ({
      ...prev,
      [offset]: (prev[offset] ?? []).map((b) =>
        b.id === id ? { ...b, status } : b,
      ),
    }));
  };

  const formatHmToDisplay = (hm: string): string => {
    const [hh, mm] = hm.split(":").map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return hm;
    return new Date(2000, 0, 1, hh, mm, 0, 0).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const parseDisplayTimeToHm = (display: string): string => {
    const raw = display.trim();
    const m = raw.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
    if (m) {
      let hh = Number.parseInt(m[1], 10);
      const mm = Number.parseInt(m[2], 10);
      const ap = m[3].toUpperCase();
      if (Number.isFinite(hh) && Number.isFinite(mm)) {
        if (ap === "PM" && hh < 12) hh += 12;
        if (ap === "AM" && hh === 12) hh = 0;
        return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
      }
    }
    const d = new Date(`2000-01-01 ${raw}`);
    if (!Number.isNaN(d.getTime())) {
      return `${String(d.getHours()).padStart(2, "0")}:${String(
        d.getMinutes(),
      ).padStart(2, "0")}`;
    }
    return "18:30";
  };

  const ymdHmForOffset = (offset: number, hm: string): string => {
    const date = addDays(today, offset);
    const day = toYMD(date);
    return `${day}T${hm}`;
  };

  const parseDateTimeLocal = (
    value: string,
  ): { offset: number; hm: string } | null => {
    if (!value) return null;
    const [datePart, timePart] = value.split("T");
    if (!datePart || !timePart) return null;
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, minute] = timePart.split(":").map(Number);
    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      !Number.isFinite(day) ||
      !Number.isFinite(hour) ||
      !Number.isFinite(minute)
    ) {
      return null;
    }
    const picked = new Date(year, month - 1, day);
    const baseToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const msPerDay = 24 * 60 * 60 * 1000;
    const offset = Math.round((picked.getTime() - baseToday.getTime()) / msPerDay);
    return {
      offset,
      hm: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    };
  };

  const closeBookingSheet = () => {
    setSheetOpen(false);
    setBookingEditingId(null);
    setBookingEditingOffset(null);
    setBookingFormError("");
  };

  const openBookingSheet = () => {
    setBookingEditingId(null);
    setBookingFormTitle("");
    setBookingFormGuest("");
    setBookingFormPhone("");
    setBookingFormHeadCount("2");
    setBookingFormDateTime(ymdHmForOffset(dayOffset, "18:30"));
    setBookingFormTable("Any");
    setBookingFormNotes("");
    setBookingFormError("");
    setSheetOpen(true);
  };

  const openBookingSheetForEdit = (b: DemoBooking) => {
    setBookingEditingId(b.id);
    setBookingEditingOffset(dayOffset);
    setBookingFormTitle(b.title);
    setBookingFormGuest(b.guest);
    setBookingFormPhone(b.phone === "—" ? "" : b.phone);
    setBookingFormHeadCount(String(Math.max(1, b.headCount)));
    setBookingFormDateTime(ymdHmForOffset(dayOffset, parseDisplayTimeToHm(b.time)));
    setBookingFormTable(b.table || "Any");
    setBookingFormNotes(b.notes === "—" ? "" : b.notes);
    setBookingFormError("");
    setSheetOpen(true);
  };

  const saveBooking = () => {
    const guest = bookingFormGuest.trim();
    if (!guest) {
      setBookingFormError("Guest name is required.");
      return;
    }
    const headCount = Number.parseInt(bookingFormHeadCount, 10);
    if (Number.isNaN(headCount) || headCount < 1) {
      setBookingFormError("Head count must be at least 1.");
      return;
    }
    const dateTime = parseDateTimeLocal(bookingFormDateTime);
    if (!dateTime) {
      setBookingFormError("Pick a date and time.");
      return;
    }
    const phone = bookingFormPhone.trim() || "—";
    const notes = bookingFormNotes.trim() || "—";
    const title = bookingFormTitle.trim() || guest;
    const row: DemoBooking = {
      id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      time: formatHmToDisplay(dateTime.hm),
      title,
      guest,
      phone,
      headCount,
      table: bookingFormTable,
      source: "phone",
      notes,
      status: "confirmed",
    };
    if (bookingEditingId) {
      const fromOffset = bookingEditingOffset ?? dayOffset;
      const toOffset = dateTime.offset;
      setBookingsByOffset((prev) => {
        const next = { ...prev };
        const updatedBooking = {
          ...row,
          id: bookingEditingId,
        };
        if (fromOffset === toOffset) {
          next[toOffset] = (next[toOffset] ?? []).map((existing) =>
            existing.id === bookingEditingId ? updatedBooking : existing,
          );
          return next;
        }
        next[fromOffset] = (next[fromOffset] ?? []).filter(
          (existing) => existing.id !== bookingEditingId,
        );
        next[toOffset] = [...(next[toOffset] ?? []), updatedBooking];
        return next;
      });
    } else {
      setBookingsByOffset((prev) => ({
        ...prev,
        [dateTime.offset]: [...(prev[dateTime.offset] ?? []), row],
      }));
    }
    closeBookingSheet();
  };

  const closeClosureSheet = () => {
    const fallback = closureSelectedDayKey ?? todayKey;
    setClosureSheetOpen(false);
    setClosureEditingId(null);
    setClosureFormTitle("");
    setClosureFormStart(fallback);
    setClosureFormEnd(fallback);
    setClosureFormStartTime("00:00");
    setClosureFormEndTime("23:59");
    setClosureFormNote("");
    setClosureFormError("");
  };

  const openClosureSheet = () => {
    const fallback = closureSelectedDayKey ?? todayKey;
    setClosureEditingId(null);
    setClosureFormTitle("");
    setClosureFormStart(fallback);
    setClosureFormEnd(fallback);
    setClosureFormStartTime("00:00");
    setClosureFormEndTime("23:59");
    setClosureFormNote("");
    setClosureFormError("");
    setClosureSheetOpen(true);
  };

  const openClosureSheetForEdit = (c: Closure) => {
    setClosureEditingId(c.id);
    setClosureFormTitle(c.title);
    setClosureFormStart(c.startDate);
    setClosureFormEnd(c.endDate);
    setClosureFormStartTime(c.startTime);
    setClosureFormEndTime(c.endTime);
    setClosureFormNote(c.note);
    setClosureFormError("");
    setClosureSheetOpen(true);
  };

  const saveClosure = () => {
    const title = closureFormTitle.trim();
    if (!title) {
      setClosureFormError("Add a short title for this closure.");
      return;
    }
    let start = closureFormStart;
    let end = closureFormEnd.trim() || start;
    if (!start) {
      setClosureFormError("Pick a start date.");
      return;
    }
    if (end < start) {
      const td = start;
      start = end;
      end = td;
    }
    const st = closureFormStartTime || "00:00";
    const et = closureFormEndTime || "23:59";
    const startAt = closureAtLocal(start, st);
    const endAt = closureAtLocal(end, et);
    if (endAt.getTime() < startAt.getTime()) {
      setClosureFormError(
        "End date and time must be the same as or after start.",
      );
      return;
    }
    const note = closureFormNote.trim();
    if (closureEditingId) {
      setClosures((prev) =>
        prev.map((row) =>
          row.id === closureEditingId
            ? {
                ...row,
                title,
                startDate: start,
                endDate: end,
                startTime: st,
                endTime: et,
                note,
              }
            : row,
        ),
      );
    } else {
      setClosures((prev) => [
        ...prev,
        {
          id: closureId(),
          title,
          startDate: start,
          endDate: end,
          startTime: st,
          endTime: et,
          note,
        },
      ]);
    }
    closeClosureSheet();
  };

  const removeClosure = (id: string) => {
    setClosures((prev) => prev.filter((c) => c.id !== id));
  };

  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 space-y-4 pb-4 pr-1">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium tracking-[0.06em] text-[var(--pos-text-2)]">
              Operations / Reservations
            </p>
            <h1 className="mt-0.5 text-[clamp(1.12rem,1.9vw,1.35rem)] font-semibold tracking-[-0.02em] text-[var(--pos-text-1)]">
              Reservations
            </h1>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Reservation sections"
          className="mx-auto grid w-full max-w-[420px] grid-cols-3 gap-1 rounded-[12px] bg-black p-1"
        >
          {TABS.map((t) => {
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(t.id)}
                className={`flex min-w-0 items-center justify-center rounded-[8px] px-3 py-2 text-center transition-colors ${
                  on
                    ? "bg-white text-black"
                    : "text-white/85 hover:bg-white/10"
                }`}
              >
                <span className="text-[14px] font-semibold tracking-[-0.01em]">
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
        {tab === "schedule" ? (
          <div className="space-y-4 pb-28">
            <div
              className={`flex flex-col gap-1.5 rounded-[10px] bg-[var(--pos-card)] px-2.5 py-2 ${border0}`}
            >
              <div className="flex min-w-0 items-baseline justify-between gap-2 px-0.5">
                <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--pos-text-2)]">
                  Pick a date
                </span>
                <span className="truncate text-right font-mono text-[10px] text-[var(--pos-text-2)]">
                  {formatFullDate(selectedDate)}
                </span>
              </div>
              <div className="flex gap-1 overflow-x-auto">
                {visibleDays.map((d, i) => {
                  const on = i === dayOffset;
                  return (
                    <button
                      key={d.toISOString()}
                      type="button"
                      onClick={() => setDayOffset(i)}
                      className={`flex min-w-[2.625rem] shrink-0 flex-col items-center rounded-[8px] border border-solid px-1.5 py-1 transition-colors ${
                        on
                          ? "border-[var(--pos-text-1)] bg-[var(--pos-page)] text-[var(--pos-text-1)]"
                          : `${border0} bg-transparent text-[var(--pos-text-2)] hover:[border-color:var(--pos-border-strong)]`
                      }`}
                    >
                      <span className="text-[8px] font-semibold uppercase leading-none tracking-wide opacity-75">
                        {formatDayLabel(d, today)}
                      </span>
                      <span className="mt-0.5 font-mono text-[13px] font-semibold leading-none tabular-nums">
                        {d.getDate()}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-medium text-[var(--pos-text-1)]">
                  {bookings.length} reservation{bookings.length === 1 ? "" : "s"}
                </p>
                <p className="text-[12px] text-[var(--pos-text-2)]">
                  {totalHeadCount} guests seated or expected
                </p>
              </div>
            </div>

            {bookings.length === 0 ? (
              <div
                className={`rounded-[14px] border border-dashed border-[var(--pos-border-medium)] bg-[var(--pos-card)]/60 px-6 py-14 text-center ${border0}`}
              >
                <CalendarDays
                  className="mx-auto size-10 text-[var(--pos-icon-muted)]"
                  strokeWidth={1.25}
                  aria-hidden
                />
                <p className="mt-4 text-[14px] font-medium text-[var(--pos-text-1)]">
                  Quiet on this day
                </p>
                <p className="mx-auto mt-1 max-w-sm text-[13px] text-[var(--pos-text-2)]">
                  Add a hold when someone calls, or open online booking once you
                  connect the API.
                </p>
                <button
                  type="button"
                  onClick={openBookingSheet}
                  className="mt-6 inline-flex h-10 items-center gap-2 rounded-[10px] bg-[var(--pos-primary-bg)] px-4 text-[13px] font-semibold text-[var(--pos-primary-fg)] transition-colors hover:bg-[var(--pos-primary-hover)]"
                >
                  <Plus className="size-4" strokeWidth={2} aria-hidden />
                  New booking
                </button>
              </div>
            ) : (
              <div
                className={`overflow-hidden rounded-[14px] bg-[var(--pos-card)] ${border0}`}
              >
                <div className="overflow-x-hidden">
                  <table className="w-full min-w-0 table-fixed border-collapse text-left text-[12px]">
                    <thead>
                      <tr className="border-b border-solid [border-color:var(--pos-divider)] bg-[var(--pos-page)]/50">
                        <th
                          scope="col"
                          className="w-[9%] min-w-0 whitespace-nowrap px-2 py-1.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--pos-text-2)] sm:px-2.5 sm:py-2"
                        >
                          Time
                        </th>
                        <th
                          scope="col"
                          className="w-[5%] min-w-0 whitespace-nowrap px-2 py-1.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--pos-text-2)] sm:px-2.5 sm:py-2"
                        >
                          Table
                        </th>
                        <th
                          scope="col"
                          className="w-[5%] min-w-0 whitespace-nowrap px-2 py-1.5 text-center text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--pos-text-2)] sm:px-2.5 sm:py-2"
                        >
                          Guests
                        </th>
                        <th
                          scope="col"
                          className="w-[20%] min-w-0 px-2 py-1.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--pos-text-2)] sm:px-2.5 sm:py-2"
                        >
                          Title
                        </th>
                        <th
                          scope="col"
                          className="w-[14%] min-w-0 px-2 py-1.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--pos-text-2)] sm:px-2.5 sm:py-2"
                        >
                          Mobile
                        </th>
                        <th
                          scope="col"
                          className="w-[10%] min-w-0 whitespace-nowrap px-2 py-1.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--pos-text-2)] sm:px-2.5 sm:py-2"
                        >
                          Source
                        </th>
                        <th
                          scope="col"
                          className="w-[23%] min-w-0 px-2 py-1.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--pos-text-2)] sm:px-2.5 sm:py-2"
                        >
                          Notes
                        </th>
                        <th
                          scope="col"
                          className="w-[14%] min-w-0 whitespace-nowrap px-2 py-1.5 pl-1.5 pr-2 text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--pos-text-2)] sm:px-2.5 sm:py-2 sm:pl-2 sm:pr-2"
                        >
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {bookings.map((b) => (
                        <tr
                          key={b.id}
                          className="cursor-pointer border-b border-solid [border-color:var(--pos-divider)] transition-colors hover:bg-[var(--pos-nav-hover)]/30 last:border-b-0"
                          onClick={() => openBookingSheetForEdit(b)}
                        >
                          <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[12px] font-semibold tabular-nums text-[var(--pos-text-1)] sm:px-2.5 sm:py-2">
                            {b.time}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[12px] text-[var(--pos-text-1)] sm:px-2.5 sm:py-2">
                            {b.table}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-center font-mono text-[12px] tabular-nums text-[var(--pos-text-1)] sm:px-2.5 sm:py-2">
                            {b.headCount}
                          </td>
                          <td className="min-w-0 px-2 py-1.5 text-[var(--pos-text-1)] sm:px-2.5 sm:py-2">
                            <div className="min-w-0">
                              <p className="line-clamp-2 font-medium leading-snug">
                                {b.title.trim() || b.guest}
                              </p>
                              {b.title.trim() && b.title.trim() !== b.guest ? (
                                <p className="mt-0.5 flex min-w-0 items-center gap-1 text-[10px] leading-tight text-[var(--pos-text-2)]">
                                  <UserRound
                                    className="size-3 shrink-0 text-[var(--pos-icon-muted)]"
                                    strokeWidth={2}
                                    aria-hidden
                                  />
                                  <span className="min-w-0 truncate">{b.guest}</span>
                                </p>
                              ) : null}
                            </div>
                          </td>
                          <td className="min-w-0 truncate whitespace-nowrap px-2 py-1.5 font-mono text-[11px] text-[var(--pos-text-2)] sm:px-2.5 sm:py-2">
                            {b.phone}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 sm:px-2.5 sm:py-2">
                            <span
                              className={`inline-block rounded-full border border-solid px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide ${
                                b.source === "walk_in"
                                  ? "border-violet-500/25 bg-violet-500/10 text-violet-800 dark:text-violet-200"
                                  : b.source === "web"
                                    ? "border-sky-500/25 bg-sky-500/10 text-sky-900 dark:text-sky-200"
                                    : b.source === "pos"
                                      ? "border-[var(--pos-border-medium)] bg-[var(--pos-page)] text-[var(--pos-text-2)]"
                                      : "border-emerald-500/20 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200"
                              }`}
                            >
                              {sourceLabel(b.source)}
                            </span>
                          </td>
                          <td
                            className="min-w-0 px-2 py-1.5 text-[11px] text-[var(--pos-text-2)] sm:px-2.5 sm:py-2"
                            title={
                              b.notes !== "—" ? b.notes : undefined
                            }
                          >
                            <span className="line-clamp-2">{b.notes}</span>
                          </td>
                          <td className="min-w-0 px-1.5 py-1 sm:px-2 sm:py-1.5">
                            <select
                              aria-label={`Status for ${b.title.trim() || b.guest}`}
                              value={b.status}
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                              onChange={(e) =>
                                updateBookingStatus(
                                  dayOffset,
                                  b.id,
                                  e.target.value as DemoBooking["status"],
                                )
                              }
                              className={`h-8 w-full min-w-0 cursor-pointer rounded-[6px] border border-solid bg-[var(--pos-input-bg)] px-1.5 text-[11px] font-semibold outline-none transition-[box-shadow,border-color] focus:border-[var(--pos-text-1)] focus:ring-1 focus:ring-[var(--pos-text-1)]/20 ${statusStyles(b.status)}`}
                            >
                              <option value="confirmed">
                                {statusLabel("confirmed")}
                              </option>
                              <option value="seated">
                                {statusLabel("seated")}
                              </option>
                              <option value="late">{statusLabel("late")}</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {tab === "blackouts" ? (
          <div className="space-y-4 pb-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="max-w-md text-[13px] leading-relaxed text-[var(--pos-text-2)]">
                Closed days show on the calendar. Add a range for holidays,
                buyouts, or maintenance — demo data stays on this device only.
              </p>
              <button
                type="button"
                onClick={openClosureSheet}
                className="inline-flex shrink-0 items-center gap-2 rounded-[10px] bg-[var(--pos-primary-bg)] px-4 py-2.5 text-[13px] font-semibold text-[var(--pos-primary-fg)] shadow-sm transition-colors hover:bg-[var(--pos-primary-hover)]"
              >
                <Ban className="size-4 opacity-90" strokeWidth={2} aria-hidden />
                Add closure
              </button>
            </div>

            <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-5 lg:gap-6">
              <div
                className={`shrink-0 rounded-[14px] bg-[var(--pos-card)] p-2.5 sm:p-3 md:sticky md:top-4 md:self-start ${border0}`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 className="text-[13px] font-semibold text-[var(--pos-text-1)] sm:text-[14px]">
                    {closureCalMonth.toLocaleDateString(undefined, {
                      month: "long",
                      year: "numeric",
                    })}
                  </h2>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        setClosureCalMonth((m) => addCalendarMonths(m, -1))
                      }
                      className="flex size-7 items-center justify-center rounded-[8px] border border-solid [border-color:var(--pos-border-medium)] text-[var(--pos-text-1)] transition-colors hover:bg-[var(--pos-nav-hover)] sm:size-8"
                      aria-label="Previous month"
                    >
                      <ChevronLeft className="size-3.5 sm:size-4" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const t = new Date();
                        setClosureCalMonth(
                          new Date(t.getFullYear(), t.getMonth(), 1),
                        );
                        setClosureSelectedDayKey(null);
                      }}
                      className="px-1.5 py-1 text-[10px] font-semibold text-[var(--pos-text-2)] underline-offset-2 hover:text-[var(--pos-text-1)] hover:underline sm:text-[11px]"
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setClosureCalMonth((m) => addCalendarMonths(m, 1))
                      }
                      className="flex size-7 items-center justify-center rounded-[8px] border border-solid [border-color:var(--pos-border-medium)] text-[var(--pos-text-1)] transition-colors hover:bg-[var(--pos-nav-hover)] sm:size-8"
                      aria-label="Next month"
                    >
                      <ChevronRight className="size-3.5 sm:size-4" strokeWidth={2} />
                    </button>
                  </div>
                </div>

                <div className="mx-auto grid w-full max-w-[12.5rem] grid-cols-7 gap-x-0.5 gap-y-0.5 sm:max-w-[14rem]">
                  {weekdayLabels.map((w) => (
                    <div
                      key={w}
                      className="pb-0.5 text-center text-[7px] font-semibold uppercase tracking-wide text-[var(--pos-text-2)] sm:text-[8px]"
                    >
                      {w}
                    </div>
                  ))}
                  {closureMonthCells.map((cell, idx) => {
                    if (cell.kind === "pad") {
                      return (
                        <div
                          key={`pad-${idx}`}
                          className="aspect-square min-h-0 w-full"
                        />
                      );
                    }
                    const { key, date } = cell;
                    const onDay = closuresTouchingDate(key, closures);
                    const hasClosure = onDay.length > 0;
                    const isToday = key === todayKey;
                    const isSelected = closureSelectedDayKey === key;
                    const closureCell =
                      "border-rose-600/35 bg-rose-500 text-white hover:bg-rose-600 dark:border-rose-400/45 dark:bg-rose-600 dark:hover:bg-rose-500";
                    const closureSelectedCell =
                      "border-[var(--pos-text-1)] bg-rose-600 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)] hover:bg-rose-600 dark:bg-rose-500 dark:hover:bg-rose-500";
                    const closureTodayCell =
                      "border-rose-700/60 bg-rose-500 text-white ring-1 ring-rose-300/90 ring-offset-0 dark:border-rose-300/50 dark:bg-rose-600 dark:ring-rose-400/60";
                    let dayCellClass: string;
                    if (hasClosure) {
                      if (isSelected) dayCellClass = closureSelectedCell;
                      else if (isToday) dayCellClass = closureTodayCell;
                      else dayCellClass = closureCell;
                    } else if (isSelected) {
                      dayCellClass =
                        "border-[var(--pos-text-1)] bg-[var(--pos-page)] text-[var(--pos-text-1)]";
                    } else if (isToday) {
                      dayCellClass = `${border0} bg-[var(--pos-nav-hover)]/50 text-[var(--pos-text-1)]`;
                    } else {
                      dayCellClass = `${border0} text-[var(--pos-text-1)] hover:bg-[var(--pos-nav-hover)]/40`;
                    }
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() =>
                          setClosureSelectedDayKey((prev) =>
                            prev === key ? null : key,
                          )
                        }
                        className={`relative flex aspect-square min-h-0 w-full flex-col items-center justify-center rounded-[6px] border border-solid text-[10px] font-medium transition-colors sm:text-[11px] ${dayCellClass}`}
                      >
                        <span className="font-mono tabular-nums leading-none">
                          {date.getDate()}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-solid [border-color:var(--pos-divider)] pt-3 text-[11px] text-[var(--pos-text-2)]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-3 shrink-0 rounded-[4px] border border-rose-600/35 bg-rose-500 dark:border-rose-400/45 dark:bg-rose-600" />
                    Has closure
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-3 rounded-[4px] bg-[var(--pos-nav-hover)]/80" />
                    Today
                  </span>
                </div>
              </div>

              <div className="min-h-0 min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--pos-text-2)]">
                    {closureSelectedDayKey
                      ? `Closures on ${parseYMDLocal(closureSelectedDayKey).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}`
                      : `All closures in ${closureCalMonth.toLocaleDateString(undefined, { month: "long" })}`}
                  </h3>
                  {closureSelectedDayKey ? (
                    <button
                      type="button"
                      onClick={() => setClosureSelectedDayKey(null)}
                      className="text-[10px] font-medium text-[var(--pos-text-2)] underline-offset-2 hover:text-[var(--pos-text-1)] hover:underline"
                    >
                      Show month
                    </button>
                  ) : null}
                </div>
                <ul className="space-y-1 pr-0.5">
                  {(closureSelectedDayKey
                    ? closuresTouchingDate(closureSelectedDayKey, closures)
                    : closuresInViewMonth
                  ).length === 0 ? (
                    <li
                      className={`rounded-[10px] border border-dashed border-[var(--pos-border-medium)] px-3 py-4 text-center text-[12px] text-[var(--pos-text-2)] sm:py-5 ${border0}`}
                    >
                      {closureSelectedDayKey
                        ? "No closures on this date."
                        : "No closures in this month."}
                      <button
                        type="button"
                        onClick={openClosureSheet}
                        className="mt-2 block w-full text-[12px] font-semibold text-[var(--pos-text-1)] underline-offset-2 hover:underline"
                      >
                        Add one
                      </button>
                    </li>
                  ) : (
                    (closureSelectedDayKey
                      ? closuresTouchingDate(closureSelectedDayKey, closures)
                      : closuresInViewMonth
                    ).map((c) => (
                      <li
                        key={c.id}
                        className={`flex items-center gap-2 rounded-[10px] bg-[var(--pos-card)] px-2.5 py-2 sm:px-3 ${border0}`}
                      >
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-[7px] bg-rose-500/12 text-rose-700 dark:text-rose-300">
                          <Ban className="size-3" strokeWidth={2} aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium leading-tight text-[var(--pos-text-1)]">
                            {c.title}
                          </p>
                          <div className="mt-0.5 flex items-center justify-between gap-2">
                            <span className="min-w-0 flex-1 truncate font-mono text-[10px] leading-none text-[var(--pos-text-2)]">
                              {formatClosureWhen(c)}
                            </span>
                            {c.note ? (
                              <span className="max-w-[42%] shrink-0 truncate text-right text-[10px] leading-none text-[var(--pos-text-2)]">
                                {c.note}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => openClosureSheetForEdit(c)}
                            className="flex size-7 items-center justify-center rounded-[7px] text-[var(--pos-text-2)] transition-colors hover:bg-[var(--pos-page)] hover:text-[var(--pos-text-1)]"
                            aria-label={`Edit ${c.title}`}
                          >
                            <Pencil className="size-3" strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeClosure(c.id)}
                            className="flex size-7 items-center justify-center rounded-[7px] text-[var(--pos-text-2)] transition-colors hover:bg-[var(--pos-page)] hover:text-red-600 dark:hover:text-red-400"
                            aria-label={`Remove ${c.title}`}
                          >
                            <Trash2 className="size-3" strokeWidth={2} />
                          </button>
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          </div>
        ) : null}

        {tab === "tables" ? (
          <div className="space-y-4 pb-8">
            <p className="text-[13px] leading-relaxed text-[var(--pos-text-2)]">
              Tables here drive max head count and what the floor shows to
              servers. Demo data only.
            </p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
              {tables.map((tbl) => (
                <div
                  key={tbl.id}
                  className={`flex flex-col rounded-[14px] bg-[var(--pos-card)] p-4 ${border0}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <LayoutGrid
                        className="size-4 text-[var(--pos-icon-muted)]"
                        strokeWidth={2}
                        aria-hidden
                      />
                      <span className="text-[14px] font-semibold text-[var(--pos-text-1)]">
                        {tbl.name}
                      </span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={tbl.on}
                      onClick={() =>
                        setTables((rows) =>
                          rows.map((r) =>
                            r.id === tbl.id ? { ...r, on: !r.on } : r,
                          ),
                        )
                      }
                      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                        tbl.on
                          ? "bg-[var(--pos-primary-bg)]"
                          : "bg-[var(--pos-border-medium)]"
                      }`}
                    >
                      <span
                        className={`absolute left-1 top-1 block size-4 rounded-full bg-white shadow transition-transform duration-200 ${
                          tbl.on ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                  <p className="mt-2 text-[12px] text-[var(--pos-text-2)]">
                    {tbl.seats} seats · {tbl.zone}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {tab === "schedule" ? (
        <button
          type="button"
          onClick={openBookingSheet}
          className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] right-[calc(1.5rem+env(safe-area-inset-right,0px))] z-30 flex size-16 min-h-16 min-w-16 shrink-0 items-center justify-center rounded-full bg-[var(--pos-primary-bg)] text-[var(--pos-primary-fg)] shadow-[0_4px_18px_rgba(0,0,0,0.22)] transition-[transform,box-shadow,background-color] hover:bg-[var(--pos-primary-hover)] hover:shadow-[0_8px_26px_rgba(0,0,0,0.26)] active:scale-[0.96]"
          aria-label="New booking"
        >
          <Plus className="size-8" strokeWidth={2.25} aria-hidden />
        </button>
      ) : null}

      <AnimatePresence>
        {sheetOpen ? (
          <motion.div
            className="fixed inset-0 z-40 flex items-end justify-center sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
              aria-label="Close"
              onClick={closeBookingSheet}
            />
            <motion.div
              initial={{ y: 48, opacity: 0.96 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 32, opacity: 0 }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className={`relative z-10 flex max-h-[min(90dvh,720px)] w-full max-w-[min(calc(100vw-1.5rem),720px)] flex-col rounded-t-[22px] bg-[var(--pos-card)] shadow-2xl sm:rounded-[22px] ${border0} [border-width:1px]`}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-solid [border-color:var(--pos-divider)] px-5 py-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--pos-text-2)]">
                    {bookingEditingId ? "Edit hold" : "New hold"}
                  </p>
                  <h2 className="mt-0.5 text-[17px] font-semibold text-[var(--pos-text-1)]">
                    Booking
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={closeBookingSheet}
                  className="flex size-9 items-center justify-center rounded-[10px] border border-solid [border-color:var(--pos-border-medium)] text-[var(--pos-text-1)] transition-colors hover:[border-color:var(--pos-text-1)]"
                  aria-label="Close"
                >
                  <X className="size-4" strokeWidth={2} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2.5">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                      Reservation title
                    </span>
                    <input
                      type="text"
                      value={bookingFormTitle}
                      onChange={(e) => {
                        setBookingFormTitle(e.target.value);
                        if (bookingFormError) setBookingFormError("");
                      }}
                      placeholder="e.g. Anniversary dinner, Corporate lunch"
                      className="h-10 w-full rounded-[10px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2.5 text-[13px] text-[var(--pos-text-1)] placeholder:text-[var(--pos-icon-muted)] focus:border-[var(--pos-text-1)] focus:outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                      Guest name
                    </span>
                    <input
                      type="text"
                      value={bookingFormGuest}
                      onChange={(e) => {
                        setBookingFormGuest(e.target.value);
                        if (bookingFormError) setBookingFormError("");
                      }}
                      placeholder="e.g. Rivera"
                      className="h-10 w-full rounded-[10px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2.5 text-[13px] text-[var(--pos-text-1)] placeholder:text-[var(--pos-icon-muted)] focus:border-[var(--pos-text-1)] focus:outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                      Phone
                    </span>
                    <input
                      type="tel"
                      value={bookingFormPhone}
                      onChange={(e) => setBookingFormPhone(e.target.value)}
                      placeholder="Optional"
                      className="h-10 w-full rounded-[10px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2.5 text-[13px] text-[var(--pos-text-1)] placeholder:text-[var(--pos-icon-muted)] focus:border-[var(--pos-text-1)] focus:outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                      Head count
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={bookingFormHeadCount}
                      onChange={(e) => {
                        setBookingFormHeadCount(e.target.value);
                        if (bookingFormError) setBookingFormError("");
                      }}
                      className="h-10 w-full rounded-[10px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2.5 font-mono text-[13px] text-[var(--pos-text-1)] focus:border-[var(--pos-text-1)] focus:outline-none"
                    />
                  </label>
                  <label
                    htmlFor="booking-datetime"
                    className="block cursor-pointer"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).tagName === "SPAN") {
                        e.preventDefault();
                        bookingDateTimeInputRef.current?.focus();
                        openBookingDateTimePicker();
                      }
                    }}
                  >
                    <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                      Date & time
                    </span>
                    <input
                      ref={bookingDateTimeInputRef}
                      id="booking-datetime"
                      type="datetime-local"
                      value={bookingFormDateTime}
                      onChange={(e) => {
                        setBookingFormDateTime(e.target.value);
                        if (bookingFormError) setBookingFormError("");
                      }}
                      onClick={() => openBookingDateTimePicker()}
                      className="h-10 w-full cursor-pointer rounded-[10px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2.5 font-mono text-[13px] text-[var(--pos-text-1)] focus:border-[var(--pos-text-1)] focus:outline-none"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                      Table preference
                    </span>
                    <select
                      value={bookingFormTable}
                      onChange={(e) => setBookingFormTable(e.target.value)}
                      className="h-10 w-full rounded-[10px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2.5 text-[13px] text-[var(--pos-text-1)] focus:border-[var(--pos-text-1)] focus:outline-none"
                    >
                      <option>Any</option>
                      <option>Window</option>
                      <option>Quiet</option>
                      <option>High top</option>
                    </select>
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                      Notes for the host
                    </span>
                    <textarea
                      rows={2}
                      value={bookingFormNotes}
                      onChange={(e) => setBookingFormNotes(e.target.value)}
                      placeholder="Allergies, occasion, running late…"
                      className="w-full resize-none rounded-[10px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2.5 py-2 text-[13px] text-[var(--pos-text-1)] placeholder:text-[var(--pos-icon-muted)] focus:border-[var(--pos-text-1)] focus:outline-none"
                    />
                  </label>
                </div>
              </div>
              <div className="shrink-0 border-t border-solid [border-color:var(--pos-divider)] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
                {bookingFormError ? (
                  <p className="mb-2 rounded-[10px] bg-red-500/10 px-3 py-2 text-[11px] text-red-800 dark:text-red-200">
                    {bookingFormError}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={saveBooking}
                  className="flex h-11 w-full items-center justify-center rounded-[11px] bg-[var(--pos-primary-bg)] text-[13px] font-semibold text-[var(--pos-primary-fg)] transition-colors hover:bg-[var(--pos-primary-hover)]"
                >
                  {bookingEditingId ? "Save changes" : "Save booking"}
                </button>
                <p className="mt-2 text-center text-[11px] text-[var(--pos-text-2)]">
                  Demo only — saved in memory for this session.
                </p>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {closureSheetOpen ? (
          <motion.div
            className="fixed inset-0 z-[45] flex items-end justify-center sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
              aria-label="Close"
              onClick={closeClosureSheet}
            />
            <motion.div
              initial={{ y: 48, opacity: 0.96 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 32, opacity: 0 }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className={`relative z-10 flex max-h-[min(90dvh,720px)] w-full max-w-[min(calc(100vw-1.5rem),720px)] flex-col rounded-t-[22px] bg-[var(--pos-card)] shadow-2xl sm:rounded-[22px] ${border0} [border-width:1px]`}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-solid [border-color:var(--pos-divider)] px-5 py-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--pos-text-2)]">
                    Closures
                  </p>
                  <h2 className="mt-0.5 text-[17px] font-semibold text-[var(--pos-text-1)]">
                    {closureEditingId ? "Edit closure" : "Add closure"}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={closeClosureSheet}
                  className="flex size-9 items-center justify-center rounded-[10px] border border-solid [border-color:var(--pos-border-medium)] text-[var(--pos-text-1)] transition-colors hover:[border-color:var(--pos-text-1)]"
                  aria-label="Close"
                >
                  <X className="size-4" strokeWidth={2} />
                </button>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                {closureFormError ? (
                  <p className="rounded-[10px] bg-red-500/10 px-3 py-2 text-[13px] text-red-800 dark:text-red-200">
                    {closureFormError}
                  </p>
                ) : null}
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                    Title
                  </span>
                  <input
                    type="text"
                    value={closureFormTitle}
                    onChange={(e) => {
                      setClosureFormTitle(e.target.value);
                      if (closureFormError) setClosureFormError("");
                    }}
                    placeholder="e.g. Staff party / maintenance"
                    className="h-11 w-full rounded-[11px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[14px] text-[var(--pos-text-1)] placeholder:text-[var(--pos-icon-muted)] focus:border-[var(--pos-text-1)] focus:outline-none"
                  />
                </label>
                <div className="space-y-2">
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                    Starts
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-1.5 block text-[11px] text-[var(--pos-text-2)]">
                        Date
                      </span>
                      <input
                        type="date"
                        value={closureFormStart}
                        onChange={(e) => {
                          setClosureFormStart(e.target.value);
                          if (closureFormError) setClosureFormError("");
                        }}
                        className="h-11 w-full rounded-[11px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2 font-mono text-[14px] text-[var(--pos-text-1)] focus:border-[var(--pos-text-1)] focus:outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[11px] text-[var(--pos-text-2)]">
                        Time
                      </span>
                      <input
                        type="time"
                        value={closureFormStartTime}
                        onChange={(e) => {
                          setClosureFormStartTime(e.target.value);
                          if (closureFormError) setClosureFormError("");
                        }}
                        className="h-11 w-full rounded-[11px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2 font-mono text-[14px] text-[var(--pos-text-1)] focus:border-[var(--pos-text-1)] focus:outline-none"
                      />
                    </label>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                    Ends
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-1.5 block text-[11px] text-[var(--pos-text-2)]">
                        Date
                      </span>
                      <input
                        type="date"
                        value={closureFormEnd}
                        onChange={(e) => {
                          setClosureFormEnd(e.target.value);
                          if (closureFormError) setClosureFormError("");
                        }}
                        className="h-11 w-full rounded-[11px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2 font-mono text-[14px] text-[var(--pos-text-1)] focus:border-[var(--pos-text-1)] focus:outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[11px] text-[var(--pos-text-2)]">
                        Time
                      </span>
                      <input
                        type="time"
                        value={closureFormEndTime}
                        onChange={(e) => {
                          setClosureFormEndTime(e.target.value);
                          if (closureFormError) setClosureFormError("");
                        }}
                        className="h-11 w-full rounded-[11px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-2 font-mono text-[14px] text-[var(--pos-text-1)] focus:border-[var(--pos-text-1)] focus:outline-none"
                      />
                    </label>
                  </div>
                </div>
                <p className="text-[11px] leading-relaxed text-[var(--pos-text-2)]">
                  Use{" "}
                  <span className="font-mono text-[var(--pos-text-1)]">
                    12:00 AM – 11:59 PM
                  </span>{" "}
                  on the same day for a full-day closure.
                </p>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                    Notes
                  </span>
                  <textarea
                    rows={3}
                    value={closureFormNote}
                    onChange={(e) => setClosureFormNote(e.target.value)}
                    placeholder="Optional — visible to staff only in this demo"
                    className="w-full resize-none rounded-[11px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 py-2.5 text-[14px] text-[var(--pos-text-1)] placeholder:text-[var(--pos-icon-muted)] focus:border-[var(--pos-text-1)] focus:outline-none"
                  />
                </label>
              </div>
              <div className="shrink-0 border-t border-solid [border-color:var(--pos-divider)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <button
                  type="button"
                  onClick={saveClosure}
                  className="flex h-12 w-full items-center justify-center rounded-[12px] bg-[var(--pos-primary-bg)] text-[14px] font-semibold text-[var(--pos-primary-fg)] transition-colors hover:bg-[var(--pos-primary-hover)]"
                >
                  {closureEditingId ? "Save changes" : "Save closure"}
                </button>
                <p className="mt-2 text-center text-[11px] text-[var(--pos-text-2)]">
                  Demo only — stored in memory for this session.
                </p>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
