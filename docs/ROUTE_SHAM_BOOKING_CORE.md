# Route Sham Booking Core

This milestone changes the product from an immediate city ride request into a scheduled booking flow between Beirut Airport and Damascus.

## Flow

1. Passenger selects direction, booking type, travel date, flight details, passengers and luggage.
2. The API loads the active administrative pricing rule.
3. A booking reference such as `TS-261234` is created.
4. The booking review status starts as `NEW`.
5. Administration confirms or rejects the booking.
6. Confirmed bookings become available for driver assignment.
7. The existing dispatch and trip execution flow continues after assignment.

## New API routes

- `GET /api/bookings/quote`
- `POST /api/bookings`
- `GET /api/bookings/me`
- `GET /api/admin/dashboard`
- `GET /api/admin/bookings`
- `POST /api/admin/bookings/:id/confirm`
- `POST /api/admin/bookings/:id/reject`
- `GET /api/pricing`
- `GET /api/pricing/admin`
- `PUT /api/pricing`

## Migration

Apply the migration and reseed pricing rules:

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```
