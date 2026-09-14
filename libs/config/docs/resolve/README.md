# resolve — turning a declaration into a value

Resolution is a fold. Given a key, walk the rows in order, take the first one that supplies a value
the key's type accepts, and report which row won. Everything interesting is in what each row is
allowed to supply, and that is `ConfigLanePolicy`'s job rather than the resolver's.

The declarations being folded come from [docs/registry/](../registry/README.md). The lane values
being folded come from `ConfigStore` (rows 2 and 3) and `RemoteCache` (rows 1 and 4), which this
document also covers because their read semantics are part of the precedence contract.

## Layout

```text
libs/config/src/
├── resolve/
│   ├── ConfigLanePolicy.ts   the order array, canSupply, writersFor
│   ├── ConfigResolver.ts     fold, snapshot, isUnlocked, UNLOCK_KEY
│   └── validate.ts           isValidValue — one pure function
├── store/ConfigStore.ts      one Map per lane, plus the subscriber set
└── lanes/RemoteCache.ts      the last-known-good payload, and rows 1 and 4
```

Four spec files cover this surface: `ConfigLanePolicy.spec.ts`, `ConfigResolver.spec.ts`,
`killLane.spec.ts` and `ConfigStore.spec.ts`.

## Responsibilities

The resolver decides which row answers. It refuses to decide anything else — it does not persist, it
does not notify, and it does not reach a port except through the four functions `ResolverFacts`
hands it.

`ConfigFacade` owns the things that need both halves: writing a lane and then diffing the resolved
value to decide whether to notify, and writing an override through to storage.

## The shared contract

### The order lives in one array

```ts
// ConfigLanePolicy
readonly order: readonly Lane[] = ['serverEnforced', 'shell', 'local', 'serverDefault'];
```

That array in `ConfigLanePolicy` is the whole precedence contract for lanes. Rows 5 to 7 are registry
declarations rather than lanes, so they have no entry here and are folded by `ConfigResolver` after
the loop ends.

| Row | Source                   | What it is                                                                                                                              |
| --: | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | `serverEnforced`         | The kill switch. Beats everything, including a local override — the device whose override is wrong is exactly the one to recover        |
|   2 | `shell`                  | What the native app stored. Survives a WebView cache wipe                                                                               |
|   3 | `local`                  | What this browser wrote, and for a `dev` key only while overrides are unlocked                                                          |
|   4 | `serverDefault`          | Remote tuning. **Below** `local` on purpose, so an engineer can still experiment on their own device while a remote default is in force |
|   5 | `byStage` / `byPlatform` | A rule the registry declared. Origin `stageRule`                                                                                        |
|   6 | `envDefaultKey`          | A raw build value. Below a declared rule, above the literal. Origin `default`                                                           |
|   7 | `defaultValue`           | The floor. Origin `default`                                                                                                             |

Rows 1 to 4 set `ConfigSnapshot.isOverridden`. Rows 5 to 7 do not — the registry deciding its own
value is not an override, which is why a clean PROD device logs nothing at boot even though
`feature.auth.socialLogin` resolves `false` through a stage rule on every one of them.

Adding a fifth lane costs two lines: one in `order`, one `case` in `ConfigResolver.readLane`.

### Every row is validated

`isValidValue(entry, value)` runs on **every** lane's value before it is used, not only on the ones a
person can write. A corrupted `localStorage` entry, a `json` key that decoded to a number, a stale
payload carrying a value the enum no longer lists — each fails here and the lane is skipped, so
resolution falls to the next row instead of handing broken data to a screen.

`null` and `undefined` always fail. `json` is currently accepted on `typeof value === 'object'` and
nothing deeper; how far a map value should be checked is still open.

### Three keys bypass the fold

`env.stage`, `env.buildStage` and `env.platform` are answered straight from the adapter's dedicated
methods, before the loop starts, with origin `default`. Their registry entries exist for shape and
typing only. Asking for them through `raw()` or a registry literal would give the same fact a second,
easier-to-drift source.

### The unlock gate applies to `dev` keys only

`canSupply` gates the `local` lane, and only it:

