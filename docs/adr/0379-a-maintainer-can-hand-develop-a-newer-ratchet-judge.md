# ADR-0379: A maintainer can hand develop a newer ratchet judge

> Status: Accepted · Decided: 2026-11-26 · Implemented: `fix/verify-ratchet-judge-dispatch`
> · Amends: [ADR-0368](./0368-new-code-comments-are-banned-and-existing-ones-only-shrink.md) decision 5 (the
> judge always comes from the compare base) · Scope: `.github/workflows/verify.yml`
> · The behaviour is documented in [tools/eslint-rules](../../tools/eslint-rules/README.md#who-judges-a-change)
> · Amended by: [ADR-0385](./0385-a-develop-push-is-judged-by-the-develop-tip-before-it.md) — a push takes its judge
> from the develop tip before it, and baselines are checked per first-parent step

## Context

A push to `develop` is compared with the commit of the last green `develop` run, and ADR-0368 decision 5
takes the ratchet judge — scripts, modes, baselines — from that commit. A fix to the judge therefore starts
judging `develop` only once a `develop` run that carries it goes green. When the fix's own push run is
cancelled by the next merge, every later push is judged by the old judge. If the old judge is wrong about
the newer tree, those runs stay red, a red run never moves the base, and `develop` cannot turn green by
itself, while every pull request passes against the `develop` tip.

The longer the base stays pinned, the less its baseline comparison can be trusted too: `git diff -M` pairs
each deleted file with one added file, so a file split in one pull request and moved in another can be
paired with the wrong half, and its unchanged baseline entry reads as raised.

## Decision

**`verify` can be run by hand on `develop` with a `judge` input; that run takes the ratchet judge and
baselines from `judge`, and a green manual run counts as a compare base like a green push run.**

- `judge` must be a commit on `develop`'s first-parent line (a merge or a direct push), no older than the
  compare base, and carry `scripts/ratchet.js`; the run fails otherwise. A commit inside a merged branch was
  never judged as a head and is refused.
- Lint, typecheck, test and e2e still compare with the last green run, so a manual run checks at least as
  much code as the push run it replaces.
- A manual run has its own concurrency group, so the next merge cannot cancel it.
- Pull requests and push runs are unchanged: a change that loosens a check is still judged by the judge it
  would replace.

## Consequences

- The range between the last green run and `judge` gets no "baselines only go down" check on `develop`.
  Each pull request in it was checked against the `develop` tip of its day. A maintainer picks the oldest
  commit that carries the fix and that the rename pairing above does not trip over, checked locally with
  `node scripts/ratchet.js verify-baseline --base <judge>`.
- Who chose the judge is in the run's annotations, and only someone with write access can start the run.
