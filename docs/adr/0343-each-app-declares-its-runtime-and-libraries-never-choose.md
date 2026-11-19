# ADR-0343: Each app declares its runtime, and libraries never choose

> Status: Accepted · Decided: 2026-11-18 · Implemented: `refactor/runtime-client-and-adapters`
> · Scope: new `libs/runtime-client`; `libs/runtime`, `libs/runtime-web`, `libs/runtime-mobile`,
> `libs/config` (the `port.*` keys), the root lint config, and `apps/admin` as the first app on a
> declaration
> · The behaviour is documented in
> [libs/runtime-client § The runtime declaration](../../libs/runtime-client/README.md#the-runtime-declaration),
> the adapters in [libs/runtime-web](../../libs/runtime-web/README.md#the-adapters) and
> [libs/runtime-mobile](../../libs/runtime-mobile/README.md#the-adapters), the toggles in
> [libs/config docs/registry](../../libs/config/docs/registry/README.md#port-choices--port)
> · Builds on: [ADR-0301](./0301-the-runtime-splits-into-contracts-assembly-and-platform-adapters-held-by-lint.md)
> (contracts, assembly and adapters) and
> [ADR-0324](./0324-the-host-declares-what-it-can-do-and-features-reach-it-through-ports.md) (the host
> profile and capability ports); plans to move ADR-0324's ports, see decision 6

## Context

The same web code runs as seven apps: the web in a browser, the web inside the phone shell, the
virtual shell, desktop-web, admin, landing, and — for the session — the mobile app's own process.
Each needs a different answer for the runtime's ports: where the session is kept, which cache the
rows land in, which socket opens.

Those answers are chosen inside libraries today. `createWebRuntime` fills every port of a page
itself, and `resolveStorageStores` sniffs the environment (a bridge, a vault, the late-vault mark) to
pick the stores. An app cannot see what it runs on without reading two libraries, cannot change one
port without changing the library for every app, and a developer who wants to try another cache on
one device has no lever but a build.

ADR-0301 already split contracts (`RuntimePorts`) from the assembly and the platform adapters, and
ADR-0324 made the host declare what it can do. What was missing is the step between them: who picks
an implementation for a port, and how that pick is changed without a release.

## Decision

### 1. An app has two parts, and only one of them chooses

Every app composes its own environment. It has a **declaration part** — `src/config/` and the
entry point's `startRuntime(declaration)` — and a **call part**, which is everything else. The
declaration part is the only code that names an implementation; the call part only uses the
runtime it was given.

Libraries hold contracts and implementations and never choose between them. `createWebRuntime`
filling the ports and `resolveStorageStores` sniffing the environment are exactly what moves out of
them, into each app's declaration.

### 2. An adapter is a typed value, not a string id

An adapter is a value: an id, the port it fills, an optional `supports(facts)`, and a `create` that
builds the port. A declaration imports adapter values and names, per port, a default, the
alternatives a toggle may switch to, and which config rows may change it. Constraints between ports
(`requires`, `conflicts`) are declared beside them.

An id (`<port>.<adapter>`, such as `cache.indexeddb`) exists only as data a toggle points at, and it
is looked up among that one declaration's candidates. Because each adapter carries its port in its
type, a cache adapter given to `storage`, or a native adapter in a page's declaration, does not
compile. An adapter only one app needs is defined in that app, beside its declaration.

### 3. Choices are toggles in config, and the start applies them

Each port has a config key, `port.<port>`. Empty means "the declaration's default". The value is
resolved by config's existing order, unchanged: server-enforced, then the device (the shell lane,
then the local lane, which a PROD build honours only after the debug unlock), then the server
default, the stage rule, a build value (`VITE_PORT_<PORT>`), and the empty floor.

`@chatic/config` stores and resolves the value and nothing more. It knows no port's meaning, no
adapter and no host: it is the package almost everything depends on, and it imports nothing. Its
only check is a pattern that rejects an id no port could have.

Everything else is `startRuntime`'s, in runtime-client: checking the id against the declaration,
asking the adapter whether this host supports it, the cross-port constraints, and falling back to
the default with the reason kept. Each port's choice is logged once at boot with the row it came
from, so a report shows which adapters a device actually ran.

Three kinds of change, three timings. A toggle that swaps an adapter applies at the next launch,
because a port is built once. A setting that tunes behaviour inside an adapter stays an ordinary
config key and applies live, as such keys already do. What the host can do is changed only by the
host's own declaration; a toggle can pick among the adapters the host supports, never add one.

### 4. runtime-client is the half of app-runtime that needs no UI library

`@chatic/app-runtime` splits along one seam. The new `@chatic/runtime-client` (`layer:client`, no
React, react-query or zustand) holds the engine holder, the commands and reads that go through the
engine, the issue report and log upload, and the declaration API (`defineRuntime`, `resolvePorts`,
`startRuntime`). app-runtime keeps the hooks and hosts, and its public surface is unchanged.
runtime-core's code is unchanged; only its README describes the new layer.

The declaration API has to be reachable from an app's entry without React, and the start has to
hand the engine to the same holder the hooks read. Putting both in one React-free package meets
both, and lets the mobile app use the start without pulling in the React surface.

### 5. The declaration part imports from its platform's package

A web app's declaration part imports from `@chatic/runtime-web`, the mobile app's from
`@chatic/runtime-mobile`. Each re-exports `defineRuntime` and `startRuntime` beside its own
adapters, so a declaration imports one package. The call part will import only the facade,
`@chatic/runtime` — the name app-runtime takes in a later change.

### 6. Scope, and what follows

This change: the libraries, and admin as the first app that starts from a declaration. The other
apps keep `createWebRuntime` and `createNativeRuntime`, which stay for them.

Next, as a plan: every other app moves to a declaration; `@chatic/app-runtime` is renamed
`@chatic/runtime`; the host's capability ports (`checkout`, `media`, `files`, `links`, `appShell`,
`signIn`, `diagnostics`, `push`) become ports of the declaration, and `@chatic/host` goes away. That
last step will supersede ADR-0324 § 2 and § 3 on where the ports live and who chooses them; the host
profile of § 1 is unaffected. A lint rule will then keep adapter packages out of the call part.

## Alternatives

- **A central table from id to implementation.** One map every app looks adapters up in. It is a
  service locator: it hides what an app depends on behind strings, loses the compile check that an
  adapter fits its port, defeats tree shaking (every adapter ships to every app), and turns the
  facade into a module that knows every platform.
- **One package with `/web` and `/mobile` subpath entries** instead of re-exports from the two
  adapter packages. Measured to work in TypeScript, jest, vitest, Vite and Metro. It needs a tsconfig
  per entry and a jest mapper line in every app, and Nx tags apply to a package, not an entry, so the
  web/React Native separation would rest on a hand-kept lint rule instead of the existing
  `platform:web` and `platform:native` tags.
- **Let config know the adapters** (an `enum` per port listing them). config would then depend on
  every platform's list, the opposite of what keeps it importable from everywhere.
- **Keep choosing inside the libraries, and add parameters.** Each new parameter is one more
  environment check in a shared library, and nothing outside the build could change the answer.

## Consequences

- A port's implementation can be switched on one device, from the server or the debug panel, without
  a release, and the boot log says which one ran and why.
- One more package, `@chatic/runtime-client`, with its own layer tag. app-runtime's tests that mock a
  moved module now name it by its runtime-client path.
- Two ways to boot exist until every app has moved: `createWebRuntime`/`createNativeRuntime` and
  `startRuntime`. The adapters wrap the same per-port factories the old builders use, so the two
  paths differ in who chooses, not in what is built.
- `startRuntime` is async, because an adapter may load (the vault does), so an entry point awaits it
  before render.
- config declares a `port.*` key for all fourteen ports, but the start resolves the five runtime
  ports today. The other nine keys take effect when those ports move into declarations.
