# ADR-0346: Every app starts from a declaration, and its call part sees only the runtime

> Status: Accepted · Decided: 2026-11-18 · Implemented: `refactor/runtime-facade-and-app-configs`
> · Scope: `libs/runtime` (renamed from `libs/app-runtime`), `libs/runtime-client`, `libs/runtime-web`,
> `libs/runtime-mobile`, `libs/config` (`port.engine`), removed `libs/host`; `apps/web`,
> `apps/desktop-web`, `apps/admin`, `apps/landing`, `apps/mobile`; the root lint config and
> `tools/eslint-rules`
> · The behaviour is documented in
> [libs/runtime-client § The runtime declaration](../../libs/runtime-client/README.md#the-runtime-declaration),
> the facade in [libs/runtime](../../libs/runtime/README.md), the adapters in
> [libs/runtime-web](../../libs/runtime-web/README.md) and
> [libs/runtime-mobile](../../libs/runtime-mobile/README.md), and each app's declaration in its own
> `README.md`
> · Builds on: [ADR-0343](./0343-each-app-declares-its-runtime-and-libraries-never-choose.md) (the
> declaration and its toggles), and carries out its decision 6
> · Supersedes: [ADR-0324](./0324-the-host-declares-what-it-can-do-and-features-reach-it-through-ports.md)
> § 2 and § 3, on where the capability ports live and who chooses them; its § 1, the host profile, stands

## Context

ADR-0343 gave the runtime a declaration: an app names one adapter per port, `startRuntime` resolves
the `port.<x>` toggles against it, and each choice is logged at boot. It moved admin onto it and left
the rest as a plan. Every other app still started the runtime by hand — `createWebRuntime` in the
pages, `createNativeRuntime`/`bootNativeRuntime` in the mobile app — and so a library still chose most
of what each app ran on.

The host's capability ports sat beside that, on their own rules. ADR-0324 put them in `@chatic/host`
and had each app's entry point build them and publish them once (`publishHostPorts`), which features
then read as `host.ports.<x>`. That gave two ways of choosing an implementation for one app: the
runtime ports by declaration and toggle, the host ports by a hand-written function no toggle could
reach. It also gave the call part of an app four packages to import the runtime through —
`@chatic/app-runtime` for hooks, `@chatic/data` for domain names, `@chatic/config` for settings,
`@chatic/host` for the host — each of which also carried things only an entry point should touch.

## Decision

### 1. Every app assembles its runtime from a declaration

Web in a browser, web in the phone shell or the virtual shell, desktop-web, admin, landing and the
mobile app each declare their runtime in `src/config/` and start it from the entry point. Nothing
else in an app names an implementation, and no library builds a runtime for an app any more:
`createWebRuntime`, `createNativeRuntime` and `bootNativeRuntime` are deleted.

apps/web has two declarations, `web-browser` and `web-hybrid`, and the entry picks one once, by whether
the host profile found a shell's bridge at boot. That is the fact the page already told the two hosts
apart by — the stores and config's shell lane were wired by it — so the host is never read a second,
different way.

### 2. The declaration carries the host ports and the engine too

A declaration names, beside the five runtime ports, the eight host ports (`checkout`, `media`, `files`,
`links`, `appShell`, `signIn`, `diagnostics`, `push`) and the engine — `engine.core`, which builds the
page's own runtime, or `engine.mirror`, which first settles with the shell who holds the session and
then mirrors the shell's runtime or builds the page's own. Every slot is chosen by the rules ADR-0343
set for the runtime ports: a `port.<x>` config toggle, the declared candidates, the config lanes a
declaration lets change it, the host's support, the fallback to the default with its reason kept, and
one boot log line per choice. `startRuntime` publishes the host ports before it boots the engine, the
order `publishHostPorts` kept.

So a host port can now be switched on one device without a release, the same way a cache can, and a
report says which implementation of each ran. What the host can do is still only what it declared
(ADR-0324 § 1): a toggle picks among the adapters the host supports, never adds one.

### 3. The call part sees one package, `@chatic/runtime`

`@chatic/app-runtime` is renamed `@chatic/runtime`, the facade. It re-exports the domain names apps
took from `@chatic/data`, and sells settings as `runtime.settings` (forwarding to config) and each host
port as `runtime.<port>`, beside the hooks it already had. A test mocks it with one fake.

### 4. `@chatic/host` is removed, and its pieces go where their readers are

The host port contracts and the holder they are published into move to `@chatic/runtime-client`,
because `startRuntime` publishes them and must not depend on a library of page code. The readers of
the shell's declaration and the host port adapters (`<port>.host`, `<port>.shell`, `<port>.browser`)
move to `@chatic/runtime-web`, beside the other page adapters. An adapter only one app needs —
apps/web's store and website checkouts, its session-owner settle — is the app's own, beside its
declaration.

### 5. Lint holds it

- **The app path rule.** In `apps/web`, `apps/desktop-web`, `apps/admin` and `apps/landing`,
  `@chatic/config`, `@chatic/data`, `@chatic/db`, `@chatic/runtime-web` and `@chatic/runtime-mobile` may
  be imported only from `src/config/**` and the entry point (`src/main.tsx`). Everything else reaches
  them through `@chatic/runtime`. The one other file allowed is `apps/web/src/testing/settings.ts`, a
  test-only helper that wires `config.init` so the tests can seed settings. The rule does not cover the
  React Native app, `apps/mobile`: its runtime host services import `@chatic/runtime-mobile` by design
  (see below).
- **New layer tags.** `layer:bridge` and `layer:ui` join the layer tags ADR-0301 added, with module
  boundary constraints of their own; `@chatic/db` is tagged `layer:adapter`, which is what it is to the
  runtime.
- **The facade's own test** checks that `@chatic/runtime` exports only what it means to — the facade,
  its types and the domain names — so a module cannot slip into the call part's surface unnoticed.
- **One exemption.** The module-boundary rule's lazy-load check skips `@chatic/runtime`. A vitest mock
  factory imports the facade's test fake dynamically, and the check would otherwise report every such
  mock as a lazy load of an eagerly imported module.

## What stayed, and why

- **The mobile session owner keeps its order**: the owner switch, then the build's pin, then the page's
  default, then the stage. It is only logged now, beside the port choices. Moving it into config's
  lanes would put the build's pin below the page and stage defaults, which inverts what a build pin is
  for, and the value has to be settled natively before the page loads, where the page's config does not
  exist yet.
- **`resolveStorageStores` and `webLocalCachePorts` stay** as the app storage adapters of web and
  desktop-web. Where site data is blocked the stores are page memory, and the session, config's session
  lane and the cache's tab rows must share one store object, or the session is invisible to the other
  two. The adapters wrap that one object; the library's own `storage.*` adapters would build a second.
- **landing still starts its runtime lazily**, from the subscription chunk. Its public pages need no
  session, and loading the runtime for them would cost every visitor for the few who subscribe.
- **The mobile app's runtime host services** (`services/runtime/`, the sub WebView bridge) keep using
  `@chatic/runtime-mobile` directly: they are the host that runs the engine for the page, not a call
  part reading one.

## Alternatives

- **Keep `@chatic/host` and its publish function, and declare only the runtime ports.** Two ways of
  choosing for one app, and the host ports would stay out of reach of a toggle and of the boot log.
- **Move the host port contracts into `@chatic/runtime-web`.** The holder has to be reachable by
  `startRuntime` and by the mobile app's bundle, which must not load page code; runtime-client is the
  React-free package both already depend on.
- **Let the call part keep importing `@chatic/config` and `@chatic/data` for what it needs.** Both
  packages also export what only a declaration should touch (`config.init`, for one), and nothing could
  tell a feature's legitimate read from an entry-point call. One facade makes the boundary a path rule.
- **Fold the mobile session owner into config's lanes** like every other choice. Rejected for the order
  and timing reasons above.

## Consequences

- About 1,050 app files changed, most of them import rewrites; reviewing the diff is reviewing the
  mechanical rewrite, the declarations and the lint rule.
- `runtime.push.kind` reads `undefined` before the host ports are published, where `host.ports.push.kind`
  threw. The other ports still throw on a read before the publish; `kind` is a string and cannot.
- Two vitest suites reset modules between tests and so evaluate the whole runtime graph again for each
  test (`useSocketFrameLogStore.spec.ts` in desktop-web, `landing.start.test.ts` in landing); they are
  given 30 s rather than the default 5 s.
- `migrateLegacyPhoneCountry` now runs after the runtime has started, in web and desktop-web, since it
  writes through config, which the start initialises.
- The mobile bundle evaluates `@chatic/runtime-client` at import, since `@chatic/runtime-mobile` hands
  on its start and holder from there.
- Features still branch on a host port's `kind` in places (`'shell'` or `'browser'`). The port says what
  the host can do, but the behaviour behind each answer is not yet inside the port; that is left for
  later.
