# ADR-0081: Split libs/data's doc canon by size, and flatten the `src/data` nesting

> Status: Accepted · Decided: 2026-09-09 · Updated: 2026-09-14 (Decisions 4·5 carried out) · Related: [ADR-0036](./0036-data-surface-unification-app-runtime-cleanup.md) (naming convention this document inherits)

## Context

This is the first step of the repo-wide documentation refresh track. `libs/data` goes first for one reason — the
documentation rules decided here become the template for the other 11 doc trees.

### Documenting code that doesn't exist (5 cases)

| Document                      | Claim                                                                              | Reality                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `docs/README.md`              | the whole `### events (src/data/events)` section (`DomainEventMap`, `eventBus.ts`) | the directory itself doesn't exist                                 |
| `docs/README.md`              | `repositories/` in the tree — "holds shared contracts"                             | it doesn't. `DataContext` moved to `repositories/types.ts:18`      |
| `README.md`                   | repeats both claims above                                                          | the same errors sit in two places                                  |
| `docs/repositories/README.md` | 8 domains (`channel, chat, cloud, join, place, profile, user, syncMeta`)           | there are 13. `auth·device·invite·report·subscription` are missing |
| `docs/repositories/README.md` | "`src/data/repositories` only holds `DataContext`"                                 | it doesn't exist                                                   |

`docs/remote/README.md` was accurate (Socket, 11 kinds · Http, 5 kinds — matches reality).

### 66% of the doc volume is a work log

`docs/http-data-path.md` is 614 lines, 45KB. The section titles alone give away the character — "Preview of step 3,"
"How to verify," "Where the implementation left the doc," "What measurement matched the doc's prediction exactly."
Not a reference — a work log of a finished track.

### There are two canons

`README.md` (242 lines) and `docs/README.md` (63 lines) duplicate the intro almost verbatim — the same 3-line core
principle, the same socket-lifecycle paragraph. The two errors above sit in both.

### Reading the docs surfaced a code problem

A "V1 is gone" comment appears in three README files. There's no V1, yet the `V2` suffix remains on **119 files**.
And a forced alias sits right at the boundary.

```ts
// libs/app-runtime/src/data/factories/localFactory.ts:5
createLocalDataSources as createDataLocalDataSources,
```

`libs/app-runtime` already uses names without `V2` — `createRepositories`, `createLocalDataSources`. **Only
`libs/data` still speaks V2; nothing else does.**

### Blast-radius measurement

- **Zero barrel bypasses.** All 213 files consuming `@chatic/data` go through the barrel only. No file imports
  `@chatic/data/...` internal paths directly.
- So relocating `src/data/**` has **zero external blast radius** — only the 109 internal files change.
- Removing the `V2` identifier goes out through the barrel, so **119 external files** change.
- Safety net: `libs/data` has 45 test files · 348 cases.

### The repo-wide layout splits four ways

| Pattern                                 | Modules                                                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| README + `docs/` both large (duplicate) | `data` (242 lines + 8), `app-runtime` (132 lines + 24)                                          |
| `docs/` only                            | `auth-sign`, `http`, `logger`, `apps/web` (55), `admin-v2`, `testbed`, `mobile`                 |
| README only                             | `app-messages` (202 lines), `bridges` (271 lines), `db`, `web-ui-kit`                           |
| Neither                                 | `block-kit`, `i18n-mobile`, `policy-content`, `web-config`, `desktop-web`, `desktop`, `landing` |

`device-utils`·`shared`·`theme`'s READMEs are still the plain 3-line nx scaffold —
`This library was generated with Nx`.

## Decision

### 1. The doc canon splits by size (repo-wide rule)

- **There's one canon.** When `README.md` and `docs/` state the same fact, one gets demoted to an entry point.
- **The canon location respects what's already decided.** `docs/` if it exists, otherwise `README.md`.
- **The only bar for creating a new `docs/`** is more than 3 documents.
- The same fact lives in exactly one canonical place; everywhere else links to it.
- A module whose canon is `docs/` still has a `README.md` with **an overview and structure** — purpose, design
  principles, scope, the layer map, the directory tree, scenarios, plus an index of the `docs/` folder. Detail lives
  under `docs/`, split by **topic**.

`libs/data` has 8 documents and two canons. `README.md` holds the overview and structure, and `docs/` splits by
layer folder (`local/` · `remote/` · `repositories/`).

