import { useMemo, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  CalendarOff,
  Plus,
  Receipt,
  Search,
  Users,
} from "lucide-react";

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

function PrimaryButton({
  children,
  showPlus = true,
}: {
  children: ReactNode;
  showPlus?: boolean;
}) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 rounded-[8px] bg-[var(--pos-text-1)] px-3 py-2 text-[12px] font-medium text-[var(--pos-page)] transition-opacity hover:opacity-90"
    >
      {showPlus ? <Plus className="size-3.5" strokeWidth={2} /> : null}
      {children}
    </button>
  );
}

function GhostButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      className={`rounded-[8px] border border-solid [border-color:var(--pos-border-medium)] bg-[var(--pos-card)] px-3 py-2 text-[12px] font-medium text-[var(--pos-text-1)] transition-colors hover:bg-[var(--pos-sidebar)]`}
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

const DEMO_PAYROLL = [
  { staff: "Nadia Islam", period: "Mar 16–31", gross: "28,400", net: "24,180", paid: "Paid" as const },
  { staff: "Rafiq Hassan", period: "Mar 16–31", gross: "26,200", net: "22,340", paid: "Paid" as const },
  { staff: "Samira Chowdhury", period: "Mar 16–31", gross: "22,800", net: "19,520", paid: "Scheduled" as const },
  { staff: "Omar Karim", period: "Mar 16–31", gross: "31,000", net: "26,450", paid: "Paid" as const },
];

const PAY_STATUS: Record<(typeof DEMO_PAYROLL)[number]["paid"], string> = {
  Paid: "border-[#3a5a3a] bg-[#e8f2e8] text-[#1a3a1a]",
  Scheduled: "border-[#2f6dae] bg-[#c8def5] text-[#1a4a6c]",
};

function PayrollSalaries() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden pr-1">
      <PageHeader
        section="Employee management"
        title="Payroll & Compensation"
        subtitle="Per-period pay runs and status. Hook into accounting or a payroll provider for production."
        icon={Receipt}
      />
      <Toolbar className="shrink-0 justify-between">
        <p className="text-[12px] text-[var(--pos-text-2)]">BDT · demo figures</p>
        <PrimaryButton showPlus={false}>
          Run payroll
        </PrimaryButton>
      </Toolbar>
      <div className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] bg-[var(--pos-card)] ${border0}`}>
        <div className="shrink-0 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--pos-text-2)]">
            Recent periods · demo
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[640px] text-left text-[12px]">
            <thead className="sticky top-0 z-[1] bg-[var(--pos-card)] shadow-[inset_0_-1px_0_var(--pos-border-hairline)]">
              <tr className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                <th className="px-4 py-2.5">Staff</th>
                <th className="px-4 py-2.5">Period</th>
                <th className="px-4 py-2.5 text-right">Gross</th>
                <th className="px-4 py-2.5 text-right">Net</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_PAYROLL.map((row) => (
                <tr
                  key={`${row.staff}-${row.period}`}
                  className="border-b border-solid [border-color:var(--pos-border-hairline)] transition-colors hover:bg-[var(--pos-sidebar)]/60"
                >
                  <td className="px-4 py-3 font-medium text-[var(--pos-text-1)]">{row.staff}</td>
                  <td className="px-4 py-3 text-[11px] text-[var(--pos-text-2)]">{row.period}</td>
                  <td className="px-4 py-3 text-right font-mono text-[11px] text-[var(--pos-text-1)]">
                    {row.gross}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[11px] text-[var(--pos-text-1)]">
                    {row.net}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${PAY_STATUS[row.paid]}`}
                    >
                      {row.paid}
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
