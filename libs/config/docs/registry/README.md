# registry — what every key means

The registry is the declaration half of this lib. It says what a key **is** — its type, who may
write it, where an override is kept, which screen would show a control for it — and it never says
what the key's value currently is. That separation is the reason the policy cannot be moved at
runtime: there is no mutable field here for a lane to reach.

[docs/resolve/](../resolve/README.md) is the other half, and it turns these declarations into a
value.

## Layout

```text
libs/config/src/registry/
├── index.ts       ConfigRegistry (merge · get · has · keys) + findPolicyViolations
├── modules.ts     ALL_MODULES — the 12 domain modules, in merge order
├── system.ts   2  the two keys the lane machinery itself needs
├── env.ts     13  read-only build facts
├── net.ts     11  endpoints, deeplink schemes, HTTP retry
├── ui.ts      11  user preferences — theme, blur, push mute, pin, sort, recent searches
├── log.ts     11  collection and upload levers, plus upload tuning
├── auth.ts    10  session, credential refresh and retry timing
├── debug.ts    6  the debug panel's own controls
├── feature.ts  6  per-stage gates — phone login, social login, subscription dry run
├── sync.ts     6  socket and sync cadence
├── limit.ts    4  operational guardrails
├── cache.ts    3  cache TTLs
└── bridge.ts   2  bridge request and handshake timeouts
```

85 keys. `allModules.spec.ts` asserts that number, so it cannot drift silently — but the command is
what proves it:

```bash
grep -chE "^    '" libs/config/src/registry/{system,env,net,ui,log,debug,feature,limit,bridge,auth,sync,cache}.ts
```

The split is by domain because one file past eighty keys stops being readable, not because the
modules mean anything to the resolver. After `ConfigRegistry.merge` there is one flat map.

## Responsibilities

The registry decides what a key means and refuses to decide what it is worth right now. It also
refuses to stop the boot.

**A duplicate key does not throw.** `merge` keeps the **first** declaration, drops the later one, and
calls `onDuplicateKey`. The reason to reject one is real — two domains reading the same key
differently is a genuine bug — but 67 of 85 keys are developer-facing, and one mistake among those
must not keep every user's app from starting. The check moved to a test instead. Merge order is fixed
in `modules.ts`, so two devices never disagree about which declaration survived.

**An impossible combination does not throw either.** `findPolicyViolations` walks the merged map and
returns a list of strings; `allModules.spec.ts` asserts it is empty. At runtime nothing acts on it.

## The shared contract

Every entry is a `ConfigEntry` (`src/types.ts`). Thirteen fields, seven of them required.

| Field           | Required | What it settles                                                                                                              |
| --------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `title`         | yes      | The human name a panel shows instead of the dotted key. Written in Korean, like every other user-visible string in this repo |
| `description`   | yes      | One sentence: what this changes, and why it exists when that is not obvious                                                  |
| `type`          | yes      | `boolean` · `string` · `number` · `enum` · `json`. Every lane's value is checked against it                                  |
| `defaultValue`  | yes      | The floor. This is why `get` can be synchronous and never fail                                                               |
| `values`        | enum     | The allowed list. An `enum` without one is a policy violation                                                                |
| `byStage`       | no       | Per-stage default. Row 5                                                                                                     |
| `byPlatform`    | no       | Per-platform default, also row 5                                                                                             |
| `envDefaultKey` | no       | The raw build value this key's default comes from. Row 6 — below a declared rule, above the literal                          |
| `surface`       | yes      | Which screen would draw a control: `user` · `labs` · `dev` · `internal`                                                      |
| `writableBy`    | yes      | Who may write it in principle: any of `shell` · `local` · `server`. `[]` means nobody — the build is the only source         |
| `persist`       | yes      | Where an override is kept: `shell` · `local` · `session` · `none`                                                            |
| `appliesAt`     | no       | `live` · `reconnect` · `restart`. Descriptive metadata for a panel. This lib never forces a reconnect or a restart           |
| `meta`          | no       | This key is part of the lock machinery. Two consequences, both below                                                         |

`surface`, `writableBy` and `persist` are **orthogonal**. A `user` key can persist to the shell
(`ui.theme`) or to local storage (`ui.pushMuted`); a `dev` key can be unwritable by anyone
(`env.project`). Nothing is inferred from anything else.

### The four surfaces

Measured from the source, and asserted in `allModules.spec.ts`.

