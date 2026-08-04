import { VehicleClass } from '@prisma/client';

export const BOOKING_MIN_PASSENGERS = 1;
export const BOOKING_MAX_PASSENGERS = 8;
export const BOOKING_MIN_LUGGAGE = 0;
export const BOOKING_MAX_LUGGAGE = 12;

export type VehicleClassCapacity = {
  vehicleClass: VehicleClass;
  passengerCapacity: number;
  luggageCapacity: number;
};

export const DEFAULT_VEHICLE_CLASS_CONFIGS: readonly VehicleClassCapacity[] = [
  { vehicleClass: 'SMALL', passengerCapacity: 3, luggageCapacity: 4 },
  { vehicleClass: 'MEDIUM', passengerCapacity: 4, luggageCapacity: 5 },
  { vehicleClass: 'LARGE', passengerCapacity: 8, luggageCapacity: 8 }
];

export function defaultVehicleClassCapacity(vehicleClass: VehicleClass) {
  return (
    DEFAULT_VEHICLE_CLASS_CONFIGS.find((item) => item.vehicleClass === vehicleClass)
      ?.passengerCapacity ?? 1
  );
}

export function defaultVehicleClassLuggageCapacity(vehicleClass: VehicleClass) {
  return (
    DEFAULT_VEHICLE_CLASS_CONFIGS.find((item) => item.vehicleClass === vehicleClass)
      ?.luggageCapacity ?? 0
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
