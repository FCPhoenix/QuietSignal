# Days 1-3 spike findings

Per `docs/PRD.md` §10: validate Ring simulator/API event access, validate Bedrock access, and build the minimal event → store → query loop. Decision gate: proceed with real Ring/AWS integration, or fall back to synthetic-only ingestion (disclosed).

## Status: code complete, live validation pending credentials

Everything below is implemented and ready to run. It has not been exercised against real Ring or AWS accounts yet, since no credentials were available in this environment. To run the actual validation:

1. Create a Ring developer account and generate a token at the [Playground](https://developer.amazon.com/ring/console/playground)
2. Request AWS credentials with Bedrock access (the hackathon's $150 credit form: https://forms.gle/GaHFxSbBQNG9Kti6A)
3. Fill both into `.env.local`
4. Run `npm run dev` and hit `GET /api/spike`

That endpoint lists your Ring devices, backfills the last 24h of events into the event store, queries them back out (the "minimal event → store → query loop"), and pings Bedrock. It returns a `decision` field: `"proceed"` once both checks pass, or a note on what's still missing.

## What the spike confirmed about the Ring API

Endpoints and schemas below were pulled directly from Amazon's own reference app, [AmazonAppDev/ring-api-helloworld](https://github.com/AmazonAppDev/ring-api-helloworld), not guessed:

- Base URL: `https://api.amazonvision.com`
- Auth: `RING_ACCESS_TOKEN` (Playground token, fastest) or `RING_REFRESH_TOKEN` + client credentials via `https://oauth.ring.com/oauth/token`
- `GET /v1/devices`, `GET /v1/devices/{id}/status`, `GET /v1/history/devices/{id}/events` all return a JSON:API shape: `{ data: [{ id, attributes }] }`
- Observed event types: `motion.human` (history endpoint) and `motion_detected` / `person_detected` (webhook)
- **The Partner API has no polling endpoint for live events.** Ring's own reference app says so directly: events are delivered via webhook, not fetched. The history endpoint (`/v1/history/devices/{id}/events`) is a backfill/lookup, not a live feed.

This is why ingestion here has two paths, not one:
- `src/lib/ingestion/ringClient.ts` backfills the rolling window from the history endpoint, for seeding the baseline engine
- `src/app/api/webhook/ring/route.ts` receives live events pushed by Ring, for ongoing monitoring

## Open risk: this API looks camera-oriented, not contact-sensor-oriented

The event types the reference app actually demonstrates are `motion_detected`, `person_detected`, and `ding` (doorbell press), all from Ring video doorbells/cameras. There is no observed event type for a contact/door sensor opening or closing. Product goal #3 in `docs/PRD.md` is "zero camera dependency: works with motion + contact sensors only", and principle P1 is "no cameras, ever" (even though QuietSignal never uses video, computer-vision-derived motion events on a camera device sit closer to that line than a plain motion or contact sensor).

**This needs a direct check once you have a real account**: does your Ring device inventory (`GET /v1/devices`, surfaced in the `/api/spike` response as `devices[].capabilities`) include standalone contact/door sensors (Ring Alarm hardware), or only cameras and doorbells? If it's cameras only, the product's core sensor mix needs a decision before Day 4: either accept camera-derived motion events (revisit P1/goal #3 wording), or treat this as the fallback case in `docs/PRD.md` §9 and stay synthetic-first for the hackathon while disclosing that honestly in the submission.

## What's still a stub

- `pingBedrock()` (`src/lib/alerts/ping.ts`) has not been run against a real model yet
- No retry/backoff on Ring API calls (fine for a spike, worth adding before Day 19-25 hardening if real integration proceeds)
- `RING_WEBHOOK_SECRET` auth on the webhook route is implemented but untested against a real Ring-sent webhook signature scheme (Ring's actual webhook signing method, if any beyond a shared secret, wasn't in the reference app's scope either)
