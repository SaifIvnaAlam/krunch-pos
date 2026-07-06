import { apiFetch } from "@/features/api-client";
import { readValidAccessToken } from "@/features/auth/authSession";
import { isDemoDataMode } from "@/shared/config/env";
import {
  coerceSalarySheetBundle,
  emptySalarySheetBundle,
  mergeSalarySheetBundles,
  readLegacyLocalSalaryBundle,
  writeSalarySheetBundle,
  type SalarySheetBundle,
} from "../../lib/salarySheetStorage";

type ApiSalaryWorkspace = SalarySheetBundle & { updatedAt?: string };

let bundleSnapshot: SalarySheetBundle =
  readLegacyLocalSalaryBundle() ?? emptySalarySheetBundle();
const listeners = new Set<() => void>();
let loadPromise: Promise<void> | null = null;
let loadedFromApi = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistInFlight: Promise<void> | null = null;
let loadError: string | null = null;
let loading = false;
/** True after local edits; prevents a late API load from wiping unsaved salary data. */
let localDirty = false;

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
  localDirty = false;
  mirrorToLocalStorage(bundle);
}

function schedulePersist() {
  if (isDemoDataMode()) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    if (!requireToken()) {
      loadError = "Sign in to save salary registers.";
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
  bundleSnapshot = updater(bundleSnapshot);
  localDirty = true;
  mirrorToLocalStorage(bundleSnapshot);
  emit();
  schedulePersist();
}

async function reconcileWithLocalCache(remote: SalarySheetBundle): Promise<SalarySheetBundle> {
  const local = readLegacyLocalSalaryBundle();
  if (!local) return remote;

  const merged = mergeSalarySheetBundles(remote, local);
  mirrorToLocalStorage(merged);

  const localIsNewer = JSON.stringify(merged) !== JSON.stringify(remote);
  if (localIsNewer && requireToken()) {
    try {
      await persistBundleToApi(merged);
    } catch {
      /* keep merged local snapshot; schedulePersist will retry on next edit */
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
      bundle = await reconcileWithLocalCache(bundle);
      if (!localDirty) {
        bundleSnapshot = bundle;
        mirrorToLocalStorage(bundle);
      }
      loadedFromApi = true;
      loadError = null;
    } catch (e) {
      const local = readLegacyLocalSalaryBundle();
      if (local && !localDirty) {
        bundleSnapshot = local;
        loadError = null;
        loadedFromApi = true;
      } else {
        loadError =
          e instanceof Error ? e.message : "Could not load salary workspace.";
      }
    } finally {
      loading = false;
      emit();
    }
  })();

  return loadPromise;
}

/** Force a fresh API load (e.g. after sign-in). */
export function reloadSalaryWorkspace(): Promise<void> {
  loadPromise = null;
  loadedFromApi = false;
  return loadSalaryWorkspace();
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
  window.addEventListener("beforeunload", () => {
    mirrorToLocalStorage(bundleSnapshot);
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    if (!requireToken() || isDemoDataMode()) return;
    void persistBundleToApi(bundleSnapshot).catch(() => {
      /* best-effort on tab close */
    });
  });
}
