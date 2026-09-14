# ports — the outside world, as four interfaces

This lib imports nothing, so everything outside it arrives through `ConfigRuntimePorts`. One
interface per concern, assembled by the app's composition root and handed over once in
`config.init(ports)`.

The shape follows `HttpRuntimePorts` in `libs/http`: an **absent member means "not wired"**, never
"broken". A missing `shell` leaves the shell lane empty; a missing `remote` leaves both server lanes
empty. Nothing throws for want of an adapter.

```ts
interface ConfigRuntimePorts {
    env: IConfigEnvAdapter; // required
    storage?: ConfigStoragePorts; // { local?, session? }
    shell?: IShellKvAdapter;
    remote?: IRemoteConfigAdapter;
    onDuplicateKey?: (key: string) => void;
    onShellWriteFailed?: (key: string, error: unknown) => void;
}
```

Only `env` is required, because a stage and a platform are what the registry's rules are judged
against — without them there is nothing to resolve.

## Layout

```text
libs/config/src/
├── ports.ts                    ConfigRuntimePorts · IConfigEnvAdapter · StorageLike
│                               · ConfigStoragePorts · IShellKvAdapter
├── lanes/RemoteCache.ts        IRemoteConfigAdapter · RemotePayload
└── adapters/webEnvAdapter.ts   createWebEnvAdapter — the one implementation that ships here
```

`IRemoteConfigAdapter` is declared next to the cache that consumes it rather than in `ports.ts`, and
re-exported through the barrel. There is no `RemoteConfigAdapter.ts`.

## Responsibilities

Ports decide what this lib needs. They refuse to decide how it is obtained — `import.meta`,
`window`, `localStorage`, a bridge round trip and an HTTP client are all on the far side of these
five interfaces, which is what lets React Native share the core unchanged.

`createWebEnvAdapter` is the one exception, and a narrow one: it is the shared **interpretation** of
raw build values for the four Vite apps, and the raw reader itself is still the caller's.

## The shared contract

### `IConfigEnvAdapter` — build facts

```ts
interface IConfigEnvAdapter {
    stage(): Stage; // an injected value wins over the baked one
    buildStage(): Stage; // only what the bundler baked in — unspoofable
    platform(): Platform;
    raw(name: string): string | undefined; // backs envDefaultKey
}
```

`stage` and `buildStage` are deliberately two methods. `stage` lets a shell say where it thinks it is
running, which is what the injected value is for. `buildStage` cannot be moved by anything a page can
set, so security-relevant rules — `meta` keys and everything under `debug.` — are judged against it.

**Two stage vocabularies exist and the adapter normalizes between them.** `VITE_ENV` is already
`LOCAL`/`DEV`/`PROD`. The shell-injected `CHATIC_APP_STAGE` uses `local`/`stage`/`prod`, which is
`@chatic/app-messages`' `Env` type, so `'stage'` maps to `'DEV'`. An unrecognized token falls back to
`buildStage()` silently.

That fallback is currently load-bearing for one shell. Electron's preload injects
`CHATIC_APP_STAGE` from `--chatic-stage=dev|prod`, and `'dev'` is not one of the three tokens — so on
a desktop dev build `stage()` quietly returns whatever the bundle was built with. The gap is in the
shared bridge vocabulary rather than in this adapter, and the same preload injects
`CHATIC_APP_PLATFORM: 'desktop'`, which the shared `Platform` union does not contain either.

`Stage` and `Platform` are declared in this lib's own `types.ts` rather than imported from
`@chatic/app-messages`, because importing that lib to gain two unions would chain this one — and
every test — to the whole bridge contract. The copy is character-identical to the original today.
The docblock in `types.ts` says an app-side test asserts the two sets stay equal; **no such test
exists in the repo.** The copies match, so nothing is broken, but the defence that docblock cites is
not there.

### `createWebEnvAdapter` — the shared Vite implementation

```ts
export const webConfigPorts: ConfigRuntimePorts = {
    env: createWebEnvAdapter(read),
    // …
};
```

