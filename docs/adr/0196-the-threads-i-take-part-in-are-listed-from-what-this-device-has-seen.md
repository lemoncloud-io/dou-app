# 0196. The threads I take part in are listed from what this device has seen

Date: 2026-10-13

## Status

Accepted, for desktop-web. Builds on [ADR-0008](./0008-threads-client-derived-from-parentid.md), which
derives threads on the client from `parentId`.

## Context

A user who replied in a thread, or whose message got replies, had no way back to it but remembering
the room and scrolling. Slack answers this with a Threads view.

The server cannot list threads. A thread is replies that share a `parentId`; `chat:feed` takes no
`parentId` filter, a root carries no reply count, last-reply time or participant set, and nothing
records who took part in what. ADR-0008 deferred a server filter, and it still has no date.

Desktop adds a second limit: chat content streams only for the open room. Every other channel is live
only through its record's newest message (`lastChat$`), so a burst of replies there arrives as the
last one.

## Decision

- **Desktop keeps its own list**, in localStorage, of the threads it has seen the user take part in: a
  reply of theirs, or a root of theirs with a reply. It is keyed by cloud, channel and root chatNo,
  capped at the 100 most recently active across all clouds (a storage bound, so a busy cloud can push a
  quiet one's threads out), and cleared on logout. It is shown as a trailing pane behind a sidebar row.
- **It is fed from what the device already receives.** A reply is recorded when the thread panel sends
  it; replies in background channels come from the feed the Mentions inbox uses, reading the root from
  the cache or the server to decide ownership; and each cloud's cache is read once on first launch.
  Every read is bound to the cloud it is for, not the selected one, and leaves out what the room hides
  from before the user's current join.
- **History is not news.** A thread found in the cache comes in as read; only a newer reply to a listed
  thread, from someone else, marks it unread, and opening the thread clears it.
- **It says what it is.** The list states it is this device's view, and shows no reply count.
- **Mobile (`apps/web`) is not part of this decision.** Where a thread list sits in the mobile app and
  how it reads has not been designed; it is left for its own decision rather than borrowed from desktop.

## Alternatives

- **Wait for a server thread list or `parentId` filter.** The correct, complete answer, but it is work
  in the API repositories with no date, and blocks the feature on it. Not dismissed: when it ships, the
  backfill becomes a server read and the list stops being per device.
- **Derive the list from the cache on every render, with no store.** The desktop cache holds only what
  the open rooms loaded, so most threads would be missing, and a store also carries the read state the
  bold row needs.
- **A new multi-channel `parentId` read in `libs/data`.** Faster than one cache read per channel, but a
  repository and index change for a once-per-cloud backfill.

## Consequences

- The list differs between devices and starts over on a new one. A thread with no activity since the
  first launch, and older than the newest 200 cached messages of its channel, is not listed until
  someone replies.
- A reply burst in a background channel is seen as its last reply; a root that cannot be read leaves
  its thread out until its next reply.
- A mobile thread list, when it comes, either reuses these rules (`myThreads`) as a port that must agree
  on the key and on how a `parentId` is read, or moves them into a shared lib.
