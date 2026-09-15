# Desktop is published as an OSS mirror repo (chatic-app); dou-app stays canonical

## Status

accepted

## Context

`apps/desktop` (Electron shell) + `apps/desktop-web` (Slack-style client) and the
shared chat engine (`libs/*`, `assets/`) were built here in `dou-app` and continue to
live here: `dou-app` is the B2C product, its engine churns daily, and three clients
(`web`, `mobile`, `desktop-web`) share it. `dou-app` needs the desktop apps.

Separately, the desktop client is also wanted as its own **open-source B2B** repository
(`chatic-app`). The desktop apps are thin (~6.4k LOC); everything else they need is the
shared engine (~24k LOC across 13 libs), and **none of those libs is desktop-exclusive**
— every one is also used by `dou-app`'s other clients. So the desktop client cannot be
cleanly "moved out"; the engine has to travel with it.

## Decision

Publish the desktop client as a **copy-first mirror** repo (`chatic-app`) and keep
`dou-app` as the **single source of truth**.

- `chatic-app` holds a copy of the desktop dependency closure (the 2 apps + 13 engine
  libs + `assets` + the desktop-relevant config/scripts/workflows), with `@chatic/*`
  aliases preserved. See `chatic-app/docs/adr/0005-copy-first-fork-from-dou-app.md`.
- `dou-app` is **unchanged** and remains the place where desktop + engine are developed.
- The mirror is currently **parked**: it is not auto-synced. Propagating later `dou-app`
  changes into `chatic-app` is a manual, on-demand step (no pipeline yet).

## Considered Options

- **Move desktop out of dou-app entirely** — rejected: `dou-app` itself needs the desktop
  client, so it cannot leave.
- **Publish the engine as npm packages** consumed by both repos — rejected for now:
  upfront pipeline cost and a publish→bump loop on an engine that changes ~5×/day.
- **git submodule / subtree** for the shared libs — rejected for now: awkward to edit the
  engine from the mirror, fiddly in CI.

## Consequences

- The desktop code + engine now exist in **two repos** and will **drift** until a sync (or
  a future single-sourcing decision). `dou-app` wins on conflict — it is canonical.
- `dou-app` development is unaffected; contributors here keep working as before.
- Re-syncing `chatic-app` is deferred and manual; when it matters, revisit the npm /
  submodule options above to remove the duplication.
