/** Client license seats: 5 Admin + 3 Managerial input. */
export const ADMIN_SEAT_LIMIT = 5;
export const MANAGER_SEAT_LIMIT = 3;

/** Portal tiers shown in Users & Access (maps to system Role ids). */
export type PortalRoleTier = 'admin' | 'manager';

/** Active seats that count toward the Admin cap (OWNER is the seeded primary admin). */
export const ADMIN_ROLE_IDS = ['owner', 'admin'] as const;

/** Active seats that count toward the Manager cap. */
export const MANAGER_ROLE_IDS = ['branch_manager'] as const;

export function roleIdForTier(tier: PortalRoleTier): string {
  return tier === 'admin' ? 'admin' : 'branch_manager';
}

export function tierForRoleIds(roleIds: string[]): PortalRoleTier | null {
  if (roleIds.some((id) => (ADMIN_ROLE_IDS as readonly string[]).includes(id))) {
    return 'admin';
  }
  if (roleIds.some((id) => (MANAGER_ROLE_IDS as readonly string[]).includes(id))) {
    return 'manager';
  }
  return null;
}

export function parsePortalRoleTier(raw: unknown): PortalRoleTier | null {
  if (raw === 'admin' || raw === 'manager') return raw;
  return null;
}