> **2026-09-09 correction.** The rule originally read "3 or fewer documents means a single `README.md`." That rule
> misfires on `libs/http`·`libs/db`·`libs/auth-sign`·`libs/logger` — all four have just 1-2 documents, but
> `docs/architecture.md` is already the canon there, and there's nothing to gain by re-siting the conventions and
> ADR-0070 cross-links that 60 documents already use. The rule's real target was modules with **two** canons
> (`data`, `app-runtime`).
>
> **2026-09-14 revision.** Dropped "README is a 20-line entry point." That shape means someone entering the module
> has to open `docs/` a second time just to see the structure, and the overview document (`architecture.md`) and
> README end up splitting the same statements between them — the original two-canons problem survives in a new
> shape. The rule now is **README holds the overview and structure, `docs/<topic>/` holds detail.** `libs/data` is
> the first application, and `architecture.md` was absorbed into README and deleted.

Under this rule, the modules to leave untouched are clear — `bridges` (271 lines) · `app-messages` (202 lines) have
`README.md` as their only canon, and `http`·`db`·`auth-sign`·`logger` have `docs/` as their only canon.

### 2. Deletions fall into 4 categories

1. **Work log · plan · preview · verification procedure** — tense that code can't verify. Anything worth keeping as
   a decision record is already covered by `docs/adr/`.
2. **Duplication** — the same fact in two places keeps only the canon and turns the other into a link.
3. **Sections describing code that doesn't exist** — deleted outright, since there's nothing to update them against.
4. **Nx scaffold README** — the 3 cases: `device-utils`·`shared`·`theme`.

`docs/http-data-path.md` falls under category 1. Only the still-true facts get absorbed into `docs/remote.md`, and
the original is deleted. Three things get absorbed — the gateway mapping table, the domain mapping · cache semantics
of the 5 HttpDataSource kinds, and why `ReportHttpDataSource` passes through this layer with no domain.

### 3. Flatten the `src/data` nesting by one level

```text
# before                             # after
libs/data/src/                      libs/data/src/
├── index.ts                        ├── index.ts
└── data/                           ├── domain/
    ├── domain/                     ├── local/
    ├── local/                      │   ├── data-sources/
    │   ├── data-sources/        │   ├── ports/
    │   ├── ports/                  │   └── stableHash.ts
    │   └── stableHash.ts           ├── remote/
    ├── remote/                     │   ├── gateways/
    │   ├── gateways/               │   ├── socket-data-sources/
    │   ├── socket-data-sources/    │   └── http-data-sources/
    │   └── http-data-sources/      └── repositories/
    └── repositories/
```

**Only the `data/` layer changes.** The layer boundaries and the `-v2` suffix in directory names stay as they are
(Decision 4 removes `-v2` too — flattening and renaming were applied as separate steps). No domain vertical slicing.

### 4. Drop the `V2` suffix

> **Progress.** Held back once (2026-09-14), then reinstated and carried out the same day. The reason for holding
> back was "keep this PR's blast radius scoped to docs"; that reason went away once the track's scope narrowed to
> just `libs/data`. Measured blast radius outside `libs/data` is **93 files** (apps/web 35 · app-runtime 25 · testbed
> 17 · db 7 · desktop-web 3 · admin-v2 3 · mobile 2), all type/symbol references through the barrel.
>
> The rename produced **zero** type errors. desktop-web's 21 and mobile's remaining ones are pre-existing debt,
> measured at the same count in a worktree from before the rename.

The mapping applied:

| Before                                         | After                                          |
| ---------------------------------------------- | ---------------------------------------------- |
| `repositories/`                                | `repositories/`                                |
| `local/data-sources/`                          | `local/data-sources/`                          |
| `XxxRepository` · `IXxxRepository`             | `XxxRepository` · `IXxxRepository`             |
| `BaseRepository`                               | `BaseRepository`                               |
| `createRepositories`                           | `createRepositories`                           |
| `DataRepositories` · `DataRepositoriesOptions` | `DataRepositories` · `DataRepositoriesOptions` |
| `XxxLocalDataSource` · `IXxxLocalDataSource`   | `XxxLocalDataSource` · `IXxxLocalDataSource`   |
| `LocalDataSources`                             | `LocalDataSources`                             |
| `createLocalDataSources`                       | `createLocalDataSources`                       |

`V2` unrelated to the data layer stays untouched — the `apps/admin-v2` path, `useRegisterUserV2`,
`useChatOutbox`·`useCloudCatalog`'s local identifiers, and so on. Not a global replace — only the names in the table
above move.

The `Invite` domain is a trap. Its `I`-prefixed interface collides with the domain name, so `IInviteRepository` and
`InviteRepository` sit side by side. A regex that handles the `I` prefix would mix the two up. Only replacements that
name the domain explicitly are used.

### 5. Delete `repositoryFactory`

Once `V2` is dropped, `libs/data`'s `createRepositories` collides in name with `app-runtime`'s wrapper.
`factories/repositoryFactory.ts` is a 30-line shell that just renames the `context` ↔ `contextProvider` key. It's
deleted, and `DataManager` calls `@chatic/data`'s `createRepositories` directly.

`factories/localFactory.ts` stays — it has storage routing and fingerprint logic, a different nature.

