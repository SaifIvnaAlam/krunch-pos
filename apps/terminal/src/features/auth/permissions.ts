/** Mirror of API RBAC checks — UI only; server is the hard edge. */
export function hasPermission(
  permissions: string[] | null | undefined,
  required: string,
): boolean {
  if (!permissions?.length) return false;
  if (permissions.includes("*")) return true;
  return permissions.includes(required);
}

export function hasAnyPermission(
  permissions: string[] | null | undefined,
  required: string[],
): boolean {
  return required.some((p) => hasPermission(permissions, p));
}

/** Operational modules (daily entry, expenses, HR roster/payroll, reports). */
export const PERM_OPS_READ = "daily_entry:read";
export const PERM_OPS_WRITE = "daily_entry:write";
/** Users & Access (portal accounts). */
export const PERM_STAFF_READ = "staff:read";
export const PERM_STAFF_CREATE = "staff:create";
export const PERM_STAFF_EDIT = "staff:edit";
