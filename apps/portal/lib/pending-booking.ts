import type { BookingType, VehicleClass } from "./types";

export const PENDING_BOOKING_KEY = "ride_pending_booking_v2";
const MAX_DRAFT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const TICKET_DB_NAME = "ride-platform-booking-drafts";
const TICKET_STORE = "flight-tickets";

export type PendingBookingForm = {
  routeId: string;
  bookingType: BookingType;
  vehicleClass: VehicleClass;
  passengerCount: number;
  luggageCount: number;
  travelDate: string;
  flightArrivalTime: string;
  flightNumber: string;
  flightTicketMediaId: string;
  flightTicketFileName: string;
  pickupAddress: string;
  dropoffAddress: string;
  useCustomMapLocations: boolean;
  pickupLatitude: number | null;
  pickupLongitude: number | null;
  dropoffLatitude: number | null;
  dropoffLongitude: number | null;
  passengerName: string;
  passengerPhone: string;
  notes: string;
};

export type PendingBooking = {
  id: string;
  form: PendingBookingForm;
  step: number;
  submitAfterAuth: boolean;
  savedAt: number;
};

export function createPendingBookingId() {
  // This UUID is also retained as a private guest-booking ownership proof.
  // Do not fall back to Math.random(): predictable UUIDs could expose trips.
  if (typeof crypto === "undefined" || typeof crypto.getRandomValues !== "function") {
    throw new Error("يتطلب الحجز متصفحًا يدعم التشفير الآمن.");
  }
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function savePendingBooking(draft: Omit<PendingBooking, "savedAt">) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    PENDING_BOOKING_KEY,
    JSON.stringify({ ...draft, savedAt: Date.now() } satisfies PendingBooking),
  );
}

export function loadPendingBooking(): PendingBooking | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_BOOKING_KEY) ?? "null") as PendingBooking | null;
    if (!parsed?.id || !parsed.form || Date.now() - parsed.savedAt > MAX_DRAFT_AGE_MS) {
      clearPendingBooking();
      return null;
    }
    // Pre-October drafts predate the explicit passenger/luggage selectors.
    // Preserve every saved field and give these new fields their safe defaults.
    return {
      ...parsed,
      form: {
        passengerCount: 1,
        luggageCount: 0,
        ...parsed.form,
      },
    };
  } catch {
    clearPendingBooking();
    return null;
  }
}

export function hasPendingBooking() {
  return Boolean(loadPendingBooking());
}

export function clearPendingBooking() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PENDING_BOOKING_KEY);
}

type StoredTicket = {
  draftId: string;
  blob: Blob;
  name: string;
  type: string;
  lastModified: number;
};

function openTicketDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("المتصفح لا يدعم حفظ ملف التذكرة مؤقتًا."));
      return;
    }
    const request = indexedDB.open(TICKET_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(TICKET_STORE)) {
        request.result.createObjectStore(TICKET_STORE, { keyPath: "draftId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("تعذر فتح مخزن التذكرة."));
  });
}

export async function storePendingTicket(draftId: string, file: File) {
  const database = await openTicketDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(TICKET_STORE, "readwrite");
      transaction.objectStore(TICKET_STORE).put({
        draftId,
        blob: file,
        name: file.name,
        type: file.type,
        lastModified: file.lastModified,
      } satisfies StoredTicket);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("تعذر حفظ التذكرة مؤقتًا."));
    });
  } finally {
    database.close();
  }
}

export async function loadPendingTicket(draftId: string) {
  const database = await openTicketDatabase();
  try {
    const record = await new Promise<StoredTicket | undefined>((resolve, reject) => {
      const transaction = database.transaction(TICKET_STORE, "readonly");
      const request = transaction.objectStore(TICKET_STORE).get(draftId);
      request.onsuccess = () => resolve(request.result as StoredTicket | undefined);
      request.onerror = () => reject(request.error ?? new Error("تعذر استعادة التذكرة."));
    });
    if (!record) return null;
    return new File([record.blob], record.name, {
      type: record.type,
      lastModified: record.lastModified,
    });
  } finally {
    database.close();
  }
}

export async function deletePendingTicket(draftId: string) {
  const database = await openTicketDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(TICKET_STORE, "readwrite");
      transaction.objectStore(TICKET_STORE).delete(draftId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("تعذر حذف ملف التذكرة المؤقت."));
    });
  } finally {
    database.close();
  }
}
