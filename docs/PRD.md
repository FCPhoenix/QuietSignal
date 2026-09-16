# QuietSignal — Product Requirements Document (PRD)

**Version:** 0.1 (Draft)
**Date:** September 15, 2026
**Author:** Hackathon submission — Build, Ship, Shape: Amazon Developer Hackathon
**Track:** Ring (priority categories: caretaking, IoT home automation)
**Mini challenges:** AWS Builder (planned); Open Source (optional, decide by Week 3)
**Deadline:** October 23, 2026, 3:00pm EDT

---

## 1. One-liner

QuietSignal learns the daily rhythm of a home from Ring motion and door/window sensor events, and alerts a designated family member — in plain language — only when the *pattern itself* breaks, not when a single event happens. It watches the routine, never the person.

## 2. Problem statement

Aging-in-place households face a monitoring paradox:

- Event-based alerts (motion, door opened, camera detected a person) fire constantly for benign reasons → alert fatigue → family ignores alerts → real emergencies are missed.
- Emergency buttons / SOS wearables depend on the person recognizing an emergency and acting. Many real emergencies (fall followed by confusion, illness, wandering at night) never generate an SOS press.
- Continuous camera-based monitoring is invasive and usually rejected by the elderly person themselves — it feels like surveillance.

**The insight:** the earliest reliable signal of trouble in an independent-living home is a *deviation from that home's established behavioral baseline*. "No kitchen motion by 11am" is a better predictor of trouble than any single motion event. This signal can be captured with the cheapest, least-invasive Ring sensors — no camera feed required, ever.

## 3. Target user & personas

### 3.1 The Watcher (primary user; the one who installs and pays attention)
- Adult child (typically 35–60) living elsewhere, responsible for a parent's wellbeing.
- Needs: reassurance; low-noise alerts they can trust; a clear explanation of *why* the system is worried.
- Pain today: either 24/7 anxiety or drowning in smart-home notifications.

### 3.2 The Resident (the person being protected; must never feel surveilled)
- Independent-living adult, 65+, typically resistant to cameras and monitoring.
- Needs: dignity, privacy, no device to wear, no behavior change required.
- Consent model: the Resident is the data owner. They can see everything QuietSignal knows, pause it, or delete it. This is a hard product principle, not marketing copy.

### 3.3 Explicit non-users / anti-persona
- Anyone wanting to monitor a non-consenting person (e.g., tracking a partner, a tenant, a caregiver). The product must be architected so this use is visibly discouraged and technically labeled.

## 4. Goals & non-goals

### Goals (hackathon scope)
1. Working end-to-end demo: Ring events → baseline model → pattern-break detection → plain-language alert delivered to a phone (push/notification surface shown in demo).
2. Baseline engine that demonstrably improves with more days of data (show learning curve in the demo).
3. Zero camera dependency: works with motion + contact sensors only.
4. Honest cold-start mode: seeded/simulated history plus a transparent "still learning" state.
5. AWS Builder mini-challenge: behavioral baseline and alert generation run on AWS (Bedrock for plain-language explanations).
6. Complete submission package: repo, <3 min video, product feedback, friction logs (target the 10% judging bonus).

### Non-goals (explicitly out of scope for this submission)
- No video/camera analysis of any kind.
- No fall detection, vitals, or wearables.
- No professional caregiving/certified-emergency-dispatch integration (claims here would be unfalsifiable and legally sensitive).
- No multi-household care circles (listed as future work only).
- No guarantee of emergency response — the product explicitly states it is a *notice* system, not a life-safety system. This disclaimer appears in-product and in the video.

## 5. Functional requirements

### FR-1: Event ingestion
- FR-1.1: Ingest timestamped events from Ring: motion detection, contact sensor (door/window) open/close, doorbell presses. Mode A: real device via Ring APIs; Mode B: Ring simulator; Mode C (cold-start fallback): synthetic event generator that produces realistic household schedules.
- FR-1.2: Every event is normalized to: `{sensor_id, sensor_type, location_label, event_type, timestamp}`.
- FR-1.3: The ingestion layer must be resilient to gaps (device offline, WiFi blip) and record gap intervals rather than pretending "no activity."

