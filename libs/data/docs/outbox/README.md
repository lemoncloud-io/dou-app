# outbox — state writes that reach the server when the socket can carry them

> Status: Live (`join.read`, `join.notify`, `join.nick`) · Last updated: 2026-10-13 · Overview in the [lib README](../../README.md) · Canonical code: [outbox/](../../src/outbox/) · The runtime half in [libs/app-runtime data](../../../app-runtime/docs/data/README.md#the-state-outbox-transport)

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

Order is local first, then the outbox; a failed local write is still queued. There is no path from a
repository to the server for these writes that skips the outbox, so no screen can bypass it.

**Not a state write** — and so not here: a write the server has to answer before the app can go on
(creating a channel or a place, starting a 1:1, issuing an invite), one that must not run late
(leaving, deleting, a purchase), and a chat send, which is not idempotent and is ordered (the
runtime's chat outbox, `createChatOutbox`).

## What lives where

| File             | Holds                                                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ports.ts`       | `StateWrite` (the queued data), `WriteReceipt` (what a repository returns), `OutboxPort` (what repositories depend on), `OutboxTransport` (what the host supplies), `StateSpec` (how one state behaves) |
| `stateOutbox.ts` | The machine, and `createImmediateTransport` for hosts with no socket runtime                                                                                                                            |
| `joinStates.ts`  | The three join states and `STATE_SPECS`                                                                                                                                                                 |

The split follows the lib's scope. **What** is sent and how values combine is this lib's: the specs
call repository methods and know each state's rules. **When** — whether a cloud's socket is up, the
retry timing, keeping the slot open during a send — is the connection lifecycle, which this lib does
not own; it arrives through `OutboxTransport`, which `libs/app-runtime` implements.

## The machine

- **One value per key.** A key is `(cid, uid, op, key)`. A new value folds into one still waiting (`merge`; default: it replaces it), and one request per key is in flight; a value set meanwhile goes right after. Keys never wait for each other.
- **Already there.** A value the server already holds (`isCovered`) resolves without a request — only while nothing waits for that key. With a value queued, setting the accepted value again must replace the queued one, or the server would end on the queued value.
- **Retries.** A failure while the socket still looks ready is retried on the transport's bounded schedule; past it, and for any failure while the socket is down, the next ready transition is the retry, and it restarts the schedule. A timer is safe here because a repeat is harmless and collapsed to one request per key — the reason the chat outbox may not have one does not apply.
- **Refusals are final.** The transport classifies a failure (`isRefusal`). A refused value is dropped and its receipts reject; the spec puts back the last accepted value, or the value the first waiting write replaced (`previous`) when none was accepted. A value set after the refused one is its own write and still goes out, and nothing is put back over it.
- **Late answers do not win.** A request's answer is recorded (`accept`) only when no newer value is waiting; otherwise on → off → on would flash the first answer.
- **Accounts.** A write carries the uid it was made under. If another uid is signed in to that cloud when it would go out, it is dropped and its receipt rejects with `OutboxAccountChangedError`. A host that reports no uid is not checked.
- **Receipts.** `delivered` resolves when the server accepted this value or a later one, rejects only on a refusal or an account change, and stays pending while the socket is down. The machine marks it handled, so a refusal nobody asked about is not an unhandled rejection.
- **Scope.** The queue lives in memory for the page. A write still queued when the app is killed survives only as the local value; the server hears of it on the next write to that key.

## The states

|               | `join.read`                                  | `join.notify`                                        | `join.nick`                         |
| ------------- | -------------------------------------------- | ---------------------------------------------------- | ----------------------------------- |
| key           | channelId                                    | channelId                                            | channelId                           |
| value         | chatNo                                       | `all` · `mention` · `none`                           | my name for the room                |
| merge         | the higher                                   | the latest                                           | the latest                          |
| already there | at or below the accepted cursor              | the same value                                       | the same value                      |
| deliver       | `join.sendRead` (`chat.read`)                | `join.sendJoinUpdate` (`join.update`, `notify` only) | `join.sendJoinUpdate` (`nick` only) |
| restore       | none — the cache never takes an older cursor | `join.writeMyJoinLocally`                            | `join.writeMyJoinLocally`           |

A notification change and a name change are separate keys, so changing both at once sends two
requests that cannot overwrite each other.

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
