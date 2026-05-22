import { apiFetch } from "@/features/api-client";
import type { AuthResultDto } from "./types";

export async function loginWithEmail(body: {
  email: string;
  password: string;
  terminalId: string;
  branchId: string;
}): Promise<AuthResultDto> {
  return apiFetch<AuthResultDto>("/auth/login/email", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function logout(accessToken: string): Promise<void> {
  await apiFetch<{ message: string }>("/auth/logout", {
    method: "POST",
    token: accessToken,
  });
}