Each app supplies only `read`, a function from a raw name to its value, which is the one piece this
lib cannot hold (`import.meta`). All four Vite apps write the same four lines of it: `VITE_*` names
come from `import.meta.env`, everything else from `window`.

The adapter carries one behaviour that looks arbitrary and is not. Exactly five raw names come back
lowercased — `VITE_PROJECT`, `VITE_REGION`, `VITE_HOST`, `VITE_OAUTH_ENDPOINT` and
`VITE_SOCIAL_OAUTH_ENDPOINT` — because those five are the values this repo compares
case-insensitively. The endpoint names outside that set (`VITE_DOU_ENDPOINT`, `VITE_WS_ENDPOINT`,
`VITE_IAP_ENDPOINT`, `VITE_BACKEND_ENDPOINT`) carry path segments, where case is significant, so
adding one of them to the set would break the address it resolves to.

### `StorageLike` — two stores, taken structurally

```ts
interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}
```

This is not a new type: it is the shape `@chatic/shared`'s `StorageAdapter` already has, taken
structurally so this lib imports nothing. `localStorage` and `sessionStorage` satisfy it directly.

A key's `persist` picks which one it lands in, and the **`shell` strategy resolves to the same
`local` store a `persist: 'local'` key uses**. That looks redundant and is the opposite: the bridge is
the source of truth on a device, but a plain browser tab has no bridge to be a source of truth, so
without a browser-side copy a value only the shell would hold is lost on every reload.
`hydrateStorage()` reads that mirror into the **`local` lane**, which the shell lane outranks — so a
device resolves from the shell and never reads the mirror, and a shell-less browser resolves from
the mirror. `ui.theme`, `ui.blurLastMessage` and `ui.onboardingCompleted` are exactly this case.

Writes are wrapped in `try`/`catch`: a blocked or full store must not break the toggle that reads it.

Values cross the storage boundary as JSON, under `storageKeyFor(key)` — `@chatic/config.<key>`.
Decoding is total, so anything unreadable comes back as absent and the lane is simply skipped.
`encodeValue` and `storageKeyFor` are on the barrel so an app writing a one-time legacy migration can
seed the exact format `hydrateStorage()` reads back, instead of duplicating this encoding.

### `IShellKvAdapter` — the shell as an opaque key-value store

```ts
interface IShellKvAdapter {
    readBag(): Readonly<Record<string, string>>; // synchronous, read once during init
    write(key: string, value: string): Promise<void>;
    clear(key: string): Promise<void>;
}
```

The shell keeps `key -> string` and **knows nothing about what any key means**, which is why adding a
toggle costs no app release.

`readBag` is synchronous by contract. The boot envelope has to be in hand before `init` runs, well
before any bridge message could answer, so the shell injects it as a `window` global during page
setup and `readBag` just reads it — the same mechanism that seeds the pre-paint theme.

`write` resolves only when the shell confirmed it. A dropped write would leave a panel claiming it
saved something it did not. `ConfigFacade` layers exactly one retry above this port, then calls
`onShellWriteFailed` — the realistic failure is a transient drop or a router that was not listening
yet, not a rejected value, so a second attempt is worth making and a third is not.

### `IRemoteConfigAdapter` — the lane with no implementation

```ts
interface IRemoteConfigAdapter {
    fetch(): Promise<RemotePayload>;
}
```

No app wires it. `refreshRemote()` returns `false` immediately when the port is absent **or** when
`system.remote.enabled` is not `true` — two switches on purpose, because merging an adapter and
turning it on are separate decisions. A throwing `fetch` is swallowed: the last known good payload is
kept, nobody is told, and the caller backs off.

See [docs/resolve/](../resolve/README.md) for what the cache does with a payload once it arrives.

### The two callbacks

`onDuplicateKey` and `onShellWriteFailed` are callbacks rather than a logger import, because this lib
depends on nothing. They are also two different kinds of problem, and `apps/web` treats them
differently: a duplicate key is an authoring error nobody holding the phone can act on, so it is
logged only; a failed shell write is something the person just did, so it is logged **and** raised as
a toast.