### FR-2: Household baseline model
- FR-2.1: For each sensor, build a per-time-of-day activity profile over a rolling window (default: 21 days, tunable 7–35), day-of-week aware (weekday vs weekend at minimum).
- FR-2.2: Derive household-level "anchor routines": first activity of the day, meal-time activity windows, last activity at night, typical door events (mail, deliveries).
- FR-2.3: Confidence scoring: the model must know what it does and doesn't know. Output a per-routine confidence level (learning / stable / high-confidence) that gates alerting.
- FR-2.4: Cold-start behavior: before confidence threshold is met, the system is in "Learning mode" — it must never alert on pattern breaks, only observe. Learning-mode status is always visible to the Watcher.

### FR-3: Pattern-break detection
- FR-3.1: Detect break classes, each independently thresholded:
  - **Absence break:** expected activity window (with per-home tolerance) passed with zero events (e.g., no morning activity by a learned cutoff).
  - **Nocturnal anomaly:** unusual nighttime activity volume/sequence (e.g., front door opened 3+ times between 1–4am when baseline is zero).
  - **Sequence break:** events in an atypical order/duration (e.g., front door opened but no interior motion afterward for N minutes).
  - **Silence-after-anomaly:** a strange event followed by total inactivity (compounding risk signal).
- FR-3.2: Every candidate break produces a **risk score with reasons** (which routines, what deviation magnitude, what confidence) — the score is never a naked number; it always carries its evidence.
- FR-3.3: Hysteresis/debounce: a break must persist for a confirmation period (configurable, default 15–30 min for absence breaks) before escalating. A single missed sensor blip must never page anyone.
- FR-3.4: Resident override loop: before escalating, the system offers a lightweight check-in nudge (e.g., a spoken/visual prompt on an existing in-home surface or a simple in-app "I'm fine" button with generous timeout). If acknowledged, the break is logged, not escalated. (If Ring/Amazon surface for the nudge proves infeasible in scope, fall back to app-only check-in — decide during Week 2 spike.)

### FR-4: Plain-language alert generation
- FR-4.1: Escalated breaks are rendered by an LLM (AWS Bedrock) into a plain-language alert using a strict template: what was expected, what happened, since when, confidence, and one suggested action ("Try calling her; if no answer by 12:30, consider asking the neighbor to check").
- FR-4.2: Alerts are batched/deduplicated — the Watcher receives at most one active conversation per break, updated in place as state changes (still no activity → check-in failed → escalation), not a stream of pings.
- FR-4.3: All-clear message when the pattern normalizes.

### FR-5: Watcher application (web app)
- FR-5.1: Screens: (a) Home status ("All normal — today's rhythm looks typical"), (b) Learning-mode dashboard with confidence per routine, (c) Active break conversation view, (d) Settings: household name, sensor labels, quiet hours, escalation contact, tolerance tuning ("Lenient / Balanced / Strict").
- FR-5.2: Every alert links to its evidence: the actual (anonymized, non-visual) event timeline that triggered it.
- FR-5.3: Resident transparency view: a single page, in large type, showing exactly what QuietSignal knows and buttons for Pause / Delete my data. Required by product principle P2 (§7).

### FR-6: Admin/ops
- FR-6.1: Config file/env for: rolling window size, thresholds per break class, confirmation periods, quiet hours, timezone.
- FR-6.2: Demo mode toggle: replays a scripted 5-day synthetic history + a scripted "day of the incident" so the video and live demos are reproducible without waiting weeks.

## 6. System architecture (logical; no code)

