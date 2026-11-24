# ADR-0376: The runtime is one headless package, a React binding, and platform adapters

> Status: Accepted · Decided: 2026-11-25 · Implemented: not yet — in steps, one pull request each, none of which changes
> behaviour or a bridge message
> · Supersedes decision 4 of [ADR-0343](./0343-each-app-declares-its-runtime-and-libraries-never-choose.md)
> (runtime-client as a package of its own); amends decision 3 of
> [ADR-0346](./0346-every-app-starts-from-a-declaration-and-its-call-part-sees-only-the-runtime.md) (a React
> app's call part takes its hooks from a second package)
> · Scope: `libs/runtime-core`, `libs/runtime-client`, `libs/runtime`, `libs/runtime-web`,
> `libs/runtime-mobile`, new `@chatic/runtime-hybrid-web` and `@chatic/runtime-node`, and every app's
> declaration
> · Amends: [ADR-0301](./0301-the-runtime-splits-into-contracts-assembly-and-platform-adapters-held-by-lint.md)
> decision 1 (runtime-core is no longer a package of its own)
> · Builds on: [ADR-0253](./0253-app-runtime-is-cut-into-layered-modules.md) (layered modules held by a test),
> [ADR-0309](./0309-the-phone-shell-may-own-the-session-settled-per-launch.md) (the phone shell may own the
> session) and [ADR-0363](./0363-a-page-asks-a-shell-whose-runtime-already-holds-the-session.md)
> · Related: [ADR-0375](./0375-platform-implementations-live-in-libs-as-families-of-one-port.md) and
> [ADR-0377](./0377-every-project-carries-a-layer-a-platform-and-a-form-factor-tag-and-folders-group-families.md)

## Context

The runtime is five packages today: `@chatic/runtime-core` (the engine, with no DOM or Node types),
`@chatic/runtime-client` (the engine holder, commands, reads and the declaration API, with no UI library),
`@chatic/runtime` (the React facade every app's call part imports), and the two platform adapters,
`@chatic/runtime-web` and `@chatic/runtime-mobile`. Four things block an app that is not one of today's:

- **No entry without React.** Every one of the roughly 800 imports of `@chatic/runtime` in the apps goes
  through the React facade. A CLI or an MCP server has no package to call.
- **Three entry names.** core, client and runtime split one engine three ways, and the adapters, which need
  only the engine, already import runtime-client as well as runtime-core, so the split between core and client buys nothing a
  consumer uses.
- **All or nothing.** `createRuntime` wires the session, HTTP, sockets, sync and the cache together. A
  service that only needs a session and HTTP calls still opens a socket and a database.
- **No Node platform.** The adapters are `web` and `mobile`.

One more thing is hidden rather than missing. The same web bundle runs in a browser tab and inside a shell,
so the web adapter holds two implementations of most ports — the browser's own and one that asks the
shell — and the choice of where the engine runs (in the web, or in the phone shell's process with the web
as its mirror) is made inside the mirror adapter's code (`settleSessionOwner`) and the cache routing, not
as candidates in the declaration.

## Decision

### 1. One headless package, one binding, one adapter per platform

| Package                      | Holds                                                                                                                        | Layer   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------- |
| `@chatic/runtime`            | the engine, the app API, the declaration API, and the remote link that serves an engine to a mirror or reaches one; no React | runtime |
| `@chatic/runtime-react`      | the hooks and the React host that ties the engine's life to a mount                                                          | binding |
| `@chatic/runtime-web`        | the browser's own implementations; imports nothing from the bridge family                                                    | adapter |
| `@chatic/runtime-hybrid-web` | built on runtime-web: the shell-delegating implementations, the mirror, and the engine position choice (decision 4)          | adapter |
| `@chatic/runtime-mobile`     | the React Native process                                                                                                     | adapter |
| `@chatic/runtime-node`       | Node (new)                                                                                                                   | adapter |

runtime-core and runtime-client merge into `@chatic/runtime`. Inside it, `engine/`, `remote/`, `api/` and
`declare/` keep their direction by a layering test, the way ADR-0253 held app-runtime's modules. The
engine becomes a package of its own only when a consumer that needs the engine alone appears.

Command code everywhere imports `runtime` from `@chatic/runtime`; a React app also imports its hooks from
`@chatic/runtime-react`. The declaration part keeps importing `startRuntime` from its platform's adapter
(the declaration half of ADR-0343 decision 5, unchanged). Today's React facade moves to `@chatic/runtime-react` before the name
`@chatic/runtime` takes the headless meaning, so a hook still imported from the old name fails to compile
instead of resolving to something else.

### 2. Modules are values an app imports

The engine is made of modules, and a declaration lists the ones it turns on:

```ts
import { sessionModule, httpModule } from '@chatic/runtime/modules';
defineRuntime({ modules: [sessionModule(), httpModule()], ports: { storage, auth } });
```

| Module  | Requires ports             | Depends on |
| ------- | -------------------------- | ---------- |
| session | storage · auth             | —          |
| http    | —                          | session    |
| sockets | transport · foreground     | session    |
| sync    | db (its cursor in storage) | sockets    |
| cache   | db                         | session    |
| push    | host push                  | session    |

A missing piece is caught three times: at compile time (a port or a module an enabled module needs), at
`startRuntime` (which fails naming what is missing), and at the call (only the enabled modules' groups
appear in the type, and a call around that throws). Today's apps declare `allModules()`, which is what
they run now. CI boots the full, the headless and the minimal presets in Node.

### 3. The binding is thin, and holds only what two apps share

State and caches live in `@chatic/runtime` behind `subscribe` and `getSnapshot`; React connects through
`useSyncExternalStore`, and a consumer without React uses the runtime directly. The react-query caching
rules now in the facade move down into the runtime step by step.

`@chatic/runtime-react` holds the generic connection (`RuntimeHost` and a few subscription hooks) and the
domain hooks that two or more apps use. A hook or screen state only one app uses stays in that app. A new
capability lands in `@chatic/runtime` first, and one symbol is never sold under two names.

### 4. Inside a shell, the engine's position is a declared candidate list

A web app that also runs inside a shell (`apps/web`, `apps/desktop-web`) declares
`@chatic/runtime-hybrid-web`; a browser-only app that runs the runtime (admin, landing) declares
`@chatic/runtime-web`. The hybrid adapter lists, per port, candidates in order and takes the first whose
`supports()` is true:

```ts
engine:  { default: [shellEngine, localEngine] },
db:      { default: [dbBridge, dbIndexedDb] },
```

`storage` is declared the same way, one candidate list per role slot, and the lists reproduce the
per-environment table in the runtime-web README (a plain browser tab keeps `secret` and `plain` in
`webSession`; a shell with a vault keeps `secret` there).

The engine is chosen once, at start; it does not switch while running. The boot log says which engine ran
and why, and which engine each cache domain went to. The lists reproduce today's choices exactly, so
nothing changes for a person using the app.

The destination is one owner: the shell's engine wherever there is a shell. The web-owned session inside
the phone shell is removed when the oldest supported app version is 0.32.2 or later, a shell
without one is handled by the shell's engine or handed the session after a web sign-in, and the boot log
shows that case is rare enough. Moving every session to the web instead is not an option; it would undo
ADR-0309.

runtime-hybrid-web never imports runtime-mobile. They share only platform-neutral agreements: the bridge
messages, the remote protocol, the bridge-backed database and vault store, and the mini-app protocol.

### 5. Node is a platform

`@chatic/runtime-node` fills the runtime ports on Node: file-backed storage and SQLite, or memory for a
short-lived process. A Node app picks the modules it needs; a push-sending service runs session and HTTP
only.

## Alternatives

- **Today's packages plus a Node adapter** (six packages). Keeps three entry names for one engine, which
  is the confusion a new consumer meets first.
- **A package per role** (nine packages). Splits for consumers that do not exist yet.
- **One headless package with a React subpath export.** Nx tags a package, not a subpath, so the React
  boundary would rest on a hand-kept rule; ADR-0301 rejected this for the same reason.
- **One package for everything.** The platform boundary would be gone.
- **A binding per app.** The facade's hooks and its React host are shared by all four React apps, and a
  hook already exists in three copies; per-app bindings would multiply that.
- **One `runtime-web` that keeps both the browser and the shell implementations.** The choice of where the
  engine runs would stay hidden in code, and a browser-only app would carry the bridge.

## Consequences

- A CLI, an MCP server or a push service imports `@chatic/runtime` and `@chatic/runtime-node` and runs
  without React, the DOM or a socket it does not need.
- Supersedes ADR-0343 decision 4: runtime-client is no longer a package. Its content — the engine holder,
  commands and reads, the declaration API — is part of `@chatic/runtime`. ADR-0346 decision 3 is amended:
  a React app's call part sees `@chatic/runtime` and `@chatic/runtime-react`.
- `@chatic/runtime` changes meaning from the React facade to the headless runtime. The hooks move first,
  so the change shows up as compile errors, not as a different import silently resolving.
- Moving the shell implementations out of runtime-web and switching the web and desktop-web declarations
  to runtime-hybrid-web happen in one pull request.
- Whether "session and HTTP only" runs without the transport is checked against the import graph when the
  runtime is reorganised: today auth imports transport in many places. If it does not, the socket part of
  auth moves into the sockets module.
- The desktop shell has no runtime adapter; inside it, the engine runs in the web. Putting an engine in the
  desktop shell is a later candidate, not part of this decision.
