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

| Class                 | Medium       | What it is                                                                                       |
| --------------------- | ------------ | ------------------------------------------------------------------------------------------------ |
| `WebMedium.local()`   | `webLocal`   | this origin's `localStorage` — survives a reload and a relaunch                                  |
| `WebMedium.session()` | `webSession` | this tab's `sessionStorage` — survives a reload, dies with the tab                               |
| `MemoryMedium`        | `memory`     | this page lifetime only                                                                          |
| `DomStorageAdapter`   | —            | any medium seen as a DOM `Storage` (`asDomStorage(medium)`), for code that only takes that shape |

**A web medium reads the storage itself on every call**, not a copy taken at construction. The web
storage is already synchronous, so a copy would buy nothing, and it would go stale the moment
anything else writes the same storage — a debug wipe, a test fixture — answering with a value the
storage no longer holds. Where the web storage does not exist, or throws on access,
`WebMedium.over()` hands back a `MemoryMedium` instead, so a caller never has to ask which it got.

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
