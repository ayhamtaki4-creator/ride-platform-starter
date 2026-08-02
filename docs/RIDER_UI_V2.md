# Rider UI V2

This milestone redesigns the passenger-facing experience without changing the database schema.

## Routes

- `/rider`: passenger dashboard and next booking summary.
- `/rider/bookings`: searchable, filterable booking history.
- `/rider/bookings/:id`: booking status timeline, trip details, driver, vehicle, operational run, and cancellation.
- `/rider/profile`: account summary and local notification preferences.

## Realtime behavior

The passenger pages refresh when rider booking/trip events or operational-run events arrive. A 30-second polling fallback remains active when the WebSocket connection is unavailable.

## Cancellation

The booking details page uses `POST /api/trips/:id/cancel`. The action is shown only before the trip starts and when the booking is not final.

## No database migration

This milestone contains portal UI changes only. Prisma generation and database migration are not required.
