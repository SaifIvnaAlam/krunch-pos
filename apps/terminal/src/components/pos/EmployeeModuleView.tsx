import { useMemo, useState, type ReactNode } from "react";
import {
  CalendarDays,
  Plus,
  Search,
  Shield,
  UserCircle,
  Users,
  UserRound,
} from "lucide-react";

const border0 =
  "border-[0.5px] border-solid [border-color:var(--pos-border-hairline)]";

export const EMPLOYEE_LEAF_IDS = new Set([
  "em-directory",
  "em-schedule",
  "em-access",
  "em-onboard",
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

const DEMO_ROLES = [
  {
    id: "r1",
    name: "Owner / Admin",
    users: 2,
    perms: "Full access · settings · payouts",
  },
  {
    id: "r2",
    name: "Manager",
    users: 4,
    perms: "Floor · orders · inventory · reports",
  },
  {
    id: "r3",
    name: "Cashier / Server",
    users: 12,
    perms: "POS · tables · limited voids",
  },
  {
    id: "r4",
    name: "Kitchen display",
    users: 6,
    perms: "KDS only · no pricing",
  },
];

const ONBOARD_COLUMNS: {
  id: string;
  label: string;
  cards: { id: string; title: string; sub: string }[];
}[] = [
  {
    id: "applied",
    label: "Applied",
    cards: [
      { id: "c1", title: "A. Rahman", sub: "Server · ref. M. Karim" },
      { id: "c2", title: "L. Nahar", sub: "Prep · portfolio link" },
    ],
  },
  {
    id: "interview",
    label: "Interview",
    cards: [{ id: "c3", title: "T. Ahmed", sub: "Barback · Tue 3 PM" }],
  },
  {
    id: "offer",
    label: "Offer",
    cards: [{ id: "c4", title: "F. Kabir", sub: "Line cook · docs pending" }],
  },
  {
    id: "paperwork",
    label: "Paperwork",
    cards: [
      { id: "c5", title: "J. Begum", sub: "Tax forms · handbook" },
    ],
  },
  {
    id: "active",
    label: "Start date set",
    cards: [{ id: "c6", title: "K. Hoque", sub: "Apr 7 · Host training" }],
  },
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
  icon: typeof Users;
}) {
  return (
    <div className="flex flex-wrap items-start gap-3">
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
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto pr-1">
      <PageHeader
        section="Employee Management"
        title="Employee directory"
        subtitle="Contact info, department, and employment status. Hook to HRIS or staff API when available."
        icon={Users}
      />

      <Toolbar className="flex-wrap justify-between gap-3">
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

      <Toolbar className="gap-1.5">
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

      <div className={`min-h-0 flex-1 overflow-hidden rounded-[14px] bg-[var(--pos-card)] ${border0}`}>
        <div className="border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--pos-text-2)]">
            Team roster
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[12px]">
            <thead>
              <tr className="border-b border-solid [border-color:var(--pos-border-hairline)] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
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

function SchedulesShifts() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto pr-1">
      <PageHeader
        section="Employee Management"
        title="Schedules & shifts"
        subtitle="Week-at-a-glance for the floor and kitchen. Integrate with time clock or scheduling tools later."
        icon={CalendarDays}
      />

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

      <div className={`overflow-x-auto rounded-[14px] bg-[var(--pos-card)] ${border0}`}>
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

function RolesAccess() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto pr-1">
      <PageHeader
        section="Employee Management"
        title="Roles & access"
        subtitle="Map POS permissions to job roles. Fine-grained toggles can mirror your admin console."
        icon={Shield}
      />

      <Toolbar className="justify-end">
        <PrimaryButton>New role</PrimaryButton>
      </Toolbar>

      <div className="grid gap-3 sm:grid-cols-2">
        {DEMO_ROLES.map((role) => (
          <div
            key={role.id}
            className={`rounded-[14px] bg-[var(--pos-card)] p-4 ${border0}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold text-[var(--pos-text-1)]">
                  {role.name}
                </h2>
                <p className="mt-2 text-[12px] leading-snug text-[var(--pos-text-2)]">
                  {role.perms}
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-solid [border-color:var(--pos-border-medium)] bg-[var(--pos-sidebar)] px-2.5 py-1 font-mono text-[11px] text-[var(--pos-text-2)]">
                {role.users} users
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <GhostButton>Edit permissions</GhostButton>
              <GhostButton>Assign users</GhostButton>
            </div>
          </div>
        ))}
      </div>

      <div className={`rounded-[14px] bg-[var(--pos-card)] p-4 ${border0}`}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--pos-text-2)]">
          Permission groups (sample)
        </p>
        <ul className="mt-3 grid gap-2 text-[12px] text-[var(--pos-text-2)] sm:grid-cols-2">
          {[
            "Sales · refunds · discounts",
            "Menu & pricing (read-only)",
            "Inventory · receiving",
            "Reports · exports",
            "Staff clock · breaks",
            "Device & printer setup",
          ].map((line) => (
            <li
              key={line}
              className="flex items-center gap-2 rounded-[8px] border border-solid [border-color:var(--pos-border-hairline)] bg-[var(--pos-page)]/40 px-3 py-2"
            >
              <span className="size-1.5 shrink-0 rounded-full bg-[var(--pos-text-1)]/40" />
              {line}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function OnboardingTraining() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto pr-1">
      <PageHeader
        section="Employee Management"
        title="Onboarding & training"
        subtitle="Track candidates through hire and first shifts. Attach checklists and training modules when you connect HR."
        icon={UserCircle}
      />

      <Toolbar className="justify-between">
        <p className="text-[12px] text-[var(--pos-text-2)]">
          Drag-and-drop will map to your workflow; columns are static for now.
        </p>
        <PrimaryButton>New applicant</PrimaryButton>
      </Toolbar>

      <div className="flex min-h-[280px] gap-3 overflow-x-auto pb-1">
        {ONBOARD_COLUMNS.map((col) => (
          <div
            key={col.id}
            className={`flex w-[200px] shrink-0 flex-col rounded-[14px] bg-[var(--pos-card)] ${border0}`}
          >
            <div className="border-b border-solid [border-color:var(--pos-divider)] px-3 py-2.5">
              <p className="text-[11px] font-semibold text-[var(--pos-text-1)]">{col.label}</p>
              <p className="mt-0.5 font-mono text-[10px] text-[var(--pos-text-2)]">
                {col.cards.length} card{col.cards.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex flex-1 flex-col gap-2 p-2">
              {col.cards.map((c) => (
                <div
                  key={c.id}
                  className={`rounded-[10px] border border-solid [border-color:var(--pos-border-hairline)] bg-[var(--pos-page)]/50 p-3`}
                >
                  <div className="flex items-start gap-2">
                    <UserRound className="mt-0.5 size-4 shrink-0 text-[var(--pos-icon-muted)]" />
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-[var(--pos-text-1)]">
                        {c.title}
                      </p>
                      <p className="mt-1 text-[10px] leading-snug text-[var(--pos-text-2)]">
                        {c.sub}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="mt-auto flex items-center justify-center gap-1 rounded-[8px] border border-dashed border-[var(--pos-border-medium)] py-2 text-[11px] text-[var(--pos-text-2)] transition-colors hover:bg-[var(--pos-sidebar)]/50"
              >
                <Plus className="size-3.5" strokeWidth={2} />
                Add
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmployeeModuleView({ leafId }: { leafId: string }) {
  switch (leafId) {
    case "em-directory":
      return <EmployeeDirectory />;
    case "em-schedule":
      return <SchedulesShifts />;
    case "em-access":
      return <RolesAccess />;
    case "em-onboard":
      return <OnboardingTraining />;
    default:
      return <EmployeeDirectory />;
  }
}
