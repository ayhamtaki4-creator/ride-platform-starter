import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcryptjs';
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { normalizeInternationalPhone } from '../common/phone';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

@Injectable()
export class PhoneVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly whatsapp: WhatsAppService
  ) {}

  async request(rawPhone: string) {
    const phone = normalizeInternationalPhone(rawPhone);
    if (!this.whatsapp.otpConfigured()) {
      throw new ServiceUnavailableException('خدمة التحقق من الهاتف غير مهيأة بعد. تواصل مع مركز العمليات.');
    }
    const account = await this.prisma.user.findUnique({
      where: { phone }, select: { id: true }
    });
    // Do not reveal whether an account exists under this phone number.
    if (!account) return { sent: true };

    const recent = await this.prisma.phoneVerificationChallenge.findFirst({
      where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' }
    });
    if (recent && Date.now() - recent.createdAt.getTime() < 90_000) {
      return { sent: true };
    }

    const code = String(randomInt(100000, 1000000));
    const challenge = await this.prisma.phoneVerificationChallenge.create({
      data: {
        phone,
        codeHash: this.codeHash(phone, code),
        expiresAt: new Date(Date.now() + 10 * 60_000)
      }
    });
    try {
      await this.whatsapp.sendVerificationCode(phone, code);
    } catch (error) {
      await this.prisma.phoneVerificationChallenge.update({
        where: { id: challenge.id }, data: { consumedAt: new Date() }
      }).catch(() => undefined);
      throw error;
    }
    return { sent: true };
  }

  async confirm(rawPhone: string, code: string) {
    const phone = normalizeInternationalPhone(rawPhone);
    const challenge = await this.prisma.phoneVerificationChallenge.findFirst({
      where: {
        phone,
        consumedAt: null,
        expiresAt: { gt: new Date() },
        attempts: { lt: 5 }
      },
      orderBy: { createdAt: 'desc' }
    });
    if (!challenge) throw new BadRequestException('رمز التحقق غير صالح أو انتهت صلاحيته.');
    const expected = Buffer.from(challenge.codeHash, 'hex');
    const provided = Buffer.from(this.codeHash(phone, code), 'hex');
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
      await this.prisma.phoneVerificationChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null },
        data: { attempts: { increment: 1 } }
      });
      throw new BadRequestException('رمز التحقق غير صالح أو انتهت صلاحيته.');
    }
    const claimed = await this.prisma.phoneVerificationChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() }
    });
    if (claimed.count !== 1) {
      throw new BadRequestException('تم استخدام رمز التحقق مسبقًا.');
    }

    const account = await this.prisma.user.findUnique({ where: { phone } });
    if (!account) return { verified: true, activated: false, linkedBookings: 0 };

    let temporaryPassword: string | undefined;
    let activated = false;
    if (account.provisionalAccount && account.status === 'SUSPENDED') {
      const newPassword = randomBytes(18).toString('base64url');
      const updated = await this.prisma.user.updateMany({
        where: { id: account.id, provisionalAccount: true, status: 'SUSPENDED' },
        data: {
          status: 'ACTIVE',
          provisionalAccount: false,
          phoneVerifiedAt: new Date(),
          mustChangePassword: true,
          passwordHash: await bcrypt.hash(newPassword, 12)
        }
      });
      if (updated.count === 1) {
        activated = true;
        temporaryPassword = newPassword;
      }
    } else {
      await this.prisma.user.update({
        where: { id: account.id },
        data: { phoneVerifiedAt: new Date() }
      });
    }
    const claimedTrips = await this.prisma.trip.updateMany({
      where: {
        passengerId: null,
        contactPhone: phone,
        bookingSource: 'GUEST',
        accountLinkStatus: 'UNLINKED'
      },
      data: { passengerId: account.id, accountLinkStatus: 'LINKED' }
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: account.id,
        action: 'auth.phone_verified',
        entityType: 'User',
        entityId: account.id,
        metadata: { activated, linkedBookings: claimedTrips.count }
      }
    });
    return {
      verified: true,
      activated,
      linkedBookings: claimedTrips.count,
      ...(temporaryPassword ? { temporaryPassword } : {})
    };
  }

  private codeHash(phone: string, code: string) {
    const secret = this.config.getOrThrow<string>('JWT_SECRET');
    return createHmac('sha256', secret).update(`${phone}:${code}`).digest('hex');
  }
}
