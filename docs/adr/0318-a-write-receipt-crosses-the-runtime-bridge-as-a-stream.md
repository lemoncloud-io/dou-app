# ADR-0318: A write receipt crosses the runtime bridge as a stream, and a crossing result must be JSON

> Status: Accepted · Decided: 2026-11-16 · Implemented: `fix/runtime-bridge-write-receipts`
> · Scope: `libs/runtime-core/src/bridge/` — `repositories.ts` (the `receipt` crossing,
> `REPOSITORY_RECEIPTS`), `host.ts` (`receiptMember`), `mirror/conversation.ts` (`receipt`),
> `wire.ts` (`NotOnTheWire`, `PromiseCrossing`, `CheckedCrossing`) and the contract tables in
> `contract.ts`; `libs/runtime-core/src/testing/mirrorLoopback.ts`
> · The behaviour is documented in [runtime-core docs/bridge](../../libs/runtime-core/docs/bridge/README.md#write-receipts)
> · Amends: [ADR-0309](./0309-the-phone-shell-may-own-the-session-settled-per-launch.md) — how a
> repository method crosses is no longer read off its signature alone; a promise's value is checked too

## Context

ADR-0309 lets the phone app's own process own the session, with the page mirroring it over a bridge that
carries JSON. Each repository method crosses as its signature says: a method that returns a promise is a
call, answered with what it resolved to.

Two methods resolve with something JSON cannot carry. `join.readChat` and `join.updateJoin` are
local-first writes: they resolve once the write is made locally, with a receipt whose `delivered`
promise settles when the server has it, or rejects with its refusal. Across the bridge that promise
arrived as `{}`. A nick or notification change then threw `receipt.delivered.catch is not a function`
right after it had succeeded — the dialog said the change failed, and the notification setting snapped
back to the old value — and a read cursor that waits for the server resolved at once.

Nothing caught it. The compiler saw a promise and listed a call. The test loopback joined the two halves
in one process and handed the page the shell's own objects, so the promise survived every test. It
broke only on a launch whose shell owns the session.

## Decision

1. **A method that resolves with a write receipt crosses as a stream** (`receipt`). The page subscribes
   under the method's own name, with its arguments and no listener marker. The shell calls the method as
   the subscribe arrives and sends `{ written }` once the write is made, then `{ delivered: true }` once
   the server has it. The method's failure, or a refused delivery, ends the stream with
   `{ $ended: failure }`. The mirror rebuilds the receipt's in-process shape from these events.
2. **The local half keeps the bound a call had.** A `written` that does not arrive within 60 s — the
   bridge's timeout for a runtime call — rejects with the 408 a timed-out call reads as. The server's
   half is not bounded: it waits as long as the outbox does.
3. **The contract version stays at 1.** An older app refuses the stream with `RUNTIME_NOT_AVAILABLE`.
   The mirror then calls the method as before, resolves `delivered` at once, remembers the refusal per
   method and logs it once. The shell still answers the method as a call, for a page from before. From
   now on the stream's spelling — the name, no marker, the two events — is part of version 1.
4. **A crossing result must be JSON, and the compiler checks it.** `NotOnTheWire` names each part of a
   type that JSON cannot carry: a function, a promise, a `Map` or `Set`. A `Date` is allowed, because it
   arrives as its ISO string, which the contract already promises. `PromiseCrossing` reads a
   repository method's resolved value as a whole, never member by member: `Foo | null` is a call only
   if `Foo` crosses, and a receipt that may be `null` is no receipt. `CheckedCrossing` does the same for
   the session, connection, sync and data tables. A table entry that lists such a member as a call does
   not compile, and the error message names the part that cannot cross.
5. **The test loopback crosses JSON.** Every request, answer and push goes through
   `JSON.parse(JSON.stringify(…))`, so a test sees what a page would.

## Alternatives

- **Raise the contract version and reshape the two methods' results.** A shell that speaks only
  version 1 would then not mirror a newer page at all. The page newer than the installed app is the
  normal case, so every such launch would fall to the error screen until the app was updated, for two
  writes.
- **A new bridge message for receipts.** This needs a bridge version and a handler in every shell. A
  subscription already carries a series of events with an end, and a page reload already ends it.
- **Two calls: the write, then `awaitDelivery(id)`.** Delivery can take as long as the socket is down,
  far past a call's 60 s timeout, so a slow but successful delivery would read as a refusal. The shell
  would also keep each pending promise under an id until a call that may never come.
- **Drop `delivered` in the mirror and resolve it at once.** This is the smallest change, and it is
  what an older app now gets as a fallback. As the only behaviour, the page would never hear a refusal,
  and a read cursor would never wait for the server.
- **Strip non-JSON parts on the host generically.** This removes the crash but not the loss: the page
  would still get a receipt with no delivery, without anyone having decided that.

## Consequences

- On a launch the app's runtime owns, a nick or notification change succeeds quietly and shows the
  server's refusal when there is one, and a read cursor waits for the server — as in a browser.
- On an app that predates the stream, the write is made and delivered as before, but its refusal goes
  unheard on the page and nothing waits for the server. This lasts until that app is updated.
- A pending receipt holds one subscription in the shell until it is delivered or refused, or until the
  page says hello again.
- A repository method whose result grows a function or a promise, nullable or not, stops compiling until
  it is given a crossing. The arguments are not checked this way: the two that take a function
  (`primeChatRoom`'s `cancelled`, `chat.refreshList`'s `onFetched`) are used only where the runtime runs.
- Left as is: if the bridge loses a subscribe's answer after `{ written }` has arrived, `delivered`
  rejects with a 408, even though the write may still be delivered. A mirror disposed while a receipt
  waits leaves that receipt unsettled, and only a test disposes a mirror its page still uses.
