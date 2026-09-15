# Threads: client-derived from `parentId`, flat (root-only), desktop-web first

## Status

accepted

## Context

Product wants threaded replies in desktop-web (Slack-style). A survey of the
backend (chatic-socials-api, chatic-sockets-api) shows thread support is a
single field and nothing else:

- `ChatModel.parentId?: string` + `ChatView.parent$?: ChatView` exist, and
  `ChatSendBody` / `chat:send` already accept `parentId` — so **sending a Reply
  needs no backend change** (the engine `ChatRepository.sendChat` already passes
  `parentId` through; `createOptimisticChat` already reads it).

Everything else a thread UI would want is **absent**:

- `chat:feed` (the channel message query) accepts only `cursorNo` / `limit` /
  `uid` — **no `parentId` filter**. You cannot ask the server for "the Replies
  of message X", and Replies are **not excluded** from the channel feed: they
  arrive mixed in as ordinary messages.
- A Thread Root carries **no reply aggregate** — no `replyCount`,
  `lastReplyAt`, or participant set.
- Creating a Reply does **nothing** to the parent (no counter bump, no
  `parent:update`) and broadcasts as an ordinary `chat:create` on the same
  channel — indistinguishable from a top-level message except for `parentId`.

So the only question is how much of the gap the _client_ closes now versus
waiting on a backend change in a separate repo.

## Decision

- **Threads are derived entirely on the client from `parentId`. No backend
  change for v1.** A Reply is `sendChat({ channelId, content, parentId: root })`
  — the existing path. A Thread is `messages.filter(m => m.parentId === root)`
  over the engine's local cache, plus the root itself, ordered by `chatNo`.

- **Replies are hidden from the main channel feed.** `MessageList` drops
  messages that have a `parentId` before grouping (`buildMessageRows`); a Thread
  Root with Replies shows a "N replies" affordance on its row that opens the
  Thread Panel. The cache still holds the Replies (they sync in with the feed);
  only the main-flow render excludes them.

- **Flat, root-only (two levels).** A Reply's `parentId` is always the Thread
  Root. Replying to a message that itself has a `parentId` normalises to that
  message's root — there are no nested threads. `buildThread` therefore only ever
  matches `parentId === root`.

- **The Thread Panel reuses the existing trailing pane.** `DesktopLayout`
  already has an optional `panel` slot (today: channel settings). A small
  `useThreadStore { openRootId, open, close }` (mirroring
  `useChannelSettingsStore`) drives it; opening a Thread closes the settings
  panel and vice-versa — one trailing pane at a time.

- **Reply Count and "loaded" completeness are best-effort, and we accept it.**
  Both the count and the Thread contents are whatever Replies are currently in
  the loaded cache. For an active Thread that is everything; for a long-idle
  Thread, older Replies appear only after the feed history is paged back in. The
  UI must not present the count as authoritative.

- **desktop-web only.** The Reply-send path lives in the shared engine and works
  for any client, but the Thread UI is built only in desktop-web for now. Mobile
  (apps/web) is out of scope.

## Considered Options

- **Add a `parentId` filter (+ reply aggregate) to `chat:feed` first** —
  rejected for v1: it is the _correct_ long-term fix (exact, complete threads),
  but it is work in two separate API repos with its own deploy, and would block
  the client feature on a backend dependency. Deferred, not dismissed — when it
  ships, `buildThread` swaps its local filter for a server fetch and Reply Count
  becomes authoritative, with no change to the surface.
- **Show Replies inline in the main feed (thread = highlight/filter only)** —
  rejected: no filtering is simpler, but the feed gets noisy and it abandons the
  Slack mental model the product asked for.
- **Nested threads (reply-to-reply)** — rejected: `parentId` technically allows
  it, but it needs recursive rendering/indentation and does not fit a desktop
  chat surface; root-only matches Slack and keeps `buildThread` trivial.
- **Modal / inline-expand thread surface** — rejected in favour of the
  side panel: the layout already has a trailing-pane slot, and a panel keeps the
  channel context visible while reading a Thread.

## Consequences

- Ships fast with zero backend coupling; the Reply-send contract is already
  proven by the optimistic chat path.
- Reply Count can under-count and a Thread can be missing old Replies until
  history is paged in — a known, documented limitation, not a bug. If it bites,
  the escape hatch is the deferred `chat:feed parentId` filter, which this design
  is shaped to drop into.
- `MessageList` gains a filter step and the feed's message set diverges from the
  raw cache (Replies present but not shown) — anything counting "messages on
  screen" must account for the filter.
- The trailing pane is now shared by two features (settings, threads); their
  mutual exclusion is explicit and must stay that way as more panes are added.
