# ADR-0365: Pull requests that need no reviewer merge themselves

> Status: Accepted · Decided: 2026-11-23 · Implemented: `feat/auto-merge-eligibility`
> · Scope: `scripts/auto-merge/`, `.github/workflows/auto-merge.yml`, `.github/workflows/revert-ratchet.yml`
> · The rules are documented in [scripts/auto-merge](../../scripts/auto-merge/README.md)

## Context

Every pull request into `develop` waits for a person to merge it, including the ones where a reviewer
adds nothing: a comment removed, a test added, a module README corrected, a three-line fix with its
test. Agents now open most pull requests, and the planned move from prose instructions to
deterministic checks will produce many more of exactly those: cleanup pull requests that only delete
comments, or only lower a ratchet count.

Two things about the repository shaped the answer. Auto-merge is off (`allow_auto_merge: false`), and
`develop` has no branch protection and no required checks, so today "CI green" is a convention, not
something GitHub enforces. And the release bump that `deploy-dev.yml` pushes to `develop` is itself a
direct push that a branch rule could block.

## Decision

A classifier decides, deterministically from the diff and the commits, whether a pull request may
merge without another reviewer. It is eligible in two cases, and only after passing every gate.

1. **Behaviour provably unchanged** — every file has a proof: a TypeScript/JavaScript file whose
   syntax tree, set beside the old one with comments and layout ignored, is identical, and whose
   comments were only removed (no directive among them); a ratchet baseline whose counts only went
   down; a test file that only gained cases; a markdown file under `apps/` or `libs/`.
2. **A small fix** — every commit is a `fix`, at most 50 changed lines outside tests, one Nx project,
   at least one test changed and none weakened.

Gates that always mean a reviewer: the `no-auto-merge` label, a draft or fork, a base other than
`develop`, a failing or unfinished visual regression status, an empty diff, and any file among
ADRs, agent instructions and skills, `.github/`, lint config, dependencies and lockfiles, native
code, release and deploy files, the repository's own scripts, environment files, build config,
screenshot and snapshot baselines, binaries, and the classifier itself.

It starts in observe mode: an eligible pull request gets the label and a "would auto-merge" comment,
and a reviewer still merges it. After an observe period with no eligible pull request changed in
review or reverted, the repository variable `AUTO_MERGE_MODE=enforce` makes the workflow turn on
GitHub's auto-merge with `--match-head-commit`, so the merge waits for the required checks on the
exact commit the classifier read. Every comment lists the rules that excluded the pull request and
what would make it eligible. A merged revert opens a `ratchet` issue that proposes a rule or test and
asks for an adversarial check (counterexamples where it fires on a correct change) before a person
approves it.

The classifier that decides is always `develop`'s copy, never the pull request's: the workflow runs
on `pull_request_target`, checks out `develop`, and reads the pull request only as git objects. A pull
request that changes the classifier or either workflow is never eligible, so a change cannot vote on
its own merge.

The workflow does not change repository settings. Auto-merge, a `develop` ruleset requiring the
verify and e2e checks (with the release bot on its bypass list) and an `AUTO_MERGE_TOKEN` secret are
switched on by an admin once the team agrees, because the ruleset applies to every pull request.
Until then the workflow only labels and comments. This record accepts the classifier and the
workflow; turning auto-merge on is that separate admin step.

## Alternatives

- **Text diff instead of a syntax-tree proof for comment removals** — rejected. A diff that only
  deletes lines starting with `//` misses comments mid-line and inside JSX, and cannot see that
  removing `{/* … */}` between two JSX text runs joins them into one rendered string. The parser can.
- **Allow comment additions and rewording too** — rejected. The tree proof shows behaviour is
  unchanged, but the words themselves are what a reviewer would read, and the comment ratchet stops
  new comments anyway.
- **Enforce from the first day** — rejected. A rule set tuned on a backtest has not met new pull
  requests yet; observing first costs two weeks of reviews the rules would have skipped, and shows
  any misfire before it merges.
- **Let an eligible verdict merge directly, without required checks** — rejected. With no rule on
  `develop`, `gh pr merge --auto` merges at once; the workflow refuses to turn auto-merge on until the
  ruleset requires the checks.
- **Enable auto-merge with the default `GITHUB_TOKEN`** — rejected. A merge made by that token starts
  no `push` workflow, so `deploy-dev.yml` and its version bump would silently not run.
- **`pull_request` instead of `pull_request_target`** — rejected. Its token cannot label, comment or
  merge. The cost of `pull_request_target` is that it holds a write token; the job never checks out
  or runs the pull request's code, only reads its files as git objects with the classifier from
  `develop`.

## Consequences

- Replayed over the 347 pull requests merged 2026-10-24..2026-11-22, 25 would have been eligible
  (21 small fixes, 2 module-doc changes, 2 test-only changes). None was later reverted, and no later
  `fix` commit rewrote a line one of them introduced within 30 days. The two reverts in that window
  undid pull requests that carried an ADR, so neither would have auto-merged.
- The gate that removes the most candidates is the ADR exclusion (173 of the 347). That is intended:
  a decision record is what a reviewer is for.
- Every rule is a line in `scripts/auto-merge/`, and that directory is excluded from auto-merge, so
  loosening a rule always goes through review.
- The revert rate of auto-merged pull requests is read from the `ratchet` issues; a revert of one
  means a rule here tightens.
- No step reports the `web-e2e/visual-regression` status yet, so that gate blocks nothing until the
  e2e suite reports it. A visual difference only blocks auto-merge if it reaches that status or
  fails the e2e job. If the e2e suite reports a difference without failing, a merge can land before
  the workflow re-reads the status after the verify run.