```ts
canSupply(entry: ConfigEntry, lane: Lane, isUnlocked: boolean): boolean {
    if (!entry.writableBy.includes(WRITER_OF[lane])) return false;
    if (lane !== 'local') return true;
    if (entry.meta || entry.surface !== 'dev') return true;
    return isUnlocked;
}
```

Two exemptions, each for its own reason.

**`meta` keys are exempt because they are the lock.** Applying the gate to them would make resolving
the unlock ask for the unlock. That exemption is the invariant that keeps `isUnlocked()` from
recursing — it folds `UNLOCK_KEY` with `isUnlocked: false` and the `meta` branch makes the argument
irrelevant.

**Non-`dev` keys are exempt because the lock guards QA levers, not people.** The lock exists to stop
a QA override of a developer-facing default from taking effect in a stranger's PROD build. It was
never meant to stop the app persisting a routine action — pinning a channel, muting push, picking a
theme. Six keys are `writableBy: ['local']` and nothing else; without this exemption all six would be
permanently dead on PROD, since they have no other writer to fall back to. `surface` already draws
that line, so the gate reads it rather than inventing a second one.

### Where the unlock itself comes from

`UNLOCK_KEY` is `'system.overridesUnlocked'`, declared in `ConfigResolver.ts` and exported from the
barrel twice — as `UNLOCK_KEY` and as `CONFIG_UNLOCK_KEY`. Only the alias has a reader.

Its registry entry defaults to `true` with `byStage: { PROD: false }`, so LOCAL and DEV builds are
open and PROD is shut. `apps/web`'s ten-tap-plus-entry-code flow writes it to the local lane, which
it is allowed to do because the key is `meta`.

### A security rule is judged against the build stage

Row 5 picks which stage to ask for:

```ts
const stage = entry.meta || key.startsWith('debug.') ? this.facts.buildStage() : this.facts.stage();
```

`stage()` honours an injected value, which is what a shell can set. `buildStage()` reads only what
the bundler baked in and cannot be spoofed by anything a page can reach. So a repackaged shell
reporting `DEV` cannot open a PROD bundle's debug overlay or unlock its override lane. Every other
key uses the injected stage, which is what a shell-injected stage is for.

The two are separate keys as well as separate methods — `env.stage` and `env.buildStage` — because a
panel has to be able to show both when they disagree.

### `canWrite` is not `writableBy`

`writableBy` says who may write a key **in principle**. `writersFor` answers who may write it **on
this device right now**, and it is what fills `ConfigSnapshot.canWrite`. It drops a writer when the
declaration omits it, when its port is not wired, or when the local lane is locked for that key.

A panel renders from `canWrite`, which is what keeps it from drawing a live control for something it
cannot change. A control that does nothing when pressed is the worst outcome available.

### Row 1 is read alone, and fails open

```ts
// ConfigResolver.readLane
try {
    switch (lane) {
        case 'serverEnforced':
            return this.remote.enforced(key);
        case 'serverDefault':
            return this.remote.remoteDefault(key);
        default:
            return this.store.read(lane, key);
    }
} catch {
    return { has: false };
}
```

The kill switch looks at three things: the cached payload, the key's own `writableBy`, and the TTL. It
never consults a stage rule, the store or the shell. A kill is used when everything else is broken, so
it must not travel the road it is closing.

The other direction is deliberate too. If row 1 throws, resolution falls through quietly to row 2.
Turning every setting off because the kill lane errored would be the larger accident.

### The remote cache keeps a stale default and drops a stale kill

`RemoteCache` holds one payload and the time it arrived.

