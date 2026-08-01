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
  ['user:read:any', 'قراءة المستخدمين'],
  ['user:update:any', 'تحديث المستخدمين'],
  ['driver:review', 'مراجعة السائقين'],
  ['pricing:manage', 'إدارة التسعير'],
  ['payment:refund', 'استرجاع المدفوعات'],
  ['support:manage', 'إدارة الدعم'],
  ['role:manage', 'إدارة الأدوار والصلاحيات']
] as const;

const rolePermissions: Record<string, string[]> = {
  PASSENGER: ['trip:create', 'trip:read:own', 'trip:update:own'],
  DRIVER: ['trip:read:own', 'trip:accept', 'trip:update:own'],
  SUPPORT_AGENT: ['trip:read:any', 'support:manage'],
  OPERATIONS_MANAGER: ['trip:read:any', 'trip:update:any', 'driver:review', 'pricing:manage'],
  FINANCE_MANAGER: ['trip:read:any', 'payment:refund'],
  ADMIN: permissions.map(([code]) => code),
  SUPER_ADMIN: permissions.map(([code]) => code)
};

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

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: 'SUPER_ADMIN' } });
  const passwordHash = await bcrypt.hash('ChangeMe123!', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      passwordHash,
      firstName: 'System',
      lastName: 'Admin'
    }
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: adminRole.id }
  });


  const passengerRole = await prisma.role.findUniqueOrThrow({ where: { code: 'PASSENGER' } });
  const driverRole = await prisma.role.findUniqueOrThrow({ where: { code: 'DRIVER' } });

  const passenger = await prisma.user.upsert({
    where: { email: 'rider@example.com' },
    update: {},
    create: {
      email: 'rider@example.com',
      passwordHash,
      firstName: 'Demo',
      lastName: 'Rider',
      passengerProfile: { create: {} }
    }
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: passenger.id, roleId: passengerRole.id } },
    update: {},
    create: { userId: passenger.id, roleId: passengerRole.id }
  });

  const driverUser = await prisma.user.upsert({
    where: { email: 'driver@example.com' },
    update: {},
    create: {
      email: 'driver@example.com',
      passwordHash,
      firstName: 'Demo',
      lastName: 'Driver',
      driverProfile: {
        create: {
          status: 'APPROVED',
          availability: 'ONLINE',
          vehicles: {
            create: {
              make: 'Toyota',
              model: 'Corolla',
              year: 2024,
              color: 'White',
              plateNumber: 'DEMO-001'
            }
          }
        }
      }
    }
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: driverUser.id, roleId: driverRole.id } },
    update: {},
    create: { userId: driverUser.id, roleId: driverRole.id }
  });

  console.log('Seed completed.');

}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
