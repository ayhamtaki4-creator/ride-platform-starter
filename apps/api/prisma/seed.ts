import {
  BookingDirection,
  BookingType,
  LocationType,
  PrismaClient,
  RegionKind,
  RouteType
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const permissions = [
  ['booking:create', 'إنشاء حجز'],
  ['booking:read:own', 'قراءة الحجوزات الخاصة'],
  ['booking:read:any', 'قراءة جميع الحجوزات'],
  ['booking:update:any', 'تأكيد ورفض الحجوزات'],
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
  ['route:manage', 'إدارة المواقع والمسارات'],
  ['media:manage', 'إدارة ملفات الوسائط'],
  ['compliance:read', 'قراءة وثائق الامتثال'],
  ['compliance:manage', 'إدارة وثائق ومتطلبات الامتثال'],
  ['payment:refund', 'استرجاع المدفوعات'],
  ['support:manage', 'إدارة الدعم'],
  ['role:manage', 'إدارة الأدوار والصلاحيات'],
  ['audit:read:any', 'قراءة سجل العمليات']
] as const;

const allPermissionCodes = permissions.map(([code]) => code);

const rolePermissions: Record<string, string[]> = {
  PASSENGER: [
    'booking:create',
    'booking:read:own',
    'trip:create',
    'trip:read:own',
    'trip:update:own'
  ],
  DRIVER: [
    'trip:read:own',
    'trip:accept',
    'trip:update:own',
    'driver:read:own',
    'driver:availability:update'
  ],
  SUPPORT_AGENT: ['trip:read:any', 'support:manage'],
  OPERATIONS_MANAGER: [
    'booking:read:any',
    'booking:update:any',
    'trip:read:any',
    'trip:update:any',
    'driver:review',
    'pricing:manage',
    'route:manage',
    'media:manage',
    'compliance:read',
    'compliance:manage',
    'user:read:any',
    'user:update:any',
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

async function upsertRegion(input: {
  code: string;
  nameAr: string;
  nameEn?: string;
  countryCode: string;
  kind: RegionKind;
}) {
  return prisma.serviceRegion.upsert({
    where: { code: input.code },
    update: { ...input, isActive: true },
    create: { ...input, isActive: true }
  });
}

async function upsertLocation(input: {
  code: string;
  nameAr: string;
  nameEn?: string;
  type: LocationType;
  countryCode: string;
  city?: string;
  governorate?: string;
  latitude?: number;
  longitude?: number;
}) {
  return prisma.serviceLocation.upsert({
    where: { code: input.code },
    update: { ...input, isActive: true },
    create: { ...input, isActive: true }
  });
}

async function upsertRoute(input: {
  code: string;
  nameAr: string;
  nameEn?: string;
  originCode: string;
  destinationCode: string;
  routeType: RouteType;
  requiresFlightDetails?: boolean;
  estimatedMinutes?: number;
  distanceKm?: number;
  requiredRegionCodes: string[];
}) {
  const [origin, destination, regions] = await Promise.all([
    prisma.serviceLocation.findUniqueOrThrow({ where: { code: input.originCode } }),
    prisma.serviceLocation.findUniqueOrThrow({ where: { code: input.destinationCode } }),
    prisma.serviceRegion.findMany({
      where: { code: { in: input.requiredRegionCodes } },
      select: { id: true, code: true }
    })
  ]);

  if (regions.length !== input.requiredRegionCodes.length) {
    throw new Error(`Missing required region for route ${input.code}`);
  }

  const route = await prisma.serviceRoute.upsert({
    where: { code: input.code },
    update: {
      nameAr: input.nameAr,
      nameEn: input.nameEn,
      originId: origin.id,
      destinationId: destination.id,
      routeType: input.routeType,
      requiresFlightDetails: input.requiresFlightDetails ?? false,
      estimatedMinutes: input.estimatedMinutes,
      distanceKm: input.distanceKm,
      isActive: true
    },
    create: {
      code: input.code,
      nameAr: input.nameAr,
      nameEn: input.nameEn,
      originId: origin.id,
      destinationId: destination.id,
      routeType: input.routeType,
      requiresFlightDetails: input.requiresFlightDetails ?? false,
      estimatedMinutes: input.estimatedMinutes,
      distanceKm: input.distanceKm,
      isActive: true
    }
  });

  await prisma.routeRequiredRegion.deleteMany({ where: { routeId: route.id } });
  await prisma.routeRequiredRegion.createMany({
    data: regions.map((region) => ({ routeId: route.id, regionId: region.id })),
    skipDuplicates: true
  });

  return route;
}

async function upsertComplianceRequirement(input: {
  regionCode: string;
  subject: 'DRIVER' | 'VEHICLE';
  documentType: string;
  minValidityDays?: number;
  regionScoped?: boolean;
  isActive?: boolean;
}) {
  const region = await prisma.serviceRegion.findUniqueOrThrow({
    where: { code: input.regionCode }
  });

  return prisma.regionDocumentRequirement.upsert({
    where: {
      regionId_subject_documentType: {
        regionId: region.id,
        subject: input.subject,
        documentType: input.documentType
      }
    },
    update: {
      minValidityDays: input.minValidityDays ?? 0,
      regionScoped: input.regionScoped ?? false,
      isActive: input.isActive ?? true
    },
    create: {
      regionId: region.id,
      subject: input.subject,
      documentType: input.documentType,
      minValidityDays: input.minValidityDays ?? 0,
      regionScoped: input.regionScoped ?? false,
      isActive: input.isActive ?? true
    }
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

  const regions = {
    SYRIA: await upsertRegion({
      code: 'SYRIA',
      nameAr: 'سوريا',
      nameEn: 'Syria',
      countryCode: 'SY',
      kind: 'COUNTRY_ACCESS',
    }),
    DAMASCUS: await upsertRegion({
      code: 'DAMASCUS',
      nameAr: 'مركز دمشق',
      nameEn: 'Damascus Hub',
      countryCode: 'SY',
      kind: 'OPERATING_HUB',
    }),
    LEBANON: await upsertRegion({
      code: 'LEBANON',
      nameAr: 'لبنان',
      nameEn: 'Lebanon',
      countryCode: 'LB',
      kind: 'COUNTRY_ACCESS',
    }),
    BEIRUT: await upsertRegion({
      code: 'BEIRUT',
      nameAr: 'مركز بيروت',
      nameEn: 'Beirut Hub',
      countryCode: 'LB',
      kind: 'OPERATING_HUB',
    }),
    JORDAN: await upsertRegion({
      code: 'JORDAN',
      nameAr: 'الأردن',
      nameEn: 'Jordan',
      countryCode: 'JO',
      kind: 'COUNTRY_ACCESS',
    }),
    AMMAN: await upsertRegion({
      code: 'AMMAN',
      nameAr: 'مركز عمّان',
      nameEn: 'Amman Hub',
      countryCode: 'JO',
      kind: 'OPERATING_HUB',
    })
  };

  const complianceRequirements = [
    { regionCode: 'SYRIA', subject: 'DRIVER' as const, documentType: 'DRIVER_LICENSE', isActive: false },
    { regionCode: 'SYRIA', subject: 'VEHICLE' as const, documentType: 'VEHICLE_REGISTRATION', isActive: false },
    { regionCode: 'SYRIA', subject: 'VEHICLE' as const, documentType: 'VEHICLE_INSURANCE', isActive: false },
    { regionCode: 'JORDAN', subject: 'DRIVER' as const, documentType: 'REGION_ENTRY_PERMIT', minValidityDays: 7, regionScoped: true },
    { regionCode: 'JORDAN', subject: 'VEHICLE' as const, documentType: 'REGION_ENTRY_PERMIT', minValidityDays: 7, regionScoped: true },
    { regionCode: 'LEBANON', subject: 'DRIVER' as const, documentType: 'REGION_ENTRY_PERMIT', minValidityDays: 7, regionScoped: true },
    { regionCode: 'LEBANON', subject: 'VEHICLE' as const, documentType: 'REGION_ENTRY_PERMIT', minValidityDays: 7, regionScoped: true }
  ];

  for (const requirement of complianceRequirements) {
    await upsertComplianceRequirement(requirement);
  }

  const locations = [
    { code: 'DAMASCUS', nameAr: 'دمشق', nameEn: 'Damascus', type: 'CITY', countryCode: 'SY', city: 'دمشق', latitude: 33.5138, longitude: 36.2765 },
    { code: 'DAMASCUS_AIRPORT', nameAr: 'مطار دمشق الدولي', nameEn: 'Damascus International Airport', type: 'AIRPORT', countryCode: 'SY', city: 'دمشق' },
    { code: 'BEIRUT', nameAr: 'بيروت', nameEn: 'Beirut', type: 'CITY', countryCode: 'LB', city: 'بيروت' },
    { code: 'BEIRUT_AIRPORT', nameAr: 'مطار بيروت الدولي', nameEn: 'Beirut–Rafic Hariri International Airport', type: 'AIRPORT', countryCode: 'LB', city: 'بيروت', latitude: 33.8209, longitude: 35.4884 },
    { code: 'AMMAN', nameAr: 'عمّان', nameEn: 'Amman', type: 'CITY', countryCode: 'JO', city: 'عمّان' },
    { code: 'QUEEN_ALIA_AIRPORT', nameAr: 'مطار الملكة علياء الدولي', nameEn: 'Queen Alia International Airport', type: 'AIRPORT', countryCode: 'JO', city: 'عمّان' },
    { code: 'RIF_DIMASHQ', nameAr: 'ريف دمشق', nameEn: 'Rif Dimashq', type: 'GOVERNORATE', countryCode: 'SY', governorate: 'ريف دمشق' },
    { code: 'ALEPPO', nameAr: 'حلب', nameEn: 'Aleppo', type: 'GOVERNORATE', countryCode: 'SY', governorate: 'حلب' },
    { code: 'HOMS', nameAr: 'حمص', nameEn: 'Homs', type: 'GOVERNORATE', countryCode: 'SY', governorate: 'حمص' },
    { code: 'HAMA', nameAr: 'حماة', nameEn: 'Hama', type: 'GOVERNORATE', countryCode: 'SY', governorate: 'حماة' },
    { code: 'LATAKIA', nameAr: 'اللاذقية', nameEn: 'Latakia', type: 'GOVERNORATE', countryCode: 'SY', governorate: 'اللاذقية' },
    { code: 'TARTUS', nameAr: 'طرطوس', nameEn: 'Tartus', type: 'GOVERNORATE', countryCode: 'SY', governorate: 'طرطوس' },
    { code: 'DARAA', nameAr: 'درعا', nameEn: 'Daraa', type: 'GOVERNORATE', countryCode: 'SY', governorate: 'درعا' },
    { code: 'AS_SUWAYDA', nameAr: 'السويداء', nameEn: 'As-Suwayda', type: 'GOVERNORATE', countryCode: 'SY', governorate: 'السويداء' },
    { code: 'QUNEITRA', nameAr: 'القنيطرة', nameEn: 'Quneitra', type: 'GOVERNORATE', countryCode: 'SY', governorate: 'القنيطرة' },
    { code: 'IDLIB', nameAr: 'إدلب', nameEn: 'Idlib', type: 'GOVERNORATE', countryCode: 'SY', governorate: 'إدلب' },
    { code: 'DEIR_EZ_ZOR', nameAr: 'دير الزور', nameEn: 'Deir ez-Zor', type: 'GOVERNORATE', countryCode: 'SY', governorate: 'دير الزور' },
    { code: 'RAQQA', nameAr: 'الرقة', nameEn: 'Raqqa', type: 'GOVERNORATE', countryCode: 'SY', governorate: 'الرقة' },
    { code: 'HASAKAH', nameAr: 'الحسكة', nameEn: 'Al-Hasakah', type: 'GOVERNORATE', countryCode: 'SY', governorate: 'الحسكة' }
  ] as const;

  for (const location of locations) {
    await upsertLocation({
      ...location,
      type: location.type as LocationType
    });
  }

  const legacyRoutes = {
    BEIRUT_AIRPORT_TO_DAMASCUS: await upsertRoute({
      code: 'BEY-AIRPORT-DAM',
      nameAr: 'مطار بيروت إلى دمشق',
      nameEn: 'Beirut Airport to Damascus',
      originCode: 'BEIRUT_AIRPORT',
      destinationCode: 'DAMASCUS',
      routeType: 'INTERNATIONAL',
      requiresFlightDetails: true,
      estimatedMinutes: 150,
      distanceKm: 115,
      requiredRegionCodes: ['LEBANON', 'SYRIA']
    }),
    DAMASCUS_TO_BEIRUT_AIRPORT: await upsertRoute({
      code: 'DAM-BEY-AIRPORT',
      nameAr: 'دمشق إلى مطار بيروت',
      nameEn: 'Damascus to Beirut Airport',
      originCode: 'DAMASCUS',
      destinationCode: 'BEIRUT_AIRPORT',
      routeType: 'INTERNATIONAL',
      requiresFlightDetails: true,
      estimatedMinutes: 150,
      distanceKm: 115,
      requiredRegionCodes: ['SYRIA', 'LEBANON']
    })
  };

  await upsertRoute({
    code: 'DAM-AMM',
    nameAr: 'دمشق إلى عمّان',
    nameEn: 'Damascus to Amman',
    originCode: 'DAMASCUS',
    destinationCode: 'AMMAN',
    routeType: 'INTERNATIONAL',
    requiredRegionCodes: ['SYRIA', 'JORDAN']
  });
  await upsertRoute({
    code: 'AMM-DAM',
    nameAr: 'عمّان إلى دمشق',
    nameEn: 'Amman to Damascus',
    originCode: 'AMMAN',
    destinationCode: 'DAMASCUS',
    routeType: 'INTERNATIONAL',
    requiredRegionCodes: ['JORDAN', 'SYRIA']
  });
  await upsertRoute({
    code: 'DAM-AIRPORT-DAM',
    nameAr: 'مطار دمشق إلى مدينة دمشق',
    nameEn: 'Damascus Airport to Damascus',
    originCode: 'DAMASCUS_AIRPORT',
    destinationCode: 'DAMASCUS',
    routeType: 'AIRPORT_TRANSFER',
    requiresFlightDetails: true,
    requiredRegionCodes: ['SYRIA']
  });
  await upsertRoute({
    code: 'DAM-DAM-AIRPORT',
    nameAr: 'مدينة دمشق إلى مطار دمشق',
    nameEn: 'Damascus to Damascus Airport',
    originCode: 'DAMASCUS',
    destinationCode: 'DAMASCUS_AIRPORT',
    routeType: 'AIRPORT_TRANSFER',
    requiresFlightDetails: true,
    requiredRegionCodes: ['SYRIA']
  });

  const governorateCodes = [
    'RIF_DIMASHQ',
    'ALEPPO',
    'HOMS',
    'HAMA',
    'LATAKIA',
    'TARTUS',
    'DARAA',
    'AS_SUWAYDA',
    'QUNEITRA',
    'IDLIB',
    'DEIR_EZ_ZOR',
    'RAQQA',
    'HASAKAH'
  ];

  for (const code of governorateCodes) {
    const location = await prisma.serviceLocation.findUniqueOrThrow({ where: { code } });
    await upsertRoute({
      code: `DAM-AIRPORT-${code}`,
      nameAr: `مطار دمشق إلى ${location.nameAr}`,
      nameEn: `Damascus Airport to ${location.nameEn ?? code}`,
      originCode: 'DAMASCUS_AIRPORT',
      destinationCode: code,
      routeType: 'AIRPORT_TRANSFER',
      requiresFlightDetails: true,
      requiredRegionCodes: ['SYRIA']
    });
    await upsertRoute({
      code: `${code}-DAM-AIRPORT`,
      nameAr: `${location.nameAr} إلى مطار دمشق`,
      nameEn: `${location.nameEn ?? code} to Damascus Airport`,
      originCode: code,
      destinationCode: 'DAMASCUS_AIRPORT',
      routeType: 'AIRPORT_TRANSFER',
      requiresFlightDetails: true,
      requiredRegionCodes: ['SYRIA']
    });
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
    update: {
      status: 'APPROVED',
      baseRegionId: regions.DAMASCUS.id
    },
    create: {
      userId: driverUser.id,
      status: 'APPROVED',
      availability: 'OFFLINE',
      baseRegionId: regions.DAMASCUS.id
    }
  });

  const demoVehicle = await prisma.vehicle.upsert({
    where: { plateNumber: 'DEMO-001' },
    update: {
      driverProfileId: driverProfile.id,
      make: 'Toyota',
      model: 'Corolla',
      year: 2024,
      color: 'White',
      seatCapacity: 4,
      baseRegionId: regions.DAMASCUS.id,
      isActive: true
    },
    create: {
      driverProfileId: driverProfile.id,
      make: 'Toyota',
      model: 'Corolla',
      year: 2024,
      color: 'White',
      plateNumber: 'DEMO-001',
      seatCapacity: 4,
      baseRegionId: regions.DAMASCUS.id
    }
  });

  for (const region of [regions.SYRIA, regions.LEBANON]) {
    await prisma.driverRegionAccess.upsert({
      where: {
        driverProfileId_regionId: {
          driverProfileId: driverProfile.id,
          regionId: region.id
        }
      },
      update: { status: 'APPROVED' },
      create: {
        driverProfileId: driverProfile.id,
        regionId: region.id,
        status: 'APPROVED'
      }
    });
    await prisma.vehicleRegionAccess.upsert({
      where: {
        vehicleId_regionId: {
          vehicleId: demoVehicle.id,
          regionId: region.id
        }
      },
      update: { status: 'APPROVED' },
      create: {
        vehicleId: demoVehicle.id,
        regionId: region.id,
        status: 'APPROVED'
      }
    });
  }

  const pricingRules = [
    {
      direction: 'BEIRUT_AIRPORT_TO_DAMASCUS' as BookingDirection,
      routeId: legacyRoutes.BEIRUT_AIRPORT_TO_DAMASCUS.id,
      bookingType: 'SHARED_SEAT' as BookingType,
      passengerPrice: 40,
      driverFee: 25,
      platformMargin: 15
    },
    {
      direction: 'DAMASCUS_TO_BEIRUT_AIRPORT' as BookingDirection,
      routeId: legacyRoutes.DAMASCUS_TO_BEIRUT_AIRPORT.id,
      bookingType: 'SHARED_SEAT' as BookingType,
      passengerPrice: 40,
      driverFee: 25,
      platformMargin: 15
    },
    {
      direction: 'BEIRUT_AIRPORT_TO_DAMASCUS' as BookingDirection,
      routeId: legacyRoutes.BEIRUT_AIRPORT_TO_DAMASCUS.id,
      bookingType: 'PRIVATE_CAR' as BookingType,
      passengerPrice: 150,
      driverFee: 110,
      platformMargin: 40
    },
    {
      direction: 'DAMASCUS_TO_BEIRUT_AIRPORT' as BookingDirection,
      routeId: legacyRoutes.DAMASCUS_TO_BEIRUT_AIRPORT.id,
      bookingType: 'PRIVATE_CAR' as BookingType,
      passengerPrice: 150,
      driverFee: 110,
      platformMargin: 40
    }
  ];

  for (const rule of pricingRules) {
    const scopeKey = `ROUTE:${rule.routeId}`;
    const existing = await prisma.pricingRule.findFirst({
      where: {
        direction: rule.direction,
        bookingType: rule.bookingType
      },
      select: { id: true }
    });

    if (existing) {
      await prisma.pricingRule.update({
        where: { id: existing.id },
        data: {
          scopeKey,
          routeId: rule.routeId,
          direction: rule.direction,
          passengerPrice: rule.passengerPrice,
          driverFee: rule.driverFee,
          platformMargin: rule.platformMargin,
          currency: 'USD',
          isActive: true
        }
      });
    } else {
      await prisma.pricingRule.create({
        data: {
          scopeKey,
          ...rule,
          currency: 'USD',
          isActive: true
        }
      });
    }
  }

  await prisma.trip.updateMany({
    where: {
      routeId: null,
      direction: 'BEIRUT_AIRPORT_TO_DAMASCUS'
    },
    data: { routeId: legacyRoutes.BEIRUT_AIRPORT_TO_DAMASCUS.id }
  });
  await prisma.trip.updateMany({
    where: {
      routeId: null,
      direction: 'DAMASCUS_TO_BEIRUT_AIRPORT'
    },
    data: { routeId: legacyRoutes.DAMASCUS_TO_BEIRUT_AIRPORT.id }
  });
  await prisma.serviceRun.updateMany({
    where: {
      routeId: null,
      direction: 'BEIRUT_AIRPORT_TO_DAMASCUS'
    },
    data: { routeId: legacyRoutes.BEIRUT_AIRPORT_TO_DAMASCUS.id }
  });
  await prisma.serviceRun.updateMany({
    where: {
      routeId: null,
      direction: 'DAMASCUS_TO_BEIRUT_AIRPORT'
    },
    data: { routeId: legacyRoutes.DAMASCUS_TO_BEIRUT_AIRPORT.id }
  });

  console.log('Seed completed: users, roles, regions, locations and routes.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
