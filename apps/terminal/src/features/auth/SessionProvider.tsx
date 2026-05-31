import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AUTH_EXPIRED_EVENT } from "./authSession";
import type { ActiveBranch } from "./types";
import { loginWithEmail, logout } from "./authApi";
import {
  clearActiveBranch,
  clearApiTokens,
  readAccessToken,
  readActiveBranch,
  readApiProfileName,
  writeActiveBranch,
  writeApiProfileName,
  writeTokens,
} from "./tokenStorage";
import { fetchStaffMe } from "@/features/staff/staffApi";
import { getDefaultBranchId, getDefaultTerminalId } from "@/shared/config/env";

const FALLBACK_BRANCH: ActiveBranch = {
  id: getDefaultBranchId(),
  name: "Restaurant",
  address: null,
};

export type SessionContextValue = {
  mode: "api";
  isSignedIn: boolean;
  userName: string;
  activeBranch: ActiveBranch;
  accessToken: string | null;
  /** @deprecated No-op — use signInWithCredentials. */
  signIn: (opts?: { userName?: string }) => void;
  signInWithCredentials: (
    email: string,
    password: string,
    branchId: string,
  ) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

function initialAccessToken(): string | null {
  return readAccessToken();
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [apiAccessToken, setApiAccessToken] = useState<string | null>(
    initialAccessToken,
  );
  const [apiUserName, setApiUserName] = useState(() => {
    const t = initialAccessToken();
    return t ? readApiProfileName() : "";
  });
  const [activeBranch, setActiveBranch] = useState<ActiveBranch>(() => {
    const t = initialAccessToken();
    return t ? (readActiveBranch() ?? FALLBACK_BRANCH) : FALLBACK_BRANCH;
  });

  useEffect(() => {
    const onExpired = () => {
      setApiAccessToken(null);
      setApiUserName("");
      setActiveBranch(FALLBACK_BRANCH);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  useEffect(() => {
    const token = apiAccessToken;
    if (!token) return;
    let cancelled = false;
    void fetchStaffMe(token)
      .then((me) => {
        if (cancelled) return;
        writeApiProfileName(me.name);
        setApiUserName(me.name);
        writeActiveBranch(me.activeBranch);
        setActiveBranch(me.activeBranch);
      })
      .catch(() => {
        /* keep cached branch from login / sessionStorage */
      });
    return () => {
      cancelled = true;
    };
  }, [apiAccessToken]);

  const signIn = useCallback((_opts?: { userName?: string }) => {
    /* API-only terminal — mock sign-in removed */
  }, []);

  const signInWithCredentials = useCallback(
    async (email: string, password: string, branchId: string) => {
      const result = await loginWithEmail({
        email: email.trim(),
        password,
        terminalId: getDefaultTerminalId(),
        branchId,
      });
      writeTokens(result.accessToken, result.refreshToken);
      writeApiProfileName(result.staffProfile.name);
      writeActiveBranch(result.activeBranch);
      setApiAccessToken(result.accessToken);
      setApiUserName(result.staffProfile.name);
      setActiveBranch(result.activeBranch);
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
    clearActiveBranch();
    setApiAccessToken(null);
    setApiUserName("");
    setActiveBranch(FALLBACK_BRANCH);
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      mode: "api",
      isSignedIn: Boolean(apiAccessToken),
      userName: apiUserName,
      activeBranch,
      accessToken: apiAccessToken,
      signIn,
      signInWithCredentials,
      signOut,
    }),
    [apiAccessToken, apiUserName, activeBranch, signIn, signInWithCredentials, signOut],
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
