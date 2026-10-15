# Tareeq Al-Sham — production monitoring & recovery

This runbook describes the **actual** controls deployed and the remaining setup.
Never send API keys, Neon connection strings, customer details, or exported backups through GitHub issues.

## Booking spam protection already deployed

- `POST /api/bookings/guest` and `POST /api/bookings/guest-with-ticket` already use
  `AuthRateLimitService.assertGuestBookingAllowed()` before creating reservations.
- The default limit is **6 requests per IP per hour** (`GUEST_BOOKING_IP_MAX` and
  `GUEST_BOOKING_WINDOW_SECONDS`). Redis backs the shared counters where available.
- A local in-memory fallback applies if Redis is unavailable (per instance only).
- Return HTTP 429 with an Arabic error and `Retry-After` when exhausted.
- Guest bookings have UUID idempotency keys. Do not change pricing, claim proofs,
  OTP bypass, or the booking identity flow when tightening abuse prevention.
- Cloudflare Turnstile is **not enabled**. If traffic indicates abuse later,
  plan a gradual, accessibility-tested challenge (server-side verification
  required, never rely on client-side tokens alone).

## Monitoring already deployed

- `.github/workflows/production-smoke.yml` runs on pushes to main and every
  six hours. Its existing read-only public probes cover API, database/Redis
  readiness, anonymous booking, public routes, security headers and gallery.
- Scheduled check failures open one GitHub Issue titled
  `[Production monitor] طريق الشام: فشل فحص الموقع والخادم`. Subsequent failures
  leave that issue open; a healthy scheduled run closes it. The issue contains
  only the workflow URL, never booking information.
- Enable GitHub notifications for **Issues** / repository activity if you want
  alerts delivered to email/mobile; an Issue alone is not an instant push alert.
- Admin dashboard shows **unreviewed active bookings older than 30 minutes**,
  **24-hour escalation**, **confirmed bookings without an assigned driver**,
  and **unassigned confirmations older than 30 minutes**. Open the respective
  queue directly: `/admin/bookings?attention=REVIEW_OVER_30M`,
  `REVIEW_OVER_24H`, `DRIVER_UNASSIGNED`, or `DRIVER_OVER_30M`.
  The queue is filtered in the database and sorted oldest first; it continues
  to refresh every 30 seconds even when its realtime socket is disconnected.
  These are operational reminders, **not automatic cancellations**.
- Telegram monitoring includes failed deliveries after five attempts and
  pending/in-progress messages delayed at least 15 minutes. The
  `/admin/telegram` page displays a filtered history and retry controls.
  Manual retry is only permitted for **FAILED** or **SKIPPED** items. Never
  resend **SENT**, **PENDING**, or **SENDING** deliveries because that can
  create duplicate staff notifications.
- The delivery queue already retries Telegram sends up to five times. First
  verify bot credentials and chat permissions; then retry failed records.
  Render free-tier instances may sleep, so the queue is not an immediate SLA.
- Operational response sequence: 1) review `REVIEW_OVER_30M`, 2) confirm
  or reject each booking manually, 3) assign a qualified driver for
  `DRIVER_UNASSIGNED`, 4) check Telegram failed/delayed alerts, 5) verify
  assigned trips appear on the driver's app. Rejected/terminal bookings are
  intentionally excluded from the actionable NEW review queue.
- Important: Render can idle and scheduled GitHub Actions can start late. Six-hour
  probes are **not** a real-time uptime SLA.

## Neon production backup status — October 14, 2026

At the time of audit:
- Project: `sham-route` (`patient-poetry-86883659`).
- Production branch: `production`, not protected.
- Plan: **Free**, with a **6-hour** point-in-time history window.
- Snapshots: one manual snapshot `pre-guest-bookings-2026-10-12`;
  **no automated snapshot schedule** configured.
- The Free plan allows one manual snapshot; automatic scheduled snapshots
  and protected branches require a paid Neon plan. These were deliberately
  **not enabled** and no payment/plan change was made.

### Backup action before serious commercial traffic

1. Create a separate encrypted, offsite PostgreSQL backup using `pg_dump`
   with **restricted access**. Keep database credentials outside the repo.
2. Verify a restore into an **isolated, non-production** Postgres database;
   a backup that has never been restored is unverified.
3. Define a retention policy, responsible administrator, restoration target
   time, and a monthly restore drill.
4. On upgrade to a Neon paid plan, enable protected production branch and
   scheduled snapshots, and verify that they do not interfere with Prisma
   migrations and the production deployment flow.

Example local backup for an administrator whose machine has PostgreSQL client
tools installed (the `DATABASE_URL` is configured in the shell's environment,
not embedded in the command history):

```bash
pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-acl --file="./tareeqalsham-$(date +%F).dump"
```

**This command creates an unencrypted dump.** Encrypt it immediately before
uploading it to secure storage and restrict who can access the file. Do not
commit or upload the dump to this public GitHub repository.

## Suggested operator response

- **API/database failure:** inspect Render service status, Neon branch state,
  database limits and recent deploys. Check GitHub production-smoke run.
- **Failed Telegram messages:** open /admin/telegram; verify bot configuration
  and chat permissions before selecting retry.
- **Booking review delays:** use the dashboard links to confirm or process
  bookings manually. No automatic cancellation is performed.
- **Suspected guest-booking abuse:** inspect anonymized 429 counts and HTTP
  logs, adjust the Redis-backed rate limit carefully, and consider Turnstile
  only after a real abuse signal.
