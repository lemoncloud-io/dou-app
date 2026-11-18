# @chatic/runtime-client

**The half of the React surface that calls the core.** `@chatic/app-runtime` is what apps render
against; this package is the part of it that needs no UI library. It holds the engine an app's entry
point hands over, the commands and reads that go through that engine, and the plain functions
app-runtime's hooks wrap. No `react`, `react-dom`, `@tanstack/*` or `zustand` — the root lint's
`layer:client` constraint refuses them, and it may depend only on the core packages
(`layer:core-lib`), `@chatic/runtime-core` and the foundation packages.

**Apps never import it.** They reach every name here through `runtime` from `@chatic/app-runtime`,
which re-exports what its groups sell; the rest is app-runtime's own wiring. The one exception is the
runtime declaration (below), which an app's entry takes from `@chatic/runtime-web` or
`@chatic/runtime-mobile`: each hands it on beside its own adapters.

```text
libs/runtime-client/src/
├── index.ts               the package barrel
├── init.ts                the engine holder: initAppRuntime · runtimeEngine · resetRuntimeEngine (tests)
├── declare/               the runtime declaration: defineRuntime · resolvePorts · startRuntime
├── sessionStorageBoot.ts  prepareSecretStorage and the web session copy, handed on from runtime-core
├── connection/            the sockets through the engine; the connectivity verdict (deriveConnectivity)
├── data/                  repositories, the cache and its writes through the engine; withCloudHold;
│                          the once-per-cloud name syncs
├── session/               reads, commands, account lookups, the sign-out callbacks, the page's own
│                          device id, the paired-cloud check and the pairing request flow
├── sync/                  the sync engine as the app drives it; primeChatRoom, syncTargetKey
└── diagnostics/           the user's issue report (submitIssueReport) and the log-batch upload
```

What only a page can answer — its host profile, its address, its user agent, the shell's injected
device ids — stays in app-runtime and is handed in where it is needed (`submitIssueReport` takes an
`IssueReportOrigin`, `createPairingRequestFlow` takes the page's request). The package compiles
without the DOM's types and its tests run in Node, so nothing here can assume a page.

The barrel also hands on, unchanged, the core's types and constants the hooks use (`RELAY_SLOT`,
`slotKeyOf`, `RELAY_CLOUD_ID`, the image-send helpers of `@chatic/data`, the policy and controller
types of runtime-core), so a hook takes the core through this package alone.

Tests that need an engine hand one over first — `initAppRuntime({ ...coreEngine, session })` with
`coreEngine` from `@chatic/runtime-core/engine` and the fakes under `@chatic/runtime-core/testing/` —
and a test in app-runtime that mocks one of these modules names its file
(`@chatic/runtime-client/data/dataCommands`), so the mock replaces it for every importer.

## The runtime declaration

An app says which adapter fills each port as a value, in a declaration, and its entry starts the
runtime from it. The declaration (in the app's `src/config/`) and that start are the only code in an
app that names an implementation; everything else uses the runtime it was given. No library chooses
for an app: a choice made in a shared package is made for every app at once and changes only with a
build, while a declaration is read by its own app alone and each of its ports can be switched on one
device by a config toggle (ADR-0343).

```ts
// src/config/console.ts — an illustration; apps/admin/src/config/ is the one in use
import { cacheIndexedDb, cacheWebStorage, defineRuntime /* … */ } from '@chatic/runtime-web';

export const consoleRuntime = defineRuntime({
    name: 'console',
    facts: webHostFacts, // what `supports` is asked about
    ports: {
        storage: { default: storageTab },
        transport: { default: transportBrowser },
        auth: { default: authLocation },
        foreground: { default: foregroundVisibility },
        cache: { default: cacheWebStorage, alternatives: [cacheIndexedDb], override: ['local'] },
    },
    constraints: [],
});

// main.tsx, after config.init(...)
await startRuntime(consoleRuntime);
```

- **An adapter is a typed value** (`Adapter<P, Impl, Facts>`): an `id` (`<port>.<name>`), the `port` it
  fills, an optional `supports(facts)`, and a `create(context)` that builds the port — `storage` from
  the facts, every other port from the facts and the built stores. It may load asynchronously. Its
  `port` is what makes a cache adapter in `storage`, or a native adapter in a page's declaration, a
  compile error.
- **Every port is declared**, with a `default`, the `alternatives` a toggle may switch to, and
  optionally `override`: the config rows allowed to change it (`serverEnforced`, `shell`, `local`,
  `serverDefault`, `stageRule`, `build`; all of them when left out, none when empty).
- **Constraints** are `requires(a, b)` — choosing `a` needs `b` chosen for its port — and
  `conflicts(a, b)`.
- **`signedOutKeyPrefixes`, `data`** ride along to `createRuntime`. **`config`** (optional) is the
  ports `@chatic/config` is initialised with when the entry leaves that to the start.

### Resolution

`resolvePorts(declaration, facts, read)` is pure. The toggle of each port is the config key
`port.<port>`, read with the row it came from (`config.snapshot` in production). config folds the rows
in its usual order — server enforced, then the device (the shell lane, then the local lane, which a
PROD build takes only after the debug unlock), the server default, a stage rule, the build value, and
the empty floor — and knows nothing of what the id means; everything below is this package's. For each
port:

1. The default must support the host; a declaration whose default cannot run here throws
   `RuntimeDeclarationError` before anything is built — a fallback needs somewhere to land.
2. An empty toggle (config's floor), or none at all → the default.
3. Otherwise the id must be the default or a declared alternative, its row allowed by `override`, and
   the adapter's `supports(facts)` true — else the default, with the reason kept on the choice. A build
   value (`VITE_PORT_<PORT>`) reports `default` in config like the empty floor; a non-empty one is
   told apart as the row `build`.

Then the constraints: while one is broken, the involved port a toggle moved off its default goes back
to it (the dependent side first). A constraint the defaults alone break throws.

Ids are only ever looked up among one declaration's candidates — there is no table of every adapter.
A table from id to implementation would hide what an app depends on behind strings, lose the compile
check that an adapter fits its port, and ship every adapter to every app.

A toggle is applied at the next launch: a port is built once, at the start. Settings that tune an
adapter's behaviour are ordinary config keys and apply live, and what the host can do is changed only by
the host's own declaration — a toggle chooses among the adapters the host supports, never adds one.

config declares a `port.*` key for all fourteen ports; the start resolves the five runtime ports
(`storage`, `transport`, `auth`, `cache`, `foreground`). The host's capability ports are still chosen
the way `@chatic/host` describes, in a file of each app's own, and their keys take effect when those
ports join the declaration.

### Starting

`startRuntime(declaration, options?)` reads the facts, makes sure config is initialised (it calls
`config.init(declaration.config)` when the declaration carries ports and nothing has initialised config
yet; it never initialises twice; with neither it throws), resolves the ports, logs one line per port,
builds `storage` and then the rest, calls runtime-core's `createRuntime`, hands the engine to
`initAppRuntime`, and returns `{ engine, choices, facts }`. Every collaborator is swappable through
`options` for tests (`config`, `read`, `createRuntime`, `initEngine`, `log`).

The lines are logged under `app.runtime_port`, before anything is built, so a port that fails to build
is reported against the adapter it was meant to be:

```text
[console] storage → storage.tab (default)
[console] cache → cache.indexeddb (local)
[console] cache → cache.web-storage (default, fell back: local asked for 'cache.memory', not one of this runtime's cache adapters (cache.web-storage, cache.indexeddb))
```
