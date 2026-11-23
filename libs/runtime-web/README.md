# @chatic/runtime-web

**The web adapter: the runtime for a web page.** The browser and the desktop shell run the session,
the sockets, sync and the data layer in the page. This package holds the pieces that are true of a page
and of nothing else — the page's stores, its `navigator.onLine`, a socket opened by the page — as the
adapters an app's runtime declaration plugs in.

Every web app starts it from its own declaration of these pieces, in its `src/config/` — see
[The adapters](#the-adapters) and the example under it:

```ts
const started = await startRuntime(declaration); // config, host ports, then the engine
```

No library chooses a page's ports for an app: a choice made here would be made for every app at once and
change only with a build, while a declaration is read by its own app alone (ADR-0343).

| Export                                                    | Does                                                                                                                                                                                    |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createBridgedRuntime(options)`                           | the engine of a page whose phone shell owns the session — see [A page that mirrors its shell](#a-page-that-mirrors-its-shell)                                                           |
| `webMirrorPort(client?)`                                  | the mirror's port over the page's bridge: `RuntimeCall` and `RuntimeSubscribe` (with `RUNTIME_CALL_TIMEOUT_MS`), `RuntimeUnsubscribe` and the two runtime pushes; made before the hello |
| `settleSessionOwner(options)`                             | who holds the session this launch, settled before the entry point boots either runtime — see [A page that mirrors its shell](#a-page-that-mirrors-its-shell)                            |
| `resolveStorageStores(env?)`                              | chooses and builds every store an app keeps state in, for its environment — see [The stores](#the-stores)                                                                               |
| `readStorageEnvironment()`                                | what that choice depends on: in a shell, the shell keeps a vault, a late vault already confirmed                                                                                        |
| `LATE_VAULT_MARK`                                         | the tab mark apps/web writes when a shell turns out to keep a vault only after its handshake                                                                                            |
| `setNativeCacheSupport(report)`                           | the phone shell's cache capability, which the cache routing reads; called by apps/web after the bridge handshake, before the data graph is built                                        |
| `readWebHostFacts(sources?)`                              | `WebHostFacts`: what the page knows about its host, as one frozen value — see [Each port on its own](#each-port-on-its-own)                                                             |
| `resolveCheckoutMethod()` and the other host-port readers | what the shell declared it does, read into the host ports the entry point publishes — see [The host ports a page publishes](#the-host-ports-a-page-publishes)                           |
| `xhrPut`, `createXhrPut()`                                | `@chatic/data`'s `PutPort`, handed to `useSendImages`: the page's own `XMLHttpRequest` PUT — the browser's and the desktop app's sender, and the phone app's for a page file            |

The ports a page fills, whichever adapters its declaration names:

| Port                      | Filled by (`src/`)             | With                                                                                                                                                                             |
| ------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RuntimePorts.transport`  | `webTransportPorts()`          | `navigator.onLine` and the window's online/offline events; `CHATIC_APP_PLATFORM` from `@chatic/bridges`' host profile and `navigator.userAgent`; `new WebSocket(url, protocols)` |
| `RuntimePorts.auth`       | `webAuthPorts()`               | `location.search`; `location.replace('/?<params>')` at the end of a session                                                                                                      |
| `RuntimePorts.foreground` | `webForegroundPorts()`         | `document.visibilityState` and the document's `visibilitychange` event                                                                                                           |
| `RuntimePorts.cache`      | `webLocalCachePorts(cacheTab)` | each cache domain in IndexedDB, in the phone shell's SQLite across the bridge, or in `cacheTab` (a plain tab's invited clouds); see [docs/cache](./docs/cache/README.md)         |

