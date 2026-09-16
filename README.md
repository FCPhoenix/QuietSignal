# QuietSignal

Learn a home's daily rhythm from Ring motion and door/window sensors, and alert a family member in plain language only when the pattern itself breaks, not when a single event happens.

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8)
![AWS Bedrock](https://img.shields.io/badge/AWS-Bedrock-orange)

## What's Inside

| Path | What it does | You need |
|------|-------------|----------|
| `src/lib/ingestion` | Ring API/simulator client, plus a synthetic event generator for demo mode | Nothing, for the synthetic path |
| `src/lib/baseline` | Builds per-household anchor routines with confidence scoring | Event history (real or synthetic) |
| `src/lib/detector` | Pattern-break detection with hysteresis, across four break classes | A baseline |
| `src/lib/alerts` | Plain-language alert composer, backed by AWS Bedrock | AWS credentials |
| `src/lib/notifications` | In-app conversation threads plus SES email | AWS credentials, for email |
| `src/app` | Watcher home screen and Resident transparency view | Node.js 18+ |

---

## Product Principles

- **Pattern, not person.** No cameras, no audio, no identifiable behavioral profiling beyond coarse routine windows.
- **Resident owns the data.** Visible pause/delete, a plain-language transparency view at `/resident`, no hidden retention.
- **Silence is the default.** The system is tuned to under-alert, since every false alarm permanently degrades trust.
- **Notice, not rescue.** QuietSignal is an awareness tool. It does not replace emergency services or medical monitoring.

---

## Step 1: Run the Demo

No Ring account or AWS credentials needed. Demo mode replays a scripted household history that ends in a real absence-break scenario.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the Watcher home screen, and [http://localhost:3000/resident](http://localhost:3000/resident) for the Resident transparency view.

> **Note:** `QS_DEMO_MODE=true` is the default in `.env.example`. Set it to `false` once real or synthetic history is wired up.

---

## Step 2: Connect a Ring Account

1. Create a Ring developer account at [developer.amazon.com/docs/ring/get-started.html](https://developer.amazon.com/docs/ring/get-started.html)
2. Set `QS_INGESTION_MODE=ring-api` in `.env.local`
3. Fill in `RING_CLIENT_ID`, `RING_CLIENT_SECRET`, and `RING_REFRESH_TOKEN`
4. Implement the request/response mapping in `src/lib/ingestion/ringClient.ts`

The rest of the pipeline (baseline engine, detector, alert composer) never needs to know whether events came from Ring or the synthetic generator, since both produce the same normalized event shape.

---

## Step 3: Turn On Bedrock Alerts and Email

The alert composer and email sender are already wired to the AWS SDK. They just need credentials.

```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
QS_BEDROCK_MODEL_ID=anthropic.claude-3-5-haiku-20241022-v1:0
QS_ALERT_FROM_EMAIL=alerts@yourdomain.example
```

Every break candidate is scored by pure statistics first. Bedrock only chooses how to phrase the resulting alert, and the composer rejects any output that doesn't trace back to the underlying evidence.

---

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `QS_INGESTION_MODE` | `ring-api`, `ring-simulator`, or `synthetic` | No, defaults to `synthetic` |
| `QS_DEMO_MODE` | Replays a scripted absence-break scenario | No, defaults to `true` |
| `QS_TIMEZONE` | Household timezone | No |
| `QS_ROLLING_WINDOW_DAYS` | Baseline window, 7 to 35 days | No, defaults to `21` |
| `QS_CONFIRMATION_PERIOD_MINUTES` | Hysteresis window before a break escalates | No, defaults to `20` |
| `QS_QUIET_HOURS_START` / `QS_QUIET_HOURS_END` | Nighttime window for nocturnal-anomaly detection | No |
| `QS_TOLERANCE` | `lenient`, `balanced`, or `strict` | No, defaults to `balanced` |
| `RING_CLIENT_ID` / `RING_CLIENT_SECRET` / `RING_REFRESH_TOKEN` | Ring OAuth credentials | Yes, for `ring-api` mode |
| `AWS_REGION` | AWS region for Bedrock and SES | Yes, for real alerts/email |
| `QS_BEDROCK_MODEL_ID` | Bedrock model used by the alert composer | No |
| `QS_ALERT_FROM_EMAIL` | From address for SES alert emails | No |

---

## Features

### Baseline Engine
- **Anchor routines** for first activity, last activity, meal windows, and per-sensor first-event patterns
- **Confidence scoring** (learning, stable, high-confidence) that gates alerting until the household is understood
- **Day-of-week awareness**, so weekday and weekend routines are learned separately

### Break Detector
- **Absence break**, an expected activity window passed with no events
- **Nocturnal anomaly**, unusual activity during quiet hours
- **Sequence break**, a door opened with no interior motion afterward
- **Silence-after-anomaly**, a strange event followed by total inactivity
- **Hysteresis**, so a single missed sensor blip never pages anyone

### Resident View
- Plain language, large type, no jargon
- Shows exactly which routines the system has learned and how long it has been watching
- Pause and delete controls, always visible

---

## Architecture

```
src/
├── app/
│   ├── page.tsx              # Watcher home screen
│   └── resident/page.tsx     # Resident transparency view
└── lib/
    ├── config.ts              # Env-driven tuning (window size, thresholds, quiet hours)
    ├── events/types.ts        # Normalized event schema shared by every ingestion mode
    ├── ingestion/
    │   ├── ringClient.ts       # Ring API/simulator client (pending real wiring)
    │   ├── syntheticGenerator.ts  # Seeded household schedule generator
    │   └── index.ts            # Picks the ingestion mode from config
    ├── eventStore/index.ts    # Append-only event store
    ├── baseline/engine.ts     # Anchor routines and confidence scoring
    ├── detector/breakDetector.ts  # Pattern-break detection with hysteresis
    ├── alerts/composer.ts     # Bedrock-backed plain-language alert composer
    ├── notifications/index.ts # In-app conversation threads and SES email
    └── pipeline.ts            # Wires ingestion, baseline, and detection together
```

Statistics decide whether to alert. The LLM only decides how to say it. That separation bounds Bedrock's role to phrasing, never detection.

---

## Tech Stack

- **App**: Next.js 16 (App Router), TypeScript, Tailwind CSS, Turbopack
- **Alerts**: AWS Bedrock
- **Notifications**: In-app conversation threads, AWS SES for email
- **Ingestion**: Ring API/simulator, with a seeded synthetic generator as a fallback

---

## Development

```bash
# Run with hot reload
npm run dev

# Type checking and lint
npx tsc --noEmit
npm run lint

# Build for production
npm run build
```

---

## Documentation

- [Product requirements document](docs/PRD.md)
- [Friction log](docs/FRICTION_LOG.md)

## License

[MIT](LICENSE)
