# Scheduled driver operations and shared-seat capacity

This milestone adds the operations layer needed for scheduled Beirut–Damascus bookings.

## Flow

1. Administration confirms a booking.
2. Administration assigns an online approved driver.
3. The system creates or joins a service run.
4. The driver receives a pending assignment.
5. The driver accepts or rejects the assignment.
6. Rejected assignments return to dispatch with the rejection reason.
7. Accepted assignments appear in the driver's schedule.
8. Shared-seat bookings for the same driver, direction, and date are grouped in one service run while vehicle capacity is enforced.

## Main endpoints

- `GET /api/admin/drivers`
- `POST /api/admin/drivers`
- `PATCH /api/admin/drivers/:driverId/status`
- `PATCH /api/admin/drivers/:driverId/vehicle`
- `GET /api/admin/bookings/:id`
- `GET /api/drivers/me/schedule`
- `POST /api/drivers/me/bookings/:tripId/accept`
- `POST /api/drivers/me/bookings/:tripId/reject`

## Test

Run:

```powershell
.\scripts\test-scheduled-shared-flow.ps1
```
