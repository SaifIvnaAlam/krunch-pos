import { apiFetch } from "@/features/api-client";
import { readValidAccessToken } from "@/features/auth/authSession";
import { isDemoDataMode } from "@/shared/config/env";
import {
  clearLegacyLocalEmployeeStorage,
  coerceEmployeeList,
  defaultEmployeeDirectory,
  readLegacyLocalEmployeeDirectory,
  type Employee,
} from "../../lib/employeeDirectoryModel";

type ApiEmployeeDirectory = { employees: unknown[]; updatedAt?: string };

let directorySnapshot: Employee[] = isDemoDataMode()
  ? defaultEmployeeDirectory()
  : [];
let activeSnapshot: Employee[] = directorySnapshot.filter((e) => e.active);
const listeners = new Set<() => void>();
let loadPromise: Promise<void> | null = null;
let loadedFromApi = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistInFlight: Promise<void> | null = null;
let loadError: string | null = null;
let loading = false;

let loadStateSnapshot = {
  loading: false,
  error: null as string | null,
  loaded: false,
};

function rebuildActiveSnapshot(list: Employee[]) {
  activeSnapshot = list.filter((e) => e.active);
}

function refreshLoadStateSnapshot() {
  const nextLoading = loading;
  const nextError = loadError;
  const nextLoaded = loadedFromApi;
  if (
    loadStateSnapshot.loading !== nextLoading ||
    loadStateSnapshot.error !== nextError ||
    loadStateSnapshot.loaded !== nextLoaded
  ) {
    loadStateSnapshot = {
      loading: nextLoading,
      error: nextError,
      loaded: loadedFromApi,
    };
  }
}

function emit() {
  refreshLoadStateSnapshot();
  for (const fn of listeners) fn();
}

export function subscribeEmployeeDirectoryStore(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getEmployeeDirectoryStoreSnapshot(): Employee[] {
  return directorySnapshot;
}

export function getActiveEmployeesStoreSnapshot(): Employee[] {
  return activeSnapshot;
}

export function getEmployeeDirectoryLoadState(): {
  loading: boolean;
  error: string | null;
  loaded: boolean;
} {
  return loadStateSnapshot;
}

function requireToken(): string | null {
  return readValidAccessToken();
}

async function fetchDirectoryFromApi(): Promise<{ list: Employee[]; apiWasEmpty: boolean }> {
  const token = requireToken();
  if (!token) throw new Error("Sign in to load employee directory.");
  const data = await apiFetch<ApiEmployeeDirectory>("/employees/directory", {
    method: "GET",
    token,
  });
  const coerced = coerceEmployeeList(data.employees);
  // Empty API roster is authoritative — do not fall back to demo defaults.
  return { list: coerced, apiWasEmpty: coerced.length === 0 };
}

function mergeDirectoryWithApi(remote: Employee[]): Employee[] {
  // Empty remote means the branch roster was cleared; keep it empty.
  if (remote.length === 0) return [];

  const remoteByName = new Map<string, Employee>();
  for (const emp of remote) {
    const key = emp.name.trim().toLowerCase();
    if (key) remoteByName.set(key, emp);
  }

  const merged: Employee[] = [];
  const seenRemoteIds = new Set<string>();

  for (const local of directorySnapshot) {
    const key = local.name.trim().toLowerCase();
    const fromApi = key ? remoteByName.get(key) : undefined;
    if (fromApi) {
      merged.push(fromApi);
      seenRemoteIds.add(fromApi.id);
    } else {
      merged.push(local);
    }
  }

  for (const emp of remote) {
    if (!seenRemoteIds.has(emp.id)) merged.push(emp);
  }

  return merged.length > 0 ? merged : remote;
}

async function persistDirectoryToApi(list: Employee[]): Promise<void> {
  const token = requireToken();
  if (!token) return;
  await apiFetch<ApiEmployeeDirectory>("/employees/directory", {
    method: "PUT",
    token,
    body: JSON.stringify({ employees: list }),
  });
}

function schedulePersist() {
  if (isDemoDataMode()) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    if (!requireToken()) return;
    persistInFlight = persistDirectoryToApi(directorySnapshot)
      .then(() => {
        loadError = null;
      })
      .catch((e) => {
        loadError =
          e instanceof Error ? e.message : "Could not save employee directory.";
      })
      .finally(() => {
        persistInFlight = null;
        emit();
      });
  }, 400);
}

export function replaceEmployeeDirectorySnapshot(list: Employee[]) {
  directorySnapshot = list;
  rebuildActiveSnapshot(list);
  emit();
  schedulePersist();
}

async function maybeMigrateLegacyLocal(list: Employee[]): Promise<Employee[]> {
  const legacy = readLegacyLocalEmployeeDirectory();
  if (!legacy) return list;

  const hasApiData = list.some((e) => e.name.trim());
  const legacyHasData = legacy.some((e) => e.name.trim());
  if (hasApiData || !legacyHasData) {
    clearLegacyLocalEmployeeStorage();
    return list;
  }

  if (requireToken()) {
    try {
      await persistDirectoryToApi(legacy);
      clearLegacyLocalEmployeeStorage();
      return legacy;
    } catch {
      return legacy;
    }
  }
  return legacy;
}

/** Loads employee directory from API once per session (skipped in demo mode). */
export function loadEmployeeDirectory(): Promise<void> {
  if (isDemoDataMode()) {
    loadedFromApi = true;
    return Promise.resolve();
  }
  if (loadPromise) return loadPromise;

  loading = true;
  loadError = null;
  emit();

  loadPromise = (async () => {
    try {
      const fetched = await fetchDirectoryFromApi();
      let list = fetched.list;
      list = await maybeMigrateLegacyLocal(list);
      list = mergeDirectoryWithApi(list);
      directorySnapshot = list;
      rebuildActiveSnapshot(list);
      if (fetched.apiWasEmpty && list.some((e) => e.name.trim()) && requireToken()) {
        try {
          await persistDirectoryToApi(list);
        } catch {
          /* roster still usable locally */
        }
      }
      loadedFromApi = true;
      loadError = null;
    } catch (e) {
      loadError =
        e instanceof Error ? e.message : "Could not load employee directory.";
    } finally {
      loading = false;
      emit();
    }
  })();

  return loadPromise;
}

export async function flushEmployeeDirectoryPersist(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (persistInFlight) await persistInFlight;
  if (isDemoDataMode() || !requireToken()) return;
  await persistDirectoryToApi(directorySnapshot);
}
