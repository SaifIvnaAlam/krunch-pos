import { useSyncExternalStore } from "react";

/** Staff member — single source of truth for names across POS modules. */
export type Employee = {
  id: string;
  name: string;
  role: string;
  phone: string;
  /** Weight for service-charge pool split; null = not in auto split. */
  serviceChargePct: number | null;
  active: boolean;
  notes: string;
};

const STORAGE_KEY = "krunch.pos.employeeDirectory.v1";

const DEFAULT_EMPLOYEES: Omit<Employee, "id">[] = [
  { name: "Jihad", role: "Manager", phone: "", serviceChargePct: null, active: true, notes: "" },
  { name: "Ahad", role: "Waiter", phone: "", serviceChargePct: 9, active: true, notes: "" },
  { name: "Salim", role: "Waiter", phone: "", serviceChargePct: 9, active: true, notes: "" },
  { name: "Al-Amin", role: "Kitchen", phone: "", serviceChargePct: null, active: true, notes: "" },
  { name: "Abdullah", role: "Waiter", phone: "", serviceChargePct: 7, active: true, notes: "" },
  { name: "Atick", role: "Runner", phone: "", serviceChargePct: 5, active: true, notes: "" },
  { name: "Mojeeb", role: "Kitchen", phone: "", serviceChargePct: null, active: true, notes: "" },
  { name: "Karim", role: "Cashier", phone: "", serviceChargePct: null, active: true, notes: "" },
  { name: "Nadia", role: "Host", phone: "", serviceChargePct: null, active: true, notes: "" },
];

function newEmployeeId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `emp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function defaultDirectory(): Employee[] {
  return DEFAULT_EMPLOYEES.map((e) => ({ ...e, id: newEmployeeId() }));
}

function coercePct(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return null;
  return Math.min(100, Math.round(raw * 100) / 100);
}

function coerceEmployee(raw: unknown): Employee | null {
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
    serviceChargePct: coercePct(o.serviceChargePct),
    active: o.active !== false,
    notes: typeof o.notes === "string" ? o.notes.trim() : "",
  };
}

function buildActiveSnapshot(list: Employee[]): Employee[] {
  return list.filter((e) => e.active);
}

let snapshot: Employee[] = loadFromStorage();
let activeSnapshot: Employee[] = buildActiveSnapshot(snapshot);
const listeners = new Set<() => void>();

function loadFromStorage(): Employee[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultDirectory();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultDirectory();
    const list = parsed.map(coerceEmployee).filter((e): e is Employee => e !== null);
    return list.length > 0 ? list : defaultDirectory();
  } catch {
    return defaultDirectory();
  }
}

function persist(list: Employee[]): { ok: true } | { ok: false; message: string } {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return { ok: true };
  } catch (e) {
    const message =
      e instanceof DOMException && e.name === "QuotaExceededError"
        ? "Storage full — could not save employee list."
        : "Could not save employee list.";
    return { ok: false, message };
  }
}

function emit() {
  for (const fn of listeners) fn();
}

function setSnapshot(list: Employee[]) {
  snapshot = list;
  activeSnapshot = buildActiveSnapshot(list);
  emit();
}

export function subscribeEmployeeDirectory(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getEmployeeDirectorySnapshot(): Employee[] {
  return snapshot;
}

/** Stable reference until the directory changes — safe for useSyncExternalStore. */
export function getActiveEmployeesSnapshot(): Employee[] {
  return activeSnapshot;
}

export function getEmployeeById(id: string): Employee | undefined {
  return snapshot.find((e) => e.id === id);
}

export function findEmployeeByName(name: string): Employee | undefined {
  const n = name.trim().toLowerCase();
  if (!n) return undefined;
  return snapshot.find((e) => e.name.trim().toLowerCase() === n);
}

/** Import roster names from legacy salary storage (one-time merge). */
export function mergeRosterNames(names: string[]): void {
  const trimmed = names.map((n) => n.trim()).filter(Boolean);
  if (trimmed.length === 0) return;
  let changed = false;
  const list = [...snapshot];
  for (const name of trimmed) {
    if (list.some((e) => e.name.trim().toLowerCase() === name.toLowerCase())) continue;
    list.push({
      id: newEmployeeId(),
      name,
      role: "",
      phone: "",
      serviceChargePct: null,
      active: true,
      notes: "",
    });
    changed = true;
  }
  if (!changed) return;
  setSnapshot(list);
  persist(list);
}

export function addEmployee(
  input: Omit<Employee, "id" | "active"> & { active?: boolean },
): { ok: true; employee: Employee } | { ok: false; message: string } {
  const name = input.name.trim();
  if (!name) return { ok: false, message: "Name is required." };
  if (snapshot.some((e) => e.name.trim().toLowerCase() === name.toLowerCase())) {
    return { ok: false, message: "An employee with this name already exists." };
  }
  const employee: Employee = {
    id: newEmployeeId(),
    name,
    role: input.role.trim(),
    phone: input.phone.trim(),
    serviceChargePct: coercePct(input.serviceChargePct),
    active: input.active !== false,
    notes: input.notes.trim(),
  };
  const list = [...snapshot, employee];
  const res = persist(list);
  if (!res.ok) return res;
  setSnapshot(list);
  return { ok: true, employee };
}

export function updateEmployee(
  id: string,
  patch: Partial<Omit<Employee, "id">>,
): { ok: true; employee: Employee } | { ok: false; message: string } {
  const idx = snapshot.findIndex((e) => e.id === id);
  if (idx < 0) return { ok: false, message: "Employee not found." };

  const cur = snapshot[idx]!;
  const name = patch.name !== undefined ? patch.name.trim() : cur.name;
  if (!name) return { ok: false, message: "Name is required." };
  if (
    snapshot.some(
      (e) => e.id !== id && e.name.trim().toLowerCase() === name.toLowerCase(),
    )
  ) {
    return { ok: false, message: "Another employee already uses this name." };
  }

  const employee: Employee = {
    ...cur,
    ...patch,
    id,
    name,
    role: patch.role !== undefined ? patch.role.trim() : cur.role,
    phone: patch.phone !== undefined ? patch.phone.trim() : cur.phone,
    serviceChargePct:
      patch.serviceChargePct !== undefined
        ? coercePct(patch.serviceChargePct)
        : cur.serviceChargePct,
    notes: patch.notes !== undefined ? patch.notes.trim() : cur.notes,
  };

  const list = snapshot.map((e) => (e.id === id ? employee : e));
  const res = persist(list);
  if (!res.ok) return res;
  setSnapshot(list);
  return { ok: true, employee };
}

export function setEmployeeActive(
  id: string,
  active: boolean,
): { ok: true } | { ok: false; message: string } {
  const res = updateEmployee(id, { active });
  if (!res.ok) return res;
  return { ok: true };
}

export function removeEmployee(id: string): { ok: true } | { ok: false; message: string } {
  const list = snapshot.filter((e) => e.id !== id);
  if (list.length === snapshot.length) return { ok: false, message: "Employee not found." };
  if (list.length === 0) return { ok: false, message: "Keep at least one employee on the list." };
  const res = persist(list);
  if (!res.ok) return res;
  setSnapshot(list);
  return { ok: true };
}

export function useEmployeeDirectory(): Employee[] {
  return useSyncExternalStore(subscribeEmployeeDirectory, getEmployeeDirectorySnapshot, getEmployeeDirectorySnapshot);
}

export function useActiveEmployees(): Employee[] {
  return useSyncExternalStore(
    subscribeEmployeeDirectory,
    getActiveEmployeesSnapshot,
    getActiveEmployeesSnapshot,
  );
}
