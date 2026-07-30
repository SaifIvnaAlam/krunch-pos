import { apiFetch } from "@/features/api-client";
import { readValidAccessToken } from "@/features/auth/authSession";
import {
  getActiveEmployeesStoreSnapshot,
  getEmployeeDirectoryLoadState,
} from "@/features/employees/employeeDirectoryStore";
import { isDemoDataMode } from "@/shared/config/env";
import {
  clearLegacyLocalSalaryStorage,
  coerceSalarySheetBundle,
  emptySalarySheetBundle,
  syncSalaryBundleToEmployees,
  writeSalarySheetBundle,
  type SalarySheetBundle,
} from "../../lib/salarySheetStorage";

type ApiSalaryWorkspace = SalarySheetBundle & { updatedAt?: string };

/** In-memory only until the first successful API load — never seed from localStorage. */
let bundleSnapshot: SalarySheetBundle = emptySalarySheetBundle();
const listeners = new Set<() => void>();
let loadPromise: Promise<void> | null = null;
let loadedFromApi = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistInFlight: Promise<void> | null = null;
let loadError: string | null = null;
let loading = false;
/** True after local edits; prevents a late API load from wiping unsaved salary data. */
let localDirty = false;
let saving = false;

let loadStateSnapshot = {
  loading: false,
  error: null as string | null,
  loaded: false,
};

let saveStateSnapshot = {
  saving: false,
  error: null as string | null,
  dirty: false,
};

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
      loaded: nextLoaded,
    };
  }
}

function refreshSaveStateSnapshot() {
  const nextSaving = saving;
  const nextError = saveStateSnapshot.error;
  const nextDirty = localDirty;
  if (
    saveStateSnapshot.saving !== nextSaving ||
    saveStateSnapshot.dirty !== nextDirty
  ) {
    saveStateSnapshot = { saving: nextSaving, error: nextError, dirty: nextDirty };
  }
}

function emit() {
  refreshLoadStateSnapshot();
  refreshSaveStateSnapshot();
  for (const fn of listeners) fn();
}

function mirrorToLocalStorage(bundle: SalarySheetBundle) {
  if (isDemoDataMode()) return;
  writeSalarySheetBundle(bundle);
}

export function getSalaryBundle(): SalarySheetBundle {
  return bundleSnapshot;
}

export function subscribeSalaryBundle(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getSalaryWorkspaceLoadState(): {
  loading: boolean;
  error: string | null;
  loaded: boolean;
} {
  return loadStateSnapshot;
}

export function getSalaryWorkspaceSaveState(): {
  saving: boolean;
  error: string | null;
  dirty: boolean;
} {
  return saveStateSnapshot;
}

function requireToken(): string | null {
  return readValidAccessToken();
}

async function fetchBundleFromApi(): Promise<SalarySheetBundle> {
  const token = requireToken();
  if (!token) throw new Error("Sign in to load salary registers.");
  const data = await apiFetch<ApiSalaryWorkspace>("/payroll/workspace", {
    method: "GET",
    token,
  });
  const coerced = coerceSalarySheetBundle({
    selectedMonthKey: data.selectedMonthKey,
    months: data.months,
  });
  return coerced ?? emptySalarySheetBundle();
}

async function persistBundleToApi(bundle: SalarySheetBundle): Promise<void> {
  const token = requireToken();
  if (!token) {
    throw new Error("Sign in to save salary registers.");
  }
  saving = true;
  saveStateSnapshot = { saving: true, error: null, dirty: localDirty };
  emit();
  try {
    await apiFetch<ApiSalaryWorkspace>("/payroll/workspace", {
      method: "PUT",
      token,
      body: JSON.stringify({
        selectedMonthKey: bundle.selectedMonthKey,
        months: bundle.months,
      }),
    });
    localDirty = false;
    mirrorToLocalStorage(bundle);
    saveStateSnapshot = { saving: false, error: null, dirty: false };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not save salary workspace.";
    saveStateSnapshot = { saving: false, error: message, dirty: localDirty };
    throw e;
  } finally {
    saving = false;
    emit();
  }
}

function applyLoadedBundle(bundle: SalarySheetBundle) {
  if (localDirty) return;
  let next = bundle;
  if (getEmployeeDirectoryLoadState().loaded) {
    next = syncSalaryBundleToEmployees(
      next,
      getActiveEmployeesStoreSnapshot(),
    );
  }
  bundleSnapshot = next;
  mirrorToLocalStorage(next);
  clearLegacyLocalSalaryStorage();
}

function schedulePersist() {
  if (isDemoDataMode()) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    if (!requireToken()) {
      loadError = "Sign in to save salary registers.";
      saveStateSnapshot = {
        saving: false,
        error: "Sign in to save salary registers.",
        dirty: localDirty,
      };
      emit();
      return;
    }
    persistInFlight = persistBundleToApi(bundleSnapshot)
      .then(() => {
        loadError = null;
      })
      .catch((e) => {
        loadError =
          e instanceof Error ? e.message : "Could not save salary workspace.";
      })
      .finally(() => {
        persistInFlight = null;
        emit();
      });
  }, 400);
}