| Read            | When stale                                                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enforced`      | **Dropped.** This is what heals a bad kill, and what keeps a device that cannot reach the server from staying locked forever — when the server stops sending the kill, it lapses on its own |
| `remoteDefault` | **Kept.** This is only tuning, and an old default beats no default                                                                                                                          |

`accept` rejects a payload whose `schemaVersion` is outside `SUPPORTED_SCHEMA_VERSIONS` — the whole
payload, not the unknown entries — and returns `false` so the previous payload survives intact.

Both rows ship empty. The lanes are registered now because adding one later would quietly change what
every key resolves to on devices already in people's hands. `killLane.spec.ts` drives the whole path
with a fake adapter, which is the only thing keeping an unexecuted code path from being broken the
first day it runs for real.

### Notification is a diff, not an echo

`ConfigStore` keeps values and a subscriber list and nothing else. Deciding whether a change is worth
telling anyone about needs the resolver, and `ConfigFacade` owns both, so the diff happens there:

```ts
// ConfigFacade.set
const before = resolver.snapshot(key)?.value;
// …write the lane, persist it…
const after = resolver.snapshot(key)?.value;
if (before !== after) this.store.notify([key]);
```

`set`, `clear` and `applyRemotePayload` all do this. The last one matters most: a payload carries
whatever the server sent, including keys a higher row is already winning, and notifying on those
would tell a watcher its value changed when nothing it can see did.

Each listener is handed the keys **it** asked about, not the whole change set. A watcher of one key
learning that some other key moved would only have to filter the noise back out. A listener that
subscribed with no keys asked about everything and gets everything; React's
`useSyncExternalStore` binding ignores the argument and just re-reads.

## Usage

### Reading the whole row

`snapshot(key)` returns everything a panel needs — the declaration unchanged, the resolved value,
which row won, whether a lane supplied it, and who may write it here and now. `snapshotAll()` maps
that over every registry key and `overriddenSnapshots()` filters to `isOverridden`.

`overriddenSnapshots()` is what the boot-time device state log uses. Reading it as "keys whose value
differs from `defaultValue`" would be wrong and noisy: a stage rule is not an override, and on PROD
every device would log several lines for declarations alone, burying the one device where someone
actually changed something.

### Clearing is not writing the default

```ts
config.clear(key, { lane: 'local' });      // remove the row, let a lower one show through
config.set(key, entry.defaultValue, ...);  // a value that wins the lane, which happens to equal the default
```

The second one keeps shadowing rows 4 to 7 forever. `clear` also removes the persisted copy and, for
a `persist: 'shell'` key, sends a clear over the bridge.

### What not to do

- **Do not hold `ConfigResolver` directly.** It is off the barrel because a consumer with a resolver could read a lane `canSupply` would have refused. Go through the facade.
- **Do not treat `origin` as the lane a write should target.** A key resolving to `origin: 'stageRule'` may still be writable on `shell`, `local` or both. `canWrite` is the field that answers that.
- **Do not add a row without adding it to `order`.** The array is the contract; a row folded somewhere else is invisible to `canSupply`, to `writersFor`, and to the panel.
- **Do not skip `isValidValue` for a lane you think you control.** The shell lane is the one people assume is safe, and it is a JSON blob from a store that survives app upgrades.

## Notes for implementers and tests

- **`ResolverFacts` has five required members** — `stage`, `buildStage`, `platform`, `raw`, `wired`. A literal missing one still runs green under jest, because ts-jest transpiles rather than type checks and the fixture entries declare no `envDefaultKey`, so `raw` is never called. That is exactly the drift the spec project's type check exists to catch.
- **`isUnlocked()` is called once per `snapshot`, not per row,** and it is short-circuited to `false` for a `meta` key before the call. Changing that shape is how recursion would come back.
- **`ConfigStore.read` distinguishes an absent key from a stored `undefined`** by returning `{ has }`. A lane that stored `undefined` still fails `isValidValue` and is skipped, but the two states are not the same to the store.
- **`RemoteCache`'s constructor takes a clock** (`now: () => number`, defaulting to `Date.now`). Every TTL test drives it with a mutable counter rather than fake timers.
- `killLane.spec.ts` is the file to read first if you are touching row 1 or row 4. It is the only executed proof that the empty lanes work.

## Further reading

- [docs/registry/](../registry/README.md) — the declarations rows 5 to 7 fold, and the fields rows 1 to 4 are gated by.
- [docs/ports/](../ports/README.md) — where `stage`, `buildStage`, `platform` and `raw` come from, and what `wired` is reporting on.
