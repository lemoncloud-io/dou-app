# ADR-0253: app-runtime is cut into layered modules, starting with the layers inside it

> Status: Accepted · Decided: 2026-10-30 · Implemented: `refactor/app-runtime-layers` (step 1 of 5)
> · Scope: `libs/app-runtime/`

## Context

`libs/app-runtime` holds the session store, login and cloud switching, device pairing, the socket
manager and its slots, the HTTP manager, the sync manager, the assembly of the repository graph, the
React host and binders, every hook, push registration, the issue report and boot — 181 source files
and about 16,800 lines in one package. ADR-0002 made it the shared engine and that still holds; what
no longer holds is that one package is the right size for it. A change to one concern runs every
other concern's tests and type checks, a reader cannot tell from the package where a layer ends, and
none of the engines can be used without React.

Measured folder by folder, the coupling that stops a split is small. No file imports itself back
(`importCycleAbsence.test.ts` already holds that), but folders did: the socket manager imported a
trace from `socket/auth`, the HTTP factory imported the credential freshness reader from
`session/auth`, `socket/index.ts` re-exported the auth wiring and a sync hook, and the auth use cases
and the sync plans each imported `data/runtime` — the repository graph that is assembled from the
socket manager and the session they sit beside.

## Decision

1. **The package is cut into five modules, by layer.** Bottom up: `@chatic/session` (store, signal,
   scope), `@chatic/transport` (socket manager and slots, HTTP manager), then `@chatic/sync` and
   `@chatic/auth` side by side (auth includes device pairing), and `@chatic/app-runtime` on top. Each
   is a module of its own — its own README, docs and tests — named by its domain with no `runtime-`
   prefix.
2. **The repository graph's assembly stays in `@chatic/app-runtime`.** It is composition: it needs the
   session, the socket manager, HTTP and `@chatic/data` all at once, which is what this package is
   for. The layers below that read the graph get it **handed down at boot** — `initAppRuntime()`
   installs an accessor for the `AuthRepository` in auth and one for the scoped graphs in sync. Both
   are read on every call, so the graph is still built lazily, and both throw a message naming
   `initAppRuntime()` when nothing was installed.
3. **Apps keep importing `runtime` from `@chatic/app-runtime` and nothing else.** The facade's 81
   symbols stay where they are, re-exported from the modules that own them. The new modules are not
   for apps to import directly; a symbol sold under two names would let one of them rot.
4. **The layers are held inside the package before any module leaves it.** `layering.test.ts` maps
   every folder to its layer and fails on any import — a type-only one included — that reaches a layer
   it may not. Every `hooks/` folder is the app layer wherever it sits, because hooks are React and
   React stays on top. This step moves two files down a layer (the credential freshness reader into
   `session/store`, the verify trace into the socket core), drops the auth and sync re-exports from
   `socket/index.ts`, and installs the two accessors. Extraction then follows bottom up, one module per
   change: session, transport, sync and auth.

## Alternatives

- **Split into a headless core and a React package only.** Two packages instead of five. Rejected as
  the target: it leaves session, socket and data in one package, so the boundaries between them stay a
  test's job forever. It remains the fallback if the per-module cost proves too high.
- **One package per folder, the graph's assembly included.** A separate `data-graph` module was
  considered for `DataManager` and its factories. Rejected: it would depend on every other module and
  sell nothing on its own, and it needed a name that explained itself, which no candidate did.
- **Merge the HTTP manager into `libs/http` and the graph's assembly into `libs/data`.** Rejected:
  `libs/data` imports `@chatic/http` and the session store imports `@chatic/data`, so either merge
  closes a cycle between packages.
- **Move the files first and fix the edges after.** Rejected: a package reference cannot be cyclic, so
  the first extraction would have had to carry every edge fix at once, mixed into a large move.

## Consequences

- What the sync and auth layers need from above is reached through an accessor that must be
  installed. A test that drives auth or sync without `initAppRuntime()` mocks or installs it; the
  thrown message says which.
- The domain models stay in `@chatic/data`, so every new module still depends on it — most only for
  `RELAY_CLOUD_ID` and a few types. Pulling the models into a lighter module is a separate change.
- Apps see no change. `public-surface.test.ts` still pins the facade symbol by symbol.
- ADR-0076 decision 7 kept `expiry.ts` in `store/` because its two consumers could only both reach it
  there; one of them, `credentialFreshness`, now sits beside it in `store/`, which holds that decision
  rather than reopening it.
- Four more changes follow, one per module, each moving its folders, their docs and their tests.
