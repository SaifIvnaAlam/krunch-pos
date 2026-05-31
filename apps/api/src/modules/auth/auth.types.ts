export interface AuthBranchSummary {
  id: string;
  name: string;
  address: string | null;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  staffProfile: {
    id: string;
    name: string;
    email: string | null;
    isActive: boolean;
    primaryBranchId: string | null;
  };
  activeBranch: AuthBranchSummary;
  roles: string[];
  permissions: string[];
}

export interface OverrideResult {
  overrideToken: string;
  action: string;
  expiresAt: number;
}