| Surface    | Keys | Where its control lives                                                                               |
| ---------- | ---: | ----------------------------------------------------------------------------------------------------- |
| `user`     |    4 | Settings and its notification sub-page. A hand-built row per key, not a generated one                 |
| `labs`     |    0 | The experimental section of Settings. No key has claimed it, so the section does not exist yet        |
| `dev`      |   67 | The web debug overlay's `ConfigScreen`, which lists them all and edits the ones this device may write |
| `internal` |   14 | Nowhere. Code reads it, or product UI writes it through a flow of its own                             |

**Declaring a surface does not create a screen.** There is no renderer that walks the registry and
produces Settings rows. `ConfigScreen` is the one generic viewer and it covers `dev` only.

The `internal` keys are the interesting boundary. `ui.channelSort`, `ui.pinnedChannels` and
`ui.recentSearches` are changed by a person constantly — but through a sort picker, a pin gesture and
a search box, not through a settings screen. `internal` is what stops a generic panel from drawing a
second, competing control for them.

### The four `meta` keys

`system.overridesUnlocked` · `system.remote.enabled` · `debug.overlayEnabled` · `debug.entryCode`.

These keys **are** the lock, and that single fact produces both of their special behaviours. A
generic panel does not render them, because the screen you need the unlock to reach would otherwise
contain the switch that unlocks it. And the local lane's unlock gate does not apply to them, because
resolving the unlock key would otherwise ask for the unlock key — that exemption is what keeps
`ConfigResolver.isUnlocked` from recursing.

`debug.entryCode` carries a second, independent exclusion: it is a credential, and the panel that
lists keys is copyable.

### Distribution, and what it tells you

| Axis            | Counts                                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `writableBy`    | `['local','server']` 32 · `[]` 21 · `['local']` 16 · `['shell','local']` 9 · `['shell']` 6 · `['shell','local','server']` 1 |
| `persist`       | `session` 41 · `none` 25 · `local` 10 · `shell` 9                                                                           |
| `appliesAt`     | absent 53 · `live` 24 · `restart` 5 · `reconnect` 3                                                                         |
| Declared rules  | `byStage` 13 · `byPlatform` **0** · `envDefaultKey` 17                                                                      |
| Server-writable | 33 of 85                                                                                                                    |

Two readings worth carrying.

**`byPlatform` has no user.** The field is declared, the resolver folds it, and not one of the 85
entries sets it. It is live code with no exercise outside `ConfigResolver.spec.ts`.

**21 keys have no writer at all.** `writableBy: []` means the build is the only source — every
`env.*` key, most endpoints, and `debug.entryCode`. A panel must render these read-only, and
`ConfigSnapshot.canWrite` already says so.

Two more keys are writable in principle and have no writer in practice. `net.relay.backend` and
`net.relay.wss` are `writableBy: ['local']`, and the only code that touches them is the logout path,
which **clears** them. The `?_backend` query parameter that shares their purpose is consumed by the
invite flow and never lands in the registry, so today the debug panel is the only thing that can set
either. `ui.language` is the third of this kind: declared `surface: 'user'`, and its one appearance
outside the registry is the legacy shell-key map — i18next manages the language under a key of its
own.

### The enforced invariants

`findPolicyViolations` (`registry/index.ts`) checks five rules. `merge.spec.ts` covers each one, and
`allModules.spec.ts` runs them against the real registry.

| Rule                                                   | Why                                                                         |
| ------------------------------------------------------ | --------------------------------------------------------------------------- |
| `user` and `labs` must include `local` in `writableBy` | A user-facing setting nobody on the web can write is a contradiction        |
| `user` and `labs` cannot be `meta`                     | A lock key on a user screen is the recursion the `meta` flag exists to stop |
| `labs` must include `server` in `writableBy`           | An experiment nobody can turn off remotely does not go out to users         |
| `enum` must have a non-empty `values`                  | A choice without options cannot be rendered or validated                    |
| `title` and `description` must be non-blank            | A nameless key shows up in the panel as a dotted string                     |

## Usage

### Adding a key

