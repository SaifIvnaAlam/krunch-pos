import { ApiRequestError } from "@/features/api-client";
import { fetchStaffMe } from "@/features/staff/staffApi";
import { getDefaultTerminalId, isDemoDataMode } from "@/shared/config/env";
import { loginWithEmail } from "./authApi";
import { readAccessToken, readRememberedEmail, writeTokens } from "./tokenStorage";

/**
 * Confirms the signed-in user's portal password before destructive actions.
 * In demo mode, any non-empty password is accepted (no API).
 */
export async function verifySessionPassword(
  password: string,
  branchId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const trimmed = password.trim();
  if (!trimmed) {
    return { ok: false, message: "Enter your password." };
  }

  if (isDemoDataMode()) {
    return { ok: true };
  }

  let email = readRememberedEmail().trim().toLowerCase();
  if (!email) {
    const token = readAccessToken();
    if (!token) {
      return { ok: false, message: "Sign in again to delete an employee." };
    }
    try {
      const me = await fetchStaffMe(token);
      email = (me.email ?? "").trim().toLowerCase();
    } catch {
      return { ok: false, message: "Could not verify your session. Sign in again." };
    }
  }

  if (!email) {
    return { ok: false, message: "No email on this account. Sign in again to delete." };
  }

  try {
    const result = await loginWithEmail({
      email,
      password: trimmed,
      terminalId: getDefaultTerminalId(),
      branchId,
    });
    writeTokens(result.accessToken, result.refreshToken);
    return { ok: true };
  } catch (e) {
    if (e instanceof ApiRequestError && (e.status === 401 || e.status === 403)) {
      return { ok: false, message: "Incorrect password." };
    }
    const message = e instanceof Error ? e.message : "Could not verify password.";
    return { ok: false, message };
  }
}
