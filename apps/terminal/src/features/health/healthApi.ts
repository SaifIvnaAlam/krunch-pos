import { apiFetch } from "@/features/api-client";

export type HealthPayload = { status?: string; [key: string]: unknown };

/** Unauthenticated liveness (API must be up). */
export async function fetchHealth(): Promise<HealthPayload> {
  return apiFetch<HealthPayload>("/health", { method: "GET" });
}