1. **Ingestion service** — polls/subscribes to Ring events (or simulator/synthetic generator); writes normalized events to the event store.
2. **Event store** — append-only, timestamped, per-sensor; also stores gap intervals and acknowledged check-ins.
3. **Baseline engine** — scheduled job (e.g., hourly + on-event) maintaining per-sensor profiles, anchor routines, and confidence scores. Pure deterministic statistics; no LLM here.
4. **Break detector** — evaluates current state against baseline; emits scored break candidates with evidence; applies hysteresis and the check-in loop before escalation.
5. **Alert composer** — calls Bedrock with a locked prompt template + structured evidence JSON to render the plain-language alert; validates output against the template (LLM never invents facts; all numbers come from structured evidence).
6. **Notification layer** — delivers to the Watcher app (web push / in-app; email as secondary). Demo uses in-app + one email.
7. **Web app** — Watcher UI + Resident transparency view + demo mode.
8. **AWS integration (mini-challenge)** — Bedrock for alert composition (and optionally a Bedrock-powered "explain this week's rhythm" summary); deployment documented for the AWS Builder submission fields.

**Data flow principle:** statistics decide *whether* to alert; the LLM only decides *how to say it*. This separation is deliberate — it bounds LLM risk to phrasing, not detection.

## 7. Product principles (non-negotiable)

- **P1 — Pattern, not person:** no cameras, no audio, no identifiable behavioral profiling beyond coarse routine windows. If a feature needs to know *what* someone is doing, it's out of scope.
- **P2 — Resident owns the data:** visible pause/delete, plain-language transparency view, no hidden retention. Baselines are per-household, never cross-household or used for anything but this home's alerts.
- **P3 — Silence is the default:** the system's success metric is alerts *not sent*. Every false alarm permanently degrades trust; the product is tuned to under-alert on marginal signals.
- **P4 — Notice, not rescue:** in-product and in-video disclaimer: QuietSignal is a awareness tool and does not replace emergency services or medical monitoring.

## 8. Success metrics (how we know the demo works)

- **M1 Precision:** ≥ 0 false escalations across the scripted demo scenario set (10 scripted benign days, 3 scripted break days).
- **M2 Recall on script:** all 3 scripted break scenarios escalate with correct evidence attached.
- **M3 Noise floor:** zero alerts during Learning mode in any scenario.
- **M4 Latency:** absence-type break escalated ≤ 15 min after confirmation window closes (simulated time).
- **M5 Learning curve:** with 21-day synthetic history, anchor routine confidence reaches "high" for ≥ 3 anchors (first activity, meal window, last activity).
- **M6 Video:** judges understand the deviation-not-events insight within the first 20 seconds.

## 9. Risks & mitigations (honest register)

| Risk | Severity | Mitigation |
|---|---|---|
| Ring simulator/API lacks needed event granularity or stable timestamps | Fatal | Week-1 spike validates before any product code; fallback = synthetic generator driving the full pipeline (still Ring-API-shaped) and disclosed honestly in feedback |
| Cold-start looks unimpressive in a 3-min video | High | Demo mode replays 5-day history in seconds; video shows the learning curve compressed |
| "Elderly monitoring" reads as surveillance to judges | High | Lead every artifact (pitch, video, README) with P1/P2 principles; Resident transparency view shown on screen in the video |
| False-alarm tuning rabbit hole | Medium | Fixed, documented thresholds for the hackathon; tuning knobs exist but defaults are frozen after Week 3 |
| Scope creep toward "full caregiving platform" | Medium | §4 non-goals are binding; anything not in FR-1..6 is future work |
| LLM hallucinating alert facts | Medium | Alert composer receives structured evidence JSON; prompt forbids invention; post-generation validation of numbers against evidence |

## 10. Milestones (39 days)

