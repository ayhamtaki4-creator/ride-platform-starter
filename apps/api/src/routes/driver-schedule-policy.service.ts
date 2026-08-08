import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type EligibleDriverRow = {
  driverId: string;
  hasScheduleConflict: boolean;
  conflictRunReference: string | null;
  [key: string]: unknown;
};

@Injectable()
export class DriverSchedulePolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async applySameDayReturnPolicy<T extends EligibleDriverRow>(
    routeId: string,
    travelDate: Date,
    rows: T[]
  ): Promise<T[]> {
    if (!rows.length) return rows;

    const requestedRoute = await this.prisma.serviceRoute.findUnique({
      where: { id: routeId },
      select: { originId: true, destinationId: true }
    });
    if (!requestedRoute) return rows;

    const { gte, lt } = this.dayBounds(travelDate);
    const runs = await this.prisma.serviceRun.findMany({
      where: {
        driverId: { in: rows.map((row) => row.driverId) },
        travelDate: { gte, lt },
        status: { not: 'CANCELLED' }
      },
      orderBy: { createdAt: 'asc' },
      select: {
        driverId: true,
        runReference: true,
        status: true,
        route: { select: { originId: true, destinationId: true } }
      }
    });

    const byDriver = new Map<string, typeof runs>();
    for (const run of runs) {
      const current = byDriver.get(run.driverId) ?? [];
      current.push(run);
      byDriver.set(run.driverId, current);
    }

    return rows.map((row) => {
      const driverRuns = byDriver.get(row.driverId) ?? [];
      if (driverRuns.length === 0) {
        return { ...row, hasScheduleConflict: false, conflictRunReference: null };
      }

      const reverseAllowed =
        driverRuns.length === 1 &&
        driverRuns[0].route?.originId === requestedRoute.destinationId &&
        driverRuns[0].route?.destinationId === requestedRoute.originId;

      if (reverseAllowed) {
        return { ...row, hasScheduleConflict: false, conflictRunReference: null };
      }

      return {
        ...row,
        hasScheduleConflict: true,
        conflictRunReference: driverRuns[0]?.runReference ?? row.conflictRunReference
      };
    });
  }

  private dayBounds(value: Date) {
    const gte = new Date(value);
    gte.setHours(0, 0, 0, 0);
    const lt = new Date(gte);
    lt.setDate(lt.getDate() + 1);
    return { gte, lt };
  }
}
