import { useEffect, useMemo, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  CalendarOff,
  Plus,
  Receipt,
  Search,
  Trash2,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  createSalaryPayment,
  defaultDocForNewMonth,
  distributeServiceChargePool,
  emptySalaryRow,
  exampleSalaryDocForMonth,
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

export const HR_LEAF_IDS = new Set([
  "hr-directory",
  "hr-roster",
  "hr-leave",
  "hr-payroll",
  /** Legacy nav ids → combined roster view */
  "hr-schedule",
  "hr-attendance",
]);

const DEMO_STAFF = [
  {
    id: "1",
    name: "Nadia Islam",
    role: "Floor lead",
    dept: "Front of house",
    phone: "+880 1711‑555012",
    status: "active" as const,
    hired: "Jan 12, 2024",
  },
  {
    id: "2",
    name: "Rafiq Hassan",
    role: "Line cook",
    dept: "Kitchen",
    phone: "+880 1812‑555044",
    status: "active" as const,
    hired: "Aug 3, 2023",
  },
  {
    id: "3",
    name: "Samira Chowdhury",
    role: "Host",
    dept: "Front of house",
    phone: "+880 1913‑555078",
    status: "leave" as const,
    hired: "Feb 20, 2025",
  },
  {
    id: "4",
    name: "Omar Karim",
    role: "Bar lead",
    dept: "Bar",
    phone: "+880 1614‑555091",
    status: "active" as const,
    hired: "Nov 1, 2022",
  },
];

const STAFF_STATUS: Record<"active" | "leave", string> = {
  active: "border-[#3a5a3a] bg-[#e8f2e8] text-[#1a3a1a]",
  leave: "border-[#8a6a2a] bg-[#f8f0e0] text-[#5c4010]",
};

const DEPT_FILTERS = ["All", "Front of house", "Kitchen", "Bar"] as const;

const DEMO_SHIFTS = [
  { staff: "Nadia Islam", mon: "4–close", tue: "4–close", wed: "off", thu: "4–close", fri: "4–close", sat: "11–6", sun: "off" },
  { staff: "Rafiq Hassan", mon: "10–6", tue: "10–6", wed: "10–6", thu: "10–6", fri: "12–close", sat: "12–close", sun: "off" },
  { staff: "Samira Chowdhury", mon: "off", tue: "5–close", wed: "5–close", thu: "5–close", fri: "5–close", sat: "5–close", sun: "brunch" },
  { staff: "Omar Karim", mon: "3–11", tue: "3–11", wed: "off", thu: "3–11", fri: "3–close", sat: "3–close", sun: "brunch" },
];

function PageHeader({
  section,
  title,
  subtitle,
  icon: Icon,
}: {
  section: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-start gap-3">
      <div
        className={`flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-[var(--pos-nav-active-bg)] text-[var(--pos-nav-active-fg)] ${border0}`}
      >
        <Icon className="size-5" strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium tracking-[0.06em] text-[var(--pos-text-2)]">
          {section}
        </p>
        <h1 className="mt-0.5 text-[19px] font-semibold tracking-[-0.01em] text-[var(--pos-text-1)]">
          {title}
        </h1>
        <p className="mt-1 max-w-[52ch] text-[12px] leading-snug text-[var(--pos-text-2)]">
          {subtitle}
        </p>
      </div>
    </div>
  );
}

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

function EmployeeDirectory() {
  const [q, setQ] = useState("");
  const [dept, setDept] = useState<(typeof DEPT_FILTERS)[number]>("All");

  const rows = useMemo(() => {
    let r = DEMO_STAFF;
    if (dept !== "All") r = r.filter((s) => s.dept === dept);
    const t = q.trim().toLowerCase();
    if (t)
      r = r.filter(
        (s) =>
          s.name.toLowerCase().includes(t) ||
          s.role.toLowerCase().includes(t) ||
          s.phone.replace(/\s/g, "").includes(t.replace(/\s/g, "")),
      );
    return r;
  }, [q, dept]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden pr-1">
      <PageHeader
        section="Employee management"
        title="Employee List"
        subtitle="Contact info, department, and employment status. Hook to HRIS or staff API when available."
        icon={Users}
      />

      <Toolbar className="shrink-0 flex-wrap justify-between gap-3">
        <div className="relative min-w-[200px] max-w-[320px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--pos-icon-muted)]"
            strokeWidth={2}
            aria-hidden
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, role, or phone…"
            className="h-10 w-full rounded-[10px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] py-2 pl-10 pr-3 text-[13px] text-[var(--pos-text-1)] placeholder:text-[var(--pos-icon-muted)] focus:border-[var(--pos-text-1)] focus:outline-none"
            aria-label="Search employees"
          />
        </div>
        <PrimaryButton>Add employee</PrimaryButton>
      </Toolbar>

      <Toolbar className="shrink-0 gap-1.5">
        {DEPT_FILTERS.map((d) => {
          const on = d === dept;
          return (
            <button
              key={d}
              type="button"
              onClick={() => setDept(d)}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                on
                  ? "border-[var(--pos-text-1)] bg-[var(--pos-text-1)] text-[var(--pos-page)]"
                  : "border-solid [border-color:var(--pos-border-medium)] bg-[var(--pos-card)] text-[var(--pos-text-2)] hover:bg-[var(--pos-sidebar)]"
              }`}
            >
              {d}
            </button>
          );
        })}
      </Toolbar>

      <div className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] bg-[var(--pos-card)] ${border0}`}>
        <div className="shrink-0 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--pos-text-2)]">
            Team roster
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[640px] text-left text-[12px]">
            <thead className="sticky top-0 z-[1] bg-[var(--pos-card)] shadow-[inset_0_-1px_0_var(--pos-border-hairline)]">
              <tr className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5">Department</th>
                <th className="px-4 py-2.5">Phone</th>
                <th className="px-4 py-2.5">Hire date</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-solid [border-color:var(--pos-border-hairline)] transition-colors hover:bg-[var(--pos-sidebar)]/60"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--pos-sidebar)] text-[11px] font-semibold text-[var(--pos-text-1)]">
                        {s.name
                          .split(" ")
                          .map((p) => p[0])
                          .join("")
                          .slice(0, 2)}
                      </span>
                      <span className="font-medium text-[var(--pos-text-1)]">{s.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--pos-text-2)]">{s.role}</td>
                  <td className="px-4 py-3 text-[var(--pos-text-2)]">{s.dept}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-[var(--pos-text-2)]">
                    {s.phone}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-[var(--pos-text-2)]">{s.hired}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold capitalize ${STAFF_STATUS[s.status]}`}
                    >
                      {s.status === "leave" ? "On leave" : "Active"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ScheduleWeekPanel() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
        Weekly schedule
      </p>
      <Toolbar className="justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <GhostButton>← Prev week</GhostButton>
          <span className="px-2 text-[12px] font-medium text-[var(--pos-text-1)]">
            Mar 31 – Apr 6, 2026
          </span>
          <GhostButton>Next week →</GhostButton>
        </div>
        <Toolbar>
          <GhostButton>Publish</GhostButton>
          <PrimaryButton>Open shift</PrimaryButton>
        </Toolbar>
      </Toolbar>

      <div className={`overflow-auto rounded-[14px] bg-[var(--pos-card)] ${border0}`}>
        <table className="w-full min-w-[720px] text-left text-[11px]">
          <thead>
            <tr className="border-b border-solid [border-color:var(--pos-divider)] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
              <th className="sticky left-0 z-[1] bg-[var(--pos-card)] px-3 py-2.5">Staff</th>
              <th className="px-2 py-2.5">Mon</th>
              <th className="px-2 py-2.5">Tue</th>
              <th className="px-2 py-2.5">Wed</th>
              <th className="px-2 py-2.5">Thu</th>
              <th className="px-2 py-2.5">Fri</th>
              <th className="px-2 py-2.5">Sat</th>
              <th className="px-2 py-2.5">Sun</th>
            </tr>
          </thead>
          <tbody>
            {DEMO_SHIFTS.map((row) => (
              <tr
                key={row.staff}
                className="border-b border-solid [border-color:var(--pos-border-hairline)]"
              >
                <td className="sticky left-0 z-[1] bg-[var(--pos-card)] px-3 py-2 font-medium text-[var(--pos-text-1)]">
                  {row.staff}
                </td>
                {(["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const).map((d) => {
                  const cell = row[d];
                  const off = cell === "off";
                  return (
                    <td key={d} className="px-2 py-2 align-top">
                      <span
                        className={`inline-block min-h-[28px] rounded-[6px] border px-2 py-1 font-mono text-[10px] ${
                          off
                            ? "border-dashed border-[var(--pos-border-medium)] text-[var(--pos-text-2)]"
                            : "border-solid [border-color:var(--pos-border-hairline)] bg-[var(--pos-sidebar)]/80 text-[var(--pos-text-1)]"
                        }`}
                      >
                        {cell}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const DEMO_ATTENDANCE = [
  { name: "Nadia Islam", in: "09:58", out: "—", status: "On shift" as const },
  { name: "Rafiq Hassan", in: "10:04", out: "18:12", status: "Completed" as const },
  { name: "Samira Chowdhury", in: "—", out: "—", status: "Leave" as const },
  { name: "Omar Karim", in: "14:55", out: "—", status: "On shift" as const },
];

const ATT_STATUS: Record<(typeof DEMO_ATTENDANCE)[number]["status"], string> = {
  "On shift": "border-[#2f6dae] bg-[#c8def5] text-[#1a4a6c]",
  Completed: "border-[#3a5a3a] bg-[#e8f2e8] text-[#1a3a1a]",
  Leave: "border-[#8a6a2a] bg-[#f8f0e0] text-[#5c4010]",
};

function AttendanceTodayPanel() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
        Today&apos;s attendance
      </p>
      <Toolbar className="justify-between">
        <p className="text-[12px] text-[var(--pos-text-2)]">Today · Apr 7, 2026</p>
        <PrimaryButton>Export day</PrimaryButton>
      </Toolbar>
      <div className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] bg-[var(--pos-card)] ${border0}`}>
        <div className="shrink-0 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--pos-text-2)]">
            Shift presence · demo
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[560px] text-left text-[12px]">
            <thead className="sticky top-0 z-[1] bg-[var(--pos-card)] shadow-[inset_0_-1px_0_var(--pos-border-hairline)]">
              <tr className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                <th className="px-4 py-2.5">Staff</th>
                <th className="px-4 py-2.5">Clock in</th>
                <th className="px-4 py-2.5">Clock out</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_ATTENDANCE.map((row) => (
                <tr
                  key={row.name}
                  className="border-b border-solid [border-color:var(--pos-border-hairline)] transition-colors hover:bg-[var(--pos-sidebar)]/60"
                >
                  <td className="px-4 py-3 font-medium text-[var(--pos-text-1)]">{row.name}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-[var(--pos-text-2)]">{row.in}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-[var(--pos-text-2)]">{row.out}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${ATT_STATUS[row.status]}`}
                    >
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RosterAndAttendance() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden pr-1">
      <PageHeader
        section="Employee management"
        title="Roster & Attendance"
        subtitle="Weekly shifts and daily clock-in/out in one place. Connect scheduling and time clock tools when you wire the backend."
        icon={CalendarDays}
      />
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-0.5">
        <div className="flex flex-col gap-8 pb-1">
          <ScheduleWeekPanel />
          <AttendanceTodayPanel />
        </div>
      </div>
    </div>
  );
}

const DEMO_LEAVE = [
  { staff: "Samira Chowdhury", type: "Annual", from: "Apr 5", to: "Apr 9", state: "Approved" as const },
  { staff: "Omar Karim", type: "Sick", from: "Apr 12", to: "Apr 12", state: "Pending" as const },
  { staff: "Rafiq Hassan", type: "Personal", from: "Apr 20", to: "Apr 21", state: "Approved" as const },
];

const LEAVE_STATE: Record<(typeof DEMO_LEAVE)[number]["state"], string> = {
  Approved: "border-[#3a5a3a] bg-[#e8f2e8] text-[#1a3a1a]",
  Pending: "border-[#8a6a2a] bg-[#f8f0e0] text-[#5c4010]",
};

function LeaveRequests() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden pr-1">
      <PageHeader
        section="Employee management"
        title="Leave"
        subtitle="Requests, balances, and approvals. Replace demo rows with your leave policy and workflows."
        icon={CalendarOff}
      />
      <Toolbar className="shrink-0 flex-wrap justify-between gap-3">
        <Toolbar className="gap-2">
          <GhostButton>Balances</GhostButton>
          <GhostButton>Calendar</GhostButton>
        </Toolbar>
        <PrimaryButton>New request</PrimaryButton>
      </Toolbar>
      <div className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] bg-[var(--pos-card)] ${border0}`}>
        <div className="shrink-0 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--pos-text-2)]">
            Upcoming · demo
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[620px] text-left text-[12px]">
            <thead className="sticky top-0 z-[1] bg-[var(--pos-card)] shadow-[inset_0_-1px_0_var(--pos-border-hairline)]">
              <tr className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                <th className="px-4 py-2.5">Staff</th>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5">From</th>
                <th className="px-4 py-2.5">To</th>
                <th className="px-4 py-2.5">State</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_LEAVE.map((row) => (
                <tr
                  key={`${row.staff}-${row.from}`}
                  className="border-b border-solid [border-color:var(--pos-border-hairline)] transition-colors hover:bg-[var(--pos-sidebar)]/60"
                >
                  <td className="px-4 py-3 font-medium text-[var(--pos-text-1)]">{row.staff}</td>
                  <td className="px-4 py-3 text-[var(--pos-text-2)]">{row.type}</td>
                  <td className="px-4 py-3 text-[11px] text-[var(--pos-text-2)]">{row.from}</td>
                  <td className="px-4 py-3 text-[11px] text-[var(--pos-text-2)]">{row.to}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${LEAVE_STATE[row.state]}`}
                    >
                      {row.state}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
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
      <PageHeader
        section="Employee management"
        title="Salaries"
        subtitle="Each calendar month has its own sheet. Record paid amounts as dated transactions per employee (partial pays on different days). Data is stored on this device."
        icon={Receipt}
      />
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
                  [b.selectedMonthKey]: exampleSalaryDocForMonth(b.selectedMonthKey),
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

export function EmployeeModuleView({ leafId }: { leafId: string }) {
  switch (leafId) {
    case "hr-directory":
      return <EmployeeDirectory />;
    case "hr-roster":
    case "hr-schedule":
    case "hr-attendance":
      return <RosterAndAttendance />;
    case "hr-leave":
      return <LeaveRequests />;
    case "hr-payroll":
      return <PayrollSalaries />;
    default:
      return <EmployeeDirectory />;
  }
}
