import { BadRequestException } from '@nestjs/common';
import { TripStatus } from '@prisma/client';

const transitions: Record<TripStatus, TripStatus[]> = {
  SEARCHING_DRIVER: [
    'DRIVER_ASSIGNED',
    'CANCELLED_BY_PASSENGER',
    'NO_DRIVER_AVAILABLE'
  ],
  DRIVER_ASSIGNED: [
    'DRIVER_ARRIVING',
    'CANCELLED_BY_PASSENGER',
    'CANCELLED_BY_DRIVER'
  ],
  DRIVER_ARRIVING: [
    'DRIVER_ARRIVED',
    'CANCELLED_BY_PASSENGER',
    'CANCELLED_BY_DRIVER',
    'DRIVER_NO_SHOW'
  ],
  DRIVER_ARRIVED: [
    'IN_PROGRESS',
    'CANCELLED_BY_PASSENGER',
    'CANCELLED_BY_DRIVER',
    'PASSENGER_NO_SHOW'
  ],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED_BY_PASSENGER: [],
  CANCELLED_BY_DRIVER: [],
  NO_DRIVER_AVAILABLE: [],
  PASSENGER_NO_SHOW: [],
  DRIVER_NO_SHOW: []
};

export class TripStateMachine {
  static assertTransition(from: TripStatus, to: TripStatus) {
    if (!transitions[from].includes(to)) {
      throw new BadRequestException(`انتقال حالة الرحلة غير مسموح: ${from} → ${to}`);
    }
  }
}
