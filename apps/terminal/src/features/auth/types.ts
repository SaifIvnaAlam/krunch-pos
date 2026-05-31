/** Mirrors `AuthResult` from `@universal-pos/api` (keep in sync manually until OpenAPI client exists). */
export type StaffProfile = {
  id: string;
  name: string;
  email: string | null;
  isActive: boolean;
  primaryBranchId: string | null;
};

export type ActiveBranch = {
  id: string;
  name: string;
  address: string | null;
};

export type AuthResultDto = {
  accessToken: string;
  refreshToken: string;
  staffProfile: StaffProfile;
  activeBranch: ActiveBranch;
  roles: string[];
  permissions: string[];
};

export type StaffMeDto = StaffProfile & {
  activeBranch: ActiveBranch;
  roles: Array<{ roleId: string; roleName: string; permissions: string[] }>;
};

export type RefreshTokensDto = {
  accessToken: string;
  refreshToken: string;
};
