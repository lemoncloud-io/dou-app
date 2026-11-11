# ADR-0308: The React surface starts its work from an engine

> Status: Accepted · Decided: 2026-11-11 · Implemented: `refactor/runtime-engine`
> · Scope: `libs/runtime-core/src/engine.ts` (`RuntimeEngine`, `coreEngine`), `createRuntime` returning it,
> the barrel keeping only the lifecycle classes' types; `libs/runtime-web/src/createWebRuntime.ts` and
> `storage/resolveStorageStores.ts` (moved from `libs/app-runtime/src/storage/`); `libs/app-runtime/src/init.ts`
> (`initAppRuntime(engine)`, `runtimeEngine()`) and the hosts and hooks that read it; the four apps' entry points
> · The behaviour is documented in [libs/runtime-core](../../libs/runtime-core/README.md#the-engine) and
> [libs/runtime-web](../../libs/runtime-web/README.md)
> · Amends: [ADR-0305](./0305-the-runtime-is-assembled-in-runtime-core.md) — the app-facing names its
> Decision 1 kept (`initAppRuntime(config)`, `AppRuntimeConfig`), and the store choice it left in app-runtime

## Context

ADR-0306 and ADR-0307 moved the runtime's lifecycle work out of React — the session's boot and guest
keep-alive, the connections, the credential guards, push registration, the chat-room prime — into
classes in `@chatic/runtime-core`. The React surface then made those classes itself: a host imported
`createSessionController`, a hook called `new RelayCredentialGuard(policy)`. That ties the surface to
the core running in the same process.

On the phone the session is to belong to the native process, with the page mirroring it. The page's
hooks and hosts are the same code there, so they cannot name the core's classes: whatever starts the
session or a guard has to be swappable for something that asks the native side instead.

At the same time each app's entry point assembled the runtime from five ports by hand — transport,
auth, foreground and cache the same in every web app — and app-runtime held the page's choice of
stores (`resolveStorageStores`), a page read in the React package.

## Decision

**The React surface starts its lifecycle work from an engine it is handed, and a page builds that
engine in one call.**

1. **`RuntimeEngine`** (runtime-core) lists what the surface starts: `sessionController`,
   `connectionController`, `relayCredentialGuard`, `cloudCredentialGuard`, `pushRegistration`,
   `primeChatRoom`. `createRuntime(config)` wires the core packages as before and returns the **core
   engine**, whose members make the core implementations. The classes leave the runtime-core barrel;
   their types stay.
2. **`initAppRuntime(engine)`** takes the engine and holds it; the hosts and hooks read it through
   `runtimeEngine()`, which throws before the entry point handed one over. `AppRuntimeConfig` goes, and
   so do the `boot` group's re-exports of the data policy types (`DataRuntimeConfig`,
   `CacheAssemblyOptions`, `DataRepositoriesOptions`), which no app imported.
3. **`createWebRuntime(options)`** (runtime-web) fills a page's ports and calls `createRuntime`. The
   options are only what a web app decides: its stores, the cache's tab store, the keys a sign-out
   takes, its data policies. The port factories leave the runtime-web barrel.
4. **The page's choice of stores** — `resolveStorageStores`, `readStorageEnvironment`,
   `LATE_VAULT_MARK` — moves from app-runtime's `boot` group to runtime-web.
5. **Messages and comments that told a reader to pass a port to `initAppRuntime()`** now name
   `createRuntime()`, where the wiring happens.

## Alternatives

- **Define the session's state and commands in the engine now.** The screens read the session, the
  repository graph and the connection state straight from the core packages, and a mirror engine will
  need all of it behind the engine too. But that contract has no second implementation to be checked
  against until the mirror engine exists; written now, it would be a guess that the first real consumer
  rewrites. It joins the engine with that engine.
- **Keep `initAppRuntime(config)` and have it build the engine.** The React package would keep choosing
  the core, which is exactly the coupling this removes; and a native entry point would have no way to
  hand over a different engine.
- **Leave the stores in app-runtime.** Choosing between the vault, `localStorage` and `sessionStorage`
  is a page's answer; the React package is not where a page's answers live (ADR-0304's reasoning,
  applied to the adapter side).

## Consequences

- An entry point is `initAppRuntime(createWebRuntime({ storage, cacheTab, ... }))`, with the stores from
  `resolveStorageStores()` or the app's own. A forgotten port is no longer possible in an app.
- A test that renders a host or a hook that starts work hands it an engine first
  (`initAppRuntime(coreEngine)` from `@chatic/runtime-core/engine`).
- The engine is the seam a mirror engine plugs into; until it exists, the session's and the
  connection's readers still bypass it.
