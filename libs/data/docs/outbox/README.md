# outbox — state writes that reach the server when the socket can carry them

> Status: Live (`join.read`, `join.notify`, `join.nick`) · Last updated: 2026-10-14 · Overview in the [lib README](../../README.md) · Canonical code: [outbox/](../../src/outbox/) · The runtime half in [libs/app-runtime data](../../../app-runtime/docs/data/README.md#the-state-outbox-transport)

A **state write** sets one piece of state to a value: my read cursor in a room, my notification
setting for it, the name I gave it. Sending the same value twice is harmless and only the latest value
matters. Such a write is shown before the server answers and sent when it can be, so it goes **two
ways**:

```text
screen → repository.readChat / updateJoin
            ├─① local cache write ─────────────→ the screen, at once
            └─② outbox.set({ op, cid, uid, key, value, previous? })      ← data, not a function
                        │
               [transport, from the runtime] is cid's socket verified?
                        │ yes
                        ▼
               spec.deliver in cid's graph → socket → server
                        │
            ③ the answer → local cache (accepted: the server's row · refused: the value put back)
```

Order is local first, then the outbox; a local write that fails rejects the call and nothing is queued. There is no path from a
repository to the server for these writes that skips the outbox, so no screen can bypass it.

**Not a state write** — and so not here: a write the server has to answer before the app can go on
(creating a channel or a place, starting a 1:1, issuing an invite), one that must not run late
(leaving, deleting, a purchase), and a chat send, which is not idempotent and is ordered (the
runtime's chat outbox, `createChatOutbox`).

## What lives where

| File             | Holds                                                                                                                                                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ports.ts`       | `StateWrite` (the queued data), `WriteReceipt` (what a repository returns), `OutboxPort` (what repositories depend on), `OutboxTransport` (what the host supplies), `StateSpec` (how one state behaves), `OutboxObserver` / `OutboxDelivery` (what a measurement is told) |
| `stateOutbox.ts` | The machine, and `createImmediateTransport` for hosts with no socket runtime                                                                                                                                                                                              |
| `joinStates.ts`  | The three join states and `STATE_SPECS`                                                                                                                                                                                                                                   |

The split follows the lib's scope. **What** is sent and how values combine is this lib's: the specs
call repository methods and know each state's rules. **When** — whether a cloud's socket is up, the
retry timing, keeping the slot open during a send — is the connection lifecycle, which this lib does
not own; it arrives through `OutboxTransport`, which `libs/app-runtime` implements.

## The machine

- **One value per key.** A key is `(cid, uid, op, key)`. A new value folds into one still waiting (`merge`; default: it replaces it), and one request per key is in flight; a value set meanwhile goes right after. Keys never wait for each other.
- **Already there.** A value the server already holds (`isCovered`) resolves without a request — only while nothing waits for that key, and only for state no other device can move back. With a value queued, setting the accepted value again must replace the queued one, or the server would end on the queued value. A setting another device can change (notifications, a name) has no `isCovered`: "this outbox sent that value earlier" says nothing about the server now, so every value is sent.
- **Retries.** A failure while the socket still looks ready is retried on the transport's bounded schedule; past it, and for any failure while the socket is down, the next ready transition is the retry, and it restarts the schedule. A new value for a key that used up its schedule starts it again. A timer is safe here because a repeat is harmless and collapsed to one request per key — the reason the chat outbox may not have one does not apply.
- **Refusals are final.** The transport classifies a failure (`isRefusal`); an `OutboxRefusalError` — a precondition the repository checks before the socket, such as my join row having gone — is final whatever the transport says. A refused value is dropped and its receipts reject; the spec puts back the last accepted value, or the value the first waiting write replaced (`previous`, which may itself be empty — a room that had no name goes back to having none) when none was accepted. A value set after the refused one is its own write and still goes out, and nothing is put back over it.
- **Late answers do not win.** A request's answer is recorded (`accept`) only when no newer value of that key is waiting; otherwise on → off → on would flash the first answer. And `accept` records only its own field: the cursor, the notification setting and the name share one join row, and the answer's copy of the others may be older than a change still waiting.
- **Accounts.** A write carries the uid it was made under. If another uid is signed in to that cloud when it would go out, it is dropped and its receipt rejects with `OutboxAccountChangedError`. An unknown uid on either side — a host that reports none, or a write made before the identity was known — is not checked.
- **Receipts.** `delivered` resolves when the server accepted this value or a later one, rejects only on a refusal or an account change, and stays pending while the socket is down. The machine marks it handled, so a refusal nobody asked about is not an unhandled rejection.
- **Observing.** `createStateOutbox` takes an optional `observer`, for a measurement only — the machine does the same without one. A key's wait, from the set that made it wait to the answer that leaves nothing waiting, is one `OutboxDelivery`: `outcome` (`accepted`, `refused`, `account_changed`), `deliveryMs`, `waitSocketMs` (the part the cloud was not ready) and `attempts`. Values set during the wait fold into it, so a cursor moved three times on the way is one delivery. `attempts` is the request that ended the wait plus each that failed and was sent again; a request answered while a newer value waited did its job and is not counted, so a value replaced in flight never reads as a retry. The clock is the observer's (`now`), so this lib reads none of its own, and `begin` may decline a wait — then nothing about it is timed. A delivery report that throws is ignored; `begin` and `now` are expected not to throw. `libs/app-runtime` supplies the observer; the web records it as the `state_outbox` trace.
- **Scope.** The queue lives in memory for the page. A write still queued when the app is killed survives only as the local value; the server hears of it on the next write to that key.

## The states

|               | `join.read`                                  | `join.notify`                                        | `join.nick`                         |
| ------------- | -------------------------------------------- | ---------------------------------------------------- | ----------------------------------- |
| key           | channelId                                    | channelId                                            | channelId                           |
| value         | chatNo                                       | `all` · `mention` · `none`                           | my name for the room                |
| merge         | the higher                                   | the latest                                           | the latest                          |
| already there | at or below the accepted cursor              | never — every value is sent                          | never — every value is sent         |
| records       | the cursor (`readNo`, `chatNo`, `metaNo`)    | `notify`                                             | `nick`                              |
| deliver       | `join.sendRead` (`chat.read`)                | `join.sendJoinUpdate` (`join.update`, `notify` only) | `join.sendJoinUpdate` (`nick` only) |
| restore       | none — the cache never takes an older cursor | `join.writeMyJoinLocally`                            | `join.writeMyJoinLocally`           |

A notification change and a name change are separate keys, so changing both at once sends two
requests, and neither answer overwrites the other's field in the cache.

## Adding a state

1. Add the op and its value type to `OutboxValues` (`ports.ts`).
2. Give the repository the local write (in the public method), a socket-only delivery method and, when a refusal must undo something, a local-only restore method. The public method writes locally, then calls `outbox.set` — never the socket.
3. Write the spec (`merge`, `isCovered`, `deliver`, `accept`, `restore`) and add it to `STATE_SPECS`.
4. Test the spec's rules and the repository's two halves; the machine's own tests cover the rest.

## What not to do

- **Do not queue a function.** A closure sends through whichever socket its graph resolves when it finally runs — after a cloud switch, the wrong one. Queue data that names its cloud.
- **Do not call a delivery method from a screen.** `sendRead` and `sendJoinUpdate` are the outbox's; a screen that calls them skips the queue and the local write.
- **Do not wait on `delivered` to update the screen.** It is pending for as long as the socket is down.
- **Do not put a create, delete or payment here.** Their outcome has to be reported when the user acts.
