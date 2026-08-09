"use client";

import { BookingForm } from "./booking-form";

export default function BookingFormLazyContent() {
  return (
    <>
      <link rel="stylesheet" href="/vendor/leaflet.css" precedence="route-vendor" />
      <link rel="stylesheet" href="/vendor/react-datepicker.css" precedence="route-vendor" />
      <link rel="stylesheet" href="/vendor/booking-mobile.css" precedence="route-vendor" />
      <BookingForm />
    </>
  );
}
