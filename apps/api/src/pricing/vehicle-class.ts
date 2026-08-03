import { BookingType, VehicleClass } from '@prisma/client';

export const BOOKING_MIN_PASSENGERS = 1;
export const BOOKING_MAX_PASSENGERS = 12;
export const BOOKING_MIN_LUGGAGE = 0;
export const BOOKING_MAX_LUGGAGE = 24;
export const STANDARD_MAX_PASSENGERS = 4;
export const STANDARD_MAX_LUGGAGE = 6;
export const FAMILY_MIN_SEATS = 5;

export const BOOKING_CAPACITY_POLICY = {
  minPassengers: BOOKING_MIN_PASSENGERS,
  maxPassengers: BOOKING_MAX_PASSENGERS,
  minLuggage: BOOKING_MIN_LUGGAGE,
  maxLuggage: BOOKING_MAX_LUGGAGE,
  standardMaxPassengers: STANDARD_MAX_PASSENGERS,
  standardMaxLuggage: STANDARD_MAX_LUGGAGE
} as const;

export function requiresFamilyVehicle(passengerCount: number, luggageCount: number) {
  return passengerCount > STANDARD_MAX_PASSENGERS || luggageCount > STANDARD_MAX_LUGGAGE;
}

export function resolveVehicleClass(
  bookingType: BookingType,
  passengerCount: number,
  luggageCount: number
): VehicleClass {
  if (bookingType !== 'PRIVATE_CAR') return 'STANDARD';

  return requiresFamilyVehicle(passengerCount, luggageCount) ? 'FAMILY' : 'STANDARD';
}

export function minimumVehicleCapacity(passengerCount: number, luggageCount: number) {
  return resolveVehicleClass('PRIVATE_CAR', passengerCount, luggageCount) === 'FAMILY'
    ? Math.max(passengerCount, FAMILY_MIN_SEATS)
    : passengerCount;
}
