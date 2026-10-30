# connection — the host, the slots it derives, and the binders

`connection/` is the React layer over the socket manager. The host mounts once per app; from the
session's state it derives which slots should exist — relay, the committed cloud, a background slot
per other joined cloud — and two binders reconcile the manager with that. The manager itself, its
slots, the active facade and their contract are `@chatic/transport`'s:
[its socket doc](../../../transport/docs/socket/README.md).

## Layout

```text
connection/                          19 source files
├── RuntimeConnectionHost.tsx      both hosts — one component, one switch
├── SocketBinder.tsx               reconciles the slots and the active pointer
├── SocketReauthBinder.tsx         re-authenticates a slot whose identity changed
├── types.ts                       RuntimeSocketSlot · RuntimeSocketSlots
├── utils/socketRebootKey.ts       the identity key both binders must agree on
├── utils/backgroundSlots.ts       the live reads behind background slots
├── utils/slotSignals.ts           the session signals the slot derivation re-reads on
└── hooks/                         useRuntimeSocketSlots · useSocketSessionDelegate ·
                                   useRuntimeSocketState · useSlotVerified · useCloudVerified ·
                                   useVerifiedClouds · useConnectivity · useBackgroundClouds ·
                                   useBackgroundCloudTokens · useBackgroundReceive ·
                                   useReclaimOwnedClouds
```

## Usage

### Mounting the host

```tsx
<runtime.connection.RuntimeConnectionHost>{children}</runtime.connection.RuntimeConnectionHost>
```

`RuntimeHostProps` is `{ slots?, children? }`. **`slots` is normally omitted** — the host derives them
itself. It remains as an override for tests and for a host that must inject them.

The host is the single init driver: `useRelaySessionInit()` runs session initialization once and the
host renders `null` until it resolves, so no binder mounts against an unprepared session. It also
owns the per-slot auth delegate (`useSocketSessionDelegate`), so an app injects nothing, and it calls
`useRelaySessionKeepAlive` above the gate.

`RuntimeAuthHost` is the same component with background guest login switched off, for a console that
must not silently acquire a session. It is a second named export rather than a prop with a default
because a forgotten prop would hand a console a guest session and nothing would say so — the name is
the safeguard.

### How a slot is derived