Web, desktop-web, admin and the landing site each start from a declaration
([The adapters](#the-adapters)), where every port is declared, so a forgotten one is a compile error.

### Each port on its own

Every piece an adapter builds is also on the barrel as a factory that builds on its own from what it is
handed — the pieces a runtime assembled from an app's own choices is made of. `resolveStorageStores` and
`webLocalCachePorts` are these factories, chosen for the page; web and desktop-web build their stores
with the first, and the apps' own cache adapters route with the second.

| Port       | Factory (adapter id)                                                        | Handed                                                                                                                        |
| ---------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| transport  | `webTransportPorts(options?)` (`transport.browser`)                         | `appPlatform` reader; the host profile's `CHATIC_APP_PLATFORM` by default                                                     |
| auth       | `webAuthPorts(location?)` (`auth.location`)                                 | the page's `location`                                                                                                         |
| foreground | `webForegroundPorts(source?)` (`foreground.visibility`)                     | a document; the page's own by default                                                                                         |
| storage    | `tabStorageStores(areas)` (`storage.tab`)                                   | the raw `webLocal`/`webSession` stores (`pageStorageAreas()`)                                                                 |
| storage    | `localStorageStores(areas)` (`storage.local`)                               | the same                                                                                                                      |
| storage    | `vaultStorageStores({ ...areas, vault })` (`storage.vault`)                 | the vault (`createShellVault()`), and optionally where plain state goes                                                       |
| cache      | `indexedDbCache(options?)` (`cache.indexeddb`)                              | an IndexedDB connection; the page's one shared connection by default                                                          |
| cache      | `shellSqliteCache({ support, client? })` (`cache.shell-sqlite`)             | the shell's cache report as a reader, and the bridge                                                                          |
| cache      | `webStorageCache({ tab, importFrom })` (`cache.web-storage`)                | the raw tab store, and the store a tab's invited clouds are imported from once                                                |
| cache      | `routedCachePorts({ bridge, support, indexedDb, shellSqlite, webStorage })` | the three stores, the bridge channel, and the report as a reader; routes by the table in [docs/cache](./docs/cache/README.md) |

`readWebHostFacts()` returns the inputs those choices are made from, as one frozen `WebHostFacts`: the
bridge channel, the platform, the storage media, the runtime offer and the capability declaration from
`@chatic/bridges`' host profile. The shell's cache report is not among them: it lands with the
handshake, after the facts were read, so a cache reads it at each decision instead.

`routedCachePorts` takes `shellSqlite` and `webStorage` as optional: a domain routed to a store that was
not handed in stays on IndexedDB, and so does the global search. With all three it routes exactly as
before.

### The adapters

The same factories as values a runtime declaration plugs in (see runtime-client's
[The runtime declaration](../runtime-client/README.md#the-runtime-declaration)). The barrel hands on
`defineRuntime`, `startRuntime`, `requires`, `conflicts`, `defineAdapter` and the declaration types, so a
web app's declaration imports this package alone. Each export is named after its id. `supports` is asked
of `webHostFacts()` (`readWebHostFacts()`, once per start).

| Export                 | Id                      | `supports`                                                    | Builds                                                                                                                                      |
| ---------------------- | ----------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `transportBrowser`     | `transport.browser`     | any page                                                      | `webTransportPorts()`                                                                                                                       |
| `authLocation`         | `auth.location`         | any page                                                      | `webAuthPorts()`                                                                                                                            |
| `foregroundVisibility` | `foreground.visibility` | any page                                                      | `webForegroundPorts()`                                                                                                                      |
| `storageTab`           | `storage.tab`           | any page                                                      | `tabStorageStores(pageStorageAreas())`                                                                                                      |
| `storageLocal`         | `storage.local`         | any page                                                      | `localStorageStores(pageStorageAreas())`                                                                                                    |
| `storageVault`         | `storage.vault`         | a shell that keeps a vault (`nativeSecure` in `storageMedia`) | `vaultStorageStores` over `createShellVault()`, loaded through `prepareSecretStorage` (`?logout=1` heard) unless the shell owns the session |
| `cacheIndexedDb`       | `cache.indexeddb`       | any page                                                      | every domain in IndexedDB                                                                                                                   |
| `cacheWebStorage`      | `cache.web-storage`     | any page                                                      | IndexedDB, plus a plain tab's invited clouds in the storage port's `webSession` — every web app's cache in a browser                        |
| `cacheShellSqlite`     | `cache.shell-sqlite`    | the phone app's bridge                                        | the whole `webLocalCachePorts` table: the shell's SQLite for what it holds, IndexedDB, the storage port's `webSession`                      |

A cache adapter is one set of stores, routed by the one table; the shell's cache report is read at each
decision rather than from the facts, because it lands with the handshake after the facts were read.
Within one start the page's raw web stores are built once, by the storage adapter: the vault's fallback
and the cache's tab rows take that adapter's `webSession` rather than opening their own. Where site data
is blocked each opening is a fresh memory store, so a second one would split the session from the cache's
tab rows — the reason the cache adapters take the storage port's `webSession`.

`storage.vault` loads the vault the way apps/web's entry does, but what that entry does around it — the
late-vault reload and the watch on a vault unreadable at launch — stays the app's. On a launch whose
session the shell owns the page must not open the vault at all, as apps/web's entry never did there:
`engine.mirror` (below) builds no port on such a launch, and a storage built while the engine says the
shell owns the session (`sessionOwner: 'native'` in its context) hands out the stores without loading
the vault. One case is still not covered: a vault the shell confirms only in its handshake, which
apps/web's late-vault mark carries into the next load — `storage.vault`'s `supports` reads the storage
media alone, not the mark.

#### The engine of a page that mirrors its shell

`engineMirror(options?)` is the `engine.mirror` adapter: the choice apps/web's entry made by hand between
`createBridgedRuntime` and its own runtime. It settles who owns the session (`settleSessionOwner`, with
the offer from the facts and `options` — `disabled` is the page's own switch, apps/web's
`VITE_SESSION_MIRROR_DISABLED`) before any port is built, then:

| Settled  | Engine                                                             | Ports built                                         |
| -------- | ------------------------------------------------------------------ | --------------------------------------------------- |
| `native` | the mirror over the bridge (`createBridgedRuntime`)                | none — no stores, sockets or cache, so no vault     |
| `web`    | the core over the declared ports (`core({ sessionOwner: 'web' })`) | every one, `storage` told the page owns the session |
| `null`   | none: `startRuntime` boots nothing                                 | none                                                |

The settle comes back from `startRuntime` as `owner` either way, so the entry point does what is the
app's around it: telling the shell its default owner, showing the unsettled screen with a reload, and
taking its own signed-out keys on a launch the shell owns. Any page: one without an offer settles on
`web` at once, without a word to the shell. `engineCore` (`engine.core`, from runtime-client) is
re-exported beside it for a declaration that lists both.

#### The host port adapters

The host ports join the declaration as adapters too (`host`, all eight or none). Each value is what the
entry points published by hand, read from the facts the start resolved against — the facts carry the
host profile's bridge, platform and capability declaration, and the readers take them as a
`DeclaredHost`.

| Port                                                                   | Adapter (id)                                                   | `supports`                                                                         | Builds                                                                                             |
| ---------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `media`, `files`, `links`, `appShell`, `signIn`, `diagnostics`, `push` | `<port>Adapters(implementations)` → `{ host, shell, browser }` | `host` and `browser` every host; `shell` only where the declaration resolves to it | the app's `shell` or `browser` implementation, given the choice (`appShell` and `signIn` add `os`) |
| `checkout`                                                             | `checkoutFromHost({ store, web })` (`checkout.host`)           | every host                                                                         | the first method the host offers, from the app's implementation, or `none`                         |
| `checkout`                                                             | `checkoutStore(store)` (`checkout.store`)                      | a host that offers a store                                                         | the first store it offers                                                                          |
| `checkout`                                                             | `checkoutWeb(web)` (`checkout.web`)                            | a host that offers the website                                                     | the app's website checkout                                                                         |
| `checkout`                                                             | `checkoutNone` (`checkout.none`)                               | every host                                                                         | `{ kind: 'none' }`                                                                                 |

`host` (`<port>.host`) builds the side the host declared, through the port's reader — the right
default; `shell` (`<port>.shell`) and `browser` (`<port>.browser`) force one side.
`.shell` follows the declaration, so a toggle cannot hand a port to a shell that never said it does the
work. `.browser` runs everywhere because the readers already hold that every host can do what a browser
does; it is what lets a toggle move one port onto the page while the rest stay on the shell.

Every port but checkout carries its work, not only the choice (the contracts are runtime-client's),
and the work is the app's: the shell side talks to the app's own bridge wrapper — apps/web's
`appBridge`, desktop-web's `webClient` requests — and the page side can need the app's own data. So
each `<port>Adapters` (`mediaAdapters`, `filesAdapters`, `linksAdapters`, `appShellAdapters`,
`signInAdapters`, `diagnosticsAdapters`, `pushAdapters`) takes the app's
`ShellOrBrowserImplementations<P>` — `shell(base, facts)` and `browser(base, facts)`, each handed the
choice (`base`, `ShellOrBrowserBase<P>`: `kind`, and `os` for `appShell` and `signIn`) and returning the
whole port — and builds the three adapters from them, calling only the side that was chosen. Each app
defines its own `linksHost`/`linksShell`/`linksBrowser` (and so on) in its `src/config/adapters/`; a
side the host has no use for still exists, because every port names all three (desktop-web's `media`
and `files` give both sides the page's own work).

Checkout's implementations — a store purchase over the app's bridge wrapper, a hand-off to the
website — are app code, so the checkout adapters are built from what the app hands in and create it
only when chosen; a store's rules can forbid sending a buyer to the website, so `checkout.web` needs the
host to offer it (`offeredCheckoutMethods`).

A web app's declaration with all of it — close to what apps/web declares for a page inside a shell
(`apps/web/src/config/webHybrid.ts`):

```ts
// src/config/adapters/links.ts — every other shell-or-browser port the same way
export const {
    host: linksHost,
    shell: linksShell,
    browser: linksBrowser,
} = linksAdapters({
    shell: base => ({ ...base, openUrl: url => appBridge.openURL(url) /* , … every member */ }),
    browser: base => ({ ...base, openUrl: url => window.open(url, '_blank', 'noopener,noreferrer') /* , … */ }),
});

export const web = defineRuntime({
    name: 'web',
    facts: webHostFacts,
    ports: {
        /* storage, transport, auth, cache, foreground */
    },
    host: {
        checkout: {
            default: checkoutFromHost({ store: storeCheckout, web: webCheckout }),
            alternatives: [checkoutWeb(webCheckout), checkoutNone],
        },
        media: { default: mediaHost, alternatives: [mediaShell, mediaBrowser] },
        files: { default: filesHost, alternatives: [filesShell, filesBrowser] },
        links: { default: linksHost, alternatives: [linksShell, linksBrowser] },
        appShell: { default: appShellHost, alternatives: [appShellShell, appShellBrowser] },
        signIn: { default: signInHost },
        diagnostics: { default: diagnosticsHost },
        push: { default: pushHost },
    },
    engine: { default: engineMirror({ disabled: import.meta.env.VITE_SESSION_MIRROR_DISABLED === 'true' }) },
});

const { owner } = await startRuntime(web); // owner: SessionOwnerChoice
```

Every web app starts from a declaration of these adapters. `resolveStorageStores` remains: it makes for
the page the choice of stores, and web and desktop-web build their stores with it and declare over them.
An app's declaration is read by that app alone, and a `port.*` toggle can switch it on one device
(ADR-0343).

### A page that mirrors its shell

On a phone launch whose shell runs the session, the page builds no runtime of its own:
`createBridgedRuntime({ hello, port })` returns runtime-core's mirror engine (`createMirrorEngine`) over
the page's bridge, built from the session the shell's `native` answer to the page's hello carried.
Nothing is wired in the page — no stores, sockets or cache — and every member reaches the shell's
runtime as runtime-core's [docs/bridge](../runtime-core/docs/bridge/README.md#the-pages-half-the-mirror-engine)
describes. It is the counterpart of the core engine (`engine.core`), never built alongside it: one
launch has one owner. The web app builds it through its declaration's `engine.mirror` once `settleSessionOwner` has
settled on the shell (below).

**The port is made before the hello** (`webMirrorPort()`). The shell pushes the session from the moment
it answers, and the mirror exists only after the answer arrives; the port keeps the newest push heard
with no one listening — with the signals of every push before it, so a sign-out in between is not lost —
and hands it to the mirror when it subscribes.

A runtime call or subscribe waits `RUNTIME_CALL_TIMEOUT_MS` (60 s) rather than the bridge's 10 s
default: a call can be a socket round trip or a cloud switch with its own deadline inside the runtime,
and a subscribe the page gave up on would stay open in the shell until the next hello, so this only
catches an answer that never comes.

**Settling who owns the session** — `settleSessionOwner({ offer, disabled })`, awaited before the
entry point boots either runtime:

- No offer it can speak (`readRuntimeOffer`: a browser, a shell that does not run its runtime, an
  offer in none of the page's contracts), or `disabled` — the page's own switch → `web`, at once and
  without a message to the shell. The shell starts its runtime only on a hello, so a page that never
  asks leaves the launch as it always was.
- Except when the offer says `held` (`offerHoldsSession`, bridge 2.35.0): the shell's runtime already
  holds the session in this app process, so the page asks whatever `disabled` says and whatever
  contracts it shares — a mismatch then ends unsettled, not `web`. Logged as `session.owner_held_asked`.
- Otherwise it makes the port (`webMirrorPort`), then says `RuntimeHello` with the page's contracts,
  each wait `SESSION_OWNER_HELLO_TIMEOUT_MS` (10 s — the shell holds a hello up to 5 s while its runtime
  starts). `web` or `NOT_FOUND` → `web`; a complete `native` answer → `native`, with the contract, the
  session and the port for `createBridgedRuntime`.
- Anything else settles nothing (`settleRuntimeHello`) and is asked again after 0.25, 0.5, 1 and then
  every 2 s, for `SESSION_OWNER_GIVE_UP_MS` (30 s). The limit counts only time the page is shown
  (`visibleClock`) — the bridge's own timeouts pause while it is hidden, and a launch sent to the
  background, or one waiting for the device's first unlock, has not been failing meanwhile — and no
  hello outlasts it: the last waits only for what is left, `SESSION_OWNER_LAST_HELLO_MIN_MS` (1 s) at
  the least.
- `RUNTIME_CONTRACT_MISMATCH` — the shell already holds the session under a contract this page does not
  speak — is not asked again: nothing but another page can change it.
- Unsettled, it answers `{ sessionOwner: null }` and logs an error: the page then boots **neither**
  runtime. Booting its own is not a way out — the shell may hold the session, and the page would be a
  second owner — so the entry point shows an error with a reload, which asks the shell again from a
  fresh page.
- **What the page cannot see.** A shell before bridge 2.35.0 (app 0.32.4) offers the same whether or
  not it already holds the session, so a page that does not ask — `disabled`, or one sharing no
  contract with the shell — cannot tell. Reloaded into a process whose shell answered `native` earlier,
  it would boot a second session. With such a shell both take effect from the next app process; a
  newer shell says `held`, and the page asks.

### The stores

`resolveStorageStores()` is the one place an app's stores are chosen and built. An entry point that uses
it (apps/web and apps/desktop-web) calls it once and hands the result out — to its declaration's storage
adapter, which runs `prepareSecretStorage`, to its config ports and its own features — instead of
constructing stores itself. The landing site runs in a browser tab and nowhere else, and admin likewise
declares storage and cache adapters of its own, over the store objects the rest of the app uses.

| environment                 | secret     | plain      | device   | tab        |
| --------------------------- | ---------- | ---------- | -------- | ---------- |
| shell with a vault          | vault      | webLocal   | webLocal | webSession |
| shell from before the vault | webLocal   | webLocal   | webLocal | webSession |
| plain browser tab           | webSession | webSession | webLocal | webSession |

Plain state follows the session: inside a shell it must survive the WebView being relaunched, in a
browser it ends with the tab like the sign-in does. `device` is `localStorage` everywhere; `device` and
`tab` are tolerant, for the features' convenience state, and a cache that must hear a failed write takes
`webSession` instead.

What else still has a browser answer inside a package moves here as its wiring becomes a port:

- `@chatic/auth` — at logout, the tokens a run without the vault left in the tab's `sessionStorage`
  (`WebStore.session()` in `session/relaySession.ts`); a no-op outside a page.
- `@chatic/http` — its own `navigator.onLine` read for failure attribution; it sits below transport,
  so it cannot read the transport's online port.

### The host ports a page publishes

A web app's entry point chooses its host ports — the contracts and the holder are
[runtime-client's](../runtime-client/README.md#the-host-ports) — from what the shell declared before the
page ran (`CHATIC_APP_CAPABILITIES`, read through `@chatic/bridges`' host profile, beside the rest of
`readWebHostFacts`). `src/hostCapabilities/` reads it, one resolver per port, each defaulting to this
page's own profile:

| Reader                                                                                                    | Key, since version                                | Answers                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolveCheckoutMethod`                                                                                   | `checkout`, 1 (`CHECKOUT_INTRODUCED_IN`)          | `'apple' \| 'google' \| 'web' \| 'none'` — the first listed method the page knows; a non-list or nothing known sells nothing                                     |
| `resolveMediaMethod`                                                                                      | `media`, 2 (`MEDIA_INTRODUCED_IN`)                | `'shell' \| 'browser'`                                                                                                                                           |
| `resolveFilesMethod`                                                                                      | `files`, 3 (`FILES_INTRODUCED_IN`)                | `'shell' \| 'browser'`                                                                                                                                           |
| `resolveLinksMethod`, `resolveDiagnosticsMethod`, `resolvePushMethod`, `resolveAppShell`, `resolveSignIn` | their own keys, 4 (`SHELL_DOMAINS_INTRODUCED_IN`) | `'shell' \| 'browser'`; `resolveAppShell` and `resolveSignIn` (`Pick<AppShellPort \| SignInPort, 'kind' \| 'os'>`, the choice alone) add `os` through `hostOsOf` |

Every `'shell' | 'browser'` key goes through `resolveShellOrBrowser`, which holds these rules:

- **No declaration, or one older than the key** — the shell never knew it — answers what the page did
  before ports: the shell wherever there is a bridge. For `checkout` the old rule is a phone store
  (Apple's when `CHATIC_APP_PLATFORM` is `ios`, in any case; Google's otherwise) with a bridge, and the
  website without one.
- **A spelling the phone app already shipped** — `'app'` for `'shell'`, `'page'` for `'browser'`, from
  before the values were renamed — reads as its new name, without a warning. Installed 0.32.x builds
  declare every key that way, and the page they load is always the current deploy, so dropping these
  turns every port on those phones over to the browser. They can go once the phone app's version floor
  is above the last build that declares them; nothing logs them, so the floor is the only signal.
- **A declaration that should hold the key and does not, or holds anything else**, is a bug in the
  shell: the browser does the work, since every host can do what a browser does, and it is logged.
  For `checkout` it sells nothing.
- **`hostOsOf`** reads the phone platform behind a `'shell'` answer from the injected platform, `ios` or
  `android` regardless of case; a desktop shell and a browser have none.

A declaration names the adapters built from these answers ([The host port adapters](#the-host-port-adapters))
and `startRuntime` publishes them (`host` is handed on from runtime-client, with the port types, so the
declaration part imports this package alone). `offeredCheckoutMethods` and `offeredStore` answer every
way the host sells, in its order, for the checkout adapters a toggle may switch to.

## Rules

- Tagged `layer:adapter` and `platform:web`: it may not import `@chatic/runtime` (the React
  surface), React, or React Native. See [the layers](../runtime-core/README.md#layers).
- Nothing in the runtime imports it. An app's declaration and entry point do, and `startRuntime` passes
  what the declared adapters build into the assembly.
- It holds the readers, not their meaning: what an `online` false means for the link, or which
  platform a user agent is, stays in the package that declared the port.
- Its tests run in jsdom, because these are a page's readers (`src/transport.spec.ts`).

## Constraints the adapters keep

- **The platform for a socket comes from the host profile, not the app's device store.** That store is
  filled by a React hook on mount, and the first socket can open before the hook runs.
- **Outside a page the readers answer "fine", never "broken".** Without `navigator` the link reads as
  online (weak evidence, which the link verdict already treats as such), and without a `document` the
  foreground signal says "in front" and never changes: a retry that waits for a return it cannot observe
  would wait forever.
- **A session ends with `location.replace`, not `assign`**, so the history keeps no signed-in entry to
  go back to; the next document's boot reads the `logout=1` it carries.
- **`copyText` rejects where the Clipboard API is missing** (a non-secure context, an old WebView)
  instead of answering `false`, so a caller with its own fallback can tell "no clipboard" from "the copy
  failed".
- **`xhrPut` leaves out the headers a browser owns** (`content-length`, `host`): `XMLHttpRequest`
  refuses to set them and fills them from the request itself, which is the value that was signed.
  Its timeout bounds the whole PUT and scales with size (at least five minutes, otherwise what a 1 Mbps
  uplink needs), so a large video is not cut off halfway and then resent whole into the same limit.
  Progress is wired only when asked. A CORS refusal lands in `onerror` and cannot be told from a dropped
  connection; both get the same retry.
- **Specs that touch IndexedDB install the shim before importing the ports** (the adapter opens a real
  database in its constructor). To get a fresh capability snapshot, use `jest.resetModules` with
  `jest.requireMock`: a dynamic `import()` of a library marks it lazy-loaded and turns every static
  import of it into a module-boundary lint error.
- **The socket lib and `uuid` need two things under jest**: `TextEncoder`/`TextDecoder`, which the shared
  jsdom environment in `tools/jest/` provides (ADR-0371), and a transform for `uuid`, which ships ESM only.
