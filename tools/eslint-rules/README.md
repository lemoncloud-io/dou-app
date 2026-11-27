# tools/eslint-rules

**The workspace's own ESLint rules.** `@nx/eslint-plugin` loads this folder by convention — it
requires `index.js` and `tsconfig.json` to be here — and offers each rule it exports as
`@nx/workspace-<name>`. The root `eslint.config.mjs` turns them on; no plugin has to be registered.

Nx also lists this folder among every project's lint inputs, so a change to a rule re-lints every
project instead of being served from cache. That is the reason a rule more than one project uses
belongs here rather than inline in a config file.

| Rule                  | Turned on as                        | What it does                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runtime-wiring-call` | `@nx/workspace-runtime-wiring-call` | Reports a runtime wiring call outside the assembly point. Catalogue and allowed file are in the root config.                                                                                                                                                                                                                                                                                                          |
| `host-facts`          | `@nx/workspace-host-facts`          | Reports `isNative()`, `isNativeApp()` and a `CHATIC_APP_*` read off `window` outside the allowed files. The allow-list is `host-facts-allowlist.js`, here so a change to it re-lints every project.                                                                                                                                                                                                                   |
| `host-port-kind`      | `@nx/workspace-host-port-kind`      | Reports a read of `kind` — and of `os` on `appShell` and `signIn` — off the host ports named in its `ports` option (`runtime.links.kind`, or through a local bound to the port), so a feature calls the port's members instead of branching on its side. The root config names every port but checkout. Off for `apps/*/src/config/**` and tests.                                                                     |
| `ratchet`             | `@nx/workspace-ratchet`             | Fails a file with more comment lines, escape hatches or `useEffect` calls than its entry in `scripts/ratchet/source-ratchet-baseline.json`. See [§ ratchet](#ratchet).                                                                                                                                                                                                                                                |
| `project-tags`        | `@nx/workspace-project-tags`        | Fails lint for a project with no tag on an axis named in its `axes` option — the root config names all three axes, for files under `apps/` and `libs/` — so `@nx/enforce-module-boundaries` never meets a project it cannot place. Tags are read from `tags` in the project.json and `nx.tags` in the package.json of the nearest folder holding either, and each project is reported once, on the first file linted. |

## Ratchet

New code carries no comments, and the comments, escape hatches and `useEffect` calls already in a file
only ever go down. Each tracked TS/JS file has an entry in `scripts/ratchet/source-ratchet-baseline.json` with the counts it had
when the rule arrived (2026-11-23); a file with no entry — every new file — is held at zero. Why: ADR-0368.

| Field                   | What is counted                                              |
| ----------------------- | ------------------------------------------------------------ |
| `comments`              | lines a comment covers (two comments on one line count once) |
| `asAny`                 | `x as any` and `<any>x`                                      |
| `tsIgnore`              | `@ts-ignore` and `@ts-nocheck` directives                    |
| `tsExpectError`         | `@ts-expect-error` directives                                |
| `eslintDisableNoReason` | `eslint-disable…` directives without a `-- reason`           |
| `useEffect`             | calls to `useEffect` or `<anything>.useEffect`               |

Not counted as comments, because they are not prose:

- `/** */` blocks in the non-test sources of `libs/chatic-apps-sdk` and `libs/chatic-apps-devtools` — the
  public API reference of the two packages published to npm;
- `eslint-disable` / `eslint-enable` with a `-- reason`;
- a license header: the file's first comment, before any code, naming a license or copyright;
- tool directives: `/// <reference>`, `prettier-ignore`, `@vite-ignore`, `webpack*:`, `istanbul`/`c8`/`v8`
  ignore hints, `@__PURE__`, JSX pragmas, `@refresh`, `@ts-check`, `eslint-env`/`globals`/`exported`, and a
  `ratchet-allow` with a reason.

What a comment would have said goes into a name, a test name, the module's README, or the commit message.

A new `as any` or `useEffect` that is really needed is written with `// ratchet-allow <field> -- <reason>`
on the line above (or the same line), so it is not counted and the reason is in the diff for review. A
`ratchet-allow` without a reason allows nothing and counts as a comment line.

`scripts/ratchet.js` counts with the same module (`ratchet-count.js`, same parser) over the whole tree,
because files outside every Nx project have no lint target:

```bash
yarn ratchet:check                                   # source counts, knip, jscpd — what CI runs
yarn ratchet:update                                  # lower every baseline to today's counts; never raises
node scripts/ratchet.js verify-baseline --base origin/develop   # fails if a baseline went up
```

A count **below** its baseline fails `check` too, until `yarn ratchet:update` lowers it; otherwise the
room a removed comment left could be filled again unnoticed. Commit the lowered baseline with the change.
`update` carries an entry along when `git diff -M` against the merge base with `origin/develop` reports its
file as renamed, so a `git mv` needs one `yarn ratchet:update` and nothing else (a rename git does not
detect — more than half the file rewritten — starts from zero). A baseline is never raised by hand:
`verify-baseline` rejects any count that rose and any new entry, except an entry that follows a renamed
file at the same count or lower.

