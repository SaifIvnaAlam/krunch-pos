import { apiFetch } from "@/features/api-client";
import type { ActiveBranch, AuthResultDto } from "./types";

export async function lookupRestaurantsForEmail(
  email: string,
): Promise<ActiveBranch[]> {
  const data = await apiFetch<{ restaurants: ActiveBranch[] }>(
    "/auth/login/restaurants",
    {
      method: "POST",
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    },
  );
  return data.restaurants ?? [];
}

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