> **2026-09-14 correction — the alias can't be removed.** This decision said "only the import alias goes away," and
> that was wrong. The alias (`createLocalDataSources as createDataLocalDataSources`) wasn't there because of `V2`.
> `localFactory.ts` **also exports its own function** as `createLocalDataSources`, so once the suffix is dropped, the
> two names collide exactly. The alias stays.

### Order and verification

1. **Flatten** — zero external blast radius. Closed within libs/data.
2. **Remove `V2` + delete `repositoryFactory`** — 93 files outside the barrel. Confirmed with downstream typecheck.
3. **Rewrite docs** — describes the result of step 1.

Run `npx tsc -b libs/data/tsconfig.lib.json` and jest after each step. The worktree has no `node_modules`, so a
symlink from the main checkout is attached and removed once done.

### Out of scope

- Domain vertical slicing
- Making the barrel explicit — keeps `index.ts`'s 8 lines of `export *`
- ADR number collisions (0027×3, 0033×3, 0034×4, 0045×3, 0047×4, 0075×2) and missing numbers (0038, 0061, 0064, 0065, 0069)
- The duplicate root `docs/` trees — `spec/` vs `specs/`, `frontend-handover.md` vs the folder of the same name,
  `DEEP-LINKING.md` vs `-V2.md`
- The 11 doc trees outside `libs/data` — only the rule gets set here; applying it is a later step

## Alternatives

**Fix the docs only, leave `V2` alone.** Dropped. The three "V1 is gone" comments would keep sitting there. The docs
would keep spending space explaining what V2 means. The problem lives in the code but gets papered over in docs.

**Domain vertical slicing**
(`src/domains/chat/{ChatRepository, ChatLocalDataSource, ChatSocketDataSource}.ts`). Dropped. The axes are
asymmetric — 13 repositories, 11 socket DS, 9 local DS, 5 http DS. The shape of the 13 folders would be uneven, and
the "reads are local · remote is command" principle would disappear from the directory structure.

**Force a `docs/` canon on every module.** Dropped. It would mean breaking up `bridges`'s 271 lines and
`app-messages`'s 202 lines too, bloating the track. Under the size rule, those two are already the right shape.

**Consolidate into one `README.md` per module.** Dropped. `apps/web`'s 55 documents, or `libs/data`'s 4 layers,
can't fit into a single file.

**Move `http-data-path.md` into `docs/adr/`.** Dropped. The same decision is already covered by ADR-0036. A work log
has no reason to swell the ADR folder.

**Remove `V2` first, flatten later.** Dropped. The two changes would mix into one diff. The zero-blast-radius one
goes first.

## Consequences

### What is gained

- The 5 false claims disappear, and there's one canon.
- `libs/data`'s doc volume drops sharply — `http-data-path.md`'s 614 lines and the README duplication.
- The alias at the boundary disappears. `app-runtime` and `libs/data` say the same name.
- A rule now exists for the other 11 trees. It can continue without a re-interview.

### What is accepted

- **3 commits touch 109-213 files.** Rebase-conflict surface is large. This worktree shares its git index with other
  sessions, so staging names paths explicitly at commit time.
- **Only the typecheck catches semantic collisions.** It's a pure rename, so re-verification after rebase is
  mandatory.
- **Nx's stale `dist`/`out-tsc` produces phantom errors.** Moving a directory physically makes downstream typecheck
  see old symbols. Force-delete with `rm -rf` before diagnosing.
- **`desktop-web` only deploys via push and has no way back.** This track's touches to `desktop-web` files are
  limited to the rename.
- **ADRs written with the old names stay as they are.** Same approach as the 2026-09-01 rename — a `V2`-removal row
  is appended to `libs/data/docs/remote/README.md`'s mapping table, and past ADR bodies are left alone since they're
  a record.

## Next steps

Hands off to `dev-2_implement`'s spec writing (Phase A).

Candidate order for the rest of the repo-wide track:

1. `libs/app-runtime` — 24 documents, the second largest, with the same README-duplication shape
2. `apps/web` — 55 documents, the largest
3. Merging the 3 duplicate root `docs/` trees — **not starting from scratch.** The same work was finished on
   2026-08-20 but the worktree disappeared and it was lost (it never landed on any branch). The verdict survives at
   `~/.claude/plans/docs-partitioned-seahorse.md` — read that first. It holds the migrate/discard verdicts for 18
   specs and 2 bugs found at the time (admin's stale deep-link format, Firestore's delayed-deep-link death).
4. Clean up ADR number collisions
5. ~~**Remove the `V2` suffix + delete `repositoryFactory`**~~ — finished together within this track (Decisions 4·5).
   Measured external blast radius was **93 files**, not 119.

The lesson from the loss is already reflected in this track — commit at every step. Never leave the worktree empty
until the end.
