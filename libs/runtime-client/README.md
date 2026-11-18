# @chatic/runtime-client

**The half of the React surface that calls the core.** `@chatic/runtime` is what apps render
against; this package is the part of it that needs no UI library. It holds the engine an app's entry
point hands over, the host ports it publishes, the commands and reads that go through that engine,
the settings' reads and writes, and the plain functions
@chatic/runtime's hooks wrap. No `react`, `react-dom`, `@tanstack/*` or `zustand` — the root lint's
`layer:client` constraint refuses them, and it may depend only on the core packages
(`layer:core-lib`), `@chatic/runtime-core` and the foundation packages.

**Apps never import it.** They reach every name here through `runtime` from `@chatic/runtime`,
which re-exports what its groups sell; the rest is @chatic/runtime's own wiring. The one exception is the
runtime declaration (below), which an app's entry takes from `@chatic/runtime-web` or
`@chatic/runtime-mobile`: each hands it on beside its own adapters.

```text
libs/runtime-client/src/
├── index.ts               the package barrel
├── init.ts                the engine holder: initAppRuntime · runtimeEngine · resetRuntimeEngine (tests)
├── declare/               the runtime declaration: defineRuntime · resolvePorts · startRuntime
├── host/                  the host ports: their contracts, the one holder (host) and its live bindings
├── settings/              the config facade's reads and writes, as runtime.settings sells them
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
device ids — stays in @chatic/runtime and is handed in where it is needed (`submitIssueReport` takes an
`IssueReportOrigin`, `createPairingRequestFlow` takes the page's request). The package compiles
without the DOM's types and its tests run in Node, so nothing here can assume a page.

The barrel also hands on, unchanged, the core's types and constants the hooks use (`RELAY_SLOT`,
`slotKeyOf`, `RELAY_CLOUD_ID`, the image-send helpers of `@chatic/data`, the policy and controller
types of runtime-core), so a hook takes the core through this package alone.

Tests that need an engine hand one over first — `initAppRuntime({ ...coreEngine, session })` with
`coreEngine` from `@chatic/runtime-core/engine` and the fakes under `@chatic/runtime-core/testing/` —
and a test in @chatic/runtime that mocks one of these modules names its file
(`@chatic/runtime-client/data/dataCommands`), so the mock replaces it for every importer.

## The host ports

What the host does for a feature — sell, pick media, move files, take links out, run the frame around
the page, sign in, carry diagnostics, receive push — is one **port** each, chosen once by the app's
entry point from what the shell declared before the page ran. The reasons are ADR-0324's; in short, a
feature never asks which host it is in, only what the port says, so a host that cannot do something
is an implementation that says so rather than a check scattered across screens.

This package holds the two halves that are not a page's:

- **The contracts** (`host/ports.ts`, `host/checkout.ts`): `HostPorts`, one field per port, and each
  port's type. `checkout` is a union — `store` (an app store, with `products()`, `purchase()`,
  `finish()`, `currentPurchases()`, `openManagement()`), `web` (`open(url)`, the website sells) or
  `none`. Every other port carries a choice only, `{ kind: 'shell' | 'browser' }` (`ShellOrBrowser`),
  and `appShell` and `signIn` add `os`, the phone platform behind a `'shell'` answer.
- **The holder** (`host/hostPorts.ts`): `host`, published once by the entry point
  (`host.publish(ports)`) and refused a second time, since a replacement would leave every caller that
  already read a port holding the old one. `host.ports` throws before the publish, naming the missed
  step; `host.isPublished` is for a caller that can do without, such as a crash screen;
  `host.resetForTests()` is for tests.

Beside the holder sit the bindings `@chatic/runtime` sells as `runtime.<port>`: `checkoutPort`,
`mediaPort`, `filesPort`, `linksPort`, `appShellPort`, `signInPort`, `diagnosticsPort` and `pushKind`.
They are module-level `let`s the process's `host` reassigns on every publish and reset, and a
re-export of a `let` is live — so `runtime.checkout` _is_ `host.ports.checkout`, with no getter of the
facade's own. Before the publish each port binding is a stand-in whose every property read throws the
same error `host.ports` does (`then`, `toJSON` and the probes a test runner makes answer `undefined`,
so printing one does not throw over the failure being printed). `pushKind` is a string and cannot
throw, so it is `undefined` until the publish; it joins the push hooks as `runtime.push.kind` because
`runtime.push` was already their group. A `HostFacade` a test makes for itself binds nothing.

`@chatic/runtime-client/host` is the same files without the engine behind the barrel. `@chatic/host`
re-exports from it while that package lasts, so a module that only asks the host what it can do does
not load the runtime to find out — and since the barrel reaches the same files, both see one holder.
Reading the shell's declaration into these ports is a page's job and lives in
[`@chatic/runtime-web`](../runtime-web/README.md#the-host-ports-a-page-publishes). An app names the
adapters that do it in its runtime declaration (below), and `startRuntime` publishes their values into
`host`, once, before the engine boots.

## Settings

`settings/settings.ts` is the config facade as the call part of an app reads and writes it:
`getSetting`, `settingSnapshot`, `settingSnapshots`, `overriddenSettingSnapshots`, `setSetting`,
`clearSetting`, `subscribeSettings` and `isSettingsInitialized`. `@chatic/runtime` sells them as
`runtime.settings` under the facade's own method names (`get`, `snapshot`, `snapshotAll`, …). Each
forwards to the process's one `config` when it is called — not bound at import — so a test that
mocks or spies on `@chatic/config` still reaches them. Wiring the config (`init`, the remote lane) is
the entry point's and is not here.

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
- **Host ports** (`host`, optional as a group) are declared the same way, one slot per port of
  `HostPorts` — `checkout`, `media`, `files`, `links`, `appShell`, `signIn`, `diagnostics`, `push` — each
  with a `default`, `alternatives` and `override`. A host adapter (`HostAdapter<P, Impl, Facts>`,
  `defineHostAdapter`) has the same `id`, `port` and `supports`, and a synchronous `create({ facts })`
  that returns the port's value. All eight are declared or none is: a feature reading a port must find
  an answer, and an app that asks the host nothing (admin, landing) leaves the group out and publishes
  nothing, as before.
- **The engine** (`engine`, optional) is the slot that decides which engine the start builds:
  `{ default, alternatives? }` of engine adapters (`EngineAdapter<Facts, Owner>`, `defineEngineAdapter`).
  Its `create({ facts, core })` may be async and answers `{ engine, owner? }`. `core(options?)` builds the
  declared runtime ports — `storage` first, told `sessionOwner` when the adapter settled who holds the
  session — and the core engine over them, once however often it is called; an engine that mirrors a
  runtime elsewhere never calls it, so none of the page's ports is built. `engine: null` is a launch that
  must boot no runtime at all. Left out, the slot is `engine.core` (`engineCore`): `core()` and nothing
  else, which is every runtime before this slot existed. Web pages add `engine.mirror` (runtime-web).
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

The same rules settle every slot: the five runtime ports (`resolvePorts`), the host ports a declaration
names (`resolveHostPorts`, `undefined` when it names none) and the engine (`resolveEngine`). The
constraints span the runtime ports only. config declares a `port.*` key for the five runtime ports, the
eight host ports and `logSink`; it has no `port.engine` yet, so the engine runs its declared default
until config declares one (a reader handed in through `options.read` can switch it in a test).

### Starting

`startRuntime(declaration, options?)` reads the facts, makes sure config is initialised (it calls
`config.init(declaration.config)` when the declaration carries ports and nothing has initialised config
yet; it never initialises twice; with neither it throws), resolves every slot, and logs one line per
slot. Then, in this order:

1. builds the host ports and publishes them through `host` — before anything else runs, the order entry
   points kept by publishing before they booted the runtime;
2. runs the engine adapter, which builds `storage` and then the rest and calls runtime-core's
   `createRuntime` through `core()` — or builds none of them;
3. hands the engine, if there is one, to `initAppRuntime`.

It returns `{ engine, choices, hostChoices?, engineChoice, facts, owner? }`: `engine` is `null` when the
engine adapter booted none, `choices` are the runtime ports', `hostChoices` the host ports' when declared,
and `owner` whatever the engine adapter settled (who holds the session, for `engine.mirror`), so the entry
point can do what is the app's around it. Every collaborator is swappable through `options` for tests
(`config`, `read`, `createRuntime`, `initEngine`, `publishHost`, `log`).

The lines are logged under `app.runtime_port`, before anything is built, so a port that fails to build
is reported against the adapter it was meant to be:

```text
[console] storage → storage.tab (default)
[console] cache → cache.indexeddb (local)
[console] cache → cache.web-storage (default, fell back: local asked for 'cache.memory', not one of this runtime's cache adapters (cache.web-storage, cache.indexeddb))
[console] engine → engine.core (default)
```
