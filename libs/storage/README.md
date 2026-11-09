# @chatic/storage

**Storage split by medium — where a value physically lives, not what it means.** A domain declares
the storage ports it needs (the session declares `secret` and `plain`); each app's entry point decides
which medium backs each port in its environment. This package holds the media and nothing that
knows about a domain.

## Who imports it

- **Each app's entry point** (`apps/web`, `apps/desktop-web`, `apps/admin-v2`) builds the media it
  uses and hands them to `runtime.boot.initAppRuntime({ storage })`. `apps/web` and
  `apps/desktop-web` also point `setStorageAdapter` at their plain medium; `apps/admin-v2` keeps its
  default.
- **`@chatic/session`** declares its ports in terms of `KeyValueStore`, and defaults to a
  `webSession` medium until an entry point configures it.
- **`@chatic/transport`** hands lemon-web-core its credential medium as a DOM `Storage`, and
  **`@chatic/auth`**'s logout sweep walks that medium's keys.
- **Anything that keeps app-wide state outside a domain port** (push registration records, the
  desktop sign-in hand-off) reads and writes through `storage`.

It imports nothing from the workspace.

## Layout

```text
libs/storage/src/
├── index.ts                    the barrel — re-exports the three folders
├── media/                      the media themselves
│   ├── types.ts                MediumName, KeyValueStore
│   ├── memoryMedium.ts         MemoryMedium
│   ├── nativeSecure/           NativeSecureMedium — the device vault, loaded once, written back in batches
│   ├── webMedium.ts            WebMedium — local(), session(), over()
│   └── globalStorage.ts        reads the localStorage / sessionStorage global without throwing
├── dom/                        a medium seen as a DOM Storage
│   ├── domStorageAdapter.ts    DomStorageAdapter
│   └── asDomStorage.ts         the factory over it
└── app/                        the app-wide storage for state that belongs to no domain port
    ├── types.ts                StorageAdapter, IAppStorage
    ├── appStorage.ts           AppStorage — swappable, sessionStorage until told otherwise
    ├── noopAdapter.ts          what AppStorage starts on where there is no sessionStorage
    └── storage.ts              the `storage` singleton and `setStorageAdapter`
```

A folder per concern, each with its own `index.ts`; interfaces in that folder's `types.ts`, one class
per file, each test beside the file it covers. A new medium goes in `media/`.

## The contract

```ts
type MediumName = 'webLocal' | 'webSession' | 'memory';

interface KeyValueStore {
    get(key: string): string | null;
    set(key: string, value: string): void;
    remove(key: string): void;
    clear(): void; // the whole medium, not only one caller's keys
    keys(): string[];
}
```

**Synchronous on purpose.** The session is read on every request and every render, so a read must
never wait.

| Class                 | Medium         | What it is                                                                                              |
| --------------------- | -------------- | ------------------------------------------------------------------------------------------------------- |
| `WebMedium.local()`   | `webLocal`     | this origin's `localStorage` — survives a reload and a relaunch                                         |
| `WebMedium.session()` | `webSession`   | this tab's `sessionStorage` — survives a reload, dies with the tab                                      |
| `MemoryMedium`        | `memory`       | this page lifetime only                                                                                 |
| `NativeSecureMedium`  | `nativeSecure` | the device vault an app or desktop shell keeps — iOS Keychain, Android Keystore, Electron `safeStorage` |
| `DomStorageAdapter`   | —              | any medium seen as a DOM `Storage` (`asDomStorage(medium)`), for code that only takes that shape        |

**A web medium reads the storage itself on every call**, not a copy taken at construction. The web
storage is already synchronous, so a copy would buy nothing, and it would go stale the moment
anything else writes the same storage — a debug wipe, a test fixture — answering with a value the
storage no longer holds. Where the web storage does not exist, or throws on access,
`WebMedium.over()` hands back a `MemoryMedium` instead, so a caller never has to ask which it got.

### `nativeSecure`: the device vault

The vault is behind the bridge, which is asynchronous, so the medium keeps its values in memory.
`hydrate()` loads them once per page (`StorageGet`) and every read after that answers from memory.
Writes go to memory at once; the writes of one turn of the event loop travel to the shell as one
`StorageSave` carrying each key's last value, in order, one request at a time. `flush()` sends what is
waiting and resolves only once the shell confirmed it — a logout waits on it before leaving the page.

**Unavailable is not empty.** When the vault cannot be read this run, a write is refused, or the shell
does not answer — five seconds for the read, the bridge's own limit for a write, both counted only while the page is visible — the medium switches to its fallback — the tab's `sessionStorage` —
for the rest of the run, carrying what it held, and `status` reads `unavailable`. The caller decides
what that means (`@chatic/auth`'s secret storage boot keeps the person signed in for the run). It never
falls back to `localStorage`: that is the copy the vault exists to replace.

The medium reaches the shell through a `NativeStorageChannel` the entry point hands it
(`@chatic/bridges`' `BridgeStorageChannel`), so this package still imports nothing from the
workspace. Whether the shell keeps a vault at all is read from `window.CHATIC_APP_STORAGE_MEDIA`
(`shellKeepsStorageMedium`), never from `isNative()`, which is true in every shell.

### The app-wide `storage`

`storage` (an `IAppStorage`) is what code outside a domain port reads and writes through.
`setStorageAdapter(adapter)` — the same as `storage.use(adapter)` — points it at the entry point's
plain medium. Until it is called it is this tab's `sessionStorage`, which is the right answer for an
app that never calls it (admin-v2, the landing site, the testbed).

## Usage

```ts
import { asDomStorage, setStorageAdapter, WebMedium } from '@chatic/storage';

const plain = isNative() ? WebMedium.local() : WebMedium.session();
setStorageAdapter(asDomStorage(plain));
runtime.boot.initAppRuntime({ storage: { secret: plain, plain } });
```

### What not to do

- **Do not name a medium after what it holds.** `secret` is a session port; the medium behind it
  differs by environment. A medium called `tokenStorage` would make that choice in the wrong place.
- **Do not call `clear()` to drop one domain's keys.** It empties the whole medium — in a shell,
  every key the origin has in `localStorage`. A domain removes its own keys by name.
- **Do not cache a web medium's values.** See above: a copy goes stale under writes made around it.

## How to verify

```bash
npx tsc -b libs/storage/tsconfig.json
npx jest --config libs/storage/jest.config.js
cd libs/storage && npx eslint src
```
