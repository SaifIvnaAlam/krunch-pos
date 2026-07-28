import { apiFetch } from "@/features/api-client";
import { readValidAccessToken } from "@/features/auth/authSession";
import { isDemoDataMode } from "@/shared/config/env";

/** Cashbook class: kitchen vendors vs ops/other payables. */
export type LedgerBookPurpose = "vendor" | "item_purchase" | "other_expense";

export type LedgerAttachment = {
  fileName: string;
  mimeType: string;
  dataUrl: string;
};

export type LedgerSupplier = {
  id: string;
  name: string;
  bookPurpose: LedgerBookPurpose;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
};

/** Line items on a bill / purchase — name, qty, unit, rate, total. */
export type LedgerItemLine = {
  id: string;
  name: string;
  qty: number;
  unit: string;
  rateCents: number;
  totalCents: number;
};

export type PurchaseOrder = {
  kind: "purchase";
  id: string;
  ref: string;
  supplierId: string;
  date: string;
  status: "draft" | "sent" | "partial" | "received" | "cancelled";
  amountCents: number;
  note: string;
  items?: LedgerItemLine[];
};

export type ReturnLine = {
  id: string;
  description: string;
  qty: number;
  unit: string;
  creditCents: number;
};

export type PurchaseReturn = {
  kind: "return";
  id: string;
  ref: string;
  supplierId: string;
  linkedPurchaseId: string;
  date: string;
  reason: string;
  status: "draft" | "credited" | "cancelled";
  lines: ReturnLine[];
};

export type StockMove = PurchaseOrder | PurchaseReturn;

export type LedgerEntry = {
  id: string;
  supplierId: string;
  date: string;
  type: "invoice" | "payment" | "return_credit" | "adjustment";
  ref: string;
  memo: string;
  amountCents: number;
  /** Receipts / files on this bill or payment. */
  attachments?: LedgerAttachment[];
  /** Item breakdown (typically on bills). */
  items?: LedgerItemLine[];
  /** When true, entry cannot be edited or removed until unlocked. */
  isLocked?: boolean;
  lockedAt?: string;
};

export function isLedgerEntryLocked(entry: LedgerEntry | undefined | null): boolean {
  return Boolean(entry?.isLocked);
}

export type LedgerWorkspaceData = {
  suppliers: LedgerSupplier[];
  moves: StockMove[];
  ledger: LedgerEntry[];
};

export type LedgerWorkspace = LedgerWorkspaceData & {
  ledgerSupplierFilter: string;
  ledgerInvoiceDrawerPrefillSupplierId: string | null;
  ledgerPaymentDrawerPrefillSupplierId: string | null;
};

type ApiLedgerWorkspace = LedgerWorkspaceData & { updatedAt?: string };

const initialData: LedgerWorkspaceData = {
  suppliers: [],
  moves: [],
  ledger: [],
};

const initialWorkspace: LedgerWorkspace = {
  ...initialData,
  ledgerSupplierFilter: "",
  ledgerInvoiceDrawerPrefillSupplierId: null,
  ledgerPaymentDrawerPrefillSupplierId: null,
};

let workspaceSnapshot: LedgerWorkspace = structuredClone(initialWorkspace);
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

export function getWorkspace(): LedgerWorkspace {
  return workspaceSnapshot;
}

export function subscribeWorkspace(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getLedgerWorkspaceLoadState(): {
  loading: boolean;
  error: string | null;
  loaded: boolean;
} {
  return loadStateSnapshot;
}

function requireToken(): string | null {
  return readValidAccessToken();
}

/**
 * Drop retired “employees” cashbooks (and their lines), and normalize legacy
 * “owners” books to vendor — owner book type was removed from the product.
 */
function stripEmployeeCashbooks(data: LedgerWorkspaceData): {
  data: LedgerWorkspaceData;
  removed: boolean;
} {
  const employeeIds = new Set(
    data.suppliers
      .filter((s) => (s as { bookPurpose?: string }).bookPurpose === "employees")
      .map((s) => s.id),
  );
  let convertedOwners = false;
  const suppliers = data.suppliers
    .filter((s) => !employeeIds.has(s.id))
    .map((s) => {
      const prior = (s as { bookPurpose?: string }).bookPurpose;
      if (prior === "owners") convertedOwners = true;
      const bookPurpose: LedgerBookPurpose =
        prior === "item_purchase" || prior === "other_expense"
          ? prior
          : "vendor";
      return {
        ...s,
        bookPurpose,
      };
    });
  const moves = data.moves.filter((m) => !employeeIds.has(m.supplierId));
  const ledger = data.ledger
    .filter((e) => !employeeIds.has(e.supplierId))
    .map(normalizeLedgerEntryAttachments);
  const removed =
    employeeIds.size > 0 ||
    convertedOwners ||
    suppliers.length !== data.suppliers.length ||
    moves.length !== data.moves.length ||
    ledger.length !== data.ledger.length;
  return { data: { suppliers, moves, ledger }, removed };
}

/** Migrate legacy single `attachment` → `attachments[]`. */
function normalizeLedgerEntryAttachments(
  entry: LedgerEntry & { attachment?: LedgerAttachment },
): LedgerEntry {
  const legacy = entry.attachment;
  const fromArray = Array.isArray(entry.attachments) ? entry.attachments : [];
  const attachments =
    fromArray.length > 0 ? fromArray : legacy ? [legacy] : undefined;
  const { attachment: _legacy, ...rest } = entry;
  if (!attachments?.length) {
    const { attachments: _drop, ...without } = rest;
    return without;
  }
  return { ...rest, attachments };
}

async function fetchWorkspaceFromApi(): Promise<{
  data: LedgerWorkspaceData;
  strippedEmployees: boolean;
}> {
  const token = requireToken();
  if (!token) throw new Error("Sign in to load cashbooks.");
  const data = await apiFetch<ApiLedgerWorkspace>("/ledger/workspace", {
    method: "GET",
    token,
  });
  const raw: LedgerWorkspaceData = {
    suppliers: Array.isArray(data.suppliers) ? (data.suppliers as LedgerSupplier[]) : [],
    moves: Array.isArray(data.moves) ? (data.moves as StockMove[]) : [],
    ledger: Array.isArray(data.ledger)
      ? (data.ledger as LedgerEntry[]).map(normalizeLedgerEntryAttachments)
      : [],
  };
  const { data: cleaned, removed } = stripEmployeeCashbooks(raw);
  // Persist when legacy single-attachment rows were migrated to attachments[].
  const migratedAttachments = (data.ledger as { attachment?: unknown }[] | undefined)?.some(
    (e) => e && typeof e === "object" && "attachment" in e && e.attachment != null,
  );
  return {
    data: cleaned,
    strippedEmployees: removed || Boolean(migratedAttachments),
  };
}

async function persistWorkspaceToApi(data: LedgerWorkspaceData): Promise<void> {
  const token = requireToken();
  if (!token) return;
  await apiFetch<ApiLedgerWorkspace>("/ledger/workspace", {
    method: "PUT",
    token,
    body: JSON.stringify({
      suppliers: data.suppliers,
      moves: data.moves,
      ledger: data.ledger,
    }),
  });
}

function schedulePersist() {
  if (isDemoDataMode()) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const { suppliers, moves, ledger } = workspaceSnapshot;
    if (!requireToken()) return;
    persistInFlight = persistWorkspaceToApi({ suppliers, moves, ledger })
      .then(() => {
        loadError = null;
      })
      .catch((e) => {
        loadError =
          e instanceof Error ? e.message : "Could not save ledger workspace.";
      })
      .finally(() => {
        persistInFlight = null;
        emit();
      });
  }, 400);
}

