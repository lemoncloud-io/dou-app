# sync — the registration hooks over `@chatic/sync`

The sync manager, its per-slot runtimes, the five plans, the background receive and the room feed are
`@chatic/sync`'s: [its README](../../../sync/README.md). What stays here is what a screen mounts —
the `sync` facade group in `socket/sync/index.ts` and the hooks under `socket/sync/hooks/` — and the
one scenario test that needs the data manager, `socket/sync/backgroundReceiveScenario.test.ts`.

```text
socket/sync/
├── index.ts                    the `sync` facade group
├── hooks/useSyncTarget.ts      useSyncTarget + the three named wrappers
└── backgroundReceiveScenario.test.ts
```

## Usage

### Registering from a screen

```tsx
const { prime, retryPrime } = runtime.sync.useChatSync(channelId); // register + prime
runtime.sync.useChannelSync(channelId);
runtime.sync.usePlaceSync(placeId);
```

Each registers on mount and disposes on unmount, under the **selected cloud**, and each re-runs on
three things: the target key (`type:id:intervalMs`), the selected cloud, and the **uid in that
cloud**. The cloud is a dependency because a component that stays mounted across a switch renders the
next cloud's rows, so its target has to become the next cloud's too — the new registration waits for
that cloud's slot, the old one leaves through the grace window. The uid is a dependency even though
it is not in the key — a target is tagged with the uid it was registered under and stops syncing when
that no longer matches, so without re-running the registration would sit blocked for the rest of the
mount, turning a visible 403 storm into an invisible dead sync.

The generic `useSyncTarget` is not on the package barrel: every app consumer picks one of the three
named targets. The three wrappers reach it in the same file.

### Priming a room

`ChatSyncPlan.run` is a no-op — chat is event-driven — so registering a chat target loads nothing by
itself. `useChatSync` therefore does two things, and they are both required:

1. Read the durable chat cache, take its highest `chatNo`, and call `updateLocalSnapshot`. The cache _is_ the cursor; there is no separate meta cursor for chat.
2. Fetch a first page **only when the cache is cold**. The plan never backfills past history, so a cold room renders nothing without it.

Both are about the target's cloud: they are gated on **that cloud's slot** being verified
(`useSlotVerified`), not on the active slot, which is what makes them re-run after that slot's
reconnect or re-authentication; the cache read and the first page go through its scoped graph; and
the baseline goes to its runtime. That gate replaced an earlier re-prime driven by the manager's
replay path.
Registration and prime are safe to overlap: chat rows merge idempotently by `chatNo`, so it does not
matter whether a message arrived by push or by page.

`useChatSync` returns where the prime stands, `{ prime, retryPrime }`. A cold room's cache reads
empty until its first page is written, so a screen cannot tell "no messages yet" from "not loaded
yet" by the list alone:

- `pending` — the slot is not verified yet, or the cache read or first page is in flight.
- `ready` — the cache already held the room, or the first page was written. The list observer
  re-reads after the write resolves, so a screen still gives an empty list a moment to fill.
- `failed` — the cache read or the first page threw. `retryPrime` runs the prime again.

The status is per room and cloud: opening another room starts it at `pending`. Callers that only
need the sync (a sidebar preview) ignore it.

## What not to do

- **Do not register from a component and expect it to survive the route.** Registration belongs to whatever screen owns the data; observation can live wherever it likes.
- **Do not prime outside `useChatSync`.** The manager stays domain-agnostic; chat prime needs a chat policy and a repository, which is why it lives in the hook.

## Further reading

- [`libs/sync`](../../../sync/README.md) — the manager these hooks register with, the plans, and the room feed the prime joins
- [connection docs](../connection/README.md) — `useSlotVerified`, the gate the prime waits on