- **Days 1–3 — Spike (kill-or-commit):** validate Ring simulator/API event access; validate Bedrock access; build the minimal event → store → query loop. Decision gate: proceed, or fall back to synthetic-only ingestion (disclosed).
- **Days 4–10 — Core engine:** event store, baseline engine with confidence scoring, break detector with hysteresis, synthetic history generator. Milestone: scripted 21-day history produces correct anchors and the 3 scripted breaks fire.
- **Days 11–18 — Alerts & app:** check-in loop, Bedrock alert composer, Watcher web app (4 screens), Resident view, demo mode. Milestone: full end-to-end run in demo mode.
- **Days 19–25 — Hardening:** false-alarm pass on scripted benign days, settings/tuning UI, ops config, deployment to AWS (for mini-challenge), friction logs written continuously from Day 1 onward (not retroactively).
- **Days 26–30 — Submission package:** repo polish (README, license visible in About, setup instructions runnable by a stranger), product feedback answers for every tool used, 3-min video (script: insight → learning montage → scripted incident → alert conversation → Resident view → disclaimer).
- **Days 31–39 — Buffer:** minimum 8 days of deliberate slack. Judge-readable dry run with a non-technical friend; fix what they misunderstand. Submit 24h before deadline; never submit on deadline day.

## 11. Open questions (owner must resolve — answered by you, the user)

1. **Ring access:** do you have (or can you create) a Ring developer account with simulator access today? If approval takes weeks, the synthetic-first plan activates immediately.
2. **Notification surface for the video:** in-app web push only, or do you also want an SMS/email leg (adds account/service setup time)?
3. **Check-in nudge surface:** pure in-app "I'm fine" button (safe), or attempt a Ring/Alexa in-home prompt (riskier, flashier)? Recommendation: in-app for the hackathon; note the in-home version as a feature request in the submission (which doubles as required product feedback).
4. **Solo or team:** is anyone joining? A second person for video/editing and a demo "Watcher" role materially improves the submission.
5. **Open Source mini-challenge:** the baseline engine, cleanly separated, is a plausible standalone OSS repo. Do it? Recommendation: only if the core is done by Day 21; a late OSS add-on is worse than none.

## 13. Official resources (from hackathon Resources page — Ring track)

**Ring — start here for the Days 1–3 spike:**
- Ring Developer portal (free account → API access): https://developer.amazon.com/docs/ring/get-started.html
- Ring API reference (auth, endpoints, webhooks, rate limits, testing, SDKs): https://developer.amazon.com/docs/ring/api-documentation.html
- Canonical starter project: https://github.com/AmazonAppDev/ring-api-helloworld
- Ring Developer community (active Q&A — first stop when stuck): https://community.amazondeveloper.com/c/ring/53
- UX design guide: https://developer.amazon.com/docs/ring/ux-design-guide.html
- Existing shipping Ring apps (competitive scan / "does this already exist?" check): https://ring.com/appstore

**Cross-track tools that apply to us:**
- Amazon Devices Builder Tools (MCP server for AI coding assistants — useful with our vibe-coding workflow): https://developer.amazon.com/docs/vega/0.24/mcp-server
- $150 AWS credits request form (do this Day 1 — free Bedrock budget for the spike): https://forms.gle/GaHFxSbBQNG9Kti6A
- AWS Builder Center (Bedrock tutorials for the mini-challenge): https://builder.aws.com/learn
- Sample code org: https://github.com/amazonappdev

**Spike note:** the hackathon states a free Ring account grants access to the Ring (Amazon Vision) APIs — no separate approval pipeline. This lowers Open Question #1's risk: create the account Day 1 and run `ring-api-helloworld` before anything else. Also scan https://ring.com/appstore immediately to confirm no shipping app already does pattern-based caretaking alerts.

## 12. Acceptance checklist (submission-ready definition)

- [ ] End-to-end demo runs in demo mode on a fresh machine from README instructions alone
- [ ] Repo: public, open-source license visible, code demonstrably calls Ring APIs/simulator (not README-only)
- [ ] Video: <3 min, English, leads with the insight, shows a real break escalation + Resident view, includes P4 disclaimer, no third-party music/footage
- [ ] Product feedback written for every Ring/AWS tool used; friction logs included (10% bonus targeted)
- [ ] AWS Builder fields filled: services used, what for, how documented
- [ ] Track = Ring; mini challenges selected; prior-work disclosure section if any code predates the window (it must be zero — build fresh)
- [ ] Submitted ≥ 24 hours before the Oct 23, 3:00pm EDT deadline
