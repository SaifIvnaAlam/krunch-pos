import { apiFetch } from "@/features/api-client";
import { requireAccessToken } from "@/features/api-client/auth";

export type ApiStaffMember = {
  id: string;
  name: string;
  email: string | null;
  isActive: boolean;
  primaryBranchId: string | null;
  roles: Array<{ roleId: string; roleName: string; branchId: string | null }>;
};

export async function fetchStaffFromApi(): Promise<ApiStaffMember[]> {
  const token = requireAccessToken();
  return apiFetch<ApiStaffMember[]>("/staff", { method: "GET", token });
}
