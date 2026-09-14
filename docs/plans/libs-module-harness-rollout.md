# libs rollout — test harness and doc canon

> Status: WP-0 done, rest ready · Written: 2026-09-14 · Branch: `claude/libs-modules-prep-c5e594`
>
> Rules: [module-docs-template.md](../guides/module-docs-template.md) ·
> Worked example: [`libs/data`](../../libs/data/README.md)
>
> ADR-0081 set the doc rules on `libs/data` and cut its own scope there — "the 11 doc trees outside
> `libs/data` are a later step". This is that step, plus the test harness that landed alongside it.

## Goal

Bring the other 15 libs to what `libs/data` has. Two lanes, independent of each other.

1. **Test harness** — test files are type checked by CI.
2. **Doc canon** — English, in the template's shape.

Work packages run **in parallel**. Each one owns exactly one module and touches no file outside it.

## Lane 1 — what the harness is

Inside a lib, `tsc --noEmit` checks zero files and succeeds. The real check is `tsc -b`, and what it
looks at is decided by `tsconfig.json`'s `references`. `libs/data` put the spec project there.

```jsonc
// libs/<lib>/tsconfig.json
"references": [{ "path": "./tsconfig.lib.json" }, { "path": "./tsconfig.spec.json" }]
```

Nx's `typecheck` target runs `tsc --build --emitDeclarationOnly` in the lib directory. No argument,
so it builds `./tsconfig.json` — and that reference pulls the specs in. CI's
`nx run-many -t typecheck` then covers them.

`tsconfig.spec.json` has to hold three things.

| Item                    | Rule                                                  | Why                                                                                                                   |
| ----------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| No `module: "commonjs"` | The base's `moduleResolution: bundler` rejects it     | TS5095. With it the config cannot compile at all — which is how test files went years without ever being type checked |
| `references`            | The same sibling list `tsconfig.lib.json` carries     | A composite project reaches its dependencies only through references. Without them, TS6307                            |
| `include`               | `src/**/*.ts`, `src/**/*.d.ts`, `src/**/__mocks__/**` | `__mocks__` is excluded on the lib side, so it must be named here or nx's cache key misses it                         |

There is a second effect worth knowing. An unharnessed module's nx `typecheck` inputs contain
`!{projectRoot}/src/**/*.spec.ts` — edit a spec and the cache does **not** invalidate. Referencing
the spec project removes that exclusion and the cache key becomes correct on its own. Nothing to do
by hand.

`jest.config.js` already points at `tsconfig.spec.json` in all ten libs that have one. Leave it.

## Lane 2 — what the doc canon is

The shape, the tone and the deletion categories are in
[module-docs-template.md](../guides/module-docs-template.md). Two points that decide scope here:

- **English.** Module docs under `libs/*` and `apps/*`.
- **The whole root `docs/` tree is being retired**, not just `docs/adr/`. Do not add links into it.
  Where a module's behaviour only makes sense with a decision's reasoning, write the reasoning into
  the module doc. This is not optional cleanup — it is the reason the doc lane exists at all.

## Where root `docs/` goes

The repo keeps two doc trees today: one per module, and a 137-file, 28,500-line tree at the root.
The root tree is going away. Everything in it is either a fact that belongs to a module, or a record
of work that is finished.

This is the destination, not the schedule — the migration is its own track and it runs **after** the
module docs exist, because it migrates _into_ them.

| Path                                                    | Files |  Lines | What it is                                         | Where it goes                                                                                                                                |
| ------------------------------------------------------- | ----: | -----: | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `adr/`                                                  |    96 | 15,620 | Decision records                                   | Absorb the reasoning into the module whose behaviour depends on it. Delete the rest                                                          |
| `specs/`                                                |    20 |  6,278 | Feature specs; `.SPEC.md`/`.TASK.md` are forecasts | `cache/*` → `libs/data`, `libs/db` · `mobile/push*` → `libs/app-runtime` · `search/*` → `apps/web` · `block-kit-messages` → `libs/block-kit` |
| `frontend-handover.md` ＋ `frontend-handover/`          |     2 |  1,710 | Handover prose ＋ a hooks catalogue                | `apps/web`                                                                                                                                   |
| `plans/`                                                |     7 |  1,583 | Rollout plans, most already finished               | Delete on completion. This file is the last one out                                                                                          |
| `spec/`                                                 |     2 |    739 | `config-registry-keys` ＋ `web-core/`              | `libs/config` · **`web-core/` describes a module that no longer exists — delete**                                                            |
| `chat-link-preview.md`                                  |     1 |    705 | Feature detail                                     | `apps/web` or `libs/block-kit`, whichever owns the behaviour                                                                                 |
| `audit/`                                                |     3 |    697 | Dated point-in-time snapshots                      | Delete once acted on. An audit is a work log with a date on it                                                                               |
| `DEEP-LINKING.md` ＋ `-V2.md` ＋ `deep-linking-assets/` |     3 |    547 | A duplicated pair plus assets                      | One survives, into `apps/web` or `apps/mobile`                                                                                               |
| `guides/`                                               |     2 |    374 | `trace-report` ＋ this canon's template            | `trace-report` → `apps/admin-v2` · **the template → `AGENTS.md`**                                                                            |
| `invite-accept-entry.md`                                |     1 |    283 | Feature detail                                     | `apps/web`                                                                                                                                   |

