import { VehicleClass } from '@prisma/client';

export const BOOKING_MIN_PASSENGERS = 1;
export const BOOKING_MAX_PASSENGERS = 8;
export const BOOKING_MIN_LUGGAGE = 0;
export const BOOKING_MAX_LUGGAGE = 12;

export type VehicleClassCapacity = {
  vehicleClass: VehicleClass;
  passengerCapacity: number;
};

export const DEFAULT_VEHICLE_CLASS_CONFIGS: readonly VehicleClassCapacity[] = [
  { vehicleClass: 'SMALL', passengerCapacity: 3 },
  { vehicleClass: 'MEDIUM', passengerCapacity: 4 },
  { vehicleClass: 'LARGE', passengerCapacity: 8 }
];

export function defaultVehicleClassCapacity(vehicleClass: VehicleClass) {
  return (
    DEFAULT_VEHICLE_CLASS_CONFIGS.find((item) => item.vehicleClass === vehicleClass)
      ?.passengerCapacity ?? 1
  );
}

export function minimumVehicleCapacity(
  vehicleClass: VehicleClass,
  passengerCount = 1,
  configuredCapacity?: number
) {
  return Math.max(
    passengerCount,
    configuredCapacity ?? defaultVehicleClassCapacity(vehicleClass)
  );
}
