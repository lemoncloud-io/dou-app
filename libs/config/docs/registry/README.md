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
├── modules.ts     ALL_MODULES — the 14 domain modules, in merge order
├── system.ts   2  the two keys the lane machinery itself needs
├── env.ts     13  read-only build facts
├── net.ts     12  endpoints, deeplink schemes, HTTP retry
├── ui.ts      16  user preferences — theme, blur, push mute, pin, sort, rail order, home sections, recent searches, photo grid columns, photo send grouping, phone country
├── log.ts     11  collection and upload levers, plus upload tuning
├── auth.ts    10  session, credential refresh and retry timing
├── debug.ts    6  the debug panel's own controls
├── feature.ts 10  per-stage gates — phone auth shortcuts, social login, desktop phone sign-in, device pairing, subscription dry run — and the Lab experiments (place invite, chat input lock)
├── sync.ts     6  socket and sync cadence
├── limit.ts    4  operational guardrails
├── cache.ts    3  cache TTLs
├── bridge.ts   2  bridge request and handshake timeouts
├── port.ts    15  which adapter fills each port, and which engine runs
└── checkout.ts 1  the web checkout's sandbox, a developer lever
```

112 keys. `allModules.spec.ts` asserts that number, so it cannot drift silently — but the command is
what proves it:

```bash
grep -chE "^    '" libs/config/src/registry/{system,env,net,ui,log,debug,feature,limit,bridge,auth,sync,cache,port,checkout}.ts
```

The split is by domain because one file past eighty keys stops being readable, not because the
modules mean anything to the resolver. After `ConfigRegistry.merge` there is one flat map.

## Responsibilities

The registry decides what a key means and refuses to decide what it is worth right now. It also
refuses to stop the boot.

**A duplicate key does not throw.** `merge` keeps the **first** declaration, drops the later one, and
calls `onDuplicateKey`. The reason to reject one is real — two domains reading the same key
differently is a genuine bug — but 85 of 111 keys are developer-facing, and one mistake among those
must not keep every user's app from starting. The check moved to a test instead. Merge order is fixed
in `modules.ts`, so two devices never disagree about which declaration survived.

**An impossible combination does not throw either.** `findPolicyViolations` walks the merged map and
returns a list of strings; `allModules.spec.ts` asserts it is empty. At runtime nothing acts on it.

## The shared contract

Every entry is a `ConfigEntry` (`src/types.ts`). Fourteen fields, seven of them required.

| Field           | Required | What it settles                                                                                                                      |
| --------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `title`         | yes      | The human name a panel shows instead of the dotted key. Written in English — the only consumer is the developer-facing debug overlay |
| `description`   | yes      | One sentence: what this changes, and why it exists when that is not obvious                                                          |
| `type`          | yes      | `boolean` · `string` · `number` · `enum` · `json`. Every lane's value is checked against it                                          |
| `defaultValue`  | yes      | The floor. This is why `get` can be synchronous and never fail                                                                       |
| `values`        | enum     | The allowed list. An `enum` without one is a policy violation                                                                        |
| `pattern`       | no       | A `RegExp` a `string` value must match, for an open set of values this lib cannot list. Checked on every row, like `values`          |
| `byStage`       | no       | Per-stage default. Row 5                                                                                                             |
| `byPlatform`    | no       | Per-platform default, also row 5                                                                                                     |
| `envDefaultKey` | no       | The raw build value this key's default comes from. Row 6 — below a declared rule, above the literal                                  |
| `surface`       | yes      | Which screen would draw a control: `user` · `labs` · `dev` · `internal`                                                              |
| `writableBy`    | yes      | Who may write it in principle: any of `shell` · `local` · `server`. `[]` means nobody — the build is the only source                 |
| `persist`       | yes      | Where an override is kept: `shell` · `local` · `session` · `none`                                                                    |
| `appliesAt`     | no       | `live` · `reconnect` · `restart`. Descriptive metadata for a panel. This lib never forces a reconnect or a restart                   |
| `meta`          | no       | This key is part of the lock machinery. Two consequences, both below                                                                 |

`surface`, `writableBy` and `persist` are **orthogonal**. A `user` key can persist to the shell
(`ui.theme`) or to local storage (`ui.pushMuted`); a `dev` key can be unwritable by anyone
(`env.project`). Nothing is inferred from anything else.

### The four surfaces

Measured from the source, and asserted in `allModules.spec.ts`.

| Surface    | Keys | Where its control lives                                                                                                   |
| ---------- | ---: | ------------------------------------------------------------------------------------------------------------------------- |
| `user`     |    4 | Settings and its notification sub-page. A hand-built row per key, not a generated one                                     |
| `labs`     |    2 | The Lab page's Experiments card. A hand-built row per key, like `user`; `feature.placeInvite` and `feature.chatInputLock` |
| `dev`      |   86 | The web debug overlay's `ConfigScreen`, which lists them all and edits the ones this device may write                     |
| `internal` |   20 | Nowhere. Code reads it, or product UI writes it through a flow of its own                                                 |

**Declaring a surface does not create a screen.** There is no renderer that walks the registry and
produces Settings rows. `ConfigScreen` is the one generic viewer and it covers `dev` only.

The `internal` keys are the interesting boundary. `ui.channelSort`, `ui.pinnedChannels`, `ui.railOrder`,
`ui.homeSectionsCollapsed`, `ui.recentSearches`, `ui.photoGridColumns`, `ui.photoSendGrouped` and
`ui.phoneCountry` are changed by a person constantly — but through a sort picker, a pin gesture, a drag on
the rails, a section header, a search box, a pinch on the photo grid, the grid's "send as one message" box
and a phone field's country picker, not through a settings screen.
`internal` is what stops a generic panel from drawing a second, competing control for them.

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

| Axis            | Counts                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `writableBy`    | `['local','server']` 35 · `[]` 22 · `['local']` 22 · `['shell','local','server']` 15 · `['shell','local']` 10 · `['shell']` 6 |
| `persist`       | `session` 43 · `local` 32 · `none` 26 · `shell` 9                                                                             |
| `appliesAt`     | absent 61 · `live` 26 · `restart` 20 · `reconnect` 3                                                                          |
| Declared rules  | `byStage` 13 · `byPlatform` **0** · `envDefaultKey` 32 · `pattern` 15                                                         |
| Server-writable | 50 of 109                                                                                                                     |

Two readings worth carrying.

**`byPlatform` has no user.** The field is declared, the resolver folds it, and not one of the 109
entries sets it. It is live code with no exercise outside `ConfigResolver.spec.ts`.

**22 keys have no writer at all.** `writableBy: []` means the build is the only source — every
`env.*` key, most endpoints, and `debug.entryCode`. A panel must render these read-only, and
`ConfigSnapshot.canWrite` already says so.

Two more keys are writable in principle and have no writer in practice. `net.relay.backend` and
`net.relay.wss` are `writableBy: ['local']`, and the only code that touches them is the logout path,
which **clears** them. The `?_backend` query parameter that shares their purpose is consumed by the
invite flow and never lands in the registry, so today the debug panel is the only thing that can set
either.

### The enforced invariants

`findPolicyViolations` (`registry/index.ts`) checks five rules. `merge.spec.ts` covers each one, and
`allModules.spec.ts` runs them against the real registry.

| Rule                                                   | Why                                                                         |
| ------------------------------------------------------ | --------------------------------------------------------------------------- |
| `user` and `labs` must include `local` in `writableBy` | A user-facing setting nobody on the web can write is a contradiction        |
| `user` and `labs` cannot be `meta`                     | A lock key on a user screen is the recursion the `meta` flag exists to stop |
| `labs` must include `server` in `writableBy`           | An experiment nobody can turn off remotely does not go out to users         |
| `enum` must have a non-empty `values`                  | A choice without options cannot be rendered or validated                    |
| `pattern` only on a `string`, and the default matches  | A floor its own pattern rejects leaves the key with no acceptable row       |
| `title` and `description` must be non-blank            | A nameless key shows up in the panel as a dotted string                     |

## Usage

### Adding a key

1. **Pick the domain file.** The dotted prefix and the filename agree — `ui.foo` goes in `ui.ts`. If neither fits, the question is whether the setting belongs in this registry at all; see [What not to do](#what-not-to-do).
2. **Write `title` and `description` in English.** They are what a panel shows. The description says what changes, not what the key is called.
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

### The checkout sandbox — `checkout.sandbox`

A `boolean`, `surface: dev`, `writableBy: ['shell','local']`, kept on this device and applied at the next
start. On, the web app's in-app checkout sends its payer calls with `?sandbox=1`, which the payment server
answers with its mock provider. The app reads it only in a dev or local build, and a virtual shell's own
sandbox wins over it (`apps/web/docs/feature/subscription/README.md` § 6). The web debug overlay draws it as a
switch, and draws `port.checkout` as a list of the runtime's candidate adapters, those the host does not
offer disabled.

### Port choices — `port.*`

One `string` key per runtime port says which adapter fills it: `port.storage`, `port.transport`,
`port.auth`, `port.foreground`, `port.cache`, `port.checkout`, `port.media`, `port.files`,
`port.links`, `port.appShell`, `port.signIn`, `port.diagnostics`, `port.push` and `port.logSink`.
The value is an adapter id — `<port>.<adapter>`, the port name exactly as in the key and the adapter
in lower case with dashes (`cache.memory`, `appShell.native-ios`). The empty string is the floor and
means "use the default the app declared for this port".

This lib stores and resolves the choice and nothing more. Which adapters exist, which one is a port's
default, and whether the host can run the one chosen are the app's declaration; the code that builds
the port — `startRuntime` in [`@chatic/runtime-client`](../../../runtime/docs/api/README.md#resolution) —
checks the resolved id against it and falls back to the declared default. This lib is what almost every
package depends on and imports nothing, so it must not learn a port's meaning, an adapter or a host. The `pattern` only
rejects an id that cannot be anybody's — a wrong shape, or another port's id — so it is demoted to the
next row before it reaches that check.

All fifteen — one per port, plus `port.engine` — are declared alike, as developer levers:

| Field           | Value                        | Why                                                                                   |
| --------------- | ---------------------------- | ------------------------------------------------------------------------------------- |
| `surface`       | `dev`                        | On a PROD build the local lane takes a value only after the override unlock           |
| `writableBy`    | `['shell','local','server']` | Every lane may supply one: the point is to switch an adapter without a release        |
| `persist`       | `local`                      | The choice applies at the next boot, so it has to survive the restart that applies it |
| `appliesAt`     | `restart`                    | An adapter is built once, at boot                                                     |
| `envDefaultKey` | `VITE_PORT_<PORT>`           | A build may name one (`VITE_PORT_APP_SHELL`); below every lane, above the empty floor |

The shell lane is not behind the unlock — that gate covers the local lane only, as for every key —
so a value the native app stored is honoured on PROD too.

To read the choice **with the row it came from**, use `config.snapshot(key)`: its `value` is the id
and its `origin` is the row that won (`serverEnforced` · `shell` · `local` · `serverDefault` ·
`stageRule` · `default`). A build value and the empty floor both report `default`; tell them apart by
the value. `isOverridden` is true for rows 1 to 4 only, so the boot-time state log
(`overriddenSnapshots()`) shows a lane's choice and not a build value's.

### Keys declared with a reason worth keeping

- **`bridge.request.timeoutMs` is `restart`.** `WebBridgeClient` copies it into an instance field at construction, so a changed value does nothing until the client is rebuilt. Its own fallback (10 s) once disagreed with the provider's (15 s), so which was live depended on the call path; this key is the one place that settles it. The `log.upload.*` tuning keys are `restart` for the same reason: the upload scheduler captures them at construction.
- **`auth.resendLimit` includes `server`.** An SMS cost spike is exactly the day it has to be tightened without a deploy.
- **`cache.ttl.*` are declared but not yet read.** The caches still take their TTLs from the data lib's cache policy, and the two defaults here (30 minutes, for general caches and the sync cursor) mirror it. Changing the key changes nothing until a consumer is wired.
- **`debug.overlayEnabled` has a per-stage default** that removes the tap-count friction in LOCAL and DEV while PROD stays as strict as before. It and `debug.entryCode` are `meta`, so the unlock check does not apply to them. `entryCode` comes from the build only; unset, it is `''`, which means no code and no dialog (fail closed).
- **`feature.auth.emailLogin` is off outside developer stages.** It exists to switch between seeded test accounts, not as a product entry point.
- **`feature.placeInvite` ships opt-in.** A place invite cannot be taken back once issued and the invitee appears in no member list, so it is not on everyone's home menu by default. `feature.chatInputLock` (the per-room composer lock) is opt-in for the same reason: nobody knows yet whether a per-room lock is wanted.
- **`ui.language` uses `shell`** so the choice reaches the native app and survives a WebView storage wipe. `apps/web` resolves the language before `config.init()` runs, so it reads the boot envelope and the local mirror itself, in the resolver's order. `ui.phoneCountry` is `local` rather than `shell`: it is a convenience of this browser, and the device locale is a fine fallback.
- **`ui.channelSort`, `pinnedChannels`, `homeSectionsCollapsed`, `recentSearches`, `photoGridColumns` and `photoSendGrouped` are `internal`** even though a person changes them, because they change through a picker, a gesture or a header rather than a settings screen, and a generic settings UI must not render a row for them.

### What not to do

- **Do not put a product entitlement here.** Place and channel counts belong to the server's product catalogue. `feature.limits.enforced` is a bypass gate, not a limit value, and `limit.*` holds only guardrails with no tier meaning — image size, resend attempts, result caps.
- **Do not declare a `labs` key without `server` in `writableBy`.** The test catches it, but by then the design is already wrong.
- **Do not declare a user setting as `dev`.** The unlock gate applies to `dev` and nothing else, so on a PROD build the local lane is shut and the feature has no other writer. That was a real outage shape: six `writableBy: ['local']` keys — pin, sort, recent searches, push mute, promo and update dismissal — would have been permanently dead in PROD.
- **Do not store a setting under a key of your own.** Bypassing the registry loses the lanes, the lock and the snapshot. The `@chatic/config.` prefix is also an exception in `libs/runtime`'s logout storage sweep, so settings survive logout — a value that must not survive it is session state, not a setting.
- **Do not expect a duplicate key to fail loudly.** It logs and the first declaration wins. The test is the gate.

## Notes for implementers and tests

- **`ConfigRegistry` has no public constructor.** `merge` is the only way in, and it takes the module array plus an optional `onDuplicateKey`. `createConfig(modules)` exists so a test can build a registry from fixtures instead of the real 111 keys; nothing in the apps calls it.
- **`testing/fixtures.ts` is the intended seam.** `entry()` gives a minimal `ConfigEntry` so a test states only the field it is about; its default `surface` is `'dev'`, which means a test about the unlock gate gets the gated behaviour for free and a test about user settings must override it.
- **`UNLOCK_ENTRY` is a fixture, not the registry's own declaration.** It mirrors `system.overridesUnlocked` closely but is a separate object — changing one does not change the other.
- **`isPersisted` in `utils/serialize.ts` has no caller,** inside this lib or outside it, and it is not on the barrel.
- The registry's own tests are `registry/merge.spec.ts` (merge behaviour and each policy rule against fixtures) and `registry/allModules.spec.ts` (the same rules against the real 111 keys, plus the counts), and `registry/port.spec.ts` pins the `port.*` declarations end to end through the facade.

## Further reading

- [docs/resolve/](../resolve/README.md) — what the resolver does with these declarations.
- [docs/ports/](../ports/README.md) — where `raw()` for `envDefaultKey` comes from, and where an override is actually written.
