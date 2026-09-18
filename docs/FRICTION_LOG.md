# Friction log

Written continuously from Day 1, per the PRD's own submission checklist
(docs/PRD.md §12) — not reconstructed after the fact. One entry per notable
snag, with the tool/service involved and how it was resolved (or not).

## 2026-09-16 — Project scaffold

- Tool: `create-next-app`. Friction: the package name can't contain capital
  letters, so it refused to scaffold directly into `QuietSignal/`. Worked
  around by scaffolding into a temp lowercase directory and moving the
  output in, then fixing `package.json`'s `name` field by hand.

## 2026-09-18 — Days 1-3 spike (Ring API)

- Tool: Ring Partner API. Friction: no live account/token was available to
  test against, so the spike was done by reading Amazon's own reference
  implementation (`AmazonAppDev/ring-api-helloworld`) instead of trial and
  error against the real API. Endpoints, auth flow, and payload shapes were
  confirmed from that source; live behavior is still unverified. See
  `docs/SPIKE_DAY1-3.md`.
- Finding: the Partner API has no polling endpoint for live events, only a
  per-device history lookup. Ring's reference app delivers live events via
  webhook instead. Built both paths (backfill + webhook) rather than one.
- Open risk: the only event types confirmed in the reference app are
  motion, person-detected, and doorbell press, all from cameras/doorbells.
  No contact/door sensor event type was found. This is a real tension with
  the product's "no cameras, motion + contact sensors only" principle, and
  needs a direct check against a real device inventory before Day 4.
  Details and the fallback options are in `docs/SPIKE_DAY1-3.md`.
- Update (same day): ran `/api/spike` against a real Ring Playground
  token. Auth and device listing both worked. The account has exactly one
  device, "Playground Device", with an empty `capabilities` list, which is
  a sandbox placeholder rather than real hardware. The contact-sensor
  question above is still open and needs a real linked device to answer.

## 2026-09-18 — Days 4-10 core engine

- Built the third scripted break scenario (sequence break) and an
  automated test suite (`tests/acceptance.test.ts`, vitest) that checks
  the PRD's own §8 metrics (M1-M5) against the real baseline engine and
  break detector, not mocks.
- Bug the tests caught immediately: the synthetic generator's door-open
  events had no guaranteed follow-up motion, so an ordinary delivery could
  randomly trigger a false "sequence break" on an otherwise benign day.
  Fixed by always generating a follow-up interior-motion event a few
  minutes after every door-open, matching what actually happens when
  someone answers the door.
- Second bug, found by hand while re-testing the live demo page after the
  suite was green: the Watcher home screen's demo mode used the real
  wall-clock time to decide whether the household's first activity was
  "late yet". That made the scripted incident only visible during certain
  hours of the day, which violates FR-6.2 ("demo mode... reproducible
  without waiting"). Fixed by pinning demo mode's evaluation time to late
  in the current calendar day, regardless of when the page is actually
  loaded.
- Both fixes are covered by the test suite now (`npm run test`).
