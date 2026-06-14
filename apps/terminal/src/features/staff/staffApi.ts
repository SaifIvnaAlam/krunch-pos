import { apiFetch } from "@/features/api-client";
import type { StaffMeDto } from "@/features/auth/types";

export async function fetchStaffMe(token: string): Promise<StaffMeDto> {
  return apiFetch<StaffMeDto>("/staff/me", { method: "GET", token });
}
