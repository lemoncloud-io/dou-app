# Chatic

Nx monorepo: `apps/` (4), `libs/` (16).

## Before you start

- Build, run, test, lint, deploy commands: [`README.md`](./README.md).

## Module docs

- Before editing a module, read its own `README.md` (and `docs/<topic>/` if it has one). Prefer it
  over inferring behavior from source.
- Root `docs/` holds only `docs/adr/` (decisions) and `docs/infra/` (config/code that deploys outside
  the Nx workspace, e.g. Firebase). Nothing else lives there — links to any other `docs/` path are
  dead.
- If a module's behavior only makes sense with a decision's reasoning, write that reasoning into the
  module doc itself, in your own words. Don't rely on a reader following an ADR link.

## ADRs (`docs/adr/`)

- One decision per file, numbered, in English. Records why a decision was made and what it cost —
  not a work log, not where a module's rules live.
- Bare `ADR-0036` mentions are fine in module docs; link into `docs/adr/` only where the reader should
  actually follow it.
- A superseded ADR keeps its file; mark its status line and link to the ADR that replaced it. Don't
  delete it.

## Verifying a change

- Typecheck a lib with `tsc -b libs/<name>/tsconfig.json`, not `tsc --noEmit` (checks 0 files inside a
  lib, always "passes").
- `.github/workflows/verify.yml` lists the projects it excludes from typecheck/test — check those by
  hand.
- A stale `dist`/`out-tsc` after a directory move produces phantom type errors. `rm -rf` it and
  recheck before trusting the error.
- Adding a new workspace `lib` as a dependency needs `nx sync` (project references). Nothing in CI
  catches a missed reference for you.