export function setSalaryBundle(updater: (b: SalarySheetBundle) => SalarySheetBundle) {
  const next = updater(bundleSnapshot);
  if (next === bundleSnapshot) return;
  bundleSnapshot = next;
  localDirty = true;
  saveStateSnapshot = { saving: false, error: null, dirty: true };
  emit();
  if (isDemoDataMode()) {
    mirrorToLocalStorage(next);
    return;
  }
  schedulePersist();
}

/** Loads salary workspace from API once per session (skipped in demo mode). */
export function loadSalaryWorkspace(): Promise<void> {
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
      const bundle = await fetchBundleFromApi();
      applyLoadedBundle(bundle);
      loadedFromApi = true;
      loadError = null;
    } catch (e) {
      loadedFromApi = false;
      loadError =
        e instanceof Error ? e.message : "Could not load salary workspace.";
    } finally {
      loading = false;
      emit();
    }
  })();

  return loadPromise;
}

/** Force a fresh API load. Skipped while unsaved edits are pending. */
export function reloadSalaryWorkspace(): Promise<void> {
  if (localDirty) return Promise.resolve();
  loadPromise = null;
  loadedFromApi = false;
  return loadSalaryWorkspace();
}

/** Align loaded salary rows to the employee roster once the directory has finished loading. */
export function syncLoadedSalaryBundleToEmployees(): void {
  if (!loadedFromApi || !getEmployeeDirectoryLoadState().loaded || localDirty) return;
  const synced = syncSalaryBundleToEmployees(
    bundleSnapshot,
    getActiveEmployeesStoreSnapshot(),
  );
  if (synced === bundleSnapshot) return;
  bundleSnapshot = synced;
  mirrorToLocalStorage(synced);
  emit();
}

/**
 * Cancel the debounced auto-persist WITHOUT writing, and clear the dirty flag so
 * a subsequent `reloadSalaryWorkspace()` isn't skipped. Used by the atomic daily
 * commit (I3): the reconciled bundle is sent in one cross-module transaction, so
 * the store's own PUT must be suppressed. The bundle is re-pulled from the server
 * after the commit, which is the committed source of truth.
 */
export function cancelSalaryWorkspacePersist(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  localDirty = false;
  saveStateSnapshot = { saving: false, error: null, dirty: false };
  emit();
}

export async function flushSalaryWorkspacePersist(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (persistInFlight) await persistInFlight;
  if (isDemoDataMode()) return;
  if (!requireToken()) {
    throw new Error("Sign in to save salary registers.");
  }
  try {
    await persistBundleToApi(bundleSnapshot);
    loadError = null;
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not save salary workspace.";
    loadError = message;
    emit();
    throw new Error(message);
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (localDirty || isDemoDataMode() || !requireToken()) return;
    void reloadSalaryWorkspace();
  });

  window.addEventListener("beforeunload", () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    if (!requireToken() || isDemoDataMode() || !localDirty) return;
    void persistBundleToApi(bundleSnapshot).catch(() => {
      /* best-effort on tab close */
    });
  });
}
