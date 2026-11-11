# @chatic/storage

**Storage split by where a value physically lives, not by what it means.** A domain declares
the storage ports it needs (the session declares `secret` and `plain`); each app's entry point decides
which store backs each port in its environment. This package holds the stores and nothing that
knows about a domain.

**Why "store".** These were called _media_ (one _medium_) at first. In an app full of photos and
videos the word kept reading as those, and the shape every one of them has was already named
`KeyValueStore`, so the classes, the folder and the names apps hand out now say store. The bridge
protocol between the web and a shell keeps the old word — `StorageGet { medium }`,
`window.CHATIC_APP_STORAGE_MEDIA`, `StorageMedium` in `@chatic/bridge-messages`, and the shell code
that answers them — because a shipped app sends and reads those names, and a web build has to keep
talking to every shell still in use.

## Who imports it

- **`@chatic/runtime-web`'s `resolveStorageStores`** is where an app's stores are chosen and built —
  the session's `secret` and `plain`, the vault, and the `device`/`tab` stores for everything else.
  `apps/web` and `apps/desktop-web` call it once in their entry points and hand the result out
  (`createWebRuntime({ storage })`, their config ports, their own `app/storage/`).
- **The browser-only apps** — admin, landing, block-kit-builder — have no environment to choose
  between, so each builds its stores once in its own `src/app/storage/` and hands them out from there.
- **Everything else in the apps and the libs** reaches web storage only through a store — the root
  ESLint config refuses `localStorage`/`sessionStorage` there, and a zustand `persist` without a
  `storage`. This package and the mini-app SDK are left out of that rule; so are tests, the e2e suites
  and the shell adapter, which stand outside an app and play the browser or the shell around it.
- **`@chatic/session`** declares its ports in terms of `KeyValueStore`, and defaults to a
  `webSession` store until an entry point configures it.
- **`@chatic/auth`**'s logout sweep and its boot clean-up of an old lemon-web-core bundle walk the
  plain store's keys, and **`@chatic/app-runtime`**'s push registration record keeps its web copy
  there.

It imports nothing from the workspace.

## Layout

```text
libs/storage/src/
├── index.ts                    the barrel — re-exports the two folders
├── stores/                     the stores themselves
│   ├── types.ts                StoreName, KeyValueStore
│   ├── memoryStore.ts          MemoryStore
│   ├── nativeSecure/           NativeSecureStore — the device vault, loaded once, written back in batches
│   ├── webStore.ts             WebStore — local(), session(), over()
│   ├── tolerantStore.ts        TolerantStore — a failed read is absent, a failed write a no-op
│   ├── switchableStore.ts      SwitchableStore — forwards to whichever store it points at
│   └── globalStorage.util.ts   reads the localStorage / sessionStorage global without throwing
└── dom/                        a store seen as a DOM Storage
    ├── domStorageAdapter.ts    DomStorageAdapter
    └── asDomStorage.mapper.ts  the factory over it
```

A folder per concern, each with its own `index.ts`; interfaces in that folder's `types.ts`, one class
per file, each test beside the file it covers. A new store goes in `stores/`.

## The contract

```ts
type StoreName = 'webLocal' | 'webSession' | 'memory' | 'nativeSecure';

interface KeyValueStore {
    get(key: string): string | null;
    set(key: string, value: string): void;
    remove(key: string): void;
    clear(): void; // the whole store, not only one caller's keys
    keys(): string[];
}
```

**Synchronous on purpose.** The session is read on every request and every render, so a read must
never wait.

| Class                | Name           | What it is                                                                                                   |
| -------------------- | -------------- | ------------------------------------------------------------------------------------------------------------ |
| `WebStore.local()`   | `webLocal`     | this origin's `localStorage` — survives a reload and a relaunch                                              |
| `WebStore.session()` | `webSession`   | this tab's `sessionStorage` — survives a reload, dies with the tab                                           |
| `MemoryStore`        | `memory`       | this page lifetime only — no app assembly picks it; it backs tests, the vault's cache and the fallback below |
| `NativeSecureStore`  | `nativeSecure` | the device vault an app or desktop shell keeps — iOS Keychain, Android Keystore, Electron `safeStorage`      |
| `DomStorageAdapter`  | —              | any store seen as a DOM `Storage` (`asDomStorage(store)`), for code that only takes that shape               |
| `TolerantStore`      | —              | wraps a store so a failed read is absent and a failed write a no-op — for convenience state                  |
| `SwitchableStore`    | —              | forwards to whichever store it points at — for state wired at import time, before the entry point runs       |

