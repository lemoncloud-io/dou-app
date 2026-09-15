# Chatic

Nx monorepo: `apps/` (4), `libs/` (16).

## Before you start

- Build, run, test, lint, deploy commands: [`README.md`](./README.md).

## Module docs

- Before editing a module, read its own `README.md` (and `docs/<topic>/` if it has one). Prefer it
  over inferring behavior from source.
- Root `docs/` holds only `docs/adr/` (decisions). Nothing else lives there — links to any other
  `docs/` path are dead.
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

## Reviewing a change

- Before calling a change done, run the same gate `verify.yml` runs for the projects you touched —
  lint, typecheck (`tsc -b`, per above), test. Don't rely on CI to catch it first.
- If the change encodes a decision rather than an obvious fix, check whether it needs a new or
  updated ADR under the existing ADR rules.
- If the change leaves a module's own `README.md` or `docs/<topic>/` out of date — new behavior,
  a changed constraint, a retired pattern — update that doc as part of the same change, not as a
  follow-up.
- Never reference an ADR in a source code comment (no `ADR-0036` mentions, no `docs/adr/` links).
  If the code needs its reasoning to make sense, write that reasoning into the module doc in your
  own words — the same rule "Module docs" already states, applied to code comments too.
- Fill `.github/pull_request_template.md` as the repo expects: PR type checkboxes, `Changes`, and
  `To Reviewers` — the last is where a reviewer's attention should be pointed, not a separate doc.

## Result documents (plans, specs, review notes)

- An implementation plan, a review pass, or survey notes produced while working are working
  artifacts, not repo artifacts. They belong in the PR description (`Changes` / `To Reviewers`) or
  the agent's own session/plan file — never committed as a new file under `docs/`.
- The two durable homes for anything worth keeping past the PR are a module's own `README.md`
  (how it behaves now) and `docs/adr/` (why a decision was made and what it cost). If neither
  fits, it likely shouldn't be committed.
- If a module's `docs/<topic>/` grows too large to sit inside one module doc — a sub-topic has
  outgrown the README or become its own concern — split it into its own `docs/<topic>/` doc. This
  is just the existing "Module docs" split (README vs. `docs/<topic>/`) applied at the point it's
  actually needed.
