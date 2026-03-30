import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

const STORAGE_KEY = "remi_pos_demo_auth";

function readStored(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

type DevAuthContextValue = {
  isSignedIn: boolean;
  signIn: () => void;
  signOut: () => void;
};

const DevAuthContext = createContext<DevAuthContextValue | null>(null);

export function DevAuthProvider({ children }: { children: React.ReactNode }) {
  const [isSignedIn, setIsSignedIn] = useState(readStored);

  const signIn = useCallback(() => {
    sessionStorage.setItem(STORAGE_KEY, "1");
    setIsSignedIn(true);
  }, []);

  const signOut = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setIsSignedIn(false);
  }, []);

  const value = useMemo(
    () => ({ isSignedIn, signIn, signOut }),
    [isSignedIn, signIn, signOut],
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
