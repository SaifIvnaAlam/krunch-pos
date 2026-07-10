/** Staff member — single source of truth for names across POS modules. */
export type Employee = {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  /** Default monthly basic pay (whole BDT) — synced into every salary-sheet row. */
  defaultBasicSalary: number;
  /** Weight for service-charge pool split; null = not in auto split. */
  serviceChargePct: number | null;
  active: boolean;
  notes: string;
};

export const LEGACY_EMPLOYEE_DIRECTORY_KEY = "krunch.pos.employeeDirectory.v1";

/** Default demo roster — stable ids so re-seeds stay consistent across branches. */
const DEFAULT_EMPLOYEES: Employee[] = [
  {
    id: "emp-demo-0001",
    name: "Jihad",
    role: "Front Manager",
    phone: "+880 1770-401212",
    email: "jihad@krunch.test",
    defaultBasicSalary: 30000,
    serviceChargePct: 10,
    active: true,
    notes: "",
  },
  {
    id: "emp-demo-0002",
    name: "Fatima Rahman",
    role: "Head Chef",
    phone: "+880 1711-223344",
    email: "fatima@krunch.test",
    defaultBasicSalary: 28000,
    serviceChargePct: null,
    active: true,
    notes: "",
  },
  {
    id: "emp-demo-0003",
    name: "Karim Hassan",
    role: "Waiter",
    phone: "+880 1812-556677",
    email: "karim@krunch.test",
    defaultBasicSalary: 12000,
    serviceChargePct: 9,
    active: true,
    notes: "",
  },
  {
    id: "emp-demo-0004",
    name: "Nadia Islam",
    role: "Host",
    phone: "+880 1913-889900",
    email: "nadia@krunch.test",
    defaultBasicSalary: 14000,
    serviceChargePct: 8,
    active: true,
    notes: "",
  },
  {
    id: "emp-demo-0005",
    name: "Salim Ahmed",
    role: "Waiter",
    phone: "+880 1614-112233",
    email: "salim@krunch.test",
    defaultBasicSalary: 12000,
    serviceChargePct: 9,
    active: true,
    notes: "",
  },
  {
    id: "emp-demo-0006",
    name: "Abdullah Khan",
    role: "Bartender",
    phone: "+880 1515-445566",
    email: "abdullah@krunch.test",
    defaultBasicSalary: 15000,
    serviceChargePct: 7,
    active: true,
    notes: "",
  },
  {
    id: "emp-demo-0007",
    name: "Priya Das",
    role: "Cashier",
    phone: "+880 1316-778899",
    email: "priya@krunch.test",
    defaultBasicSalary: 16000,
    serviceChargePct: null,
    active: true,
    notes: "",
  },
  {
    id: "emp-demo-0008",
    name: "Mojeeb Ali",
    role: "Kitchen Helper",
    phone: "+880 1417-001122",
    email: "mojeeb@krunch.test",
    defaultBasicSalary: 10000,
    serviceChargePct: null,
    active: true,
    notes: "",
  },
  {
    id: "emp-demo-0009",
    name: "Atick Hossain",
    role: "Runner",
    phone: "+880 1718-334455",
    email: "atick@krunch.test",
    defaultBasicSalary: 9000,
    serviceChargePct: 5,
    active: true,
    notes: "",
  },
  {
    id: "emp-demo-0010",
    name: "Rina Akter",
    role: "Shift Supervisor",
    phone: "+880 1819-667788",
    email: "rina@krunch.test",
    defaultBasicSalary: 22000,
    serviceChargePct: 10,
    active: false,
    notes: "On leave — inactive for payroll",
  },
];

export function defaultEmployeeDirectory(): Employee[] {
  return DEFAULT_EMPLOYEES.map((e) => ({ ...e }));
}

function newEmployeeId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `emp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function coerceMoney(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.round(raw));
}

function coercePct(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return null;
  return Math.min(100, Math.round(raw * 100) / 100);
}

export function normalizeEmployeeEmail(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase();
}

export function isValidEmployeeEmail(email: string): boolean {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function coerceEmployee(raw: unknown): Employee | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" && o.id ? o.id : newEmployeeId();
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!name) return null;
  return {
    id,
    name,
    role: typeof o.role === "string" ? o.role.trim() : "",
    phone: typeof o.phone === "string" ? o.phone.trim() : "",
    email: normalizeEmployeeEmail(o.email),
    defaultBasicSalary: coerceMoney(o.defaultBasicSalary),
    serviceChargePct: coercePct(o.serviceChargePct),
    active: o.active !== false,
    notes: typeof o.notes === "string" ? o.notes.trim() : "",
  };
}

export function coerceEmployeeList(raw: unknown): Employee[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(coerceEmployee).filter((e): e is Employee => e !== null);
}

/** One-time read of browser-local roster (pre-API). */
export function readLegacyLocalEmployeeDirectory(): Employee[] | null {
  try {
    const raw = localStorage.getItem(LEGACY_EMPLOYEE_DIRECTORY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    const list = coerceEmployeeList(parsed);
    return list.length > 0 ? list : null;
  } catch {
    return null;
  }
}

export function clearLegacyLocalEmployeeStorage(): void {
  try {
    localStorage.removeItem(LEGACY_EMPLOYEE_DIRECTORY_KEY);
  } catch {
    /* ignore */
  }
}

export function newEmployeeRecordId(): string {
  return newEmployeeId();
}

export function normalizeEmployeeMoney(value: number): number {
  return coerceMoney(value);
}

export function normalizeEmployeePct(raw: unknown): number | null {
  return coercePct(raw);
}