The four deletion categories in the template decide each file. Most of `specs/` is category 1 — a
name like `use-websocket-v2-refactoring.TASK.md` (306 lines) announces a work log. Take the living
facts out and drop the tense.

`AGENTS.md` is where the doc canon ends up, because it is the one repo-wide file that outlives the
tree and agents already read it first.

### Blast radius

Module docs reference the ADR tree in two forms, and only one of them breaks.

| Form                                      | Count | On deletion  |
| ----------------------------------------- | ----: | ------------ |
| Markdown links (`](../../../docs/adr/…)`) |   163 | **Break**    |
| Plain text (`ADR-0036`, no link)          |   609 | Cost nothing |

163 links across roughly 40 files. They are not chased down on sight — each one is replaced as the
section it sits in gets rewritten, which is what every WP in this plan is already doing. That is why
the rule is "do not add new ones" rather than "remove them now".

## Current state

Measured 2026-09-14, on a `node_modules` synced to the lockfile. **All 16 libs' production code
(`tsconfig.lib.json`) is green** — every error below is in a spec file.

| Module           | specs | Harness | Errors | Doc files | Doc lines | Korean |
| ---------------- | ----: | ------- | -----: | --------: | --------: | -----: |
| `data`           |    47 | done    |      — |         7 |     1,381 |     0% |
| `bridges`        |     6 | done    |      — |         1 |       272 |    25% |
| `auth-sign`      |     2 | —       |  **0** |         1 |       384 |    68% |
| `db`             |     8 | —       |  **0** |         2 |       486 |    63% |
| `shared`         |     6 | —       |  **0** |  1 (stub) |         4 |      — |
| `web-ui-kit`     |    75 | —       |  **0** |         2 |       319 |    51% |
| `config`         |     8 | —       |      1 |         2 |     1,004 |    74% |
| `block-kit`      |     6 | skipped |      1 |         0 |         0 |      — |
| `logger`         |    21 | —       |      3 |         4 |     1,774 |    60% |
| `http`           |    14 | —       |     16 |         1 |       440 |    64% |
| `app-runtime`    |    77 | —       |     49 |        25 |     5,218 |    57% |
| `app-messages`   |     0 | n/a     |      — |         1 |       203 |    60% |
| `ui-kit`         |     0 | n/a     |      — |  1 (stub) |        15 |      — |
| `device-utils`   |     0 | n/a     |      — |  1 (stub) |         4 |      — |
| `theme`          |     0 | n/a     |      — |  1 (stub) |         4 |      — |
| `policy-content` |     0 | n/a     |      — |         0 |         0 |      — |

Roughly 6,000 Korean lines across 39 files. `libs/data`'s 1,381 lines are already English and are
the reference for all of it.

### The two heavy modules

`http` — 16 errors, two causes.

| Count | What                                                    | Where                                  |
| ----: | ------------------------------------------------------- | -------------------------------------- |
|     6 | `Mock<LemonRequestBuilder, [], unknown>` not assignable | `client*.spec.ts` × 4                  |
|     5 | `executeCloudRequest` is not on `HttpClient`            | `gateways/*.spec.ts` × 5               |
|     1 | `getCredential` is not on `HttpRuntimePorts`            | `client.spec.ts`                       |
|     2 | `'error' is of type 'unknown'`                          | `client.credentialAttribution.spec.ts` |

`executeCloudRequest` exists nowhere in `libs/http`'s production code. Five mocks are imitating a
method that is gone — real drift, caught by the harness.

`app-runtime` — 49 errors, and 21 of them are **one missing import**.
`sessionAuthAdapter.test.ts` uses `UserTokenView` without importing it. ts-jest strips types, so the
runtime never noticed.

| Count | What                                    | Where                                      |
| ----: | --------------------------------------- | ------------------------------------------ |
|    21 | `UserTokenView` not imported            | `session/auth/sessionAuthAdapter.test.ts`  |
|     6 | `ConnectivitySignals` shape mismatch    | `connection/hooks/useConnectivity.test.ts` |
|     6 | Spread argument is not a tuple          | `connection/hooks/useConnectivity.test.ts` |
|     5 | Mock surface mismatch                   | `http/gateways.test.ts`                    |
|    11 | Strict-null, implicit any, and the like | 8 files                                    |

