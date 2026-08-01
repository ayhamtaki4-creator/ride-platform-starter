import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        createdAt: true,
        roles: {
          select: {
            role: { select: { code: true, name: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
  }
}
