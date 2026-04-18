import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

const STORAGE_KEY = "remi_pos_demo_auth";
const USER_NAME_KEY = "remi_pos_user_name";

function readStored(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function readStoredUserName(): string {
  try {
    return sessionStorage.getItem(USER_NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

type DevAuthContextValue = {
  isSignedIn: boolean;
  /** Display name for the signed-in session (empty when signed out). */
  userName: string;
  signIn: (opts?: { userName?: string }) => void;
  signOut: () => void;
};

const DevAuthContext = createContext<DevAuthContextValue | null>(null);

export function DevAuthProvider({ children }: { children: React.ReactNode }) {
  const [isSignedIn, setIsSignedIn] = useState(readStored);
  const [userName, setUserName] = useState(() =>
    readStored() ? readStoredUserName() : "",
  );

  const signIn = useCallback((opts?: { userName?: string }) => {
    const name = (opts?.userName ?? "").trim() || "Staff";
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
      sessionStorage.setItem(USER_NAME_KEY, name);
    } catch {
      /* ignore */
    }
    setIsSignedIn(true);
    setUserName(name);
  }, []);

  const signOut = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(USER_NAME_KEY);
    } catch {
      /* ignore */
    }
    setIsSignedIn(false);
    setUserName("");
  }, []);

  const value = useMemo(
    () => ({ isSignedIn, userName, signIn, signOut }),
    [isSignedIn, userName, signIn, signOut],
  );

  return (
    <DevAuthContext.Provider value={value}>{children}</DevAuthContext.Provider>
  );
}

export function useDevAuth() {
  const ctx = useContext(DevAuthContext);
  if (!ctx) {
    throw new Error("useDevAuth must be used within DevAuthProvider");
  }
  return ctx;
}
