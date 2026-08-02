import { Trip } from "@/lib/types";
import { getBookingStatus } from "@/lib/rider-bookings";

export function BookingStatusBadge({ booking }: { booking: Trip }) {
  const status = getBookingStatus(booking);

  return (
    <span className={`rider-status-badge tone-${status.tone}`} title={status.description}>
      <span aria-hidden="true" />
      {status.label}
    </span>
  );
}