## WP-0 — serial prerequisite ✅ done

> Landed 2026-09-14. `workspaces` is `["apps/*", "libs/*"]`, the dead `targets` blocks are gone, and
> `verify.yml` no longer carries a separate step. The full gate was run locally first — lint 26
> projects, typecheck 19, test 15, all green. `@chatic/bridges` also came off the test exclusion
> list: its `yarn test` resolves jest now that the lib is a workspace member.

This one touches root files. It lands **alone**, on its own PR, with a green CI run, before any
parallel WP starts.

**Root `workspaces` is stale.** It reads
`["apps/*", "libs/socket", "libs/chats", "libs/data", "libs/bridge"]`. The last three directories do
not exist, and 15 real libs are missing. Only `data` is linked under `node_modules/@chatic/`.

The consequence is that nx builds no `test` target for `@chatic/app-runtime` or `@chatic/db`, and
`verify.yml` compensates by calling `npx jest --config` three times by hand. Changing it to
`["apps/*", "libs/*"]` was tried and both targets appear — exactly what that workflow's own comment
predicts.

Also in WP-0: `libs/db`, `libs/app-runtime` and `libs/bridges` carry a **top-level `targets` key**
in `package.json`. Nx reads project config only under an `"nx"` key, so this is dead — the proof is
that `bridges`' inferred target is `nx:run-script`, not the `@nx/jest:jest` written there. Delete it.

`yarn install` re-runs and hoisting shifts, so this needs its own CI pass before anything builds on
top of it. Three things were checked up front, and none of them blocks:

- **`yarn.lock` does not change.** `yarn install --frozen-lockfile` succeeds against `libs/*` and
  leaves the lockfile byte-identical. Every lib's own dependencies are `*`, which resolve to the
  hoisted root entries already in the lock. WP-0 commits no lockfile churn.
- **14 libs get linked** under `node_modules/@chatic/`. `ui-kit` and `web-ui-kit` do not, because
  they have no `package.json` — they carry a `project.json` instead. Harmless: both are reached
  through `tsconfig.base.json` paths and jest's `moduleNameMapper`, not through node resolution.
- **The `pod-install` failure in the install log is noise.** The root `postinstall` swallows it
  (`catch(e){}`), and on CI it never runs at all — the guard requires `RUNNER_OS === 'macOS'` and the
  runner is `ubuntu-latest`.

## Parallel work packages

Each WP = one module, both lanes, one PR. Scope is `libs/<name>/**` and nothing else.

| WP       | Module                                                           | Harness      | Docs                           | Size |
| -------- | ---------------------------------------------------------------- | ------------ | ------------------------------ | ---- |
| WP-1     | `auth-sign`                                                      | wiring       | 384 lines → English            | S    |
| WP-2     | `db`                                                             | wiring       | 486 lines → English            | M    |
| WP-3     | `shared`                                                         | wiring       | stub → write from scratch      | M    |
| WP-4     | `web-ui-kit`                                                     | wiring       | 319 lines → English            | M    |
| WP-5     | `config`                                                         | 1 error      | 1,004 lines → English          | L    |
| WP-6     | `logger`                                                         | 3 errors     | 1,774 lines → English          | L    |
| ~~WP-7~~ | ~~`block-kit`~~                                                  | —            | — (out of scope)               | —    |
| WP-8     | `http`                                                           | 16 errors    | 440 lines → English            | L    |
| WP-9a    | `app-runtime` harness                                            | 49 errors    | —                              | L    |
| WP-9b    | `app-runtime` README ＋ `architecture.md` ＋ `public-surface.md` | —            | README becomes the canon       | L    |
| WP-9c    | `app-runtime` `docs/socket/**` (11 files)                        | —            | → English                      | L    |
| WP-9d    | `app-runtime` `docs/data` ＋ `session` ＋ `push` ＋ `runtime`    | —            | → English                      | L    |
| WP-10    | `app-messages`                                                   | no tests     | 203 lines → English            | S    |
| WP-11    | `bridges`                                                        | already done | 272 lines → English            | S    |
| WP-12a   | `device-utils` ＋ `theme` ＋ `policy-content`                    | no tests     | write a README each            | S    |
| WP-12b   | `ui-kit`                                                         | no tests     | write a README (29 components) | M    |
| WP-13    | `data`                                                           | done         | de-link ADRs ＋ one stale line | S    |
| WP-14    | `verify.yml` — shrink the exclusion lists                        | serial, last | —                              | S    |

**WP-9b runs before 9c and 9d.** `app-runtime` is the only module left whose canon is split in two,
which is what makes it the `libs/data` case, and it is settled the same way: **`README.md` at the
module root holds overview and structure, and every per-feature detail moves down into
`docs/<topic>/`.** `docs/architecture.md` (998 lines) and `docs/public-surface.md` (193) are the two
files that collide with the README today — they are absorbed upward into it or pushed down into a
topic folder, and they do not survive in place. That is what `libs/data` did when its own
`architecture.md` disappeared into the README.

