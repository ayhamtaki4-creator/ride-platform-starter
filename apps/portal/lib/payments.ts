import type { Trip } from "@/lib/types";

export type PaymentStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID";
export type PaymentMethod = "CASH";
export type PaymentReceiver = "ADMIN" | "DRIVER";

export type PaymentAwareTrip = Trip & {
  paymentStatus: PaymentStatus;
  paymentMethod?: PaymentMethod | null;
  paymentReceiver?: PaymentReceiver | null;
  amountPaid: string | number;
  paymentReceivedAt?: string | null;
  paymentNote?: string | null;
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  UNPAID: "غير مدفوع",
  PARTIALLY_PAID: "مدفوع جزئيًا",
  PAID: "مدفوع",
};

export const PAYMENT_RECEIVER_LABELS: Record<PaymentReceiver, string> = {
  ADMIN: "الإدارة",
  DRIVER: "السائق",
};

export function bookingTotal(trip: Pick<PaymentAwareTrip, "finalFare" | "estimatedFare">) {
  return Number(trip.finalFare ?? trip.estimatedFare ?? 0);
}

export function outstandingAmount(trip: PaymentAwareTrip) {
  return Math.max(0, bookingTotal(trip) - Number(trip.amountPaid ?? 0));
}
