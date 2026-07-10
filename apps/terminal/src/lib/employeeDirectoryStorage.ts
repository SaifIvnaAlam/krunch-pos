import { useSyncExternalStore } from "react";
import {
  getActiveEmployeesStoreSnapshot,
  getEmployeeDirectoryStoreSnapshot,
  replaceEmployeeDirectorySnapshot,
  subscribeEmployeeDirectoryStore,
} from "@/features/employees/employeeDirectoryStore";
import {
  newEmployeeRecordId,
  normalizeEmployeeEmail,
  normalizeEmployeeMoney,
  normalizeEmployeePct,
  isValidEmployeeEmail,
  type Employee,
} from "./employeeDirectoryModel";

export type { Employee } from "./employeeDirectoryModel";
export {
  LEGACY_EMPLOYEE_DIRECTORY_KEY,
  clearLegacyLocalEmployeeStorage,
  coerceEmployee,
  coerceEmployeeList,
  defaultEmployeeDirectory,
  readLegacyLocalEmployeeDirectory,
} from "./employeeDirectoryModel";

function getSnapshot(): Employee[] {
  return getEmployeeDirectoryStoreSnapshot();
}

export function subscribeEmployeeDirectory(listener: () => void): () => void {
  return subscribeEmployeeDirectoryStore(listener);
}

export function getEmployeeDirectorySnapshot(): Employee[] {
  return getSnapshot();
}

export function getActiveEmployeesSnapshot(): Employee[] {
  return getActiveEmployeesStoreSnapshot();
}

export function getEmployeeById(id: string): Employee | undefined {
  return getSnapshot().find((e) => e.id === id);
}

export function findEmployeeByName(name: string): Employee | undefined {
  const n = name.trim().toLowerCase();
  if (!n) return undefined;
  return getSnapshot().find((e) => e.name.trim().toLowerCase() === n);
}

export function mergeRosterNames(names: string[]): void {
  const trimmed = names.map((n) => n.trim()).filter(Boolean);
  if (trimmed.length === 0) return;
  let changed = false;
  const list = [...getSnapshot()];
  for (const name of trimmed) {
    if (list.some((e) => e.name.trim().toLowerCase() === name.toLowerCase())) continue;
    list.push({
      id: newEmployeeRecordId(),
      name,
      role: "",
      phone: "",
      email: "",
      defaultBasicSalary: 0,
      serviceChargePct: null,
      active: true,
      notes: "",
    });
    changed = true;
  }
  if (!changed) return;
  replaceEmployeeDirectorySnapshot(list);
}

export function addEmployee(
  input: Omit<Employee, "id" | "active"> & { active?: boolean },
): { ok: true; employee: Employee } | { ok: false; message: string } {
  const snapshot = getSnapshot();
  const name = input.name.trim();
  if (!name) return { ok: false, message: "Name is required." };
  if (snapshot.some((e) => e.name.trim().toLowerCase() === name.toLowerCase())) {
    return { ok: false, message: "An employee with this name already exists." };
  }
  const email = normalizeEmployeeEmail(input.email);
  if (!isValidEmployeeEmail(email)) {
    return { ok: false, message: "Enter a valid email address or leave blank." };
  }
  const employee: Employee = {
    id: newEmployeeRecordId(),
    name,
    role: input.role.trim(),
    phone: input.phone.trim(),
    email,
    defaultBasicSalary: normalizeEmployeeMoney(input.defaultBasicSalary),
    serviceChargePct: normalizeEmployeePct(input.serviceChargePct),
    active: input.active !== false,
    notes: input.notes.trim(),
  };
  replaceEmployeeDirectorySnapshot([...snapshot, employee]);
  return { ok: true, employee };
}

export function updateEmployee(
  id: string,
  patch: Partial<Omit<Employee, "id">>,
): { ok: true; employee: Employee } | { ok: false; message: string } {
  const snapshot = getSnapshot();
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

  const email =
    patch.email !== undefined ? normalizeEmployeeEmail(patch.email) : cur.email;
  if (!isValidEmployeeEmail(email)) {
    return { ok: false, message: "Enter a valid email address or leave blank." };
  }

  const employee: Employee = {
    ...cur,
    ...patch,
    id,
    name,
    role: patch.role !== undefined ? patch.role.trim() : cur.role,
    phone: patch.phone !== undefined ? patch.phone.trim() : cur.phone,
    email,
    defaultBasicSalary:
      patch.defaultBasicSalary !== undefined
        ? normalizeEmployeeMoney(patch.defaultBasicSalary)
        : cur.defaultBasicSalary,
    serviceChargePct:
      patch.serviceChargePct !== undefined
        ? normalizeEmployeePct(patch.serviceChargePct)
        : cur.serviceChargePct,
    notes: patch.notes !== undefined ? patch.notes.trim() : cur.notes,
  };

  const list = snapshot.map((e) => (e.id === id ? employee : e));
  replaceEmployeeDirectorySnapshot(list);
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
  const snapshot = getSnapshot();
  const list = snapshot.filter((e) => e.id !== id);
  if (list.length === snapshot.length) return { ok: false, message: "Employee not found." };
  replaceEmployeeDirectorySnapshot(list);
  return { ok: true };
}

export function useEmployeeDirectory(): Employee[] {
  return useSyncExternalStore(
    subscribeEmployeeDirectory,
    getEmployeeDirectorySnapshot,
    getEmployeeDirectorySnapshot,
  );
}

export function useActiveEmployees(): Employee[] {
  return useSyncExternalStore(
    subscribeEmployeeDirectory,
    getActiveEmployeesSnapshot,
    getActiveEmployeesSnapshot,
  );
}
