# Friction log

Written continuously from Day 1, per the PRD's own submission checklist
(docs/PRD.md §12) — not reconstructed after the fact. One entry per notable
snag, with the tool/service involved and how it was resolved (or not).

## 2026-09-16 — Project scaffold

- Tool: `create-next-app`. Friction: the package name can't contain capital
  letters, so it refused to scaffold directly into `QuietSignal/`. Worked
  around by scaffolding into a temp lowercase directory and moving the
  output in, then fixing `package.json`'s `name` field by hand.
