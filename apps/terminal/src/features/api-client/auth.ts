import { readValidAccessToken } from "@/features/auth";

export function requireAccessToken(): string {
  const token = readValidAccessToken();
  if (!token) throw new Error("Session expired — sign out and sign in again.");
  return token;
}