9c and 9d then rewrite the topic folders underneath the structure 9b lands.

### WP-12a and WP-12b — modules with no real docs

Four modules get a `README.md` written from nothing — three of them hold an nx stub today and
`policy-content` has no file at all. All four are **README-only**: the size rule says a `docs/`
folder starts at more than three documents, and none of these is close.

| Module           | What it holds                                                                   |
| ---------------- | ------------------------------------------------------------------------------- |
| `device-utils`   | `constants`, `useAppChecker`, `useDeviceInfo`, a `deviceInfoStore` (zustand)    |
| `theme`          | `useTheme` and `ThemeProvider` — two files and the contract between them        |
| `policy-content` | Terms, privacy and child policy text in ko/en, plus `PolicyVersion` and `utils` |
| `ui-kit`         | 29 shadcn/ui components and `utils`                                             |

Three of the four currently carry the nx scaffold line (`This library was generated with Nx`), which
is deletion category 4. `ui-kit`'s scaffold README also tells the reader to run `nx test ui-kit` —
there are no tests and no jest config in that module, so the instruction is false and goes.

One thing in `ui-kit`'s current README is worth keeping, because it is the real procedure for adding
a component:

```shell
npx shadcn@latest add <component>
```

For `ui-kit` the README's centre of gravity is the **component catalogue** and the rule for when to
put something there instead of in `web-ui-kit`.

**WP-13 is small but real.** `libs/data`'s README says `nx typecheck @chatic/data` runs "every
dependency's own typecheck, which is not green today". That is no longer true — the target and its
17 dependency tasks pass. The README also links into `docs/adr/` in four places.

## Working in parallel

- **One worktree per WP.** Concurrent `tsc -b` runs share dependency `dist/` directories and will
  race. Separate worktrees keep the builds apart.
- **Nobody edits `.github/workflows/verify.yml`.** Every WP wants to remove its module from an
  exclusion list, and all of them would conflict. WP-14 does it once at the end, reading the state
  that actually landed.
- **Nobody edits root `package.json`, `nx.json`, `tsconfig.base.json`, `AGENTS.md` or
  `docs/guides/module-docs-template.md`.** WP-0 owns the first three; the last two are settled. A WP
  that believes the template is wrong says so instead of editing it.
- A WP touches only its own module's `tsconfig.*`. Never a sibling's, even when the error points
  there.
- The git stash stack and the git index are shared across worktrees. Stage by explicit path.

## Verification

Per module, two commands.

```bash
npx tsc -b libs/<lib>/tsconfig.json --force
npx jest --config libs/<lib>/jest.config.js
```

`tsconfig.json` and not `tsconfig.lib.json` — the point is to check that the spec reference works.
Repo-wide, use what CI uses.

```bash
npx nx run-many -t typecheck
```

## Traps

**A stale `node_modules` makes every measurement a lie.** While this document was being written the
worktree's `node_modules` was four days old and held `@lemoncloud/chatic-backend-api@0.26.810`; the
lockfile says `0.26.811`. That one gap turned up 3 errors in `shared`'s production code and 4 in
`data`'s tests — `MembershipView.adminStatus` does not exist in 810. CI was green the whole time.
**Run `yarn install --frozen-lockfile` before measuring anything.**

That install rewrites `apps/mobile/package.json`: indentation 4 → 2, and it adds
`@radix-ui/react-context-menu` and `@jest/globals` to dependencies. Keep it out of the commit. (It
also means those two are genuinely missing from that manifest — a separate matter.)

`libs/shared`'s `tsconfig.lib.json` references `../../assets/tsconfig.lib.json`. `assets` sits at the
repo root, not under `libs/`. Copying that reference list into the spec config and shortening it to
`../` breaks the build.

A stale `dist`/`out-tsc` produces phantom errors after a directory moves. `rm -rf` and look again.

## Out of scope

- **`block-kit`.** Left alone by decision. It is the one module with specs (6 files) but no
  `jest.config.js`, no `tsconfig.spec.json` and no test script, so harnessing it means choosing how
  it runs tests at all — a different question from the one this track answers. `verify.yml` already
  excludes it from the test step, and that stays. Its single spec type error goes unfixed.
- `apps/*`. This document covers `libs/*` only.
- `web-ui-kit`'s 3 `*.stories.tsx` errors, already recorded as pre-existing debt in `verify.yml`.
  The harness goes on with stories excluded.
- The other pre-existing debt named at the bottom of `verify.yml`, `desktop-web`'s 21 included.
- Retiring `docs/adr/`. This document only stops module docs from depending on it.
- **Adding** tests. This track type checks the tests that exist.
