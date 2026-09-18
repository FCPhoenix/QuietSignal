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
