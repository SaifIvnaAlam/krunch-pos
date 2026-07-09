import { apiFetch } from "@/features/api-client";
import { readValidAccessToken } from "@/features/auth/authSession";
import { isDemoDataMode } from "@/shared/config/env";

export type LedgerBookPurpose = "vendor" | "owners" | "employees";

export type EmployeeLedgerLineKind =
  | "salary"
  | "service_charge"
  | "bonus"
  | "overtime";

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
  attachment?: LedgerAttachment;
  employeeLineKind?: EmployeeLedgerLineKind;
  /** Item breakdown (typically on bills). */
  items?: LedgerItemLine[];
};

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

async function fetchWorkspaceFromApi(): Promise<LedgerWorkspaceData> {
  const token = requireToken();
  if (!token) throw new Error("Sign in to load cashbooks.");
  const data = await apiFetch<ApiLedgerWorkspace>("/ledger/workspace", {
    method: "GET",
    token,
  });
  return {
    suppliers: Array.isArray(data.suppliers) ? (data.suppliers as LedgerSupplier[]) : [],
    moves: Array.isArray(data.moves) ? (data.moves as StockMove[]) : [],
    ledger: Array.isArray(data.ledger) ? (data.ledger as LedgerEntry[]) : [],
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
  if (loadPromise) return loadPromise;

  loading = true;
  loadError = null;
  emit();

  loadPromise = (async () => {
    try {
      const data = await fetchWorkspaceFromApi();
      workspaceSnapshot = {
        ...workspaceSnapshot,
        suppliers: data.suppliers,
        moves: data.moves,
        ledger: data.ledger,
      };
      loadedFromApi = true;
      loadError = null;
    } catch (e) {
      loadError =
        e instanceof Error ? e.message : "Could not load ledger workspace.";
    } finally {
      loading = false;
      emit();
    }
  })();

  return loadPromise;
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