[`useRuntimeSocketSlots()`](../../src/connection/hooks/useRuntimeSocketSlots.ts) subscribes to exactly
three signal kinds — `relay:token`, `cloud:token`, `selection` — and reads the matching narrow
snapshot, plus the background store's version, which moves the background slots only
([Background slots](#background-slots)). **Both have to be narrowed together**: subscribing to a subset while reading the full
context renders values from signals nobody is listening to. `identity` is excluded deliberately; boot
alone emits it twice and every login adds one, each of which used to re-render this hook and hand
both binders a new-but-equal slots object.

Four rules produce the result:

- **Each slot is gated on its own server having a token.** The relay wss is a static env value that exists before login, so gating on the URL alone would boot a socket with nothing to authenticate with. Login turns a slot on; logout turns it off.
- **`identityToken` rides beside `config`, not inside it.** `SocketBinder`'s reboot key reads only `config`, so a token refresh leaves the config stable and the socket alive, while `SocketReauthBinder` watches this field per slot.
- **No cloud slot carries an `identityToken`, committed or background.** A switch lands either on a cloud with no slot, which registers from scratch when it boots, or on a background slot whose own registered tokens the switch commits unchanged ([docs/auth/](../auth/README.md)) — either way there is no identity change on a live connection to watch for. A cloud token re-issued _without_ a switch is therefore invisible to both binders, and `renewCloudSession` re-registers explicitly.
- **The cloud slot's cid is the committed cloud**, read from the delegation token — not the selected one, which flips at the start of a switch. Using the selected value made the config describe two clouds at once during the optimistic window: the target's cid next to the outgoing cloud's URL and token.

### Background slots

Every cloud the account belongs to keeps a socket session while the user is somewhere else — another
cloud, or home. A write addressed to a cloud then has a live socket to go to whichever cloud is on
screen (and a cloud past the cap is held for the length of the write — below), and switching back to a kept cloud costs no reconnect and no token exchange. These slots have no sync
targets — no screen of theirs is mounted — but they do receive: a receive loop keeps each background
cloud's room list, last messages and `$join` current with one `channel.sync` a minute, so entering a
kept cloud finds its list already cached ([docs/sync/](../sync/README.md#background-receive)).

The pieces, and who owns each:

| Piece                                                                         | Owner                               | Does                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connection.useBackgroundClouds(cids)`                                        | the app (`BackgroundCloudsRunner`)  | hands over membership — the owned catalog plus the invited-cloud cache — which only the app can see                                                                                                         |
| `connection.useReclaimOwnedClouds(cids, alsoInvited)`                         | each app (`BackgroundCloudsRunner`) | hands over the owned catalog, and the owned clouds also cached as invited; an owned cloud held as an invitee is re-issued as the owner ([docs/auth/](../auth/README.md#an-owned-cloud-held-as-its-invitee)) |
| [`selectBackgroundClouds`](../../../transport/src/socket/backgroundClouds.ts) | transport                           | drops relay and the committed cloud, orders the rest by recent use (`cloudStore.getRecentClouds`, then the app's order), caps at 5, then adds held clouds                                                   |
| [`BackgroundCloudTokens`](../../src/socket/auth/backgroundCloudTokens.ts)     | runtime                             | issues a cloud's tokens before its slot boots ([docs/auth/](../auth/README.md))                                                                                                                             |
| [`readyBackgroundConfigs`](../../src/connection/utils/backgroundSlots.ts)     | runtime                             | one `cloud` config per selected cloud whose cached entry is ready, URL from the cached delegation token                                                                                                     |
| `SocketBinder`                                                                | runtime                             | binds them beside relay and the committed cloud; never makes one active                                                                                                                                     |

**The cap is five** — the largest subscription tier's allowance of owned clouds, so an account that
only owns clouds never reaches it. Invited clouds are not bounded by any plan; past five in total,
the cap keeps the clouds entered most recently. Each background session costs one socket and a
token issue per lifetime (two HTTP calls); the cap is what bounds that per device.

**Moving between background and committed is the same slot.** Its key is the cloud and its reboot
key `url|deviceId|wssType` does not change, so `ensure` reuses the client. Leaving a cloud for home
leaves it bound too, so going home is not signing out.

**A slot torn down with its session still good is signed off first.** When a cloud slot leaves the
desired set while the relay stays, `SocketBinder` asks `hasLiveJoinedSession(cid)` — still in the
app's list, cached tokens still usable — and, if so, sends that socket `auth.logout` before
destroying it: the cloud was pushed past the cap, and its server should hear the session end rather
than time it out. A cloud no longer joined, or whose session already expired, has nothing to sign
off from; a relay logout has already notified every slot. `logoutCloudSession` covers exactly the
opposite case for the cloud it leaves, so no socket is notified twice.

### Holding a slot for a write

A write addressed to a cloud needs that cloud's socket until its ack comes back, and neither the cap
nor the joined list knows a write is in flight: a switch can push the cloud out of the selection, and
a cloud the account has just left is not in the app's list at all. `backgroundClouds.hold(cid)`
covers that gap. It returns a release, and until the release is called:

- **the cloud is selected whatever the cap and the list say** — appended after the capped selection rather than competing for a place in it, so holding one cloud for the length of a send never tears another's slot down;
- **only a slot that is bound is kept** — a hold opens none. The write that took it goes out at once, so a slot booted for it would arrive after that write had already failed, and be torn down again as the hold ended;
- **`logoutCloudSession` does not sign it off** on the way home, because a logout on that socket would unauthenticate it under the ack. The cost is one case: a held cloud that is no longer in the app's list is then never told `auth.logout` — once the hold ends, the binder tears its slot down without signing off, as it does for any cloud not joined — and closing the socket is what ends that session.

Holds are reference-counted — two sends to one cloud overlap, and the first to settle must not free
the slot the second is waiting on — and the first hold and the last release announce like any other
change to the store. The relay and the committed cloud have slots of their own and are never
selected as background ones for a hold. `runInCloud` (`data/cloudChat.ts`) is the only caller
(`sendChatInCloud` and the image send go through it); it takes the hold before anything awaits, so
it is in place before any switch it races with commits.

The derivation re-runs when the session signals move and when the background store announces —
the app's list changed, or a cloud's cached tokens were issued or dropped (the token cache announces
nothing on its own, so the preparer and the cloud renewer call `backgroundClouds.invalidate()`).

The debug overlay's State screen lists every bound slot through `getSlotStatuses()` — key, kind,
whether it is active, transport state, verified, and `connectCount` — because a background slot's
reconnects never reach the active `SocketState`.

### The two binders

`SocketBinder` owns every slot through **one reconcile effect**. Each render turns the slots into a
desired set — slot key → config — and a desired active slot (the cloud's key, or `null` for relay).
The effect is keyed on each desired slot's key plus its **reboot key** `url|deviceId|wssType`
([`socketRebootKey.ts`](../../src/connection/utils/socketRebootKey.ts), shared with the other binder
so the two cannot drift), and runs three steps in a fixed order:

1. **Bind** every slot that is new, or whose reboot key moved, through `bootstrapSocketConnection`.
   A reboot detaches the previous boot's SDK subscriptions first; `ensure` then rebuilds the client
   because its config differs.
2. **Point** the facade: `setActiveSlot(desired active)`.
3. **Tear down** every slot the manager holds that is not desired — read from `getSlotKeys()`, not
   only from what this binder remembers booting, because a remount starts with an empty memory.

Step 1 is finished by the time step 2 runs because `bootstrapSocketConnection` calls `ensure` before
its first `await`, so the pointer never names a slot that has not been created.

The effect's key carries the desired **active** slot too, on its own. A switch between two clouds
that both hold a slot — one committed, one in the background — leaves every slot key and reboot key
where it was; only which of them is active moves. Keyed on the slot set alone, that switch never
re-ran the reconcile and the facade stayed on the cloud the user had left.

Several clouds hold connections at once, by design, from the same device id. That is a change: until
background slots, step 1 was also what kept a switch from ever having two clouds connected — B's
`connect` came after the `await`, and A was gone by then.

A bootstrap that fails is forgotten, so the next reconcile tries that slot again. Until it binds, the
pointer names an unbound slot and the facade stays on relay; the binder logs that alongside the
failure.

This replaced two independent `useSocketSlot` effects, one per role, whose relative order across a
switch was whatever React ran first — and a guard that reported a cloud switch arriving on the same
wss host as an unsupported case. With slots keyed by the cloud, a different cloud is a different
slot whatever its URL, so the guard had nothing left to detect and is gone.

`cid` is not in the reboot key because it is already the slot's key. The identity token is not in it
because a refresh must not reboot a healthy socket.

Unmount detaches every boot's subscriptions and forgets them, but destroys no socket. That is what
StrictMode (desktop-web runs under it) relies on: the second mount re-bootstraps each slot, `ensure`
finds the config unchanged and reuses the client, and a boot from the first mount that resolves late
detaches itself. The unmount half is a separate `[]` effect, so a dependency change never detaches a
slot the reconcile is about to keep.

It also calls `getSyncManager()` in its render body. That looks stray and is not: a slot's sync
runtime must exist _before_ the slot binds, because the runtime owns that connection's
`device.save`, and `device.save:ok` is what opens the auth gate. It used to work by accident —
whichever code touched a repository first built the data manager, which built the socket runtime,
which built sync — and this call states the requirement instead.

`SocketReauthBinder` watches each slot's `identityToken` and calls `reauthenticateActiveSocket` when
it moves **and a reboot is not already happening**, since a reboot re-registers anyway.

### Reading connection state

| Hook                      | Answers                                                                     |
| ------------------------- | --------------------------------------------------------------------------- |
| `useRuntimeSocketState()` | The **active** slot's `{ state, isConnected, isVerified, connectionId }`    |
| `useSlotVerified(key)`    | Is _this_ slot verified, whatever is active — for gating a slot-pinned call |
| `useCloudVerified(cid)`   | The same, named by cloud id — a missing id is the relay                     |
| `useVerifiedClouds()`     | Every cloud whose slot is verified — for work that spans all of them        |
| `useConnectivity()`       | What to tell the **user**: `online` · `reconnecting` · `offline`            |

`useConnectivity` is a display verdict, not an auth verdict, which is why it was never folded into
`deriveAuthStatus`: it answers "what do we say", while `AuthStatus` answers "what does the runtime
do". Its truth table encodes one asymmetry — `navigator.onLine` is a **strong negative** and an
**unreliable positive** (`true` only proves an interface is up). So with the browser online, a closed
socket reads as **reconnecting, not offline**: the fault is ours, and telling the user to check their
wifi sends them after the wrong thing. Boot (`state === 'idle'`) reads as `online`, because nothing
has been attempted yet. When the link counts as down is the transport's rule:
[When is the link down](../../../transport/docs/socket/README.md#when-is-the-link-down).

### What not to do

- **Do not put the identity token into the reboot key.** A refresh would reboot a healthy socket. `cid` needs no place in it either — it is already the slot's key — and both binders share the key.
- **Do not take a raw `ClientSocketV2` and hold it** in a hook or a binder. Clients are rebuilt on every config change; [the socket doc](../../../transport/docs/socket/README.md#what-not-to-do) has the rest of the manager's rules.

## Further reading

- [`@chatic/transport` socket doc](../../../transport/docs/socket/README.md) — the manager these binders drive, slot keys, the active pointer, state and failure reporting
- [docs/auth/](../auth/README.md) — what `bootstrapSocketConnection` and `reauthenticateActiveSocket` do on these slots
- [docs/sync/](../sync/README.md) — the per-slot runtimes, and the background receive loop
- [`libs/session`](../../../session/README.md) — the signals `useRuntimeSocketSlots` subscribes to
