import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

const BCRYPT_SALT_ROUNDS = 10;
const PBKDF2_ITERATIONS = 100000;

const SYSTEM_ROLES = [
  {
    name: 'SUPER_ADMIN',
    description: 'Global. Vendor level only.',
    isSystem: true,
    permissions: ['*'],
  },
  {
    name: 'OWNER',
    description: 'Global. Full access all branches.',
    isSystem: true,
    permissions: [
      'orders:create', 'orders:modify', 'orders:void', 'orders:void_item',
      'orders:hold', 'orders:discount', 'orders:price_override', 'orders:split',
      'orders:merge', 'orders:transfer', 'payments:process', 'payments:refund',
      'payments:void', 'payments:view', 'payments:report', 'menu:read',
      'menu:edit', 'menu:create', 'menu:delete', 'menu:86',
      'inventory:read', 'inventory:adjust', 'inventory:waste_log',
      'staff:read', 'staff:create', 'staff:edit', 'staff:deactivate',
      'staff:assign_role', 'roles:create', 'roles:edit', 'roles:delete',
      'reports:branch', 'reports:global', 'audit:read', 'system:config',
      'daily_entry:read', 'daily_entry:write',
      'storage:read', 'storage:write',
    ],
  },
  {
    name: 'ADMIN',
    description: 'Global. Staff and menu management.',
    isSystem: true,
    permissions: [
      'orders:create', 'orders:modify', 'orders:void', 'orders:void_item',
      'orders:hold', 'orders:discount', 'orders:split', 'orders:merge',
      'orders:transfer', 'payments:process', 'payments:refund', 'payments:void',
      'payments:view', 'payments:report', 'menu:read', 'menu:edit',
      'menu:create', 'menu:delete', 'menu:86', 'inventory:read',
      'inventory:adjust', 'inventory:waste_log', 'staff:read', 'staff:create',
      'staff:edit', 'staff:deactivate', 'staff:assign_role', 'roles:create',
      'roles:edit', 'roles:delete', 'reports:branch', 'reports:global',
      'audit:read', 'system:config',
      'daily_entry:read', 'daily_entry:write',
      'storage:read', 'storage:write',
    ],
  },
  {
    name: 'BRANCH_MANAGER',
    description: 'Branch-scoped. Full access own branch.',
    isSystem: true,
    permissions: [
      'orders:create', 'orders:modify', 'orders:void', 'orders:void_item',
      'orders:hold', 'orders:discount', 'orders:price_override', 'orders:split',
      'orders:merge', 'orders:transfer', 'payments:process', 'payments:refund',
      'payments:void', 'payments:view', 'payments:report', 'menu:read',
      'menu:edit', 'menu:create', 'menu:delete', 'menu:86',
      'inventory:read', 'inventory:adjust', 'inventory:waste_log',
      'staff:read', 'staff:create', 'staff:edit', 'staff:deactivate',
      'staff:assign_role', 'reports:branch', 'audit:read',
      'daily_entry:read', 'daily_entry:write',
      'storage:read', 'storage:write',
    ],
  },
  {
    name: 'SERVER',
    description: 'Branch-scoped. Orders, own tables.',
    isSystem: true,
    permissions: [
      'orders:create', 'orders:modify', 'orders:hold',
      'payments:process', 'payments:view', 'menu:read',
    ],
  },
  {
    name: 'CASHIER',
    description: 'Branch-scoped. Counter orders, payments.',
    isSystem: true,
    permissions: [
      'orders:create', 'orders:modify', 'payments:process',
      'payments:view', 'payments:report', 'menu:read',
    ],
  },
  {
    name: 'KITCHEN',
    description: 'Branch-scoped. KDS view only.',
    isSystem: true,
    permissions: [
      'orders:create', 'menu:read', 'menu:86',
    ],
  },
  {
    name: 'AUDITOR',
    description: 'Global. Read-only all reports.',
    isSystem: true,
    permissions: [
      'payments:view', 'payments:report', 'menu:read',
      'inventory:read', 'staff:read', 'reports:branch',
      'reports:global', 'audit:read', 'storage:read',
    ],
  },
];

