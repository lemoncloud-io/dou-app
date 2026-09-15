# plans — what runs underneath

The scheduler and the plan base classes come from `@lemoncloud/chatic-sockets-lib`. This package
supplies five plan instances and a manager around them; everything on this page is behaviour of the
library, and it is written down here because none of it is visible from a plan's constructor and all
of it changes what a callback means.

Read [README.md](./README.md) first for who owns what.

## Where the boundary sits

```txt
SyncManager                        ← this package: how many runtimes, which targets, whose account
 └ ClientSocketRuntime             ← keepAlive + reconnect + rotation + scheduler, one timer loop
    └ DomainSyncScheduler          ← "what should be re-read now"
       └ DomainSyncPlan × 6        ← per-domain strategy; five of them are ours
          └ callbacks              ← this package again: write to a repository
```

`ClientSocketV2` matches a `domain.action` request to its `domain.action:ok|:error` response by
message id and knows no domain policy. The scheduler subscribes to `client.onState` for connection
changes and `client.onMessage` for `*.sync` pushes: **it does not run before the socket connects, it
starts on `connected`, and it stops every timer on `closing`/`closed`.** Every difference between
domains lives in a plan.

## Two plan families

| Plan        | Version axis | `run` (poll)  | Update trigger               | On 403/404                       | Needs an id             |
| ----------- | ------------ | ------------- | ---------------------------- | -------------------------------- | ----------------------- |
| **Device**  | `tick`       | `device.read` | re-run                       | **retries forever** — it is mine | no (current connection) |
| **Channel** | `updatedAt`  | `channel.get` | re-run                       | auto-stop after 2                | yes                     |
| **Profile** | `updatedAt`  | `profile.get` | re-run                       | auto-stop after 2                | yes                     |
| **Place**   | `updatedAt`  | `place.get`   | re-run                       | auto-stop after 2                | yes                     |
| **Join**    | `updatedAt`  | `join.get`    | re-run / `join.sync` push    | auto-stop after 2                | yes                     |
| **Chat**    | `chatNo`     | **no-op**     | `onTrigger` appends directly | n/a                              | yes                     |

Channel, Profile, Place and Join are one polling-plus-`updatedAt` template. Device is that template
with a `tick` axis, a pre-send hint and a never-stop failure policy. **Chat is the one that is
genuinely different**, and most surprises come from treating it like the others.

### Chat is event-driven

`run` does nothing. Everything happens on two events:

| Path                                 | Behaviour                                                                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `onTrigger` — a `chat.sync` push     | `chatNo === lastNo + 1` appends the payload directly, with no server round trip. A gap is filled by fetching just that range       |
| `onConnected` — a reconnect          | Reads the channel's newest `chatNo` and catches up the interval between it and `lastNo`                                            |
| A duplicate or an out-of-order frame | `chatNo <= lastNo` is ignored, which is what makes the path idempotent                                                             |
| A large gap                          | Only the newest `cap` (default 50) are filled; the rest is the app's lazy-load. The retained window is `maxMessages` (default 500) |

Two consequences that bite:

- **`snapshot.messages` is not a reliable history.** After a large gap `lastNo` jumps to the server's total while the interval below it was never fetched, and the window is truncated at `maxMessages` anyway. Accumulate what arrives through `onApply` in your own store, keyed by `chatNo`.
- **A payload for a `chatNo` already resolved is an _update_, not an append.** `hidden: true` means the message was deleted, anything else is an edit, and it fires even for messages that have scrolled out of the window — so apply by id and expect repeats. `lastNo` means "the highest resolved", not "the highest received", which is what stops it stalling on a gap a hidden message left.

Chat also serializes itself. The scheduler does not serialize `onTrigger`, so `ChatSyncPlan` keeps a
per-channel promise chain to stop a read-modify-write race; the polling plans rely on the scheduler's
own in-flight guard.

