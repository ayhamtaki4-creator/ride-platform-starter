import { apiFetch } from "./api";

const STORAGE_KEY = "tareeq_guest_booking_claims_v1";
const MAX_STORED_CLAIMS = 20;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type GuestBookingClaim = {
  clientRequestId: string;
  bookingReference: string;
  savedAt: number;
};

type ClaimResponse = { linked: boolean; bookingId: string | null };

function readClaims(): GuestBookingClaim[] {
  if (typeof window === "undefined") return [];
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((item): item is GuestBookingClaim =>
      item && typeof item === "object" &&
      UUID_V4.test(item.clientRequestId) &&
      typeof item.bookingReference === "string" &&
      /^[A-Za-z0-9-]{1,50}$/.test(item.bookingReference) &&
      typeof item.savedAt === "number" && Number.isFinite(item.savedAt)
    ).slice(-MAX_STORED_CLAIMS);
  } catch {
    return [];
  }
}

function saveClaims(claims: GuestBookingClaim[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(claims.slice(-MAX_STORED_CLAIMS)));
  } catch {
    // Storage may be blocked (private mode, browser policy). The reservation
    // remains valid, but auto-linking will not be available on this device.
  }
}

export function rememberGuestBookingClaim(clientRequestId: string, bookingReference: string) {
  if (!UUID_V4.test(clientRequestId) || !/^[A-Za-z0-9-]{1,50}$/.test(bookingReference)) return;
  const others = readClaims().filter((item) => item.clientRequestId !== clientRequestId);
  saveClaims([...others, { clientRequestId, bookingReference, savedAt: Date.now() }]);
}

export function guestBookingClaimForReference(bookingReference: string | null): GuestBookingClaim | null {
  if (!bookingReference) return null;
  return readClaims().find((item) => item.bookingReference === bookingReference) ?? null;
}

export function forgetGuestBookingClaim(clientRequestId: string) {
  saveClaims(readClaims().filter((item) => item.clientRequestId !== clientRequestId));
}

export async function claimGuestBooking(
  clientRequestId: string,
  token?: string
): Promise<ClaimResponse> {
  if (!UUID_V4.test(clientRequestId)) {
    throw new Error("رمز ربط الحجز غير صالح.");
  }
  return apiFetch<ClaimResponse>("/bookings/claim-guest", {
    method: "POST",
    ...(token ? { token } : {}),
    retryAuth: false,
    timeoutMs: 8000,
    body: JSON.stringify({ clientRequestId }),
  });
}

/**
 * A phone number alone never grants travel-history access. Claims also need
 * the private UUID saved on the original booking device (or copied by its user).
 * Failed claims remain in storage so they can be retried after connectivity recovers.
 */
export async function claimSavedGuestBookings(token: string): Promise<number> {
  const claims = readClaims();
  const results = await Promise.allSettled(claims.map(async (item) => {
    const result = await claimGuestBooking(item.clientRequestId, token);
    if (result.linked) {
      forgetGuestBookingClaim(item.clientRequestId);
      return true;
    }
    return false;
  }));
  return results.filter((result) => result.status === "fulfilled" && result.value).length;
}
