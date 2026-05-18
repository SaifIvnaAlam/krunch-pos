const ACCESS = "universal_pos_terminal_access";
const REFRESH = "universal_pos_terminal_refresh";
const DEMO_FLAG = "remi_pos_demo_auth";
const DEMO_NAME = "remi_pos_user_name";

export function readAccessToken(): string | null {
  try {
    return sessionStorage.getItem(ACCESS);
  } catch {
    return null;
  }
}

export function readRefreshToken(): string | null {
  try {
    return sessionStorage.getItem(REFRESH);
  } catch {
    return null;
  }
}

export function writeTokens(access: string, refresh: string): void {
  try {
    sessionStorage.setItem(ACCESS, access);
    sessionStorage.setItem(REFRESH, refresh);
  } catch {
    /* ignore */
  }
}

const API_PROFILE = "universal_pos_terminal_profile_name";

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

export function clearApiTokens(): void {
  try {
    sessionStorage.removeItem(ACCESS);
    sessionStorage.removeItem(REFRESH);
    sessionStorage.removeItem(API_PROFILE);
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
