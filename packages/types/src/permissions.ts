export const PERMISSIONS = {
  ORDERS_CREATE: 'orders:create',
  ORDERS_MODIFY: 'orders:modify',
  ORDERS_VOID: 'orders:void',
  ORDERS_VOID_ITEM: 'orders:void_item',
  ORDERS_HOLD: 'orders:hold',
  ORDERS_DISCOUNT: 'orders:discount',
  ORDERS_PRICE_OVERRIDE: 'orders:price_override',
  ORDERS_SPLIT: 'orders:split',
  ORDERS_MERGE: 'orders:merge',
  ORDERS_TRANSFER: 'orders:transfer',
  PAYMENTS_PROCESS: 'payments:process',
  PAYMENTS_REFUND: 'payments:refund',
  PAYMENTS_VOID: 'payments:void',
  PAYMENTS_VIEW: 'payments:view',
  PAYMENTS_REPORT: 'payments:report',
  MENU_READ: 'menu:read',
  MENU_EDIT: 'menu:edit',
  MENU_CREATE: 'menu:create',
  MENU_DELETE: 'menu:delete',
  MENU_86: 'menu:86',
  INVENTORY_READ: 'inventory:read',
  INVENTORY_ADJUST: 'inventory:adjust',
  INVENTORY_WASTE_LOG: 'inventory:waste_log',
  STAFF_READ: 'staff:read',
  STAFF_CREATE: 'staff:create',
  STAFF_EDIT: 'staff:edit',
  STAFF_DEACTIVATE: 'staff:deactivate',
  STAFF_ASSIGN_ROLE: 'staff:assign_role',
  ROLES_CREATE: 'roles:create',
  ROLES_EDIT: 'roles:edit',
  ROLES_DELETE: 'roles:delete',
  REPORTS_BRANCH: 'reports:branch',
  REPORTS_GLOBAL: 'reports:global',
  AUDIT_READ: 'audit:read',
  SYSTEM_CONFIG: 'system:config',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const SYSTEM_ROLES = [
  'SUPER_ADMIN',
  'OWNER',
  'ADMIN',
  'BRANCH_MANAGER',
  'SERVER',
  'CASHIER',
  'KITCHEN',
  'AUDITOR',
] as const;

export type SystemRole = (typeof SYSTEM_ROLES)[number];

export const GLOBAL_ROLES: readonly SystemRole[] = ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'AUDITOR'];
export const BRANCH_SCOPED_ROLES: readonly SystemRole[] = ['BRANCH_MANAGER', 'SERVER', 'CASHIER', 'KITCHEN'];

export interface RoleDto {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isCustom: boolean;
  branchId: string | null;
  permissions: Permission[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRoleRequest {
  name: string;
  description?: string;
  branchId?: string | null;
  permissions: Permission[];
}

export interface TempElevationRequest {
  permissions: Permission[];
  branchId: string;
  validFrom: string;
  validUntil: string;
}
