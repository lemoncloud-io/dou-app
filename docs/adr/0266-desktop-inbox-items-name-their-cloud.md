# ADR-0266: Desktop inbox items name their cloud, and the items stored without one are dropped

> Status: Accepted · Decided: 2026-11-02 · Implemented: `fix/inbox-cloud-scope`
> · Scope: `apps/desktop-web/src/app/shared/` — `useMentionsStore`, `useInboxCapture`, `inboxKinds`,
> `placeUnreadCounts`
> · Partly supersedes: [ADR-0219](./0219-desktop-nav-rail-and-device-local-inbox.md) — only decision 4's
> "nothing persisted is lost". The inbox's four sources and its `kind` stay.

## Context

The desktop inbox is one device-local store for every cloud the reader visits. Its items carried a
place id and a channel id, and the Notifications panel showed the items whose place id was the active
place. But every cloud numbers its own places, channels and messages from the same start — the first
place of each cloud is `10001` — so a place id names a place in every cloud. Moving from one cloud's
place to another cloud's place of the same number left the panel listing the first cloud's items, and
the channel row's `@`, the mentions-only counts and the read marking matched across clouds the same
way. A message id another cloud had already used was dropped as captured.

## Decision

1. **Every item carries `cloudId`**, the channel's cloud (the relay's `default` when the row leaves it
   empty), and its key is `<cloud>:<message id>`.
2. **Every reader compares the cloud before the place**: the panel and its badges, the nav rail dot,
   the channel row's `@`, the dock and place dots, and read marking.
3. **Items stored before this carry no cloud and are dropped** when the store moves to version 1. This
   reverses ADR-0219 decision 4's promise that nothing persisted is lost.

## Alternatives

- **Show the old items in every cloud**, as items with no place show in every place. Rejected: it is
  the bug itself for every item already stored, and it would last until 500 newer items pushed them
  out.
- **File the old items under the relay.** Rejected: most of them came from a cloud, so the relay's
  panel would list another cloud's history, and a click would open a channel id the relay does not
  have.
- **Guess the cloud from the channel cache.** Rejected: channel ids repeat across clouds too, so a hit
  is no proof, and a wrong guess is the same bug with less reason to suspect it.

## Consequences

- On the first launch with this change the inbox on that device starts empty. It is device-local
  history of up to 500 items, already lost on a reinstall or another device.
- An item with no `kind` still reads as `direct`, but every such item predates the cloud, so none is
  left to read.
- The module doc is [apps/desktop-web inbox](../../apps/desktop-web/docs/chat/inbox.md).
