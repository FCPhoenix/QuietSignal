# QuietSignal

QuietSignal learns the daily rhythm of a home from Ring motion and door/window
sensors, and alerts a designated family member — in plain language — only
when the *pattern itself* breaks, not when a single event happens. It watches
the routine, never the person.

Built for the **Build, Ship, Shape: Amazon Developer Hackathon** (Ring track).
Full spec: [docs/PRD.md](docs/PRD.md).

## Product principles

- **Pattern, not person** — no cameras, no audio, no identifiable behavioral
  profiling beyond coarse routine windows.
- **Resident owns the data** — visible pause/delete, a plain-language
  transparency view (`/resident`), no hidden retention.
- **Silence is the default** — the system is tuned to under-alert; every
  false alarm permanently degrades trust.
- **Notice, not rescue** — QuietSignal is an awareness tool. It does not
  replace emergency services or medical monitoring.

## Architecture

```
ingestion → event store → baseline engine → break detector → alert composer → notifications
                                                                 (Bedrock)      (in-app + email)
```

Statistics decide *whether* to alert; the LLM (AWS Bedrock) only decides
*how to say it* — this bounds LLM risk to phrasing, never detection. See
`src/lib/`:

| Module | Responsibility |
|---|---|
| `lib/ingestion` | Ring API/simulator or the synthetic generator — same output shape either way |
| `lib/eventStore` | Append-only event store (in-memory for now; swap for DynamoDB later) |
| `lib/baseline` | Per-household anchor routines with confidence scoring |
| `lib/detector` | Pattern-break detection with hysteresis |
| `lib/alerts` | Bedrock-backed plain-language alert composer, evidence-validated |
| `lib/notifications` | In-app conversation threads + SES email |

## Getting started

```bash
npm install
cp .env.example .env.local   # demo mode is on by default — no credentials needed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the Watcher home
screen, and [http://localhost:3000/resident](http://localhost:3000/resident)
for the Resident transparency view. With `QS_DEMO_MODE=true` (the default),
the app replays a scripted 21-day history ending in an absence-break
scenario — no Ring account or AWS credentials required to see it work.

To wire up real services, edit `.env.local`:
- **Ring**: create a developer account ([get started](https://developer.amazon.com/docs/ring/get-started.html)), set `QS_INGESTION_MODE=ring-api`, fill in `RING_*`, and implement `src/lib/ingestion/ringClient.ts`.
- **Bedrock alerts / SES email**: set `AWS_REGION` + credentials; the alert composer and email sender are already wired to the SDK.

## Status

Early scaffold — ingestion, baseline engine, break detector, and alert
composer are implemented end-to-end in synthetic/demo mode. Real Ring API
integration is pending the Days 1–3 spike (see `docs/PRD.md` §10 and
`docs/FRICTION_LOG.md`).

## License

MIT — see [LICENSE](LICENSE).
