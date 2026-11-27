# ADR-0385: A develop push is judged by the develop tip before it

> Status: Accepted · Decided: 2026-11-27 · Implemented: `fix/ratchet-push-judge`
> · Amends: [ADR-0368](./0368-new-code-comments-are-banned-and-existing-ones-only-shrink.md) decision 5 and
> [ADR-0379](./0379-a-maintainer-can-hand-develop-a-newer-ratchet-judge.md) · Scope: `.github/workflows/verify.yml`,
> `scripts/ratchet.js`, `scripts/ratchet/files.js`
> · The behaviour is documented in [tools/eslint-rules](../../tools/eslint-rules/README.md#who-judges-a-change)

## Context

A push to `develop` took its ratchet judge — scripts, modes, baselines — from the last green `develop` run.
From 2026-11-25 to 2026-11-26 that commit stayed at one merge while fifteen more landed, and five push runs
failed on changes every pull request had passed. Replaying them locally reproduced each failure, for two
reasons:

- The judge's own scripts were old. A fix to how test files of a nested project are counted had merged
  since, so the old judge counted `libs/runtime`, `libs/checkout`, `libs/design-system`, `libs/push` and
  `libs/sign-in` as having untyped test files; the current scripts count none.
- Over the long range, `git diff -M` paired `libs/runtime/src/facade.test.ts` with a file split off in one
  pull request instead of the one it moved to in the next, so an unchanged `jscpd` entry read as raised.

ADR-0379 let a maintainer hand `develop` a newer judge by hand. That only helps after somebody notices.

## Decision

**A push run takes its ratchet judge and reference baselines from the `develop` tip before the push
(`github.event.before`), never from a commit of the push itself. "Baselines only go down" is checked one
first-parent step at a time, each step against its parent and judged by the parent's ratchet scripts when the
parent is in the judge's history.**

- `scripts/ratchet.js verify-baseline --head <ref>` reads the baselines from a commit instead of the tree,
  and follows renames between `--base` and `--head` only.
- The walk starts at the last green run. A manual run starts it at its `judge` input instead, so a
  maintainer can still step past a raise that would keep every later run red (ADR-0379).
- When `before` is missing, not an ancestor of `HEAD` or equal to it (a new branch, a force push), the
  judge is the last green run, as before.
- Lint, typecheck, test and e2e still compare with the last green run.
- A judge or parent that has no `--head` yet is replaced by the run's judge; a judge without it compares
  once, against the judge commit.
- Pull requests are unchanged.

## Alternatives

- **Keep the last green run as the judge** and rely on ADR-0379's manual run: every stale stretch then
  needs a person, and `develop` is red until one acts.
- **Compare baselines once against `HEAD^1`** without the walk: a step whose push run was cancelled would
  never have its baselines checked on `develop`.

## Consequences

- A change to the judge starts judging `develop` with the next push, not with the next green run.
- A step that raised a baseline is named by its range in the failure, so the merge to look at is known.
- The counts of a push are held to the previous tip's modes and baselines. If a merge was let in red and its
  own push run was cancelled, the next push is judged by that merge's ratchet; only its baseline step is
  still judged by its parent.
