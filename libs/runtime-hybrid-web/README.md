# @chatic/runtime-hybrid-web

**The web adapter for a page that also runs inside a shell.** apps/web and apps/desktop-web ship one bundle
that loads in a browser tab, in the phone app's WebView and in the desktop app. This package sits on
[`@chatic/runtime-web`](../runtime-web/README.md) — it re-exports all of it — and adds what talks to a
shell: the mirror of a shell that owns the session, the vault, the phone app's SQLite cache, the host
capability readers and the shell side of every host port. A browser-only app (admin, landing) declares
runtime-web and carries none of it (ADR-0376 decision 4).

Inside a shell, where each piece runs is **chosen from candidates the declaration lists**, in order, and
the boot log says which won and why. The lists reproduce the choices the page made before they were
written down, so nothing changes for a person using the app.

| Slot              | Candidates, in order                                                                                | Chosen by                   |
| ----------------- | --------------------------------------------------------------------------------------------------- | --------------------------- |
| engine            | `engine.shell` (the mirror), `engine.local` (the page)                                              | `engineCandidates`          |
| storage `secret`  | `vault`, `webLocal` (in a shell), `webSession`                                                      | `STORAGE_CANDIDATES.secret` |
| storage `plain`   | `webLocal` (in a shell), `webSession`                                                               | `STORAGE_CANDIDATES.plain`  |
| cache, per domain | `native` (the phone app's SQLite), `web` (IndexedDB); `invitecloud` first tries `session` (the tab) | `CACHE_DOMAIN_CANDIDATES`   |

```ts
// apps/web/src/config/adapters/engine.ts
export const engineMirrorRecorded = (disabled: boolean) =>
    engineCandidates('engine.mirror', [engineShell({ disabled, settle: settleAndRecordOwner }), engineLocal]);
```

The engine is chosen once, at start; it never switches while running. Every choice is one `info` line
under `app.runtime_port`, beside the declaration's own `port → adapter` lines:

| Where                                   | Boot-log line                                                                                                                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| browser tab                             | apps/web declares `web-browser` there (`engine → engine.core`), so no engine line; `storage.secret → webSession`, cache domains `→ web`, `invitecloud → session` (no shell)                                               |
| phone shell, the shell owns the session | `[hybrid] engine → engine.shell (the shell holds the session (contract N))`; the storage lines still appear, since apps/web chooses its stores before the owner is settled; no cache line, since the page builds no ports |
| phone shell, the page owns the session  | `[hybrid] engine → engine.local (… not engine.shell: the shell left the session to the page)`, `storage.secret → vault`, cache domains `→ native` where the shell holds them (bridge react-native-webview)                |
| desktop shell                           | desktop-web declares `engine.core`, so no engine line; `storage.secret → vault` or `webLocal`, cache domains `→ web` (bridge message-handler)                                                                             |

`chooseCandidate` and `logHybridChoice` are exported for a declaration that lists candidates of its own.
`webHostFacts`, `transportBrowser`, `cacheWebStorage`, `webLocalCachePorts`, `webPlatform` and
`startRuntime` are this package's own: the same names as runtime-web's, reading the host profile where
runtime-web's answer for a browser.

| Export                                                    | Does                                                                                                                                                                                    |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createBridgedRuntime(options)`                           | the engine of a page whose phone shell owns the session — see [A page that mirrors its shell](#a-page-that-mirrors-its-shell)                                                           |
| `webMirrorPort(client?)`                                  | the mirror's port over the page's bridge: `RuntimeCall` and `RuntimeSubscribe` (with `RUNTIME_CALL_TIMEOUT_MS`), `RuntimeUnsubscribe` and the two runtime pushes; made before the hello |
| `settleSessionOwner(options)`                             | who holds the session this launch, settled before the entry point boots either runtime — see [A page that mirrors its shell](#a-page-that-mirrors-its-shell)                            |
| `resolveStorageStores(env?)`                              | chooses and builds every store an app keeps state in, for its environment — see [The stores](#the-stores)                                                                               |
| `readStorageEnvironment()`                                | what that choice depends on: in a shell, the shell keeps a vault, a late vault already confirmed                                                                                        |
| `LATE_VAULT_MARK`                                         | the tab mark apps/web writes when a shell turns out to keep a vault only after its handshake                                                                                            |
| `setNativeCacheSupport(report)`                           | the phone shell's cache capability, which the cache routing reads; called by apps/web after the bridge handshake, before the data graph is built                                        |
| `readWebHostFacts(sources?)`                              | `WebHostFacts`: what the page knows about its host, read from `@chatic/bridges`' host profile, as one frozen value                                                                      |
| `resolveCheckoutMethod()` and the other host-port readers | what the shell declared it does, read into the host ports the entry point publishes — see [The host ports a page publishes](#the-host-ports-a-page-publishes)                           |

Where each cache domain goes is [docs/cache](./docs/cache/README.md).

## The adapters

Beside runtime-web's (`authLocation`, `foregroundVisibility`, `storageTab`, `storageLocal`,
`cacheIndexedDb`), each built from the facts the host profile gives:

| Export             | Id                   | `supports`                                                    | Builds                                                                                                                                      |
| ------------------ | -------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `transportBrowser` | `transport.browser`  | any page                                                      | `webTransportPorts()` with the shell's `CHATIC_APP_PLATFORM`                                                                                |
| `storageVault`     | `storage.vault`      | a shell that keeps a vault (`nativeSecure` in `storageMedia`) | `vaultStorageStores` over `createShellVault()`, loaded through `prepareSecretStorage` (`?logout=1` heard) unless the shell owns the session |
| `cacheWebStorage`  | `cache.web-storage`  | any page                                                      | IndexedDB, plus a plain tab's invited clouds in the storage port's `webSession`                                                             |
| `cacheShellSqlite` | `cache.shell-sqlite` | the phone app's bridge                                        | the whole `webLocalCachePorts` table: the shell's SQLite for what it holds, IndexedDB, the storage port's `webSession`                      |

`storage.vault` loads the vault the way apps/web's entry does, but what that entry does around it — the
late-vault reload and the watch on a vault unreadable at launch — stays the app's. On a launch whose
session the shell owns the page must not open the vault at all: `engine.shell` builds no port on such a
launch, and a storage built while the engine says the shell owns the session (`sessionOwner: 'native'`)
hands out the stores without loading the vault.

### The engine

`engineCandidates(id, [engineShell(options?), engineLocal])` is the engine's candidate list;
`engineMirror(options?)` is that list under the id `engine.mirror`, which apps/web declares. `engineShell`
settles who owns the session (`settleSessionOwner`, with the offer from the facts and `options` —
`disabled` is the page's own switch, apps/web's `VITE_SESSION_MIRROR_DISABLED`) before any port is built;
`engineLocal` runs the core over the declared ports. A candidate either takes the launch or passes it to
the next with a reason, and the settle it heard travels on as the owner:

| Settled  | Engine                                                                             | Ports built                                         |
| -------- | ---------------------------------------------------------------------------------- | --------------------------------------------------- |
| `native` | `engine.shell`: the mirror over the bridge (`createBridgedRuntime`)                | none — no stores, sockets or cache, so no vault     |
| `web`    | `engine.local`: the core over the declared ports (`core({ sessionOwner: 'web' })`) | every one, `storage` told the page owns the session |
| `null`   | none: `startRuntime` boots nothing                                                 | none                                                |

The settle comes back from `startRuntime` as `owner` either way, so the entry point does what is the
app's around it: telling the shell its default owner, showing the unsettled screen with a reload, and
taking its own signed-out keys on a launch the shell owns. Any page: one without an offer settles on
`web` at once, without a word to the shell. `engineCore` (`engine.core`, from runtime-client) is
re-exported beside it for a declaration that lists both.

### The host port adapters

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

Every port but checkout carries its work, not only the choice (the contracts are `@chatic/ports`'),
and the work comes from the app's declaration: apps/web hands in the `host/web` family's
implementations — [`@chatic/host-web-mobile-shell`](../host/web/mobile-shell/README.md), given
`webClient`, and [`@chatic/host-web-browser`](../host/web/browser/README.md) — and desktop-web still
its own `webClient` requests. So each `<port>Adapters` (`mediaAdapters`, `filesAdapters`, `linksAdapters`, `appShellAdapters`,
`signInAdapters`, `diagnosticsAdapters`, `pushAdapters`) takes the app's
`ShellOrBrowserImplementations<P>` — `shell(base, facts)` and `browser(base, facts)`, each handed the
choice (`base`, `ShellOrBrowserBase<P>`: `kind`, and `os` for `appShell` and `signIn`) and returning the
whole port — and builds the three adapters from them, calling only the side that was chosen. Each app
declares its own `linksHost`/`linksShell`/`linksBrowser` (and so on) in its `src/config/adapters/`; a
side the host has no use for still exists, because every port names all three (desktop-web's `media`
and `files` give both sides the page's own work).

Checkout's implementations — a store purchase over the bridge (`mobileShellStoreCheckout`), a hand-off
to the website — are handed in by the app, so the checkout adapters are built from what the app hands in and create it
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
    shell: mobileShellLinks({ bridge: webClient, subWebViewOpenScope }),
    browser: browserLinks,
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
runtime as runtime-core's [docs/bridge](../runtime/docs/remote/README.md#the-pages-half-the-mirror-engine)
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

`resolveStorageStores()` is the one place an app's stores are chosen and built, from `STORAGE_CANDIDATES`: one list per role, the first candidate whose `supports` holds for the `StorageEnvironment` wins, and each choice is logged with its reason (`[hybrid] storage.secret → vault (…)`). An entry point that uses
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

### The host ports a page publishes

A web app's entry point chooses its host ports — the contracts and the holder are
[runtime-client's](../runtime/docs/api/README.md#the-host-ports) — from what the shell declared before the
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

- Tagged `layer:adapter` and `platform:web`, like runtime-web. It imports runtime-web; runtime-web never
  imports it, and runtime-web may import `@chatic/bridges` for types only (its lint config holds both).
- It never imports `@chatic/runtime-mobile`. What it shares with the phone app is platform-neutral: the
  bridge messages, the remote protocol, the bridge-backed cache and vault.
- An app that runs inside a shell declares this package, not runtime-web. Declaring runtime-web there
  would read every shell as a browser: the session in the tab, every cache domain in IndexedDB.
- Its tests run in jsdom.
