# Operational Runs and Passenger Manifest

This milestone promotes `ServiceRun` from an automatic grouping record into a full operational journey.

## Admin workflow

1. Create a draft run with direction, type, departure time, driver, and vehicle.
2. Add compatible confirmed bookings.
3. Verify seat capacity and the passenger manifest.
4. Schedule the run and send it to the driver.
5. Replace the driver before departure when required.
6. Monitor boarding, execution, completion, revenue, driver fees, and platform margin.

## Driver workflow

1. Accept or reject the complete run.
2. Start boarding.
3. Mark each booking as picked up or no-show.
4. Start the journey after all passenger groups are resolved.
5. Mark individual groups as dropped off when needed.
6. Complete the run and all boarded bookings.

## Passenger manifest states

- `WAITING`
- `PICKED_UP`
- `NO_SHOW`
- `DROPPED_OFF`

## Main API routes

- `GET /api/admin/runs`
- `POST /api/admin/runs`
- `GET /api/admin/runs/:id`
- `POST /api/admin/runs/:id/bookings/:bookingId`
- `DELETE /api/admin/runs/:id/bookings/:bookingId`
- `POST /api/admin/runs/:id/bookings/:bookingId/move`
- `POST /api/admin/runs/:id/schedule`
- `POST /api/admin/runs/:id/replace-driver`
- `POST /api/admin/runs/:id/cancel`
- `GET /api/drivers/me/runs`
- `GET /api/drivers/me/runs/:runId`
- `POST /api/drivers/me/runs/:runId/accept`
- `POST /api/drivers/me/runs/:runId/reject`
- `POST /api/drivers/me/runs/:runId/boarding`
- `PATCH /api/drivers/me/runs/:runId/bookings/:bookingId/status`
- `POST /api/drivers/me/runs/:runId/start`
- `POST /api/drivers/me/runs/:runId/complete`