## Usage

### What each app wires

| App                | env | storage | shell               | remote | callbacks |
| ------------------ | :-: | :-----: | ------------------- | :----: | :-------: |
| `apps/web`         |  ✓  |    ✓    | ✓ when `isNative()` |   —    |     ✓     |
| `apps/desktop-web` |  ✓  |    ✓    | —                   |   —    |     —     |
| `apps/admin-v2`    |  ✓  |    ✓    | —                   |   —    |     —     |
| `apps/testbed`     |  ✓  |    ✓    | —                   |   —    |     —     |

Only `apps/web` runs inside a native shell, and it wires the port **conditionally**: a plain browser
tab has no shell to round-trip a write to, and leaving the member unset rather than wired-and-always-
failing is what keeps an unwired `persist: 'shell'` key a silent no-op instead of a spurious
`onShellWriteFailed` on every page load.

`apps/desktop-web` has no shell port either, even though it runs inside Electron, because it has no
`persist: 'shell'` consumer to justify building the preload half.

### Adding a port to an app

1. Create `src/app/config/adapters.ts` exporting a `ConfigRuntimePorts`. Keep the `import.meta.env` read in that file and nowhere else — it is the one file per Vite app allowed to touch it.
2. Build `env` with `createWebEnvAdapter(read)`. Do not reimplement stage validation or the lowercasing.
3. Put anything testable in a **separate** file. A module that reads `import.meta.env` is unloadable under the CommonJS test transform, and so is anything importing it — which is why `apps/web` keeps its two callbacks in `configPortCallbacks.ts`.
4. Call `config.init(ports)` in `main.tsx`, after any legacy migration and before the runtime boot.

### What not to do

- **Do not read `import.meta` anywhere but the adapter file.** It is the boundary the no-dependency rule is enforced at, and a second reader is a second source of truth for the same fact.
- **Do not migrate an identity value into the registry.** `CHATIC_APP_PLATFORM` and `CHATIC_APP_INSTALLATION_ID` are read straight off `window` by device-token registration, push mute, the IAP screens and `libs/device-utils`' `deviceInfoStore`, on purpose. They feed contracts whose vocabulary is not `Stage`'s or `Platform`'s — a push broker wants lowercase `dev`/`prod`, and Electron's preload injects a platform (`desktop`) that the shared bridge union does not contain — so routing them through the registry would change the value that arrives.
- **Do not wire the shell port "just in case".** A port that is present and always fails produces a visible error for every write; a port that is absent produces a quiet no-op, which is the correct behaviour when there is no shell.
- **Do not build a bridge message with no caller.** The shell lane deliberately has no `FetchConfigBag` message: the boot envelope is synchronous and nothing needs an async fallback, so the message and its native handler have not been written.

## Notes for implementers and tests

- **`testing/fixtures.ts` covers all of this.** `ports()` returns `env` plus two `memoryStorage()` instances, and takes overrides; `envAdapter(stage, buildStage, platform)` defaults `buildStage` to `stage`, so a test that wants them to disagree must say so explicitly.
- **`memoryStorage()` exposes `dump()`** on top of `StorageLike`, which is how the persistence tests assert what landed under which key.
- **`adapters/webEnvAdapter.spec.ts` is the one place the lowercasing rule is pinned.** Changing that set without changing the test is how a path-bearing endpoint would start being lowercased.
- **The shell round trip is not tested here.** `ConfigFacade`'s retry and failure reporting are covered in `index.spec.ts` with a fake adapter; the `NOT_FOUND` downgrade to the legacy bridge lives in `apps/web`'s `shellKvAdapter.test.ts`, and the native side in `apps/mobile`'s `ConfigKvService.test.ts`.

## Further reading

- [docs/registry/](../registry/README.md) — `persist` and `envDefaultKey`, the two declaration fields that decide which port a key touches.
- [docs/resolve/](../resolve/README.md) — what `wired()` reports into `canWrite`, and what the remote cache does with a payload.
