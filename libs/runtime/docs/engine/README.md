# The engine

**The runtime's assembly, and what it takes from the platform it runs on.** The session, the
sockets, sync and the data layer run in two places: in the web page for the browser and the desktop
shell, and in the native process for the mobile app. What differs between those places — where the
session is stored, how a socket is opened, what "online" means, where the cache's rows live, whether
the app is in front of the user — comes
into the runtime as a **port**. The type that lists them all, `RuntimePorts`, is a contract and lives in
[`@chatic/ports`](../../../contracts/ports/README.md); `src/engine/` re-exports it and holds
`createRuntime(config)`, which wires the core packages together from them: the same assembly on every
platform.

`src/engine/` is the bottom folder of `@chatic/runtime` ([layers](../layers/README.md#inside-chaticruntime)):
it imports no other folder of the package. It was the package `@chatic/runtime-core`, which now only
re-exports `src/engine/` and `src/remote/` under its old name for the consumers that still import it.

```text
libs/runtime/src/engine/
├── index.ts            the folder's barrel — what @chatic/runtime-core re-exports, with remote/'s
├── ports.ts            re-exports RuntimePorts and its every-field-required check from @chatic/ports
├── createRuntime.ts    the assembly: every wiring call, in order; returns the engine
├── engine.ts           RuntimeEngine — what the app API starts its lifecycle work from
├── config/             records the effective settings in the logs at boot
├── storage/            the runtime's own `device` store (the sync cursor watermark)
├── data/               the repository graph — see data.md
├── testing/            fakes for tests that go through the engine (`testing/sessionView`, `testing/sessionCommands`, `testing/connection`) and a host joined to a mirror in one process, through JSON as the bridge carries it (`testing/mirrorLoopback`) — not on the barrel
├── connection/         the connection controller: session → socket slots; the sockets as screens read them — see connection.md
├── session/            the session controller, the two credential guards, the foreground port, the session view, the commands and the secret-storage boot step (`prepareSecretStorage`) — see session.md
├── push/               push device-token registration — see push.md
└── sync/               the sync engine as screens drive it (connection.md), `primeChatRoom` among it — a chat room's baseline and first page (../sync/README.md)
```

The runtime across the bridge — the handshake, the contract version, errors, the shell's host and the
page's mirror engine — is `src/remote/`, one folder up ([docs/remote](../remote/README.md)).

Apps do not import the engine — the root lint refuses `@chatic/runtime-core` and every `@chatic/runtime`
subpath, as it refuses the core packages. A web app starts the runtime from its declaration through
`startRuntime(...)` in `@chatic/runtime-web`, whose adapters fill the page's ports and whose start calls
`createRuntime` and hands the engine it returns to `initAppRuntime(engine)` in `src/api/`; the app reads
the runtime through `runtime`. The graph's React hooks are `@chatic/runtime-react`'s;
[docs/engine/data](./data.md) covers the graph itself. The native process builds it the same way, from the
mobile app's own declaration over `@chatic/runtime-mobile`'s adapters, which fill React Native's ports
(its `docs/runtime/`).

The connections live here for the same reason: `createConnectionController` keeps the sockets in line
with the session — the slots, the binders, the background clouds' tokens and receive loops — without
React, and runtime-react's host only starts and stops it ([docs/engine/connection](./connection.md)).
So does the relay session's own lifecycle: `createSessionController` brings the session up at boot
and keeps a session-less visitor signed in as a guest ([docs/engine/session](./session.md)).

| Document                         | Holds                                                                                                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [data.md](./data.md)             | the repository graph: `DataManager`, the factories, scoped graphs, outboxes, invited and paired clouds; the page's graph and the engine's `data`            |
| [session.md](./session.md)       | the session controller (boot, guest keep-alive), the relay and cloud credential guards, the foreground port they wait on, the session view and the commands |
| [push.md](./push.md)             | push device-token registration: the delegate contract, the once-per-install record, the triggers                                                            |
| [connection.md](./connection.md) | the connection controller: the slots it derives from the session, the two binders, background slots and write holds; the sockets as screens read them       |

## The engine

`createRuntime(config)` wires the core packages and returns a **`RuntimeEngine`** — what the app API
(`src/api/`) starts its lifecycle work from, instead of making it itself:

| Member                                                          | Makes                                                            |
| --------------------------------------------------------------- | ---------------------------------------------------------------- |
| `session`                                                       | the session as screens read it: a snapshot without tokens        |
| `commands`                                                      | what a screen does to the session: sign in and out, switch, pair |
| `connection`                                                    | the sockets as screens read and drive them                       |
| `sync`                                                          | the sync engine as screens drive it: targets and baselines       |
| `data`                                                          | the page's repository graphs, and the work done on them          |
| `sessionController(options)`                                    | the relay session's boot and the guest keep-alive                |
| `connectionController(options)`                                 | the sockets kept in line with the session, the background clouds |
| `relayCredentialGuard(policy)` · `cloudCredentialGuard(policy)` | the two credential guards an app starts with its own policy      |
| `pushRegistration(options)`                                     | push device-token registration                                   |

The engine `createRuntime` returns is the **core engine**: each member makes the core implementation, in
this process. The classes behind it are not on the barrel — only their types are — so `src/api/` can
reach them only through the engine it was handed. A runtime that runs elsewhere (the native process,
with the page mirroring it) supplies the same members backed by that process, and the hooks and hosts
do not know which engine they were given.

`session`, `commands`, `connection`, `sync` and `data` are the members that are not factories: the core engine
keeps one session view over this process's stores ([docs/engine/session](./session.md#the-session-view)),
and every session reader `src/api/` publishes reads through it; `commands` run this process's use cases
([docs/engine/session](./session.md#the-commands)), and every session command `src/api/`
publishes runs through them; `connection` reads and drives this process's socket manager
([docs/engine/connection](./connection.md#the-sockets-as-screens-read-them)) and `sync` its sync
manager, and `src/api/` reaches neither manager any other way; `data` hands over the page's view of
this process's repository graphs, without the token issuers ([docs/engine/data](./data.md#the-pages-graph)).

Everything the app API reads or drives goes through the engine, sending media included: the page
holds the cloud (`data.holdCloud`) and makes the upload and send calls through the engine, and uploads
the bytes itself — see [docs/data](../data/README.md).

## The runtime across the bridge

On the phone the runtime can run in the shell's own process, with the page mirroring it. Which side
owns the session is settled once per launch: the shell offers before the page runs, the page asks in
a handshake before it boots, and the shell decides. The page runs its own runtime only on a refusal
or from a shell that cannot answer; a lost answer means asking again, never a second owner. `src/remote/` holds what both halves are held to: the contract version they negotiate, the
handshake's three steps, and how an error crosses with the fields screens read — or says the installed
app's runtime does not have the method yet. The shell's half is
`createRuntimeBridgeHost` (`src/remote/host.ts`); the page's is `createMirrorEngine`
(`src/remote/mirror/`), an engine with every member the in-process one has, each crossing as the
contract says ([docs/remote](../remote/README.md)). It sits one layer above the engine: it imports
`src/engine/`, and the engine imports nothing of it.

## Purpose

A runtime that falls back to a browser's answer when nothing is passed in works everywhere it is
tried in a browser, and in a native process it quietly reads a page's storage that is not there. The
point of collecting the ports in one required type is that leaving one out is a compile error in the
adapter that forgot it, not a fallback discovered on a device.

## Design principles

1. **Every port is required.** `RuntimePorts` has no optional field. `RuntimePortsAreRequired` in
   [`@chatic/ports`](../../../contracts/ports/src/runtime.ts) is a type that stops compiling if one is declared
   with `?`; [`ports.spec.ts`](../../src/engine/ports.spec.ts) checks it through the engine's re-export. A port has
   no neutral default — the only values in reach are one platform's — so there is nothing a default
   could safely be.
2. **The package that uses a port declares it.** `RuntimePorts.storage` is `@chatic/session`'s own
   `SessionStoragePorts` and `RuntimePorts.transport` is `@chatic/transport`'s
   `TransportPlatformPorts` (the online signal, the device, how a socket is opened) and
   `RuntimePorts.auth` is `@chatic/auth`'s `AuthPlatformPorts` (the address, the way home at logout)
   and `RuntimePorts.cache` is `@chatic/data`'s `LocalCachePorts` (where each cache domain lives);
   `@chatic/ports` names them, it does not redefine them. `RuntimePorts.foreground` (whether the app is
   in front of the user) is `ForegroundSignal`, and the runtime's own `device` store is
   `RuntimeStorePorts`; both are declared in `@chatic/ports` and re-exported here
   (`session/foreground.ts`, `storage/runtimeStores.ts`), because only the runtime reads them.
3. **No platform here.** The folder compiles without the browser's types or Node's (`lib:
["es2022"]`, `types: []` in `libs/runtime/tsconfig.neutral.json`, which `tsc -b libs/runtime/tsconfig.json`
   builds beside the lib), its tests run in jest's `node` environment (a test whose fixtures play a page
   names `tools/jest/jsdom-environment.js` in a docblock), and it imports neither React nor React Native
   nor `@chatic/bridges`. One gap: React Native's global
   types (`fetch` among them) still arrive through `@chatic/bridge-messages`, which `@chatic/data`
   imports, and through `@chatic/ports`, whose store checkout types are `react-native-iap`'s — globals
   both runtimes have.
4. **Only the core packages, the contracts and the foundation below it.** `@chatic/runtime` may depend on a
   package tagged `layer:core-lib`, `layer:contract` (`@chatic/ports`) or `layer:foundation` (logger, config,
   perf, http, storage, bridge-messages) and on nothing else — an allow-list, so taking a new dependency
   means tagging it on purpose. Inside the package the engine imports no other folder
   ([layers](../layers/README.md#inside-chaticruntime)).
5. **Process-wide, one per launch.** `createRuntime` wires module singletons and returns the core
   engine; a second call replaces the wiring and says so in the log.

## Imports

Production code reaches `@chatic/session`, `-transport`, `-sync` and `-auth` through their barrels
only; `libs/runtime/eslint.config.mjs` repeats the root's ban for its own files, because a block
here replaces the root's list and every ban kept has to be stated again. `@chatic/data`'s inner paths
are closed to tests as well. A test may name a file of the other four, so that a mock replaces the
module for every importer, the owning package's own modules included.

## The wiring calls

The calls that wire the core packages together — `sessionStores.configure`,
`syncDataGraph.provide` and the rest — are made in one file, `src/engine/createRuntime.ts`, and a workspace
lint rule reports them anywhere else. The catalogue and the allowed file are in the root config; the
rule is [`tools/eslint-rules`](../../../../tools/eslint-rules/README.md)'s `runtime-wiring-call`.

`createRuntime` is called once per launch, from the app's entry point, and where it sits matters:

- **After the app's log wiring.** The call can log — a second call warns, and a policy registered
  after the data runtime exists is ignored with a warning — so the log listeners have to exist first.
- **Before anything that reads the session.** Reading a platform port or a session store before the
  call throws an error that names `createRuntime`, on purpose: a missing wiring is a loud failure, not
  a read against an empty host.
- **Inside it, in this order.** The platform ports and stores first, so nothing below reads an
  unconfigured one. Then the leftovers an older build kept in web storage, the signed-out key prefixes
  and the `?logout=1` sweep — first among the readers, because everything after may read a token, and
  this drops the ones of the account that just signed out. Then the pending sync-cursor reset, before
  any repository exists to read a cursor. Then the credential recovery, the data policy and the graph
  accessors handed to the auth and sync layers, and last the config state log.
- **Credential recovery is wired here, not in a module of its own.** Every HTTP route recovers the
  same way, `credentialRenewers.relay.renew()`, because the relay credential is the only one that
  signs; the cloud credential is re-issued by the guard that watches the cloud socket
  ([docs/engine/session](./session.md#the-credential-guards)), not by HTTP. The wiring joins the
  HTTP registry to the socket renewers, which deliberately import nothing of each other, so no package
  owns it and the composition root does.
- **The graph is handed down as accessors.** The auth use cases and the sync plans read the repository
  graph but sit below where it is assembled, so they get a function, and the graph is still built on
  first access.
- **A second call replaces the wiring, never stacks it** — assignment, not accumulation — and says so
  in the log, since it means two entry paths believe they own the boot.

### The config state log

`attachConfigStateLog` (`src/engine/config/configStateLog.ts`, the last step of `createRuntime`) leaves this
device's effective settings in the logs. It records **changes, not state**: stamping the settings on
every entry would repeat the same few pairs on every batch. So there is one line at boot, listing
every key some lane decided, and one line per key afterwards whenever its resolved value moves,
naming the row that won. A collector replays them to know the state at any moment.

- **An empty boot line is the useful case.** It says nothing on this device explains the bug.
- **Only overridden keys count** (`isOverridden`: a shell, local-storage or server row supplied the value). A value a stage or platform rule chose is not news — `system.overridesUnlocked` is off on every production device by declaration, so counting it would fill every boot line.
- **`debug.entryCode` is the one excluded key.** The registry holds settings, not identity, so there is nothing else to redact; the entry code is a credential and the log is read by the team.
- **It lives here because `@chatic/config` imports nothing** and so cannot reach a logger, while every app that boots the config registry also calls `createRuntime`. The subscription is held at module scope, so a second attach (HMR, a double boot) replaces it instead of doubling every line.

## How to verify

The engine is checked with the rest of `@chatic/runtime` — see [its README](../../README.md#how-to-verify).
`tsc -b libs/runtime/tsconfig.json` includes the required-ports assertion and the no-platform build of
`tsconfig.neutral.json`, and `src/layering.test.ts` fails on an engine file that imports another folder.

Jest runs in the `node` environment. A test that opts into jsdom names the shared environment by path,
which provides the `TextEncoder` / `TextDecoder` the socket library touches at import time (ADR-0371).

To see a constraint fire, add an import that breaks it — `import 'react'` here, or
`import '@chatic/runtime-web'` in a core package — and lint that package with `npx nx lint`. Running
ESLint by hand reads the project graph Nx last computed, so an indirect dependency added since is only
seen after an `nx` command has run.
