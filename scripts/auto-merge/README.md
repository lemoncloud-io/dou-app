# auto-merge

Decides whether a pull request into `develop` may merge without another reviewer, and the two
workflows that act on it: `.github/workflows/auto-merge.yml` and `.github/workflows/revert-ratchet.yml`.
The policy, why it is shaped this way and what it costs is ADR-0365.

The verdict is deterministic: the same diff and commits always give the same answer, and the bot
comment names the rule behind it. A human reviewer is the default; this only removes the review for
changes where one adds nothing.

## Rules

A pull request is eligible when it passes every gate and then **either** every file has a proof
(class A) **or** the whole change is a small fix (class B).

**Gates** — any one of these means a reviewer:

- the `no-auto-merge` label (the kill switch — add it to any pull request at any time);
- a draft, a pull request from a fork, or a base branch other than `develop`;
- the visual regression status `web-e2e/visual-regression` reports `failure`, or is still `pending`
  (the verdict is taken again when verify finishes). No step reports it yet; until the e2e suite
  does, the gate reads `missing` and blocks nothing;
- a changed file on the excluded list (`rules.js` `EXCLUDED`): ADRs, `AGENTS.md`/`CLAUDE.md`, agent
  skills and `.claude/`, all of `.github/`, lint and format config and `tools/eslint-rules/`, git
  hooks, any `package.json` and lockfiles, native code under `apps/mobile/ios|android`, release and
  deploy scripts, `docs/infra/` and changelogs, this classifier, every other file under `scripts/`
  except `scripts/__tests__/` (CI runs those scripts from the pull request's head, so a change could
  switch off a check for its own pull request), `.env*` files, build config
  (`project.json`, `tsconfig*.json`, `nx.json`, bundler and test-runner configs), screenshot and
  snapshot baselines;
- a binary file, a file whose type changed (a file replaced by a link), a path with a control
  character, or an empty diff.

**Class A — behaviour provably unchanged.** Classes mix freely: a cleanup that removes comments and
moves their reasoning into the module README is A1 + A4.

| Class | Files                                                                         | Proof                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1    | modified `.ts .tsx .js .jsx .mjs .cjs` (`.mts .cts` too)                      | Both versions parse, and their syntax trees match once comments and layout are set aside. Every comment left was already there (a pure removal: adding or rewording a comment needs a reader). No removed comment is a tool directive (`@ts-*`, `eslint-*`, `prettier-ignore`, `#__PURE__`, `@vite-ignore`, `@jsx*`, `/// <reference>`, coverage ignores, `@license`, test-environment docblocks). The shebang is unchanged. |
| A2    | ratchet baselines (`AUTO_MERGE_BASELINE_PATTERNS`, see below)                 | Valid JSON before and after; no entry added; every number is less than or equal to before; everything that is not a number is unchanged.                                                                                                                                                                                                                                                                                     |
| A3    | test files: `*.test.*`, `*.spec.*`, `__tests__/`, `__mocks__/`, `apps/*-e2e/` | No test file deleted; per file, the count of `it`/`test` cases does not drop and no `.only`/`.skip`/`.fixme`/`.todo`/`xit`/`fit` marker is added.                                                                                                                                                                                                                                                                            |
| A4    | markdown under `apps/` and `libs/`                                            | Path only. ADRs, agent instructions and changelogs are excluded above.                                                                                                                                                                                                                                                                                                                                                       |

How A1 compares trees: TypeScript's parser builds both trees, and a walk prints each node's kind,
the primitive fields the parser sets on it (names, literal text, operators, `let`/`const`, type-only
imports) and its children, skipping positions and comments. Two JSX details follow React's own
rules, because they decide what renders: an empty `{/* … */}` container renders nothing and is
dropped, and JSX text is compared after the same whitespace trimming React applies. Removing a JSX
comment that sat between two text runs joins them into one string and is correctly reported as a
change.

One thing A1 cannot see: a tool that reads comments as input. Tailwind scans source text, so a
comment that lists class names (`// bg-red-500 bg-blue-500` beside a built class name) keeps those
classes in the CSS, and removing it drops them. The tree is unchanged, so A1 passes. Keep such lists
in code, or add `no-auto-merge` to the cleanup that removes one.

**Class B — a small fix.** All of:

- every commit's subject is `fix: …` or `fix(scope): …`, without `!` (merge commits are skipped);
- at most 50 changed lines (added + deleted) outside test files — module doc lines count;
- every non-test file sits in one Nx project (`apps/<name>` or `libs/<name>`); root files count as a
  project of their own;
- at least one test file changed, and no test file loses cases or gains a focus/skip marker.

CI is what proves the fix works: auto-merge only merges once the required verify and e2e checks pass
on the exact head the classifier saw (`--match-head-commit`).

## What the workflow does

