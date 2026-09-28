# ADR-0115: A socket slot is keyed by the cloud it serves, not by the role it plays

> Status: Accepted · Decided: 2026-09-28 · Implemented: `refactor/socket-slots-by-cid`
> · Scope: `libs/app-runtime/src/socket/**` · `libs/app-runtime/src/connection/**` ·
> `libs/data/src/remote/gateways/socket.ts` (the unused `cloud` route) · the app call sites that pinned
> the relay slot
> · Related: [ADR-0112](./0112-the-cache-partition-is-the-one-an-operation-was-captured-for.md) (the
> cache half of the same question — which cloud a write belongs to) ·
> [ADR-0045](./0045-push-relay-cloud-routing-crossover.md) (`'#'`, the relay marker in push payloads)
> · The module doc is [libs/app-runtime/docs/socket](../../libs/app-runtime/docs/socket/README.md#a-slot-is-keyed-by-the-cloud-it-serves)

## Context

`SocketManager` holds a relay socket and, while a cloud session is active, one cloud socket. Both were
keyed by `SocketKind = 'relay' | 'cloud'`. That key names a **role**, not an address: `'cloud'` meant
"whichever cloud is committed right now".

The rest of the runtime already speaks in cloud ids. The cache partitions by `(cid, uid)`, the relay's
partition is `'default'` (`RELAY_CLOUD_ID`), the sync plans judge frames by cid, and ADR-0112 made a
write land in the partition of the cloud it was captured for. The socket layer was the one place that
could not name a cloud. Three things followed:

- **A write had no destination.** An outbox entry, or an upload-complete `chat.send`, could not say
  "cloud A". Once the user switched to cloud B, "the cloud slot" meant B.
- **A second cloud socket had nowhere to go.** Holding a socket for a cloud the user is not looking at —
  to finish a send, or to keep that cloud's cache current — needs a slot that is not "the" cloud slot.
- **The same cloud had two names.** A socket's cloud was a `boundCid` field frozen at bind time plus a
  `rebindCid` to re-point it, next to a key that did not say which cloud it was.

## Decision

1. **The key is the cid.** A slot is keyed by a branded `SlotKey` — the id of the cloud it serves —
   built by `slotKeyOf(cid)`. The relay's key is `RELAY_SLOT`, which is `RELAY_CLOUD_ID`, the value the
   cache already uses for the relay. `SocketBindingConfig.cid` is required and is the key.
2. **Relay/cloud is an attribute.** `kindOf(key)` derives it from the key alone. It still selects the
   credential, the renewer and the expiry policy — those differ per kind — but it no longer addresses
   anything. It is never derived from a token, because a relay token can carry a `cloudId`.
3. **The brand is the migration check.** Every former `'relay'`/`'cloud'` literal still type-checks as
   a `string`, and a missed one would name a slot that never exists — a subscription on it waits
   forever, silently. Making the key a branded type turns each missed call site into a compile error,
   and `slotKeyOf` throws on the legacy words for anything that casts past it. `desktop-web` is not
   type-checked in CI, so the compiler is not the whole net; the throw is the rest of it.
4. **A slot cannot change its cloud.** `boundCid` and `rebindCid` are gone; `getBoundCid()` reports the
   active slot's key. A switch that flips the cache cid first cannot relabel the outgoing socket.
5. **This change keeps at most one cloud slot.** `ensure` tears down another cloud's slot before it
   binds a new one, in the same call, so the active client goes from one cloud straight to the next.
   Lifting that limit is a separate decision; this one only makes it expressible.
6. **A cloud config can no longer land on the relay's slot.** The cloud slot used to fall back to cid
   `'default'` when no cloud was committed. Under cid keys that fallback names the relay slot and would
   replace the relay socket, so it is removed (no committed cloud, no cloud slot, and a warning), and
   `ensure` refuses a config whose `wssType` disagrees with its key.
7. **`'#'` is not a key.** It is the relay marker in the backend's push payload (ADR-0045), translated
   where a push is read. Inside the runtime one server has one name.

## Alternatives

- **Keep the role keys and add a cid field for writes.** Smallest diff, but it leaves two names for one
  socket — the role and the cid — and every consumer that needs "cloud A's socket" would have to scan
  for it. It also cannot express two cloud sockets without a third key type.
- **Composite keys, `'relay' | 'cloud:<cid>'`.** Carries both facts in one string, but the relay would
  then have a name the cache does not use, and every reader would parse the string back apart. The kind
  is fully determined by the cid, so storing it in the key is redundant.
- **Leave `SocketKind` as the key and move straight to multiple cloud slots.** The keying has to change
  first — N cloud slots cannot all be `'cloud'` — and doing both at once would make the behavioural
  change and the renaming impossible to review separately.

## Consequences

- The public surface changes: `useKindVerified` → `useSlotVerified(slot)`, and `ISocketManager`'s
  `*KindVerified` → `*SlotVerified`. `RELAY_SLOT` and `slotKeyOf` join the `connection` group. Every app
  call site pinned the relay, so each became `RELAY_SLOT`.
- The unused `cloud` socket route is removed from `libs/data` (`SocketRoute` is `'active' | 'relay'`).
  It named the role, and no caller used it.
- Failure streaks, `authIdRegistry` entries and log data are per slot; log lines keep the `relay`/`cloud`
  label for readers and carry the cid in their data.
- Nothing is observable to a user. The slot set, the active slot and every request's destination are
  what they were — which is the point of doing this on its own.
