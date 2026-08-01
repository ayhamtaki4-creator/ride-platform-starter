import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const permissions = [
  ['trip:create', 'إنشاء رحلة'],
  ['trip:read:own', 'قراءة الرحلات الخاصة'],
  ['trip:read:any', 'قراءة جميع الرحلات'],
  ['trip:accept', 'قبول رحلة'],
  ['trip:update:own', 'تحديث الرحلة المرتبطة بالمستخدم'],
  ['trip:update:any', 'تحديث أي رحلة'],
  ['driver:read:own', 'قراءة ملف السائق الخاص'],
  ['driver:availability:update', 'تحديث حالة اتصال السائق'],
  ['user:read:any', 'قراءة المستخدمين'],
  ['user:update:any', 'تحديث المستخدمين'],
  ['driver:review', 'مراجعة السائقين'],
  ['pricing:manage', 'إدارة التسعير'],
  ['payment:refund', 'استرجاع المدفوعات'],
  ['support:manage', 'إدارة الدعم'],
  ['role:manage', 'إدارة الأدوار والصلاحيات'],
  ['audit:read:any', 'قراءة سجل العمليات']
] as const;

const allPermissionCodes = permissions.map(([code]) => code);

const rolePermissions: Record<string, string[]> = {
  PASSENGER: ['trip:create', 'trip:read:own', 'trip:update:own'],
  DRIVER: [
    'trip:read:own',
    'trip:accept',
    'trip:update:own',
    'driver:read:own',
    'driver:availability:update'
  ],
  SUPPORT_AGENT: ['trip:read:any', 'support:manage'],
  OPERATIONS_MANAGER: [
    'trip:read:any',
    'trip:update:any',
    'driver:review',
    'pricing:manage',
    'user:read:any',
    'audit:read:any'
  ],
  FINANCE_MANAGER: ['trip:read:any', 'payment:refund'],
  ADMIN: allPermissionCodes,
  SUPER_ADMIN: allPermissionCodes
};

async function assignRole(userId: string, roleCode: string) {
  const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId: role.id } },
    update: {},
    create: { userId, roleId: role.id }
  });
}

async function main() {
  for (const [code, name] of permissions) {
    await prisma.permission.upsert({
      where: { code },
      update: { name },
      create: { code, name }
    });
  }

  for (const [roleCode, codes] of Object.entries(rolePermissions)) {
    const role = await prisma.role.upsert({
      where: { code: roleCode },
      update: { name: roleCode },
      create: { code: roleCode, name: roleCode }
    });

    const dbPermissions = await prisma.permission.findMany({
      where: { code: { in: codes } }
    });

    for (const permission of dbPermissions) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id
          }
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: permission.id
        }
      });
    }
  }

  const passwordHash = await bcrypt.hash('ChangeMe123!', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: { status: 'ACTIVE' },
    create: {
      email: 'admin@example.com',
      passwordHash,
      firstName: 'System',
      lastName: 'Admin'
    }
  });
  await assignRole(admin.id, 'SUPER_ADMIN');

  const passenger = await prisma.user.upsert({
    where: { email: 'rider@example.com' },
    update: { status: 'ACTIVE' },
    create: {
      email: 'rider@example.com',
      passwordHash,
      firstName: 'Demo',
      lastName: 'Rider'
    }
  });
  await assignRole(passenger.id, 'PASSENGER');
  await prisma.passengerProfile.upsert({
    where: { userId: passenger.id },
    update: {},
    create: { userId: passenger.id }
  });

  const driverUser = await prisma.user.upsert({
    where: { email: 'driver@example.com' },
    update: { status: 'ACTIVE' },
    create: {
      email: 'driver@example.com',
      passwordHash,
      firstName: 'Demo',
      lastName: 'Driver'
    }
  });
  await assignRole(driverUser.id, 'DRIVER');

  const driverProfile = await prisma.driverProfile.upsert({
    where: { userId: driverUser.id },
    update: { status: 'APPROVED' },
    create: {
      userId: driverUser.id,
      status: 'APPROVED',
      availability: 'OFFLINE'
    }
  });

  await prisma.vehicle.upsert({
    where: { plateNumber: 'DEMO-001' },
    update: {
      driverProfileId: driverProfile.id,
      make: 'Toyota',
      model: 'Corolla',
      year: 2024,
      color: 'White',
      isActive: true
    },
    create: {
      driverProfileId: driverProfile.id,
      make: 'Toyota',
      model: 'Corolla',
      year: 2024,
      color: 'White',
      plateNumber: 'DEMO-001'
    }
  });

  console.log('Seed completed.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