export function setWorkspace(updater: (w: LedgerWorkspace) => LedgerWorkspace) {
  workspaceSnapshot = updater(workspaceSnapshot);
  emit();
  schedulePersist();
}

/** Loads ledger workspace from API once per session (skipped in demo mode). */
export function loadLedgerWorkspace(): Promise<void> {
  if (isDemoDataMode()) {
    loadedFromApi = true;
    return Promise.resolve();
  }
  // Retry after a failed attempt — otherwise a 403 at boot sticks forever.
  if (loadPromise && !loadError) return loadPromise;

  loading = true;
  loadError = null;
  emit();

  let attempt!: Promise<void>;
  attempt = (async () => {
    try {
      await applyFetchedWorkspace();
    } catch (e) {
      loadError =
        e instanceof Error ? e.message : "Could not load ledger workspace.";
      if (loadPromise === attempt) loadPromise = null;
    } finally {
      loading = false;
      emit();
    }
  })();
  loadPromise = attempt;

  return attempt;
}

/** Clear in-memory cashbooks (e.g. on sign-out) so the next session reloads. */
export function resetLedgerWorkspace(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  loadPromise = null;
  loadedFromApi = false;
  loadError = null;
  loading = false;
  workspaceSnapshot = structuredClone(initialWorkspace);
  refreshLoadStateSnapshot();
  emit();
}

/** Fetch the workspace from the API and replace the local snapshot with it. */
async function applyFetchedWorkspace(): Promise<void> {
  const { data, strippedEmployees } = await fetchWorkspaceFromApi();
  const filterStillValid = data.suppliers.some(
    (s) => s.id === workspaceSnapshot.ledgerSupplierFilter,
  );
  workspaceSnapshot = {
    ...workspaceSnapshot,
    suppliers: data.suppliers,
    moves: data.moves,
    ledger: data.ledger,
    ledgerSupplierFilter: filterStillValid
      ? workspaceSnapshot.ledgerSupplierFilter
      : "",
  };
  loadedFromApi = true;
  loadError = null;
  if (strippedEmployees) schedulePersist();
}

/**
 * Force a re-fetch from the API, discarding any debounced local write. Used
 * after a cross-module mutation elsewhere (e.g. deleting a whole daily entry
 * server-side removes that day's bills) so the store doesn't hold — or re-save —
 * stale rows. Caller should flush legitimate pending edits before mutating.
 */
export async function reloadLedgerWorkspace(): Promise<void> {
  if (isDemoDataMode()) return;
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  loading = true;
  loadError = null;
  emit();
  try {
    await applyFetchedWorkspace();
    loadPromise = Promise.resolve();
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "Could not reload ledger workspace.";
  } finally {
    loading = false;
    emit();
  }
}

/**
 * Cancel the debounced auto-persist WITHOUT writing. Used by the atomic daily
 * commit (I3): after reading the in-memory workspace to send in one cross-module
 * transaction, the store's own PUT must be suppressed so it can't race or write
 * a second (non-atomic) copy. Follow the commit with `reloadLedgerWorkspace()`.
 */
export function cancelLedgerWorkspacePersist(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
}

export async function flushLedgerWorkspacePersist(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (persistInFlight) await persistInFlight;
  if (isDemoDataMode() || !requireToken()) return;
  const { suppliers, moves, ledger } = workspaceSnapshot;
  await persistWorkspaceToApi({ suppliers, moves, ledger });
}
