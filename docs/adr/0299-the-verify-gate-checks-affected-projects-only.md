# ADR-0299: The verify gate checks affected projects only

> Status: Accepted · Decided: 2026-11-10 · Implemented: `ci/verify-affected`
> · Scope: `.github/workflows/verify.yml` (`verify` job), root `README.md` § CI/CD

## Context

`verify.yml` runs on every pull request and again on the push to `develop` that its merge makes. Its
`verify` job ran `nx run-many` for lint, typecheck and test, so both runs checked every project no
matter what the change touched. A run took 8 to 13 minutes, and test alone took about 7 of them. A PR
that changed one e2e spec in `desktop-web-e2e` paid for the whole workspace twice: 11.5 minutes on
the PR, and the full suite again after the merge.

The job's `e2e` sibling already skipped itself when `web-e2e` was not affected, so the pattern was in
the file. The `verify` job had never used it.

## Decision

**Lint, typecheck and test run under `nx affected`, with a fallback to every project when the diff
leaves `apps/` and `libs/`.**

- A pull request is compared with `origin/<base>`. A push is compared with the commit that the last
  successful push run on `develop` checked, looked up through the Actions API. It is not compared
  with the commit just before the push (`github.event.before`). The concurrency group cancels a
  develop run when the next merge lands, and a red run stays red. With `event.before`, either one
  would drop its commits out of every later comparison. A later merge that touched some other
  project would then turn `develop` green while the broken project was still broken. Comparing
  against the last green commit keeps every unproven commit in scope until a run proves it.
- Any changed file outside `apps/` and `libs/` that is not markdown sends the job back to
  `run-many`. Nx maps project files and a few root files it knows (`nx.json`, `package.json`, the
  lockfile, `tsconfig.base.json`) to projects. A shared root config such as `eslint.config.mjs`, a
  script a target calls, or the workflow itself maps to nothing, and `affected` would select no
  project for it.
- A push runs every project instead of guessing when its base is missing or is not an ancestor of
  `HEAD`. That happens when no run has succeeded yet, when the lookup fails, or after a force-push
  that rewrote `develop`. The file list uses `--no-renames`, the same way Nx lists changed files, so a
  root config moved under `apps/` still shows its old path.
- The doc and comment checks keep running over the whole repo. They take seconds.

Measured against the eight merges before this one: a test-only PR runs no tests; app and lib PRs run
one to eight projects; three of the eight touched a root file and would still run everything.

## Alternatives

**Carry Nx's local cache between runs with `actions/cache`.** This looked better, because a cache hit
is decided by Nx's own input hash, root configs included, rather than by a path rule. It does not
work on Nx 22. Nx records each cache entry in a SQLite database under `.nx/workspace-data`, named per
machine, and ignores artifacts in `.nx/cache` that the database does not list. Restoring
`.nx/cache` alone gave a miss on every task. The switch that used to allow it,
`NX_REJECT_UNKNOWN_LOCAL_CACHE=0`, is no longer supported with the database cache. Sharing a cache
across runners now means a remote cache, either Nx Cloud or a self-hosted one. Each is a service to
run and secure, and neither fit a change meant to remove work.

**Drop the push trigger and trust the PR run.** That halves the runs, but two PRs that each pass
against an older `develop` can still break once they are both merged, and then nothing checks the
result. The push run is what catches that. With `affected`, it costs only what the merge touched.

## Consequences

- A project the diff does not reach is not checked on that run. The gate no longer re-proves that
  the untouched rest of the workspace is green. That is fine as long as every change into `develop`
  goes through this gate, because the previous state was already checked.
- The fallback rule is a path rule. A root file that matters to a target but sits under `apps/` or
  `libs/` outside any project would slip past it. Today every path under those two folders belongs
  to a project.
- A change to the workflow itself runs everything, so the PR that changes this gate is checked in
  full.
- A remote cache is still open as a later step. If it is added, the push run after a merge could
  reuse the PR's results instead of re-running them.
