import type { VehicleClass } from "./types";

/**
 * Only public, non-sensitive travel choices cross from the assistant to booking.
 * Fares, dates, passenger identities and tokens are intentionally never accepted.
 * Booking validates these values against the current active route and price API.
 */
export type AssistantBookingSelection = {
  routeId: string;
  vehicleClass: VehicleClass;
  passengerCount: number;
  luggageCount: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLASSES: VehicleClass[] = ["SMALL", "MEDIUM", "LARGE"];

function safeInteger(value: string | null, minimum: number, maximum: number): number | null {
  if (value === null || !/^(0|[1-9][0-9]{0,2})$/.test(value)) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= maximum ? number : null;
}

export function parseAssistantBookingSelection(search: string): AssistantBookingSelection | null {
  const params = new URLSearchParams(search);
  if (params.get("from") !== "assistant") return null;
  const routeId = params.get("routeId");
  const vehicleClass = params.get("vehicleClass");
  const passengerCount = safeInteger(params.get("passengerCount"), 1, 20);
  const luggageCount = safeInteger(params.get("luggageCount"), 0, 20);
  if (!routeId || !UUID.test(routeId) || !CLASSES.includes(vehicleClass as VehicleClass) ||
    passengerCount === null || luggageCount === null) return null;
  return { routeId, vehicleClass: vehicleClass as VehicleClass, passengerCount, luggageCount };
}

export function assistantBookingHref(selection: AssistantBookingSelection): string {
  const params = new URLSearchParams({
    from: "assistant",
    routeId: selection.routeId,
    vehicleClass: selection.vehicleClass,
    passengerCount: String(selection.passengerCount),
    luggageCount: String(selection.luggageCount),
  });
  return `/booking?${params.toString()}`;
}
