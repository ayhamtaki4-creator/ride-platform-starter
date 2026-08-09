"use client";

import BookingFormContent from "./booking-form-lazy-content";

export function LazyBookingForm() {
  return (
    <div data-booking-load-state="active">
      <BookingFormContent />
    </div>
  );
}
