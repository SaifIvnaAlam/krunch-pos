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
      'reports:global', 'audit:read',
    ],
  },
];

function derivePbkdf2(pin: string, salt: Buffer): string {
  return crypto.pbkdf2Sync(pin, salt, PBKDF2_ITERATIONS, 64, 'sha256').toString('hex');
}

async function main(): Promise<void> {
  console.log('Seeding system roles...');

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

  const defaultPin = '1234';
  const portalPassword = 'Owner123!';
  const pinHash = await bcrypt.hash(defaultPin, BCRYPT_SALT_ROUNDS);
  const passwordHash = await bcrypt.hash(portalPassword, BCRYPT_SALT_ROUNDS);
  const pbkdf2Salt = crypto.randomBytes(32);
  const pbkdf2Hash = derivePbkdf2(defaultPin, pbkdf2Salt);

  const owner = await prisma.staff.upsert({
    where: { id: 'default-owner' },
    update: {
      passwordHash,
      pinHash,
      pbkdf2Hash,
      pbkdf2Salt: pbkdf2Salt.toString('hex'),
    },
    create: {
      id: 'default-owner',
      name: 'Default Owner',
      email: 'owner@universalpos.local',
      passwordHash,
      pinHash,
      pbkdf2Hash,
      pbkdf2Salt: pbkdf2Salt.toString('hex'),
      isActive: true,
    },
  });

  await prisma.staffRole.upsert({
    where: { id: 'default-owner-role' },
    update: {},
    create: {
      id: 'default-owner-role',
      staffId: owner.id,
      roleId: 'owner',
      assignedBy: systemStaffId,
    },
  });

  console.log(
    `Seeded default OWNER staff: ${owner.name} (PIN: ${defaultPin}, email login: ${owner.email} / ${portalPassword})`,
  );
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
