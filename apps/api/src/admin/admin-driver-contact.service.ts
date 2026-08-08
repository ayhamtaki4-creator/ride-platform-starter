import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { normalizeInternationalPhone } from '../common/phone';
import { AuthUser } from '../iam/auth-user.type';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminDriverContactService {
  constructor(private readonly prisma: PrismaService) {}

  async update(actor: AuthUser, driverId: string, rawPhone: string) {
    const phone = normalizeInternationalPhone(rawPhone);
    const driver = await this.prisma.user.findUnique({
      where: { id: driverId },
      select: {
        id: true,
        phone: true,
        driverProfile: { select: { id: true } }
      }
    });
    if (!driver?.driverProfile) throw new NotFoundException('السائق غير موجود.');

    const duplicate = await this.prisma.user.findFirst({
      where: { phone, id: { not: driverId } },
      select: { id: true }
    });
    if (duplicate) throw new ConflictException('رقم الهاتف مستخدم في حساب آخر.');

    const previousPhone = driver.phone;
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: driverId },
        data: { phone, whatsappOptIn: true }
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'driver.contact.update',
          entityType: 'User',
          entityId: driverId,
          metadata: {
            previousPhone,
            phone,
            whatsappOptIn: true
          }
        }
      });
    });

    return { driverId, phone, whatsappOptIn: true };
  }
}