function derivePbkdf2(pin: string, salt: Buffer): string {
  return crypto.pbkdf2Sync(pin, salt, PBKDF2_ITERATIONS, 64, 'sha256').toString('hex');
}

type SeedPortalConfig = {
  name: string;
  email: string;
  password: string;
  pin: string;
};

const PORTAL_STAFF_ID = 'staff-azmain-fahim';
const PORTAL_ROLE_ASSIGNMENT_ID = 'staff-azmain-fahim-role';

function readSeedPortalConfig(): SeedPortalConfig {
  const email = process.env.SEED_OWNER_EMAIL?.trim() || 'azmainfahimanjum@gmail.com';
  const password = process.env.SEED_OWNER_PASSWORD?.trim();
  const name = process.env.SEED_OWNER_NAME?.trim().replace(/^["']|["']$/g, '') || 'Azmain Fahim Anjum';
  const pin = process.env.SEED_STAFF_PIN?.trim();

  if (password) {
    if (password.length < 8) {
      throw new Error('SEED_OWNER_PASSWORD must be at least 8 characters.');
    }
    return {
      name,
      email,
      password,
      pin: pin || crypto.randomBytes(4).toString('hex'),
    };
  }

  const allowDevDefaults =
    process.env.SEED_ALLOW_DEV_DEFAULTS === 'true' || process.env.NODE_ENV !== 'production';

  if (allowDevDefaults) {
    console.warn(
      'Using local dev seed credentials. Set SEED_OWNER_PASSWORD in deploy/.env before production deploy.',
    );
    return {
      name,
      email,
      password: 'Welcome123!',
      pin: pin || '1234',
    };
  }

  throw new Error(
    'Missing SEED_OWNER_PASSWORD. Add it to deploy/.env before seeding production.',
  );
}

function readBranchAddress(): string | null {
  const address = process.env.SEED_BRANCH_ADDRESS?.trim();
  return address || null;
}

function readBranchTimezone(): string {
  return (
    process.env.SEED_BRANCH_TIMEZONE?.trim() ||
    process.env.GENERIC_TIMEZONE?.trim() ||
    'Asia/Dhaka'
  );
}

async function removeDemoSeedData(): Promise<void> {
  const demoMenuItemIds = ['seed-welcome-burger'];

  await prisma.orderItem.deleteMany({
    where: { menuItemId: { in: demoMenuItemIds } },
  });
  await prisma.menuItem.deleteMany({
    where: { id: { in: demoMenuItemIds } },
  });
}

async function removeLegacyPortalStaff(reassignToStaffId: string): Promise<void> {
  const legacyStaffIds = ['default-owner', 'staff-alam-saifivn'];

  await prisma.dailyEntry.updateMany({
    where: { enteredByStaffId: { in: legacyStaffIds } },
    data: { enteredByStaffId: reassignToStaffId },
  });
  await prisma.dailyEntry.updateMany({
    where: { lockedByStaffId: { in: legacyStaffIds } },
    data: { lockedByStaffId: reassignToStaffId },
  });
  await prisma.order.updateMany({
    where: { staffId: { in: legacyStaffIds } },
    data: { staffId: reassignToStaffId },
  });
  await prisma.stockMovement.updateMany({
    where: { staffId: { in: legacyStaffIds } },
    data: { staffId: reassignToStaffId },
  });
  await prisma.auditLog.updateMany({
    where: { staffId: { in: legacyStaffIds } },
    data: { staffId: reassignToStaffId },
  });
  await prisma.tempPermission.deleteMany({
    where: { staffId: { in: legacyStaffIds } },
  });
  await prisma.shift.deleteMany({
    where: { staffId: { in: legacyStaffIds } },
  });
  await prisma.staffRole.deleteMany({
    where: { staffId: { in: legacyStaffIds } },
  });
  await prisma.staff.deleteMany({
    where: { id: { in: legacyStaffIds } },
  });
}

async function main(): Promise<void> {
  console.log('Seeding system roles...');

  const DEFAULT_BRANCH_ID = 'a0000000-0000-4000-8000-000000000001';

  const systemStaffId = 'system-seeder';

  const roles = await Promise.all(
    SYSTEM_ROLES.map((role) =>
      prisma.role.upsert({
        where: { id: role.name.toLowerCase() },
        update: {
          permissions: role.permissions,
          description: role.description,
        },
        create: {
          id: role.name.toLowerCase(),
          name: role.name,
          description: role.description,
          isSystem: true,
          isCustom: false,
          permissions: role.permissions,
          createdBy: systemStaffId,
        },
      }),
    ),
  );

  console.log(`Seeded ${roles.length} system roles.`);

  const branchAddress = readBranchAddress();
  const branchTimezone = readBranchTimezone();

  await prisma.branch.upsert({
    where: { id: DEFAULT_BRANCH_ID },
    update: {
      name: 'Steak & Marrow',
      address: branchAddress,
      timezone: branchTimezone,
      isActive: true,
    },
    create: {
      id: DEFAULT_BRANCH_ID,
      name: 'Steak & Marrow',
      address: branchAddress,
      timezone: branchTimezone,
      isActive: true,
    },
  });

  await removeDemoSeedData();

  const portalConfig = readSeedPortalConfig();
  const pinHash = await bcrypt.hash(portalConfig.pin, BCRYPT_SALT_ROUNDS);
  const portalPasswordHash = await bcrypt.hash(portalConfig.password, BCRYPT_SALT_ROUNDS);

  async function upsertPortalStaff(opts: {
    id: string;
    name: string;
    email: string;
    passwordHash: string;
    pin: string;
    roleAssignmentId: string;
  }) {
    const staffPinSalt = crypto.randomBytes(32);
    const staff = await prisma.staff.upsert({
      where: { id: opts.id },
      update: {
        name: opts.name,
        email: opts.email,
        passwordHash: opts.passwordHash,
        pinHash,
        pbkdf2Hash: derivePbkdf2(opts.pin, staffPinSalt),
        pbkdf2Salt: staffPinSalt.toString('hex'),
        primaryBranchId: DEFAULT_BRANCH_ID,
        isActive: true,
      },
      create: {
        id: opts.id,
        name: opts.name,
        email: opts.email,
        passwordHash: opts.passwordHash,
        pinHash,
        pbkdf2Hash: derivePbkdf2(opts.pin, staffPinSalt),
        pbkdf2Salt: staffPinSalt.toString('hex'),
        isActive: true,
        primaryBranchId: DEFAULT_BRANCH_ID,
      },
    });

    await prisma.staffRole.upsert({
      where: { id: opts.roleAssignmentId },
      update: { staffId: staff.id, roleId: 'owner' },
      create: {
        id: opts.roleAssignmentId,
        staffId: staff.id,
        roleId: 'owner',
        assignedBy: systemStaffId,
      },
    });

    return staff;
  }

  const portalUser = await upsertPortalStaff({
    id: PORTAL_STAFF_ID,
    name: portalConfig.name,
    email: portalConfig.email,
    passwordHash: portalPasswordHash,
    pin: portalConfig.pin,
    roleAssignmentId: PORTAL_ROLE_ASSIGNMENT_ID,
  });

  await removeLegacyPortalStaff(PORTAL_STAFF_ID);

  console.log(`Seeded portal user: ${portalUser.name} (${portalUser.email})`);
  if (!process.env.SEED_STAFF_PIN?.trim()) {
    console.log('Generated a random staff PIN because SEED_STAFF_PIN was not set.');
  }
  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
