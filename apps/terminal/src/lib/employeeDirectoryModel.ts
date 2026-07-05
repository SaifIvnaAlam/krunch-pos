/** Staff member — single source of truth for names across POS modules. */
export type Employee = {
  id: string;
  name: string;
  role: string;
  phone: string;
  /** Default monthly basic pay (whole BDT) — synced into every salary-sheet row. */
  defaultBasicSalary: number;
  /** Weight for service-charge pool split; null = not in auto split. */
  serviceChargePct: number | null;
  active: boolean;
  notes: string;
};

export const LEGACY_EMPLOYEE_DIRECTORY_KEY = "krunch.pos.employeeDirectory.v1";

const DEFAULT_EMPLOYEES: Omit<Employee, "id">[] = [
  {
    name: "Jihad",
    role: "Manager",
    phone: "",
    defaultBasicSalary: 0,
    serviceChargePct: null,
    active: true,
    notes: "",
  },
  {
    name: "Ahad",
    role: "Waiter",
    phone: "",
    defaultBasicSalary: 0,
    serviceChargePct: 9,
    active: true,
    notes: "",
  },
  {
    name: "Salim",
    role: "Waiter",
    phone: "",
    defaultBasicSalary: 0,
    serviceChargePct: 9,
    active: true,
    notes: "",
  },
  {
    name: "Al-Amin",
    role: "Kitchen",
    phone: "",
    defaultBasicSalary: 0,
    serviceChargePct: null,
    active: true,
    notes: "",
  },
  {
    name: "Abdullah",
    role: "Waiter",
    phone: "",
    defaultBasicSalary: 0,
    serviceChargePct: 7,
    active: true,
    notes: "",
  },
  {
    name: "Atick",
    role: "Runner",
    phone: "",
    defaultBasicSalary: 0,
    serviceChargePct: 5,
    active: true,
    notes: "",
  },
  {
    name: "Mojeeb",
    role: "Kitchen",
    phone: "",
    defaultBasicSalary: 0,
    serviceChargePct: null,
    active: true,
    notes: "",
  },
  {
    name: "Karim",
    role: "Cashier",
    phone: "",
    defaultBasicSalary: 0,
    serviceChargePct: null,
    active: true,
    notes: "",
  },
  {
    name: "Nadia",
    role: "Host",
    phone: "",
    defaultBasicSalary: 0,
    serviceChargePct: null,
    active: true,
    notes: "",
  },
];

function newEmployeeId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `emp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function defaultEmployeeDirectory(): Employee[] {
  return DEFAULT_EMPLOYEES.map((e) => ({ ...e, id: newEmployeeId() }));
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