**It depends on a server contract the client cannot enforce**: the `chat.sync` push must carry the
full `ChatView`, body included. A thin nudge makes every live-appended message render with empty
content.

## Behaviours the source shows and the API does not

1. **Only Device sends a `sync` hint before reading.** Each `run` sends a `device.sync` carrying the last known tick before calling `device.read`. No other plan does.
2. **Polling plans stop themselves; Device never does.** The scheduler classifies 403 and 404 as `gone`; after two the target is stopped and `onRemove` fires. So `onRemove` on a channel, place or profile means "deleted, or you lost access" and must be wired to that, not treated as an error. Device overrides the policy to always retry — it is your own device.
3. **Polling slows down on its own.** If `run` does not change the snapshot the interval doubles, up to 60 seconds (30 for device). A `*.sync` push or a failure resets it immediately. A channel poll that started at 2 seconds and drifted to a minute is working as designed.
4. **A `*.sync` push is broadcast to every target of that domain.** The scheduler fires `onTrigger` on all of them whenever a message type starts with `<domain>.` and ends with `.sync`; filtering to the right id is each plan's own job.
5. **A manual gateway call never reaches a plan.** A response type ends in `:ok`, so it does not pass the trigger filter — only a bare `<domain>.sync` push from the server does. The delta comes back on your promise and nowhere else, which is why [`updateLocalSnapshot`](./README.md#updatelocalsnapshot-is-the-bridge-and-it-is-domain-agnostic) exists.
6. **Re-registering an existing target merges, it does not restart.** Matching keys have their fields merged and nothing else happens — safe to call on every mount. A changed `intervalMs` takes effect on the next tick rather than immediately.
7. **A single dropped push on a live connection is not self-healing.** Reconnect catch-up covers a reconnect; a push lost while the socket stayed up, with no message after it, stays lost until the next message or the next reconnect.

## Client rules that follow from all of that

- **The client does not own `tick`, `chatNo` or `updatedAt`.** They are "the server version I know about". Never send one, and never apply a lower one.
- **Send a `<domain>.sync` with `send()`, not `request()`.** The response may be omitted entirely.
- **Merge only what a callback gives you.** The scheduler decides idleness by whether the snapshot moved, so writing outside the callbacks makes it back off while data is changing.
- **Branch on the numeric `errorCode` first**, falling back to the `:error` suffix.
- **Wire `onRemove` to a "gone" state**, not to a retry.

## Device: three different writes

`device` is the only plan that runs before authentication, and it is the only domain with two write
paths. They are not interchangeable.

| Intent                                        | Call                                      | `tick`    | Response               |
| --------------------------------------------- | ----------------------------------------- | --------- | ---------------------- |
| Keep the connection registered                | none — the runtime does it on `connected` | +1        | —                      |
| Change my device state (`posX`, `posY`, name) | `saveDevice(body)`                        | **+1**    | the device view        |
| Announce presence (foreground/background)     | `syncDevice({ status })`                  | unchanged | none — fire and forget |
| Announce what I am looking at                 | `syncDevice({ viewingType, viewingId })`  | unchanged | none — fire and forget |
| Watch another device                          | `registerDevice(id)`                      | —         | plan callbacks         |

**State goes on the version axis; attention does not.** Sending a viewing change through `save`
bumps the tick and makes every watcher re-synchronize for something none of them needed. Three rules
follow: send `viewingType` and `viewingId` together or clear them together; send `status` on its own
because the server merges partially, and padding the viewing fields with empty strings erases the
attention; and throttle anything derived from continuous input, because every `save` is a tick.

A plain "I am online" needs no call at all — the runtime's connect-driven save already sets it.

## Further reading

- [README.md](./README.md) — `SyncManager`, the registry, and chat prime
- [docs/socket/](../socket/README.md) — the slots these runtimes attach to
- [`libs/data`](../../../data/README.md) — the repositories the callbacks write through, and the device repository behind `saveDevice`/`syncDevice`
