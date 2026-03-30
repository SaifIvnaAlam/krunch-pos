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
  roles: string[];
  permissions: string[];
}

export interface OverrideResult {
  overrideToken: string;
  action: string;
  expiresAt: number;
}
