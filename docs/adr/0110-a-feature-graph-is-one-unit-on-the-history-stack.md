# ADR-0110: A feature graph is one unit on the history stack

> Status: Accepted · Decided: 2026-09-22
> · Scope: `apps/web/src/app/navigation/**`
> · Builds on [ADR-0108](./0108-one-module-owns-the-history-stack-and-depth-is-the-routers-index.md)
> (one module owns the stack, and depth is the router's index)
> · Widens one rule recorded there — see § The rule this replaces.

## Context

A report from the app: open channel A, open A's settings, follow a link into channel B, press back
— and land in **channel A's settings**, a screen about a channel the reader has left.

`stackPolicy` already had a rule for this shape, and it was too narrow. It collapsed the current
entry only when that entry was a channel **room**:

```ts
return isChannelRoomPath(fromPath) ? { kind: 'replace' } : { kind: 'push' };
```

So `[home, roomA]` → B produced `[home, roomB]`, correctly. But `[home, roomA, settingsA]` → B
produced `[home, roomA, settingsA, roomB]`, and back walked down through a channel that was over.

The narrowness was deliberate and is recorded in the source: the rule once read "anywhere but
home", and under that reading a push tapped from `/mypage` deleted mypage. Retreating to "rooms
only" fixed that and left the settings case open.

The missing idea is that **a channel is not a screen, it is a small graph of screens** — room,
settings, invite, invite link, threads — all about one channel, entered from somewhere outside it.
The stack has no notion of that grouping, so it cannot put the group away as a group. `/place/:id`
has the same shape: a detail screen plus five settings pages about one place.

There is a second, quieter cost. Because the stack could not answer "how far back is the screen I
entered this graph from", the invite flow answers it by hand: `roomDistance` is a hop counter
threaded through `location.state` from call site to call site, incremented at each step, so
`InviteLinkPage` can call `navigate(-roomDistance)`. That works and is untouched here, but it is
the same question asked in a way that only works for the paths someone remembered to thread.

## Decision

**Entering another instance of a feature graph rewinds the whole graph being stood in, then pushes
the target onto whatever was underneath it.**

Three pieces:

1. `navigation/featureGraph.ts` — pure. `readFeatureGraph(pathname)` returns `{feature, instance}`
   for the two instance-scoped features (`channels`, `place`) and `null` for everything else.
   `countGraphRun` counts how many entries at the top of the stack belong to one graph.
2. `stackPolicy` gains an action, `{ kind: 'rewind-then-push', steps }`, and asks for the collapse
   before its existing `push` and `deeplink` rules. `EntryContext` gains an optional `stack`.
3. `useStackNavigate` executes it: `navigate(-steps)`, then `navigate(to)` once the pop has landed.

The collapse applies only when the move is to a **different instance of the same feature**. Same
instance is ordinary forward movement and keeps stacking, or back would stop working inside a
channel. A different feature keeps pushing, which is what protects the `/mypage` case.

### The rule this replaces

The room rule still exists and still fires, but it is now the fallback rather than the answer. With
a stack available, `[home, roomA]` → B resolves as `rewind-then-push` with `steps: 1`, which is the
same history outcome the old `replace` produced. Without a stack it resolves as `replace`, exactly
as before.

### Rewind and push, not rewind and replace

After rewinding the graph the cursor sits on the screen the reader entered it from — home, or
mypage, or a search result. That screen is one they chose. Replacing it would leave the app one
entry deep with the reader's own starting point gone, so the target is pushed on top of it.

### Where the stack comes from, and what it costs

The browser exposes no way to enumerate history entries, so the run is counted against
`stackTracker`'s reconstruction. That promotes the tracker from something the debug overlay reads
to something behaviour depends on, which is the real price of this decision.

Three things keep the price bounded. The tracker already tracks `isIndexed` and goes false the
moment a transition arrives without a readable index; `useStackNavigate` passes no stack at all in
that case, and every rule falls back to what it did before. `countGraphRun` stops at the first
unobserved entry, so a reload mid-stack rewinds too little rather than dropping a screen it cannot
see. And `steps` is clamped to `depth`, so a rewind can never leave the app.

## Alternatives

**Make back graph-aware instead of entry.** Leave the stack as it is and teach the back handler to
skip over a foreign graph. Rejected: the in-app back buttons call `navigate(-1)` directly and only
the hardware back press goes through `useStackBack`, so the rule would have to be applied in two
places and would be one `navigate(-1)` away from being bypassed by the next screen anyone writes.

**Stop pushing sub-screens as history entries** — render settings as an overlay of the room, so the
graph is one entry by construction. This is the version with no arithmetic in it and no dependency
on the tracker, and it is the better long-term shape. Rejected for now as a far larger change:
every sub-screen of both features would have to stop being a route, which breaks their deep links.

**Generalise `roomDistance`** — thread a hop counter through every entry into a graph, as the
invite flow already does. Rejected: it works only where someone remembered to thread it, and a
deep link or a push arrives from outside the app with no `location.state` to carry it.

**A general `/:feature/:id/*` rule** instead of naming the two graphs. Rejected: it matches
`/invite/:inviteId/waiting`, which is one screen rather than a graph, and a second invite would
delete the first one's entry while the reader was still using it.

## Consequences

- Back from a channel entered by push or deep link now leaves for the screen the previous channel
  was entered from, not for that channel's own sub-screens.
- `stackPolicy` is no longer a function of the top of the stack alone. It stays pure — the stack is
  an argument — but a reader of the rules now has to know where that argument comes from.
- The tracker's reconstruction is load-bearing. `stackTracker.reset()` was test-only scaffolding
  around a debug surface and now clears something behaviour reads.
- `roomDistance` is unchanged and still threads through the invite flow. Retiring it in favour of
  the graph run is possible and is not done here; it is in-app movement, and this ADR only changes
  how the app is ENTERED.
- Only `channels` and `place` are graphs. Adding a third means adding a row to `GRAPH_PATTERNS`,
  and forgetting to means the old push behaviour, which is a quiet regression rather than a break.
