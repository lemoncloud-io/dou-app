# ADR-0305: The runtime is assembled in runtime-core

> Status: Accepted · Decided: 2026-11-11 · Implemented: `refactor/runtime-assembly-to-core-move`
> · Scope: `libs/runtime-core` (`createRuntime.ts`, `ports.ts`, `config/`, `storage/`, `data/` and their
> tests, moved from `libs/app-runtime`); `libs/app-runtime` (`init.ts`, `boot.ts`, `data/` hooks and
> group, the source-scanning guards); `nx.tags` of logger, config, perf, http, storage and
> bridge-messages; root `eslint.config.mjs` (`runtimeLayerConstraints`, `RUNTIME_WIRING`)
> · The behaviour is documented in [libs/runtime-core](../../libs/runtime-core/README.md) and its
> [docs/data](../../libs/runtime-core/docs/data/README.md)
>
> **Amended by [ADR-0308](./0308-the-react-surface-starts-its-work-from-an-engine.md) (2026-11-11):**
> `initAppRuntime` now takes the engine `createRuntime` returns, and `AppRuntimeConfig` is gone — an app
> builds the runtime through `createWebRuntime` in `@chatic/runtime-web`; `resolveStorageStores` moved
> there too. Decision 1's "the public surface does not change" and the consequence that keeps the store
> choice in app-runtime no longer hold.

## Context

ADR-0301 created `@chatic/runtime-core` for the ports the runtime takes from its platform, and left the
assembly — the wiring that builds the runtime from them — in `@chatic/app-runtime`, the React package,
until what it read of the page had become ports. That has happened: the session's storage, the
transport's platform, auth's address and the local cache all come in through `RuntimePorts`, and the
assembly code reads no page.

It still lived in the React package, which the native process does not load. A native runtime would
have had to depend on a package of hooks and components to get the assembly, or copy it.

## Decision

**The assembly moves into `@chatic/runtime-core`, and the React package keeps only what React needs.**

1. **`createRuntime(config)`** (`src/createRuntime.ts`) is the assembly — what `initAppRuntime` did,
   unchanged. `RuntimeConfig` extends `RuntimePorts` with the app's own policies (`data`,
   `signedOutKeyPrefixes`); `RuntimePorts.storage` now carries the runtime's own `device` store too.
   `@chatic/app-runtime` keeps `initAppRuntime` and `AppRuntimeConfig` as the names apps know, and both
   are now `createRuntime` and `RuntimeConfig`: the public surface does not change.
2. **The repository graph goes with it**: `DataManager`, the four factories, the outboxes, the scoped
   graphs, invited and paired clouds, the cache clear and the cursor watermark, the config-state log
   and the runtime's `device` store — with their tests, moved as they were. The `data` group of the
   facade and its hooks stay in the React package and read the graph through runtime-core's barrel.
3. **The wiring rule's allowed file is `libs/runtime-core/src/createRuntime.ts`.**
4. **A `layer:foundation` tag** marks logger, config, perf, http, storage and bridge-messages — what the
   core packages and the assembly are built on. runtime-core's allow-list becomes `layer:core-lib` and
   `layer:foundation`, and the foundation's is `layer:foundation` alone: runtime-core's check sees its
   direct dependencies only, so a foundation package that took an untagged one would carry it in.
5. **`@chatic/runtime-core` is closed to apps**, like the core packages: the root lint refuses its
   barrel and its paths everywhere but the runtime packages' own configs, and app-runtime's source
   takes the barrel only. Apps boot it through `initAppRuntime` and read it through `runtime`.

## Alternatives

- **Leave the assembly in the React package, and have the native runtime depend on it.** It would pull
  React, the hooks and the components into a process that renders nothing.
- **Move the hooks too.** A hook is React; runtime-core bans React imports so that the native process
  can run it, and the hooks are the React surface's by definition.
- **Tag the foundation libraries `layer:core-lib`.** Simpler, but `layer:core-lib` bans React imports,
  and `@chatic/config` has a React entry (`config/react`); the foundation is also below the core
  packages, not beside them, and a separate tag says so.
- **Rename `@chatic/app-runtime` in the same change.** The name no longer fits a React-only package, but
  a rename touches every screen's import; it is its own change.

## Consequences

- runtime-core depends on the core packages and the foundation; a new dependency of the assembly has
  to be tagged one of the two, on purpose.
- Tests in app-runtime that mocked an assembly module now name it as `@chatic/runtime-core/<path>`, the
  way they already named the core packages' modules; runtime-core's own tests run in `node`, with a
  `@jest-environment jsdom` docblock where the fixtures play a page.
- The source-scanning guards that keep the refresh and `auth.update` out of the runtime, and import
  cycles out of it, now walk runtime-core and runtime-web as well.
- What still reads a page outside the adapters: app-runtime's `report/` (the bridge's log batch format,
  `isNative()`) and `storage/resolveStorageStores` (the web's choice of stores), and `@chatic/perf`'s
  page-visibility read, which the assembly reaches through the outbox's timing.