**A web store reads the storage itself on every call**, not a copy taken at construction. The web
storage is already synchronous, so a copy would buy nothing, and it would go stale the moment
anything else writes the same storage — a debug wipe, a test fixture — answering with a value the
storage no longer holds. Where the web storage does not exist, or throws on access,
`WebStore.over()` hands back a `MemoryStore` instead, so a caller never has to ask which it got.

**`TolerantStore` is for state whose loss costs only itself.** Web storage throws on a full quota,
in some private windows and when blocked. The session must hear that, so `WebStore` lets it through;
a composer draft or a log batch must not take its screen down with it, so the `device`/`tab` stores an
app's features use are wrapped in `TolerantStore`.

### `nativeSecure`: the device vault

The vault is behind the bridge, which is asynchronous, so the store keeps its values in memory.
`hydrate()` loads them once per page (`StorageGet`) and every read after that answers from memory.
Writes go to memory at once; the writes of one turn of the event loop travel to the shell as one
`StorageSave` carrying each key's last value, in order, one request at a time. `flush()` sends what is
waiting and resolves only once the shell confirmed it — a logout waits on it before leaving the page.

**Unavailable is not empty.** When the vault cannot be read this run, a write is refused, or the shell
does not answer — five seconds for the read, the bridge's own limit for a write, both counted only while the page is visible — the store switches to its fallback — the tab's `sessionStorage` —
for the rest of the run, carrying what it held, and `status` reads `unavailable`. The caller decides
what that means (`@chatic/auth`'s secret storage boot keeps the person signed in for the run). It never
falls back to `localStorage`: that is the copy the vault exists to replace.

The store reaches the shell through a `NativeStorageChannel` the entry point hands it
(`@chatic/bridges`' `BridgeStorageChannel`), so this package still imports nothing from the
workspace. Whether the shell keeps a vault at all is read from `window.CHATIC_APP_STORAGE_MEDIA`
(`shellKeepsStorageMedium`), never from `isNative()`, which is true in every shell.

### No app-wide storage

There used to be a swappable `storage` singleton for state that belonged to no domain port, pointed at
the session's plain store by each entry point. It was a second way to reach a store that nobody
chose by name, and an app that never pointed it anywhere silently got `sessionStorage`. It is gone:
state that has no port of its own takes a store its app hands out — in desktop-web, `plainStore`
for what travels with a sign-in — and a lib reads the session's plain store through `sessionStores`.

## Usage

```ts
// both from @chatic/runtime-web
const stores = resolveStorageStores();
configureAppStores({ device: stores.device, tab: stores.tab });
runtime.boot.initAppRuntime(
    createWebRuntime({
        storage: { secret: stores.secret, plain: stores.plain, device: stores.device },
        cacheTab: stores.webSession, // a tab's invited clouds
    })
);
```

### What not to do

- **Do not name a store after what it holds.** `secret` is a session port; the store behind it
  differs by environment. A store called `tokenStorage` would make that choice in the wrong place.
- **Do not call `clear()` to drop one domain's keys.** It empties the whole store — in a shell,
  every key the origin has in `localStorage`. A domain removes its own keys by name.
- **Do not cache a web store's values.** See above: a copy goes stale under writes made around it.
- **Do not construct a store in a feature.** Take the one your app hands out from its `app/storage` —
  `deviceStore`/`tabStore` and the like. A `new WebStore` deep in a feature is a second place
  deciding where state lives. The exceptions are deliberate and few: the debug storage screen, whose
  job is to walk the two web storages whole; the defaults a holder serves before its entry point
  configures it (the same storages); and the logout's clean-up of the tab copy a vault-less run left.

## How to verify

```bash
npx tsc -b libs/storage/tsconfig.json
npx jest --config libs/storage/jest.config.js
cd libs/storage && npx eslint src
```
