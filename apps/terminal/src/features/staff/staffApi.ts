import { apiFetch } from "@/features/api-client";
import type { StaffMeDto } from "@/features/auth/types";

export type PortalRoleTier = "admin" | "manager";

export type StaffListItemDto = {
  id: string;
  name: string;
  email: string | null;
  isActive: boolean;
  primaryBranchId: string | null;
  roleTier: PortalRoleTier | null;
  roles: Array<{ roleId: string; roleName: string; branchId: string | null }>;
};

export type StaffSeatUsage = {
  admin: { used: number; limit: number };
  manager: { used: number; limit: number };
};

export type StaffListResponse = {
  staff: StaffListItemDto[];
  seats: StaffSeatUsage;
};

export type CreateStaffDto = {
  name: string;
  email: string;
  password: string;
  roleTier: PortalRoleTier;
};

export type UpdateStaffDto = {
  name?: string;
  email?: string;
  password?: string;
  isActive?: boolean;
};

export async function fetchStaffMe(token: string): Promise<StaffMeDto> {
  return apiFetch<StaffMeDto>("/staff/me", { method: "GET", token });
}

export async function listStaff(token: string): Promise<StaffListResponse> {
  return apiFetch<StaffListResponse>("/staff", { method: "GET", token });
}

export async function createStaff(
  token: string,
  dto: CreateStaffDto,
): Promise<{ id: string; name: string; email: string | null; roleTier: PortalRoleTier }> {
  return apiFetch("/staff", {
    method: "POST",
    token,
    body: JSON.stringify(dto),
  });
}

export async function updateStaff(
  token: string,
  staffId: string,
  dto: UpdateStaffDto,
): Promise<{ id: string; name: string }> {
  return apiFetch(`/staff/${encodeURIComponent(staffId)}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(dto),
  });
}
