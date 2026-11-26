# ADR-0368: New code comments are banned, and existing ones only shrink

> Status: Accepted · Decided: 2026-11-23 · Implemented: `feat/lint-ratchets`
> · Scope: every tracked TS/JS file; `tools/eslint-rules/ratchet.js`, `tools/eslint-rules/ratchet-count.js`,
> `scripts/ratchet/source-ratchet-baseline.json`, `scripts/ratchet/modes.json`, `scripts/ratchet.js` and `scripts/ratchet/`, `knip` and `jscpd`,
> `.github/workflows/verify.yml`
> · The behaviour is documented in [tools/eslint-rules/README.md](../../tools/eslint-rules/README.md) (ratchet)
> · Amended by: [ADR-0379](./0379-a-maintainer-can-hand-develop-a-newer-ratchet-judge.md) — decision 5: a manual
> `develop` run can take its judge from a newer `develop` commit

## Context

Comments are 23% of the non-test source: 74,609 of 327,861 lines on 2026-11-23, 44% in one lib. Much of it
restates what the next line does, narrates history a commit already records, or holds reasoning that
belongs in the module's README, where the next reader of the module looks first. Agents write most of the
new code here, and an agent copies what it reads: a file that explains every line teaches the next change
to do the same. The prose rules asking for fewer, better comments did not move the number.

The same holds for the escape hatches the type checker and the linter offer — `as any`, `@ts-ignore`,
`@ts-expect-error`, an `eslint-disable` with no reason — and for `useEffect`, whose non-test count went
from 362 to 727 between July and November 2026. Unused exports and copied blocks accumulate the same way.

Deleting 74,000 comment lines in one change cannot be reviewed and would conflict with every open
branch. Banning them outright from today would fail the build on every existing file.

## Decision

### 1. A new comment line is a lint error; an existing one may stay until it is removed

Every tracked TS/JS file has a baseline: its counts of comment lines, `as any` assertions, `@ts-ignore`
and `@ts-expect-error` directives, `eslint-disable` directives without a `-- reason`, and `useEffect`
calls, as measured on 2026-11-23 (`@ts-nocheck` counts with `@ts-ignore`). A file whose count goes above its baseline fails. A new file has no
entry, so its baseline is zero.

The check exists twice over one counting module: as the ESLint rule `@nx/workspace-ratchet`, so the
error shows while editing, and as `scripts/ratchet.js check`, which CI runs over the whole tree because a
file outside every Nx project has no lint target.

### 2. Four kinds of comment are not prose and are not counted

- Public API JSDoc (`/** */`) in the two packages published to npm, `libs/chatic-apps-sdk` and
  `libs/chatic-apps-devtools` — it is the reference their users read in their editor.
- An `eslint-disable` or `eslint-enable` directive with a `-- reason`.
- A license header: the file's first comment, before any code, naming a license or copyright.
- A directive a tool reads, for example `/// <reference>`, `prettier-ignore`, `@vite-ignore`, `webpack*:`,
  coverage `ignore` hints, `@__PURE__`, JSX pragmas, and a `ratchet-allow` that carries a reason. The full
  list is in the rule's README.

A reason that matters moves to a name, a test, the module's README, or the commit message.

### 3. A baseline only goes down

A count below its baseline also fails, until `yarn ratchet:update` lowers the baseline to it; otherwise
the room left by a removed comment could be filled again unnoticed. `scripts/ratchet.js verify-baseline`
compares the baseline files with the compare base and fails when any count rose or an entry appeared,
except an entry that follows a file `git diff -M` reports as renamed, at the same count or lower. A
justified new `as any` or `useEffect` is written with `// ratchet-allow <field> -- <reason>` on the line
above, so the reason sits in the diff where a reviewer reads it.

### 4. Unused code and copy-paste are held the same way

`knip` lists unused files, exports and types; its baseline is the set of those issues, and any issue
not in it fails. `jscpd` measures each file's duplicated lines; a file above its count fails. Both
versions are pinned, because a new release reports differently.

### 5. The base branch judges a change, and new checks start by observing

CI runs the ratchet scripts, the counting module and the modes file from the compare base, not from the
change, and holds each count to the lower of the change's baseline and the base's. A change that loosens a
check or raises a baseline is judged by the version it would replace; it can still merge, after a human
review, and then judges the changes after it.

Each check has a mode — `off`, `observe` or `enforce` — in `scripts/ratchet/modes.json`. `observe` reports
what would fail as a warning annotation and in the job summary and keeps the job green, so false positives
can be counted before the check blocks anyone. The source counts start in `enforce`, because their
baseline is generated from the same tree by the same code that checks it, and the ESLint rule and the
script agree on every tracked file. knip and jscpd start in `observe`.

For knip and jscpd a count below the baseline is reported, never a failure: both count across files, so
two changes that are each green could otherwise turn `develop` red together.

## Consequences

- No new prose comment lands in TS/JS. Removing existing comments is ordinary work that lowers the
  baseline, project by project.
- Every change that removes a comment, an `as any`, an unused export or a copied block also commits the
  lowered baseline. One command does it; the check names it.
- The baseline files are large (one line per file) and change often. They are kept out of prettier and
  written in a fixed order, so their diff is one line per file that changed.
- CI spends about a minute more per run, most of it jscpd and knip over the whole tree, plus a second
  checkout of the base for the judge.
- A change to the checks cannot prove itself in its own CI run: its new rules first run on the change
  after it.
- The ratchet counts lines of comment text, not their value. A useful comment and a useless one cost
  the same, which is the point: neither is written into code any more.

## Alternatives

- **Remove every comment in one change.** Unreviewable at 74,000 lines, and it conflicts with every open
  branch. The ratchet lets the removal happen one project at a time.
- **Keep the prose rule and review comments by hand.** That is the state that produced 23%.
- **A repository-wide total instead of per file.** A total lets one file grow while another shrinks, and
  the error cannot point at the file that grew.
- **Lint only, without the script.** Lint runs per Nx project and only for affected ones; the baseline
  file's own integrity and the files outside any project need a whole-tree check.
