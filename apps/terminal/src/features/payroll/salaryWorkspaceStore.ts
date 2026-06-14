import { apiFetch } from "@/features/api-client";
import { readValidAccessToken } from "@/features/auth/authSession";
import { isDemoDataMode } from "@/shared/config/env";
import {
  clearLegacyLocalSalaryStorage,
  coerceSalarySheetBundle,
  emptySalarySheetBundle,
  readLegacyLocalSalaryBundle,
  type SalarySheetBundle,
} from "../../lib/salarySheetStorage";

type ApiSalaryWorkspace = SalarySheetBundle & { updatedAt?: string };

let bundleSnapshot: SalarySheetBundle = emptySalarySheetBundle();
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

function emit() {
  refreshLoadStateSnapshot();
  for (const fn of listeners) fn();
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
  if (!token) return;
  await apiFetch<ApiSalaryWorkspace>("/payroll/workspace", {
    method: "PUT",
    token,
    body: JSON.stringify({
      selectedMonthKey: bundle.selectedMonthKey,
      months: bundle.months,
    }),
  });
}

function schedulePersist() {
  if (isDemoDataMode()) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    if (!requireToken()) return;
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
  bundleSnapshot = updater(bundleSnapshot);
  emit();
  schedulePersist();
}

async function maybeMigrateLegacyLocal(bundle: SalarySheetBundle): Promise<SalarySheetBundle> {
  const legacy = readLegacyLocalSalaryBundle();
  if (!legacy) return bundle;

  const hasApiMonths = Object.keys(bundle.months).some((k) => {
    const doc = bundle.months[k];
    return doc && doc.rows.some((r) => r.name.trim() || r.basic > 0);
  });
  if (hasApiMonths) {
    clearLegacyLocalSalaryStorage();
    return bundle;
  }

  const merged = legacy;
  if (requireToken()) {
    try {
      await persistBundleToApi(merged);
      clearLegacyLocalSalaryStorage();
    } catch {
      return merged;
    }
  }
  return merged;
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
      let bundle = await fetchBundleFromApi();
      bundle = await maybeMigrateLegacyLocal(bundle);
      bundleSnapshot = bundle;
      loadedFromApi = true;
      loadError = null;
    } catch (e) {
      loadError =
        e instanceof Error ? e.message : "Could not load salary workspace.";
    } finally {
      loading = false;
      emit();
    }
  })();

  return loadPromise;
}

export async function flushSalaryWorkspacePersist(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (persistInFlight) await persistInFlight;
  if (isDemoDataMode() || !requireToken()) return;
  await persistBundleToApi(bundleSnapshot);
}
