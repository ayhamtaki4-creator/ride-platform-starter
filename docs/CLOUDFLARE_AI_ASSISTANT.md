# مساعد طريق الشام الذكي (Cloudflare Workers AI)

## Overview

The public FAQ widget supports typed Arabic questions with a server-side Cloudflare Workers AI model. Quick topic buttons still use reviewed local answers and never call AI. If inference is not configured, fails, or is rate-limited, typed queries fall back to the existing reviewed FAQ answers or to human support.

The assistant never accesses production accounts, private bookings, payment data, or phone verification. It does **not** place, confirm, change, or cancel bookings.

## Production setup

The portal's `apps/portal/wrangler.jsonc` contains:

- `ai.binding = "AI"`: Cloudflare Workers AI.
- `ratelimits`: `CHAT_RATE_LIMIT`, 8 requests per minute per Cloudflare client IP (the tradeoff is mobile carrier IP sharing).

To publish, build the portal with the existing OpenNext/Cloudflare deployment flow and deploy the Worker **using this Wrangler configuration**. Verify that the deployed Worker has both bindings in Cloudflare's dashboard. It requires neither an OpenAI API key nor changes to the NestJS API/Neon database.

Model: `@cf/meta/llama-3.1-8b-instruct-fp8`. Cloudflare Workers AI has a daily free allocation on Workers Free and charges for overages on paid plans; check the current dashboard's pricing and usage. The rate-limit binding helps avoid unexpected request spikes but is not a daily spending cap. On free quotas exhausted, visitors retain FAQ answers.

Some local `next dev` setups do not initialize OpenNext's Cloudflare development context; the model endpoint then intentionally returns HTTP 503 and the FAQ fallback remains usable. On a published Cloudflare Worker, the bindings should work.

## QA checklist

1. As a guest, open the homepage and click the floating help button.
2. Select a quick price question: link must lead to `/booking`; no guessed numerical fare.
3. Type a natural Arabic question not identical to a FAQ, such as "إذا وصل الطيران متأخر شو بعمل؟". Expect a brief useful AI reply.
4. Try asking for the status of another person's booking or a guaranteed price: expect referral to the booking form or support, never private data or a fabricated confirmation.
5. While AI is unavailable, the FAQ fallback must work and the page must not crash.
6. Test narrow mobile widths, Escape close, no authentication requirement.
7. Confirm `POST /api/assistant/chat` rejects cross-origin (403), invalid content type (415), oversized body (413) and repeated requests (429).
8. Check Workers AI usage and errors in Cloudflare after enabling traffic.

## Privacy and security

- Only the user's typed text plus up to six recent short chat turns are sent to Cloudflare Workers AI. This is disclosed inside the widget.
- Phone-like numbers, email addresses, and certain booking references are masked before inference.
- Neither request texts nor model errors are logged intentionally, and responses set `Cache-Control: no-store`.
- Client text and earlier assistant turns are treated as untrusted by the system instructions.
- The assistant is informational and has no privileged operational API credentials.
- Rate limit is enforced server-side **before** triggering inference and fails closed if unavailable.
- For production beyond the free-tier trial, consider Cloudflare WAF/bot management, a verified human handoff, a durable cost budget, and analytics that never collect conversation content.

## Live routes, exact price quoting, and human handoff

The widget now opens a fare and route explorer when visitors select **كم سعر الرحلة؟** / **ما المسارات المتاحة؟** or ask a matching question. The explorer calls the same public API used by the booking form:

- `GET /api/routes`: only bookable, active, private-car routes.
- `GET /api/bookings/quote?routeId=...&bookingType=PRIVATE_CAR&vehicleClass=...&passengerCount=...&luggageCount=...`: authoritative price computed by the backend for an explicitly selected route/class/counts. A successful response is not a reservation or an availability guarantee.
- Price is cleared immediately on any change to route, class, passenger count, or luggage count. Failures never reuse previous prices; the visitor can go to the official booking page.
- Initial Render cold starts are handled by the existing public API warmup. No extra database tables or auth permissions are needed.
- Two WhatsApp actions contact the already-published support numbers. They carry only a fixed greeting and a vetted category label (for example, prices or routes), never conversation transcripts, customer details, or price quotes.

The generative AI does not invent a price and never receives private booking records. The existing `/booking` form remains the source of truth before placing a reservation. No route-specific booking deep link is used because the wizard does not currently guarantee support for preselecting a route via query parameters.

### Smoke check after release

1. Open `/` in a private browsing session and open **مساعد طريق الشام**.
2. Select **كم سعر الرحلة؟**. Verify current routes appear and no inactive route is visible.
3. Choose a route, car class, number of passengers and bags, then click **عرض السعر المعتمد**.
4. Check the returned fare and currency against the booking form for the same selections.
5. Change the route/class/counts: the old fare must disappear. Check quote failure shows a clear message rather than a stale result.
6. Verify both WhatsApp links open the correct contact with only the generic request text.
7. Verify the free-form AI assistant and guest booking flow still work as before.
