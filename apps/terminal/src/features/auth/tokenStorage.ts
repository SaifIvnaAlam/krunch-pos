const ACCESS = "universal_pos_terminal_access";
const REFRESH = "universal_pos_terminal_refresh";
const REMEMBERED_EMAIL = "universal_pos_terminal_remembered_email";
const REMEMBERED_BRANCH = "universal_pos_terminal_remembered_branch";
/** In-memory copy so API calls work when sessionStorage is blocked but sign-in succeeded. */
let memoryAccessToken: string | null = null;
let memoryRefreshToken: string | null = null;

export function readAccessToken(): string | null {
  try {
    const stored = sessionStorage.getItem(ACCESS);
    if (stored) return stored;
  } catch {
    /* private mode / blocked storage */
  }
  return memoryAccessToken;
}

export function readRefreshToken(): string | null {
  try {
    const stored = sessionStorage.getItem(REFRESH);
    if (stored) return stored;
  } catch {
    /* ignore */
  }
  return memoryRefreshToken;
}

export function writeTokens(access: string, refresh: string): void {
  memoryAccessToken = access;
  memoryRefreshToken = refresh;
  try {
    sessionStorage.setItem(ACCESS, access);
    sessionStorage.setItem(REFRESH, refresh);
  } catch {
    /* sessionStorage blocked — memory tokens still used for this tab */
  }
}

const API_PROFILE = "universal_pos_terminal_profile_name";
const API_PROFILE_EMAIL = "universal_pos_terminal_profile_email";
const ACTIVE_BRANCH = "universal_pos_terminal_active_branch";

export type StoredActiveBranch = {
  id: string;
  name: string;
  address: string | null;
};

export function readApiProfileName(): string {
  try {
    return sessionStorage.getItem(API_PROFILE) ?? "";
  } catch {
    return "";
  }
}

export function writeApiProfileName(name: string): void {
  try {
    sessionStorage.setItem(API_PROFILE, name);
  } catch {
    /* ignore */
  }
}

export function readApiProfileEmail(): string {
  try {
    return sessionStorage.getItem(API_PROFILE_EMAIL) ?? "";
  } catch {
    return "";
  }
}

export function writeApiProfileEmail(email: string): void {
  try {
    const trimmed = email.trim().toLowerCase();
    if (trimmed) sessionStorage.setItem(API_PROFILE_EMAIL, trimmed);
    else sessionStorage.removeItem(API_PROFILE_EMAIL);
  } catch {
    /* ignore */
  }
}

export function readActiveBranch(): StoredActiveBranch | null {
  try {
    const raw = sessionStorage.getItem(ACTIVE_BRANCH);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredActiveBranch;
    if (typeof parsed?.name !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeActiveBranch(branch: StoredActiveBranch): void {
  try {
    sessionStorage.setItem(ACTIVE_BRANCH, JSON.stringify(branch));
  } catch {
    /* ignore */
  }
}

export function clearActiveBranch(): void {
  try {
    sessionStorage.removeItem(ACTIVE_BRANCH);
  } catch {
    /* ignore */
  }
}

export function clearApiTokens(): void {
  memoryAccessToken = null;
  memoryRefreshToken = null;
  try {
    sessionStorage.removeItem(ACCESS);
    sessionStorage.removeItem(REFRESH);
    sessionStorage.removeItem(API_PROFILE);
    sessionStorage.removeItem(API_PROFILE_EMAIL);
    sessionStorage.removeItem(ACTIVE_BRANCH);
  } catch {
    /* ignore */
  }
}

export function readRememberedEmail(): string {
  try {
    return localStorage.getItem(REMEMBERED_EMAIL) ?? "";
  } catch {
    return "";
  }
}

export function readRememberedBranchId(): string {
  try {
    return localStorage.getItem(REMEMBERED_BRANCH) ?? "";
  } catch {
    return "";
  }
}

export function writeRememberedLogin(email: string, branchId: string): void {
  try {
    localStorage.setItem(REMEMBERED_EMAIL, email.trim().toLowerCase());
    localStorage.setItem(REMEMBERED_BRANCH, branchId);
  } catch {
    /* ignore */
  }
}
