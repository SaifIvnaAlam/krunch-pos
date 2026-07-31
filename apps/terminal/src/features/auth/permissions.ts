/** Mirror of API RBAC checks — UI only; server is the hard edge. */
export function hasPermission(
  permissions: string[] | null | undefined,
  required: string,
): boolean {
  if (!permissions?.length) return false;
  if (permissions.includes("*")) return true;
  return permissions.includes(required);
}

/** Users & Access (portal accounts). */
export const PERM_STAFF_READ = "staff:read";
export const PERM_STAFF_CREATE = "staff:create";
export const PERM_STAFF_EDIT = "staff:edit";
