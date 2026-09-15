# service — the execution boundary

`src/app/services` is where domain behaviour runs. A webview handler, a native screen, or a debug
screen calls into a service; none of them implement behaviour themselves. This is the layer
[the app README](../README.md#design-principles) means by "services are the execution boundary, and
they look only downward" — `services/` imports nothing from `webview/` or `features/`.

## Layout

19 domains, each shaped the same way:

```text
services/<domain>/
├── types.ts        the interface(s) — the contract other layers depend on
├── <Domain>Service.ts
└── index.ts        export * from './types'; export * from './<Domain>Service'
```

`cache/` is the exception with a domain to itself: `CacheCrudService`, `CacheSearchService` and
`TestRecordService` share one directory because they share the same SQLite data sources.
`services/provider.ts` assembles every instance; `services/index.ts` re-exports the domains and the
commonly used singletons. Confirm the count and the shape together:

```bash
ls apps/mobile/src/app/services | grep -v '\.ts$'
```

## Responsibilities

A service owns business behaviour, storage access, and retry/recovery policy for anything
long-running. It decides _what_ happens for a given call. It does not decide how a WebView message
is framed, what the reply payload looks like, or how a native screen renders — those stay in
`webview/` and `features/`.

## The shared contract

`provider.ts` is a singleton `DependencyProvider` with two constructions:

- **Eager**, built in the constructor, for anything the cold-start path reads before the first
  render: `logService`, `logUploadQueueService`, `keyValueStorage`, `bootMetricsService`,
  `notificationService`, `pushEventManager`, `deeplinkManager`, `deeplinkService`,
  `firebaseCrashlyticsService`, `pendingReportQueueService`. `logService` is constructed first —
  most other services take it as their first constructor argument — and `bootMetricsService` right
  after, so its boot-timeline baseline sits as close to JS entry as possible.
- **Lazy**, behind a memoized getter, for everything else: `sqliteDatabase` and the SQLite-backed
  data sources, `cacheCrudService`, `cacheSearchService`, `uploadService`, `testRecordService`,
  `deviceService`, `clipboardService`, `smsService`, `permissionService`, `oauthService`,
  `dynamicAppIconService`, `firebaseInstallationService`, `subscriptionIapService`,
  `preferenceService`, `configKvService`, `versionService`, `unfurlService`. `sqliteDatabase` opens
  on the first read of any lazy getter that needs it, not at boot — see
  [boot-optimization.md](./boot-optimization.md) section 4.4, which this split exists to satisfy.

`services/index.ts` re-exports every domain's barrel plus the commonly used singletons — but not the
SQLite-backed ones. A module-level `export const x = provider.x` for those would invoke the lazy
getter at barrel load, which happens during boot, defeating the split above. Consumers read
`provider.cacheCrudService` (etc.) at the point of use instead. `useServices()` (in
[`hooks/useServices.ts`](../src/app/hooks/useServices.ts)) mirrors the same split for React
consumers: it exposes every eager and non-SQLite lazy service, and omits the SQLite-backed ones for
the identical reason — it runs during `MainScreen` render, before the WebView starts loading.

`@chatic/config`'s shell lane is the one domain with no domain-named service: `configKvService`
(`ConfigKvService`) is a generic, meaning-blind key-value store that `@chatic/config` writes and
reads through, and this app never imports `@chatic/config` directly — the library name appears only
in a comment on `configKvService`.

## Usage

### Adding a service

1. Define the interface in `services/<domain>/types.ts` first — this is the contract a handler or
   another service depends on, and it should be readable without opening the implementation.
2. Implement the class in `services/<domain>/<Domain>Service.ts`, injecting `logService` and any
   other dependency through the constructor rather than importing a singleton directly.
3. Re-export both from `services/<domain>/index.ts`.
4. Register the instance in `services/provider.ts` — eager only if boot-critical, lazy otherwise —
   and re-export it from `services/index.ts` unless it is SQLite-backed.
5. Consume it via `useServices()` in a component, or `provider.<name>` at the point of use in a
   webview handler.

### What not to do

- Do not import from `webview/` or `features/` inside `services/`. That import direction is the one
  rule this layer exists to hold; a service that reaches up into a handler becomes callable only
  from a WebView message, and untestable without one. Confirm with:

    ```bash
    grep -rn "from '.*webview" apps/mobile/src/app/services
    grep -rn "from '.*features" apps/mobile/src/app/services
    ```

    Both print nothing today.

- Do not add a second eager singleton for something `provider.ts` already builds — `sqliteDatabase`,
  `cacheCrudService` and the rest are lazy specifically so a second construction cannot happen; a new
  call site should read the existing getter, not `new` the class again.
- Do not put retry, recovery, or "what counts as done" logic in a `bridge/` wrapper or a webview
  handler. `uploadService` owns upload lifecycle orchestration for this reason — the native bridge
  only carries bytes and progress events across the boundary.

## Notes for implementers and tests

- A service takes its dependencies as constructor arguments, never as bare imports of the singleton
  instances — this is what lets a spec construct one with a fake `logService` instead of pulling in
  the entire provider.
- `provider.ts` is a true singleton (`DependencyProvider.getInstance()`); a spec that needs a fresh
  provider state has to construct the service under test directly rather than going through
  `provider`.
- Jest does not type-check; `apps/mobile/tsconfig.json` excludes every `*.test.ts(x)` from the
  project it references (see [the app README](../README.md#how-to-verify)). A service spec with a
  broken fixture surfaces as "`... is not a function`" at runtime, not as a compile error.

## Further reading

- [native-module.md](./native-module.md) — the bridge layer a service calls into for anything the OS
  has to do.
- [cache.md](./cache.md) — `CacheCrudService`/`CacheSearchService` and the SQLite data sources behind
  them, this domain's largest.
- [boot-optimization.md](./boot-optimization.md) — why the split between eager and lazy exists.
