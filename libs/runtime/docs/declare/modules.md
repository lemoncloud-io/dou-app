# Modules

A runtime is built from **modules**, and a module is a value the declaration imports. The engine wires
the modules it is given and nothing else, so an app that needs only the session and HTTP — a service
that sends pushes, say — starts without sockets, sync or a local cache, and needs no transport, cache
or foreground port.

```ts
import { defineRuntime, httpModule, sessionModule } from '@chatic/runtime-web'; // or /runtime-mobile

export const pusherRuntime = defineRuntime({
    name: 'pusher',
    facts: () => ({}),
    modules: [sessionModule(), httpModule()],
    ports: { storage: { default: storageTab }, auth: { default: authLocation } },
});
```

A declaration that names no `modules` gets `allModules()`, which is the wiring every app had before
modules existed.

## The modules

| Module    | Value             | Ports it needs             | Modules it needs | What it wires                                                                                   |
| --------- | ----------------- | -------------------------- | ---------------- | ----------------------------------------------------------------------------------------------- |
| `session` | `sessionModule()` | `storage` · `auth`         | —                | the session stores, the sign-out sweep, the session view and reads (commands need the graph)    |
| `http`    | `httpModule()`    | —                          | `session`        | credential recovery for HTTP: a refused HTTP call asks the relay renewer for a fresh credential |
| `sockets` | `socketsModule()` | `transport` · `foreground` | `session`        | the connection, its controller, the session controller and the two credential guards            |
| `sync`    | `syncModule()`    | `cache`                    | `sockets`        | the sync data graph and the pending sync-cursor reset                                           |
| `cache`   | `cacheModule()`   | `cache`                    | `session`        | the local cache ports                                                                           |
| `push`    | `pushModule()`    | `foreground`               | `session`        | device-token registration                                                                       |

`push` needs `foreground` because the engine's push registration re-registers when the app returns
to the foreground; the host's push port is read by the app API at call time, not by the engine.

The **repository graph** — `engine.data`, the `data` and `report` groups, and the auth repository the
sign-in use cases and session commands read — builds socket, local-cache and HTTP data sources together. It is wired when `sockets` and
`http` are on and the `cache` port is given (by `sync` or `cache`). Without it, a call that reaches the
graph throws, naming what is missing. The relay renewer refreshes a credential over the relay socket,
so with `http` and no `sockets` a refused HTTP call is not recovered: the renewer answers `false`.

## Presets

| Preset              | Modules                                        | Ports                         |
| ------------------- | ---------------------------------------------- | ----------------------------- |
| `allModules()`      | session · http · sockets · sync · cache · push | all five                      |
| `headlessModules()` | session · http · sockets · sync                | all five (sync needs `cache`) |
| `minimalModules()`  | session · http                                 | `storage` · `auth`            |

[`src/modules/presets.test.ts`](../../src/modules/presets.test.ts) boots all three in Node with the
real engine, and checks the declaration-time and type-level rules below.

## Three checks

1. **Compile time.** `defineRuntime` infers the module tuple when no type argument is given. A caller
   that names `Facts` explicitly (`defineRuntime<WebHostFacts, SessionOwnerChoice>(…)`) or annotates the
   result as `RuntimeDeclaration<Facts>` gets the default module type, so it must name the modules as
   the third type argument (`ReturnType<typeof minimalModules>`) for these checks to apply; without it,
   every port is required and the dependency check is left to `startRuntime`. `ports` requires exactly the ports the
   modules need and makes the rest optional, and `modules` refuses a tuple that leaves out a module
   one of its members depends on, or leaves out `session`. The started runtime's `runtime` handle has
   only the groups whose modules are on (`RuntimeOf<M>`).
2. **`startRuntime`.** It checks again before resolving a port, because a declaration can be built
   without `defineRuntime`, and fails with `RuntimeDeclarationError` listing every gap — "the 'sync'
   module needs the 'sockets' module", "the 'sync' module needs the 'cache' port". It then resolves,
   logs and creates only the ports the modules need, in the usual order.
3. **The call.** `createRuntime` configures a port no module needs with a stand-in that throws on use,
   naming the module it belongs to, and replaces the engine members of a module that is off the same
   way. On the `runtime` handle a group that is off is not enumerable and throws when read; `'push' in
runtime` is still `true`, so use `started.modules` to ask whether a group is there. The
   process-wide `runtime` facade keeps every group; a call through it into an off module throws at the
   engine member or the port.

With every module on, `createRuntime` returns the very same engine object it always did, and
`startRuntime` hands `createRuntime` the same arguments as before when the declaration names no
`modules`.

## Where it lives

`src/engine/modules.ts` holds the values, the presets and the gap check; `src/engine/moduleWiring.ts`
maps engine members and ports to their modules; `src/declare/types.ts` holds the declaration's types
and `RuntimeOf`; `src/declare/runtimeHandle.ts` builds the handle. `@chatic/runtime/modules`
re-exports the values for the packages built on this one, and `@chatic/runtime-web` and
`@chatic/runtime-mobile` hand them on to an app's declaration.

`@chatic/runtime-mobile`'s `runNativeRuntime` starts the session and connection controllers, both
credential guards, sync and — when given a push delegate — push registration, so it runs only on a
runtime with every module on. A mobile declaration that names fewer modules has to start its engine
with its own runner.
