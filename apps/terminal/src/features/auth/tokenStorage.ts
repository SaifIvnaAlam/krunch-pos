const ACCESS = "universal_pos_terminal_access";
const REFRESH = "universal_pos_terminal_refresh";
const REMEMBERED_EMAIL = "universal_pos_terminal_remembered_email";
const REMEMBERED_BRANCH = "universal_pos_terminal_remembered_branch";
const DEMO_FLAG = "remi_pos_demo_auth";
const DEMO_NAME = "remi_pos_user_name";

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

export function clearApiProfileName(): void {
  try {
    sessionStorage.removeItem(API_PROFILE);
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
    sessionStorage.removeItem(ACTIVE_BRANCH);
  } catch {
    /* ignore */
  }
}

export function readDemoSignedIn(): boolean {
  try {
    return sessionStorage.getItem(DEMO_FLAG) === "1";
  } catch {
    return false;
  }
}

export function writeDemoSession(userName: string): void {
  try {
    sessionStorage.setItem(DEMO_FLAG, "1");
    sessionStorage.setItem(DEMO_NAME, userName);
  } catch {
    /* ignore */
  }
}

export function clearDemoSession(): void {
  try {
    sessionStorage.removeItem(DEMO_FLAG);
    sessionStorage.removeItem(DEMO_NAME);
  } catch {
    /* ignore */
  }
}

export function readDemoUserName(): string {
  try {
    return sessionStorage.getItem(DEMO_NAME) ?? "";
  } catch {
    return "";
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
