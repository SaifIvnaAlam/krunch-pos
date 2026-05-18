import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  AUTH_EXPIRED_EVENT,
  isAccessTokenExpired,
} from "./authSession";
import { loginWithEmail, logout } from "./authApi";
import {
  clearApiTokens,
  readAccessToken,
  readApiProfileName,
  writeApiProfileName,
  writeTokens,
} from "./tokenStorage";
import { getDefaultBranchId, getDefaultTerminalId } from "@/shared/config/env";

export type SessionContextValue = {
  mode: "api";
  isSignedIn: boolean;
  userName: string;
  accessToken: string | null;
  /** @deprecated No-op — use signInWithCredentials. */
  signIn: (opts?: { userName?: string }) => void;
  signInWithCredentials: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

function initialAccessToken(): string | null {
  const t = readAccessToken();
  if (!t || isAccessTokenExpired(t)) {
    clearApiTokens();
    return null;
  }
  return t;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [apiAccessToken, setApiAccessToken] = useState<string | null>(
    initialAccessToken,
  );
  const [apiUserName, setApiUserName] = useState(() => {
    const t = initialAccessToken();
    return t ? readApiProfileName() : "";
  });

  useEffect(() => {
    const onExpired = () => {
      setApiAccessToken(null);
      setApiUserName("");
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  const signIn = useCallback((_opts?: { userName?: string }) => {
    /* API-only terminal — mock sign-in removed */
  }, []);

  const signInWithCredentials = useCallback(
    async (email: string, password: string) => {
      const result = await loginWithEmail({
        email: email.trim(),
        password,
        terminalId: getDefaultTerminalId(),
        branchId: getDefaultBranchId(),
      });
      writeTokens(result.accessToken, result.refreshToken);
      writeApiProfileName(result.staffProfile.name);
      setApiAccessToken(result.accessToken);
      setApiUserName(result.staffProfile.name);
    },
    [],
  );

  const signOut = useCallback(async () => {
    const token = readAccessToken();
    if (token) {
      try {
        await logout(token);
      } catch {
        /* still clear locally */
      }
    }
    clearApiTokens();
    setApiAccessToken(null);
    setApiUserName("");
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      mode: "api",
      isSignedIn: Boolean(apiAccessToken),
      userName: apiUserName,
      accessToken: apiAccessToken,
      signIn,
      signInWithCredentials,
      signOut,
    }),
    [apiAccessToken, apiUserName, signIn, signInWithCredentials, signOut],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return ctx;
}