The same mechanism holds three more baselines, kept beside the script:

- `scripts/ratchet/knip-ratchet-baseline.json` — unused files, exports, types and duplicate exports
  reported by `knip`, one key per issue. Any issue not listed is above the baseline.
- `scripts/ratchet/jscpd-ratchet-baseline.json` — each file's duplicated lines as `jscpd` measures them.

- `scripts/ratchet/test-typecheck-ratchet-baseline.json` — the projects that have test files (`*.spec.ts(x)`,
  `*.test.ts(x)`) no `tsc -b` of the project's `tsconfig.json` reaches: not included by any referenced
  config, included only by one that shares an earlier config's build info (tsc skips it as up to date), or
  in a project `verify.yml` excludes from typecheck. It is a flag per project (`1`), not a file count, so
  writing a new test in a project that is not covered yet is not penalised; a project that is covered can
  never lose that. `apps/web` was the case that shared build info until this check arrived.

knip and jscpd count across files: removing a copy in one file lowers the other file's count, and while a file is
unused knip does not report its exports, which all appear once something imports it. So for these two a
count below the baseline is only reported, never a failure — two changes that are each green could
otherwise turn `develop` red together.

Both tools are pinned to an exact version in the root `package.json`; a new release reports differently,
so bumping one means regenerating its baseline in the same change (`node scripts/ratchet.js init --only
knip --force`) and saying so in the PR.

### Modes

`scripts/ratchet/modes.json` sets each check to `off`, `observe` or `enforce`. `observe` runs the check and
reports what would fail — in the log, as a GitHub warning annotation and in the job summary — while the
step stays green, so false positives can be counted before the check is trusted. A new check starts in
`observe` and moves to `enforce` after a clean period.

The source counts (comments, escape hatches, `useEffect`) start in `enforce`: the baseline is generated
from the tree it judges by the same code that judges it, and the ESLint rule and the script were checked to
agree on every tracked file, so they have no false positive by construction. The test typecheck count
starts in `enforce` for the same reason. knip and jscpd start in `observe`: they run each project's config
files, and whether CI's Linux runner, without the local env files, sees exactly what a laptop sees is
something to watch, not assume.

### Who judges a change

CI never lets a change judge itself. The ratchet steps in `.github/workflows/verify.yml` check out the
compare base into a separate worktree and run **its** `scripts/ratchet.js`, counting module and
`modes.json` against this tree (`RATCHET_ROOT`), and `check --reference <base>` holds every count to the
lower of this tree's baseline and the base's (followed through renames). A change that edits the rule, the
script, the modes or a baseline upward is judged by the version it is trying to replace; once it merges,
it judges the changes after it. `yarn gate` runs this tree's judge, so a change that loosens
`modes.json` passes locally and still fails CI. Such a change gets a human review — it changes the rules — and is never
merged automatically. The ESLint rule reads this tree's files, so it gives the early warning while editing;
the CI step is the one that decides.

A push to `develop` is judged by the `develop` tip before the push (`github.event.before`), never by a
commit of the push itself, and "baselines only go down" is checked one first-parent step at a time, from
the last green `develop` run to `HEAD`: each step against its parent (`verify-baseline --base <step>^1 --head
<step>`), judged by the parent's ratchet scripts when the parent is in the judge's history. Lint, typecheck
and test still compare with the last green run. Before this the judge was the last green run's commit, and
while `develop` stayed red its old scripts and its long rename range failed every merge that its pull
request had passed (ADR-0385). One case is left: a merge let in red whose own push run was cancelled has
its counts judged by its own ratchet in the next push; only its baseline step is still judged by its parent.

A maintainer can still run `verify` by hand on `develop` with a `judge` commit (ADR-0379):

```sh
gh workflow run verify.yml --ref develop -f judge=<develop commit>
```

The run takes the ratchet scripts, modes and baselines from that commit, walks the baseline steps from
`judge` on — stepping past a raise that would otherwise keep every later run red — and still runs lint,
typecheck and test against the last green run. `judge` must be a commit on `develop`'s first-parent line — a merge
or a direct push, never a commit inside a merged branch — no older than the compare base, and carry the
ratchet; the run fails otherwise. A manual run has a concurrency group of its own, so a merge during it does
not cancel it, and a green manual run counts as a base like a green push run. Pull requests are untouched:
they are judged by the `develop` tip, so a change that loosens a check is still judged by the old judge.

Baselines are compared step by step because `git diff -M` pairs each deleted file with one added file:
over a long range, a file split into two in one pull request and moved in another can be paired with the
wrong half, and its baseline entry then reads as raised although each pull request kept it.

All baseline files are JSON objects whose leaves are non-negative integers, one file per line, keys sorted,
zero entries dropped. They are in `.prettierignore` so that shape survives formatting.

## Adding a rule

Write it as plain CommonJS next to the others, export it from `index.js`, and give it a
`<name>.spec.js` that runs it through ESLint's `RuleTester`. `npx nx test eslint-rules` runs the specs;
CI runs them with every other project's tests.
