export interface JwtPayload {
  staffId: string;
  branchId: string;
  terminalId: string;
  roles: string[];
  permissions: string[];
  iat: number;
  exp: number;
}

export interface LoginRequest {
  staffId: string;
  pin: string;
  terminalId: string;
  branchId: string;
}

export interface NfcLoginRequest {
  nfcCardUid: string;
  terminalId: string;
  branchId: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  staffProfile: StaffProfile;
  roles: string[];
  permissions: string[];
}

export interface StaffProfile {
  id: string;
  name: string;
  email: string | null;
  isActive: boolean;
  primaryBranchId: string | null;
}

export interface OverrideRequest {
  managerPin: string;
  action: string;
  orderId?: string;
  staffId: string;
}

export interface OverrideResponse {
  overrideToken: string;
  action: string;
  expiresAt: number;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}
