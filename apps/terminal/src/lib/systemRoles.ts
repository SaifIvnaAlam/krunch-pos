/** System roles assignable via Admin Controls (ids match Prisma seed). */
export const ASSIGNABLE_SYSTEM_ROLES = [
  {
    id: "admin",
    name: "ADMIN",
    description: "Global — staff, menu, and most operations",
  },
  {
    id: "branch_manager",
    name: "BRANCH_MANAGER",
    description: "Branch — full access for one location",
  },
  {
    id: "server",
    name: "SERVER",
    description: "Branch — orders and tables",
  },
  {
    id: "cashier",
    name: "CASHIER",
    description: "Branch — counter and payments",
  },
  {
    id: "kitchen",
    name: "KITCHEN",
    description: "Branch — kitchen display only",
  },
  {
    id: "auditor",
    name: "AUDITOR",
    description: "Global — read-only reports",
  },
] as const;

export function roleLabel(roleName: string): string {
  return roleName.replace(/_/g, " ");
}
