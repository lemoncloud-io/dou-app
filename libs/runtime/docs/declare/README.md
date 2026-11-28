# The declaration

`src/declare/` is the top folder of `@chatic/runtime` ([layers](../layers/README.md#inside-chaticruntime)):
the runtime declaration an app starts from — `defineRuntime`, `resolvePorts`, `startRuntime` and the
adapter types — and the secret-storage boot step (`sessionStorageBoot.ts`, which hands on the engine's
`prepareSecretStorage`, `hasWebSessionCopy` and `discardWebSessionCopy`). It may import the engine, the
remote connection and the app API; nothing in the package imports it back. It was `declare/` inside
`@chatic/runtime-client`, which now re-exports it with `src/api/` under its old name.

Apps never import it here: an app's entry takes it from `@chatic/runtime-web` or `@chatic/runtime-mobile`,
each of which hands it on beside its own adapters.

Which parts of the runtime a declaration starts — the session, HTTP, sockets, sync, the local cache,
push — is its `modules`, covered in [modules](./modules.md). A declaration that names none starts all
of them.

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
        db: { default: cacheWebStorage, alternatives: [cacheIndexedDb], override: ['local'] },
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
  else, which is every runtime before this slot existed. Web pages that run in a shell add `engine.mirror` (runtime-hybrid-web), a candidate list of `engine.shell` and `engine.local`.
- **`signedOutKeyPrefixes`, `data`** ride along to `createRuntime`. **`config`** (optional) is the
  ports `@chatic/config` is initialised with when the entry leaves that to the start.

### Resolution

`resolvePorts(declaration, facts, read)` is pure. The toggle of each port is the config key
`port.<port>`, read with the row it came from (`config.snapshot` in production). config folds the rows
in its usual order — server enforced, then the device (the shell lane, then the local lane, which a
PROD build takes only after the debug unlock), the server default, a stage rule, the build value, and
the empty floor — and knows nothing of what the id means; everything below is this folder's. For each
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
2. runs the engine adapter, which builds `storage` and then the rest and calls the engine's
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
[console] db → db.indexeddb (local)
[console] db → db.web-storage (default, fell back: local asked for 'db.memory', not one of this runtime's db adapters (db.web-storage, db.indexeddb))
[console] engine → engine.core (default)
```

## Why it works this way

- **One port set per start.** `core()` builds the runtime ports once however often the engine asks, because
  a second set would open a second session over the same stores.
