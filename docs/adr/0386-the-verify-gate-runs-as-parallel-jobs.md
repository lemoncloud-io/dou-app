# ADR-0386: The verify gate runs as parallel jobs

> Status: Accepted · Decided: 2026-11-27 · Implemented: `ci/verify-parallel-jobs`
> · Builds on: [ADR-0299](./0299-the-verify-gate-checks-affected-projects-only.md),
> [ADR-0385](./0385-a-develop-push-is-judged-by-the-develop-tip-before-it.md) · Scope: `.github/workflows/verify.yml`,
> `.github/actions/setup-workspace/`, `scripts/test-shards.js`, `scripts/test-seconds.json`

## Context

The gate was one job that ran doc checks, script tests, ratchets, lint, typecheck and test in a row: 11 to 17
minutes on recent pull requests, test alone about 8.5 of them. Every step waited for the one before it.

## Decision

**The gate is split into jobs that run side by side after `base`: `checks` (doc checks, script tests, every
ratchet), `lint`, `typecheck` and `test` in four shards, plus a `verify` job under the gate's old name that is
green only when all of them are.**

- `base` also computes the Nx scope once (`scripts/gate.js scope`), so every job checks the same projects.
- `scripts/test-shards.js` deals the test projects in the scope out longest first, by the seconds each took in a
  run of every project (`scripts/test-seconds.json`, refreshed with `--record <log>`); a project without a time
  counts as the median.
- Test output is streamed; Nx's replay of a large task's output was cut off in CI logs and hid failures.
- Each job restores the yarn cache through `.github/actions/setup-workspace`; only `checks` on a push or manual
  run saves it.

## Alternatives

- **Jest and Vitest `--shard` inside every project**: balances files, not projects, but every target would have
  to accept the flag, and each shard would still build every project's dependencies.
- **One job, Nx parallelism raised**: the runner has two cores; the steps already competed for them.

## Consequences

- A pull request waits for the slowest job instead of the sum; it uses more runner minutes, since each job
  checks out and restores the cache, and each test shard builds the libraries its projects depend on.
- A pull request that changes `yarn.lock` installs in every job, because pull requests do not save the cache.
- A failure in `base` (including the scope script) now skips the e2e jobs too.
