import { BookingType, VehicleClass } from '@prisma/client';

export const BOOKING_MIN_PASSENGERS = 1;
export const BOOKING_MAX_PASSENGERS = 5;
export const BOOKING_MIN_LUGGAGE = 0;
export const BOOKING_MAX_LUGGAGE = 12;

export const VEHICLE_CLASS_CAPACITIES = [
  {
    vehicleClass: 'SMALL',
    maxPassengers: 3,
    maxLuggage: 5,
    minimumVehicleSeats: 3
  },
  {
    vehicleClass: 'MEDIUM',
    maxPassengers: 4,
    maxLuggage: 7,
    minimumVehicleSeats: 4
  },
  {
    vehicleClass: 'LARGE',
    maxPassengers: 5,
    maxLuggage: 12,
    minimumVehicleSeats: 5
  }
] as const satisfies ReadonlyArray<{
  vehicleClass: VehicleClass;
  maxPassengers: number;
  maxLuggage: number;
  minimumVehicleSeats: number;
}>;

export const BOOKING_CAPACITY_POLICY = {
  minPassengers: BOOKING_MIN_PASSENGERS,
  maxPassengers: BOOKING_MAX_PASSENGERS,
  minLuggage: BOOKING_MIN_LUGGAGE,
  maxLuggage: BOOKING_MAX_LUGGAGE,
  classes: VEHICLE_CLASS_CAPACITIES.map(
    ({ vehicleClass, maxPassengers, maxLuggage }) => ({
      vehicleClass,
      maxPassengers,
      maxLuggage
    })
  )
} as const;

export function resolveVehicleClass(
  bookingType: BookingType,
  passengerCount: number,
  luggageCount: number
): VehicleClass {
  if (bookingType !== 'PRIVATE_CAR') return 'SMALL';

  const capacity = VEHICLE_CLASS_CAPACITIES.find(
    (item) => passengerCount <= item.maxPassengers && luggageCount <= item.maxLuggage
  );

  return capacity?.vehicleClass ?? 'LARGE';
}

export function minimumVehicleCapacity(passengerCount: number, luggageCount: number) {
  const vehicleClass = resolveVehicleClass('PRIVATE_CAR', passengerCount, luggageCount);
  const capacity = VEHICLE_CLASS_CAPACITIES.find(
    (item) => item.vehicleClass === vehicleClass
  );

  return Math.max(passengerCount, capacity?.minimumVehicleSeats ?? passengerCount);
}