1. **Pick the domain file.** The dotted prefix and the filename agree — `ui.foo` goes in `ui.ts`. If neither fits, the question is whether the setting belongs in this registry at all; see [What not to do](#what-not-to-do).
2. **Write `title` and `description` in Korean.** They are what a panel shows. The description says what changes, not what the key is called.
3. **Choose `surface`.** `user` if a person turns it on in Settings, `labs` for an experiment, `dev` for a QA or developer lever, `internal` for state the product writes through its own flow.
4. **Choose `writableBy`.** Leave `server` out when a wrong remote value would be self-reinforcing — `auth.sdk.*` excludes it because a bad refresh cadence makes every device refresh at once, and fixing it remotely means writing through the load it just caused. Leave it out of endpoints too: a remote config must not be able to move where the app talks. Leave it out of privacy opt-outs such as `log.collection.enabled` — an opt-out the server can undo is not one.
5. **Choose `persist`.** `shell` when the native app reads the same value, `local` when this browser should keep it across reloads, `session` for a QA override that should die with the tab, `none` when it lives only in memory.
6. **Set `appliesAt` by checking the consumer, not by guessing.** `live` only after confirming the consumer re-reads — a subscriber, or a per-call default argument. A value captured into an instance field at construction is `restart`; one passed at socket construction is `reconnect`. When in doubt the pessimistic answer is right, because a panel claiming it turned something off that is still on is worse than one that says nothing.
7. **Update the key count in `registry/allModules.spec.ts`.** It asserts the total and the surface distribution; both move when you add a key.
8. **Wire the consumer.** Read it where it is used, not at module scope — see the README's usage rules.

Nothing else. There is no separate types file to touch, no export to add, and no barrel to update: the
key reaches `config.get` through its module, which `modules.ts` already lists.

### Sourcing a default from the build

`envDefaultKey` names a raw build value — `VITE_DOU_ENDPOINT`, `CHATIC_APP_BUILD_NUMBER`. The resolver
asks the env adapter's `raw()` for it, after a declared `byStage`/`byPlatform` rule has missed and
before the literal `defaultValue` floor.

It passes the value through **unchanged**. There is no transform hook, so "the opposite of this build
flag" cannot be expressed — `apps/web`'s log upload switch keeps its build flag as a separate input
for exactly that reason and asks the registry only whether someone overrode the key.

Three keys bypass this mechanism entirely. `env.stage`, `env.buildStage` and `env.platform` are read
straight off the adapter's dedicated methods, so their `defaultValue` and `writableBy` exist for
shape only and are never reached.

### What not to do

- **Do not put a product entitlement here.** Place and channel counts belong to the server's product catalogue. `feature.limits.enforced` is a bypass gate, not a limit value, and `limit.*` holds only guardrails with no tier meaning — image size, resend attempts, result caps.
- **Do not declare a `labs` key without `server` in `writableBy`.** The test catches it, but by then the design is already wrong.
- **Do not declare a user setting as `dev`.** The unlock gate applies to `dev` and nothing else, so on a PROD build the local lane is shut and the feature has no other writer. That was a real outage shape: six `writableBy: ['local']` keys — pin, sort, recent searches, push mute, promo and update dismissal — would have been permanently dead in PROD.
- **Do not store a setting under a key of your own.** Bypassing the registry loses the lanes, the lock and the snapshot. The `@chatic/config.` prefix is also an exception in `libs/app-runtime`'s logout storage sweep, so settings survive logout — a value that must not survive it is session state, not a setting.
- **Do not expect a duplicate key to fail loudly.** It logs and the first declaration wins. The test is the gate.

## Notes for implementers and tests

- **`ConfigRegistry` has no public constructor.** `merge` is the only way in, and it takes the module array plus an optional `onDuplicateKey`. `createConfig(modules)` exists so a test can build a registry from fixtures instead of the real 85 keys; nothing in the apps calls it.
- **`testing/fixtures.ts` is the intended seam.** `entry()` gives a minimal `ConfigEntry` so a test states only the field it is about; its default `surface` is `'dev'`, which means a test about the unlock gate gets the gated behaviour for free and a test about user settings must override it.
- **`UNLOCK_ENTRY` is a fixture, not the registry's own declaration.** It mirrors `system.overridesUnlocked` closely but is a separate object — changing one does not change the other.
- **`isPersisted` in `utils/serialize.ts` has no caller,** inside this lib or outside it, and it is not on the barrel.
- The registry's own tests are `registry/merge.spec.ts` (merge behaviour and each policy rule against fixtures) and `registry/allModules.spec.ts` (the same rules against the real 85 keys, plus the counts).

## Further reading

- [docs/resolve/](../resolve/README.md) — what the resolver does with these declarations.
- [docs/ports/](../ports/README.md) — where `raw()` for `envDefaultKey` comes from, and where an override is actually written.