On open, every push, reopen, ready-for-review, conversion to draft, base change and `no-auto-merge`
label change, and again when a `verify` run finishes:

1. Before anything else can fail: the `no-auto-merge` label switches auto-merge off, and new
   commits, a move to draft or a base change pause the auto-merge this workflow turned on. Auto-merge
   a person turned on, on a pull request this workflow never found eligible, is left alone.
2. The classifier from `develop` reads the pull request's commits — fetched as git objects, never
   checked out or run — and decides.
3. Eligible: the `auto-merge:eligible` label goes on. In **observe mode** (the default) that is all:
   the comment says the pull request would auto-merge, and a reviewer still merges it. With the
   repository variable `AUTO_MERGE_MODE=enforce`, auto-merge is turned on with `AUTO_MERGE_TOKEN`. It is **not** turned on when `develop` lacks a ruleset requiring the verify and
   e2e checks (auto-merge would then merge without waiting), or when the token is missing (a merge
   made with the default token starts no `push` workflow, so `deploy-dev.yml` would not run). The
   comment says which.
4. Not eligible: the label comes off, and auto-merge is switched off if this workflow had turned it on.
   A failed step also switches it off.
5. If the pull request's head moved during the run, the run stops here; the new push's run speaks.
6. One comment, found by its `<!-- auto-merge-eligibility -->` marker, is created or updated with the
   verdict, every rule that excluded the pull request, and what would make it eligible (`hints.js`),
   so a reviewer never has to work the verdict out from the diff.

`revert-ratchet.yml`: when a pull request whose title starts with `Revert` merges, it finds the
reverted pull request (`Reverts #N` in the body, `This reverts commit <sha>` in a commit, or the quoted
title) and opens an issue labelled `ratchet`. The issue proposes a candidate rule or test from what
the reverted pull request touched, and asks for an adversarial check first: try to make the candidate
fire on correct changes (recent merged pull requests, the code as it is), narrow it until no
counterexample is left, and only then have a person approve it.
The issue says whether the reverted pull request carried `auto-merge:eligible`; those issues are the
auto-merge revert rate.

## Repository setup it depends on

Nothing here changes repository settings. An admin turns these on, and the team agrees first,
because the ruleset applies to every pull request:

1. Allow auto-merge: `gh api -X PATCH repos/lemoncloud-io/dou-app -F allow_auto_merge=true`.
2. A ruleset on `refs/heads/develop` requiring the status checks
   `doc links · doc language · code comment language · lint · typecheck · test`,
   `web e2e · webkit-ios` and `web e2e · chromium-android` (the job names in `verify.yml`; the e2e
   jobs succeed when e2e is not affected, so requiring them blocks nothing). The bot that pushes the
   release version bump to `develop` (the owner of `LEMON_BOT_TOKEN`) goes on the bypass list, or
   `deploy-dev.yml`'s bump push is rejected.
3. A secret `AUTO_MERGE_TOKEN`: a bot token with contents and pull-requests write.

4. After the observe period, the repository variable `AUTO_MERGE_MODE=enforce`.

Without these the workflow still labels and comments; it only leaves auto-merge off.

**Observe period.** Run in observe mode for two weeks after merging. Each "would auto-merge" comment
is a prediction a reviewer checks against the real review: did the review change anything, and was
the pull request reverted or followed by a fix? Switch to enforce when no eligible pull request
needed a change in review and none was reverted; any one that did tightens a rule first. Re-run
`backtest.js` over the period to compare against the 25-of-347 baseline.

## Running it

```bash
node scripts/auto-merge/cli.js classify --base origin/develop --head HEAD --out /tmp/result.json
node scripts/auto-merge/cli.js comment --result /tmp/result.json --action not-eligible
node --test 'scripts/auto-merge/__tests__/*.test.js'
```

`backtest.js` replays the classifier over merged pull requests (`gh pr list --state merged --json
number,title,mergedAt,mergeCommit,labels,isCrossRepository > prs.json`, then
`node scripts/auto-merge/backtest.js prs.json <cache dir> out.json`). For each eligible one it also
reports later reverts and later `fix` commits whose removed lines `git blame` attributes to that pull
request — the misfire rate to watch once auto-merge is on.

Ratchet baselines are matched by `AUTO_MERGE_BASELINE_PATTERNS` (comma-separated regular
expressions); the defaults in `rules.js` match `*ratchet*baseline*.json`, `.ratchet/**/*.json` and
`tools/ratchet/**/*.json`. A baseline may sit under `scripts/` or `tools/eslint-rules/` despite
those directories' exclusion, because lowering a count can only tighten a rule. The ratchet's own
scripts and its `scripts/ratchet/modes.json` (which switches each check between off, observe and
enforce) stay excluded. A key that disappears counts as lowered to zero. A renamed file moves its
entry to a new key, which reads as an added entry and goes to a reviewer.
