import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import {
  BOOKING_TYPE_LABELS,
  DIRECTION_LABELS,
  Trip,
} from "@/lib/types";
import {
  formatBookingDate,
  formatBookingMoney,
  getBookingStatus,
  getRunStatusLabel,
} from "@/lib/rider-bookings";
import { BookingStatusBadge } from "./booking-status-badge";

export function RiderBookingCard({
  booking,
  compact = false,
}: {
  booking: Trip;
  compact?: boolean;
}) {
  const status = getBookingStatus(booking);
  const vehicle = booking.driver?.driverProfile?.vehicles[0];
  const runStatus = getRunStatusLabel(booking);

  return (
    <article className={`rider-booking-card ${compact ? "is-compact" : ""}`}>
      <div className="rider-booking-card-top">
        <div className="rider-booking-reference">
          <span className="rider-booking-icon"><Icon name="bookings" size={20} /></span>
          <div>
            <small>رقم الحجز</small>
            <strong>{booking.bookingReference ?? booking.id.slice(0, 8)}</strong>
          </div>
        </div>
        <BookingStatusBadge booking={booking} />
      </div>

      <div className="rider-route-row">
        <span className="route-point route-point-start"><Icon name="map-pin" size={17} /></span>
        <div>
          <strong>
            {booking.direction
              ? DIRECTION_LABELS[booking.direction]
              : `${booking.pickupAddress} ← ${booking.dropoffAddress}`}
          </strong>
          <small>{status.description}</small>
        </div>
      </div>

      <div className="rider-booking-facts">
        <span><Icon name="calendar" size={17} />{formatBookingDate(booking.travelDate, { day: "numeric", month: "long", year: "numeric" })}</span>
        <span><Icon name="users" size={17} />{booking.passengerCount ?? 1} مسافر</span>
        <span><Icon name="luggage" size={17} />{booking.luggageCount ?? 0} حقيبة</span>
        <span><Icon name="car" size={17} />{booking.bookingType ? BOOKING_TYPE_LABELS[booking.bookingType] : "رحلة"}</span>
      </div>

      {!compact && (booking.driver || booking.serviceRun) ? (
        <div className="rider-booking-assignment">
          {booking.driver ? (
            <div>
              <span className="rider-avatar-small">
                {booking.driver.firstName.slice(0, 1)}{booking.driver.lastName?.slice(0, 1) ?? ""}
              </span>
              <div>
                <small>السائق</small>
                <strong>{booking.driver.firstName} {booking.driver.lastName}</strong>
                {vehicle ? <span>{vehicle.make} {vehicle.model} · {vehicle.plateNumber}</span> : null}
              </div>
            </div>
          ) : (
            <div className="rider-assignment-placeholder">
              <Icon name="drivers" size={20} />
              <span>يتم تجهيز بيانات السائق</span>
            </div>
          )}

          {booking.serviceRun ? (
            <div className="rider-run-chip">
              <small>الرحلة التشغيلية</small>
              <strong>{booking.serviceRun.runReference}</strong>
              <span>{runStatus}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="rider-booking-card-footer">
        <div>
          <small>قيمة الحجز</small>
          <strong>{formatBookingMoney(booking.estimatedFare, booking.currency)}</strong>
        </div>
        <Link className="button compact-button" href={`/rider/bookings/${booking.id}`}>
          عرض التفاصيل <Icon name="arrow-left" size={17} />
        </Link>
      </div>
    </article>
  );
}
