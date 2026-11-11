# @chatic/runtime-core

**The runtime's assembly, and what it takes from the platform it runs on.** The session, the
sockets, sync and the data layer run in two places: in the web page for the browser and the desktop
shell, and in the native process for the mobile app. What differs between those places — where the
session is stored, how a socket is opened, what "online" means, where the cache's rows live — comes
into the runtime as a **port**. This package holds the type that lists them all, `RuntimePorts`, and
`createRuntime(config)`, which wires the core packages together from them: the same assembly on every
platform.

```text
libs/runtime-core/src/
├── index.ts            the package barrel — what the React surface reads
├── ports.ts            RuntimePorts, every field required
├── createRuntime.ts    the assembly: every wiring call, in order
├── config/             records the effective settings in the logs at boot
├── storage/            the runtime's own `device` store (the sync cursor watermark)
├── data/               the repository graph — see docs/data/
└── connection/         the connection controller: session → socket slots — see docs/connection/
```

Apps do not import this package — the root lint refuses it, as it refuses the core packages. They boot it through `@chatic/app-runtime`'s `initAppRuntime`,
which is `createRuntime` under the name they know, and read it through `runtime`. The graph's React
hooks stay there too; [docs/data](./docs/data/README.md) covers the graph itself.

The connections live here for the same reason: `createConnectionController` keeps the sockets in line
with the session — the slots, the binders, the background clouds' tokens and receive loops — without
React, and app-runtime's host only starts and stops it ([docs/connection](./docs/connection/README.md)).

## Purpose

A runtime that falls back to a browser's answer when nothing is passed in works everywhere it is
tried in a browser, and in a native process it quietly reads a page's storage that is not there. The
point of collecting the ports in one required type is that leaving one out is a compile error in the
adapter that forgot it, not a fallback discovered on a device.

## Design principles

1. **Every port is required.** `RuntimePorts` has no optional field. `RuntimePortsAreRequired` in
   [`ports.ts`](./src/ports.ts) is a type that stops compiling if one is declared with `?`. A port has
   no neutral default — the only values in reach are one platform's — so there is nothing a default
   could safely be.
2. **The package that uses a port declares it.** `RuntimePorts.storage` is `@chatic/session`'s own
   `SessionStoragePorts` and `RuntimePorts.transport` is `@chatic/transport`'s
   `TransportPlatformPorts` (the online signal, the device, how a socket is opened) and
   `RuntimePorts.auth` is `@chatic/auth`'s `AuthPlatformPorts` (the address, the way home at logout)
   and `RuntimePorts.cache` is `@chatic/data`'s `LocalCachePorts` (where each cache domain lives);
   this package names them, it does not redefine them.
3. **No platform here.** The package compiles without the browser's types or Node's (`lib:
["es2022"]`, `types: []` in `tsconfig.lib.json`), its tests run in jest's `node` environment (a test
   whose fixtures play a page says so with a `@jest-environment jsdom` docblock), and
   it imports neither React nor React Native nor `@chatic/bridges`. One gap: React Native's global
   types (`fetch` among them) still arrive through `@chatic/bridge-messages`, which `@chatic/data`
   imports — globals both runtimes have.
4. **Only the core packages and the foundation below it.** It may depend on a package tagged
   `layer:core-lib` or `layer:foundation` (logger, config, perf, http, storage, bridge-messages) and on
   nothing else — an allow-list, so taking a new dependency means tagging it on purpose.
5. **Process-wide, one per launch.** `createRuntime` wires module singletons and returns nothing; a
   second call replaces the wiring and says so in the log.

## Layers

Each runtime package carries a layer tag in its `package.json` (`"nx": { "tags": [...] }`), and
`@nx/enforce-module-boundaries` in the root `eslint.config.mjs` refuses an import that goes the wrong
way:

```mermaid
flowchart TD
    Apps["apps/* entry points"]
    Surface["@chatic/app-runtime<br/><i>layer:react-surface</i>"]
    Web["@chatic/runtime-web<br/><i>layer:adapter · platform:web</i>"]
    Core["@chatic/runtime-core<br/><i>layer:runtime-core</i>"]
    Libs["session · transport · sync · auth · data<br/><i>layer:core-lib</i>"]
    Found["logger · config · perf · http · storage · bridge-messages<br/><i>layer:foundation</i>"]

    Apps --> Surface
    Apps --> Web
    Surface --> Core
    Surface --> Libs
    Web --> Core
    Core --> Libs
    Core --> Found
    Libs --> Found
```

| Tag                   | May not depend on                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| `layer:core-lib`      | runtime-core, an adapter or the React surface, directly or through another package; React or React Native |
| `layer:runtime-core`  | anything not tagged `layer:core-lib` or `layer:foundation`; React or React Native                         |
| `layer:foundation`    | anything not tagged `layer:foundation` — it knows nothing of the runtime above it                         |
| `layer:adapter`       | the React surface; React                                                                                  |
| `layer:react-surface` | an adapter — which platform fills the ports is the entry point's choice                                   |
| `platform:web`        | React Native                                                                                              |

An adapter is not banned React Native by its layer: the native adapter will be made of React Native
modules, so that is its platform tag's decision.

**No page in the core packages either.** session, transport, sync and auth compile without the DOM's
types, as this package does (Node's stay, for timers, `URL` and `TextEncoder`), and a root lint block
refuses the page's globals — `window`, `document`, `navigator`, `location`, `indexedDB`, `WebSocket`,
`XMLHttpRequest` and the rest of `PAGE_GLOBALS` in `eslint.config.mjs` — in all five, data included.
`@chatic/data` still compiles with the DOM's types: its IndexedDB port is declared in them, until the
IndexedDB assembly moves out of the core. The compiler catches the names only a page has; names React
Native also declares (`WebSocket`, `XMLHttpRequest`, `File`, `fetch`) arrive through
`@chatic/bridge-messages` and type-check, so for those the lint list is the check.

Not enforced yet, because today's code still does it: the core packages import `@chatic/storage` and
`@chatic/http`, `@chatic/app-runtime` imports the core packages directly, and an app may import an
adapter from any file rather than its entry point. Each goes when the code it describes moves.

## The wiring calls

The calls that wire the core packages together — `sessionStores.configure`,
`syncDataGraph.provide` and the rest — are made in one file, `src/createRuntime.ts`, and a workspace
lint rule reports them anywhere else. The catalogue and the allowed file are in the root config; the
rule is [`tools/eslint-rules`](../../tools/eslint-rules/README.md)'s `runtime-wiring-call`.

## How to verify

```bash
node node_modules/.bin/tsc -b libs/runtime-core/tsconfig.json   # includes the required-ports assertion
(cd libs/runtime-core && node ../../node_modules/.bin/jest)
(cd libs/runtime-core && node ../../node_modules/.bin/eslint .)
```

To see a constraint fire, add an import that breaks it — `import 'react'` here, or
`import '@chatic/runtime-web'` in a core package — and lint that package with `npx nx lint`. Running
ESLint by hand reads the project graph Nx last computed, so an indirect dependency added since is only
seen after an `nx` command has run.
