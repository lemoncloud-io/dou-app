# ADR-0047: Reaction/thread follow-up polish — an add button beside the chips · reaction info moves to a chip-long-press-only sheet · the home preview shows only the last real message · threads share the channel's context (header, notifications, scroll) · mark deleted messages

> Status: Accepted · Decided: 2026-08-07
> Follows: [ADR-0045](./0045-web-emoji-reaction-and-thread.md) (introducing emoji reactions · threads) ·
> [ADR-0008](./0008-threads-client-derived-from-parentid.md) (threads client-derived from `parentId`)
> Related: [ADR-0046](./0046-web-feature-ownership-and-barrel-hygiene.md) (feature ownership · barrel hygiene)

## Context

After ADR-0045 landed reactions and threads in `apps/web`, real usage surfaced a set of loose ends. Most of
these aren't new features — they're **finishing touches on a surface already built** — but three are
genuine defects.

### 1. Adding one more reaction to an already-reacted message costs as much as the first

The only path to adding a reaction is a long press (450ms) → action sheet. Attaching a second emoji to a
message that already has a chip means going through the same 450ms and the same sheet again. The chip row
is `flex flex-wrap` and doesn't render at all when there are no chips
(`apps/web/src/app/features/channels/components/ReactionChips.tsx:27`), so appending an add button as the
last item in that row makes "only shown once there's at least one" hold automatically, by construction.

### 2. Only a screen reader knows who tapped what

`foldReactions` already holds `userIds`, but that information only reaches the chip's `aria-label`
(`chat.room.reactionWho`) — a sighted user sees only a count. ADR-0045 left "a detail sheet listing who
reacted" as a follow-up item, and **all the material for it already exists locally.**

### 3. When the observation window fills up with reactions, a home row looks like an empty channel

ADR-0045 stripped reactions out of the preview entirely (`pickPreviewChat`). Since preview and time **both**
come from `lastChat`
(`apps/web/src/app/features/home/components/ChannelList.tsx:113`), there's no mismatch like "stale text with
a fresh timestamp." The problem is window size — `PREVIEW_LOOKBACK = 10`, so if the most recent 10 rows are
all reactions, `lastChat` becomes `undefined` and both the preview and the time turn into empty strings,
making **a channel with an active conversation look like an empty one.**

Investigation shows sort order is **barely affected by reactions.** The `'recent'` primary key is my own
join's `updatedAt` (`apps/web/src/app/utils/sortChannels.ts:40`), so nothing anyone else sends changes the
ordering. Only the fallback used when there's no join (`lastActivityAt`) is sensitive to reactions. As a side
finding, **other people's new messages don't reorder the home list either** — a preexisting characteristic,
out of scope here (see Follow-ups).

### 4. The thread header has no channel context, and ignores channel kind

It just shows "Thread" via `title={t('chat.thread.title')}`
(`apps/web/src/app/features/channels/pages/ThreadPage.tsx:207`), with no indication of which room the
thread belongs to. Worse, `kind="group"` is hardcoded, so DMs and self-chats also show the group glyph.

### 5. The reply footer avatar can differ from the message row avatar

`ThreadFooter` uses only `replier.thumbnail` (the reply's server-embedded `owner$.thumbnail`), while the
message row **prioritizes** `profileMap` (the site profile). The same person can show a different face in
the two spots, and an optimistic reply has no `owner$` at all, so its avatar doesn't render.

### 6. A deleted message doesn't look deleted

`isPreviewableChat` **deliberately allows** tombstones (`hidden`). The reasoning was "it really is that
channel's last message, and the feed keeps it in place as a tombstone" — **but that was a desktop
assumption.** Desktop renders "This message was deleted." there, but `apps/web` has no such branch.
`hidden` only suppresses the link preview and reaction chips
(`apps/web/src/app/features/channels/components/ChannelMessageRow.tsx:104,110`), and the bubble still prints
`content` as-is. There's no i18n key for deletion copy either.

There's a reason this went unnoticed. `apps/web`'s `deleteMessage` is not a server soft delete but a
**cache-only delete**, used only for failed/pending rows. So a `hidden` row only ever arrives **when a
different client, like desktop, deleted it.** The net effect today: "a message deleted on desktop stays
intact on mobile."

### 7. There are two more places where a thread isn't treated as "the room"

The header (§4) was just the visible symptom — two more defects with the same root cause surfaced.

- **In-app banner.** The check for "don't show a banner for the room you're currently viewing" matches only
  the room route. Threads don't match, so **the round trip of my own message being sent bounces back as a
  banner while I'm typing a reply.** What's suppressed in the main feed showing up in the thread isn't a
  rule — it's an omission.
- **Scroll position.** Room → thread is a route change, and the room page unmounts. Coming back, the
  `flex-col-reverse` list starts again at `scrollTop 0`, i.e. the bottom. Someone reading through history who
  taps the reply footer gets dropped to the latest message for no other reason. This is a cost that came
  along when ADR-0045 made threads a full-screen route, unnoticed at the time.

## Decision

### 1. Put an add-reaction button at the end of the chip row, opening the emoji picker directly

Skip the action sheet. By the time this button is tapped, intent is already fixed as "add a reaction," so
there's no reason to show one more sheet that mixes in copy/reply. Reuse `EmojiPickerSheet` as-is.

When there are no chips, this button doesn't appear either — because the row itself doesn't render, and
that is intentional (keeps ADR-0045's judgment that reserving an empty strip under every single message
costs more than the feature is worth).

### 2. Put reaction info in a dedicated sheet opened by long-pressing a chip, showing reactors' faces

Build `ReactionDetailSheet` as a separate bottom sheet: **per-emoji tabs** (emoji + headcount, horizontally
scrollable) above a list of **profile photo + name** for everyone who reacted with that emoji. It opens with
the tab for the long-pressed chip preselected.

**The chip splits two gestures by frequency** — tap toggles (the most common action gets the cheapest
gesture), long-press opens detail. The reverse assignment would push the most common action onto the harder
gesture. To keep one gesture from firing both, a `click` that follows a long-press is swallowed. The
long-press threshold shares the same constant (`LONG_PRESS_DELAY_MS`) as the message bubble — if the values
diverge, the same gesture would feel different depending on where a finger lands.

**It does not go into the message action sheet.** The two sheets answer different questions — the action
sheet answers "what can I do with this message," this one answers "who's behind this reaction." And faces
need vertical space the action sheet doesn't have. The same information doesn't live in two places.

> This item **reverses the original decision**. The initial call was "don't build a new surface — add a
> section inside the existing long-press sheet," but looking at the real screen surfaced three problems:
> (a) reactors are hard to identify by name alone, (b) a variable-height list pushes the action sheet's other
> items around, and (c) with multiple emoji, the section dominates the action sheet. The reasoning behind the
> reversed option is kept in Alternatives.

### 3. The home preview shows only the last real message — reactions don't participate

Keep ADR-0045's position. Attaching a reaction badge to the home row was considered and dropped (see
Alternatives): it only covers the case where the target is the latest message, which is a half-coverage
signal that can't be trusted, doesn't lead to action, and clashes with the mental model that "reactions are
chips under a message, not a row."

**So the classification logic doesn't change.** `isPreviewableChat`'s three predicates are already correct,
and each one catches something different:

| Predicate             | What it catches                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `stereo !== 'system'` | join/leave **+ reaction events** (reactions are always `system`)                                                       |
| `!parentId`           | thread replies — they're `stereo: 'user'`, so the predicate above doesn't catch them                                   |
| `!isFailed`           | my own failed send — also `user`, and its `chatNo: 0` sentinel always sorts as latest, permanently pinning the preview |

So the answer to "is filtering out `system` enough" is no. Reactions are already filtered out by the
`system` guard, but replies and failed sends need their own predicates. `isFeedVisible`'s
`subType !== 'reaction'` is redundant but is kept as a belt-and-suspenders guard that documents intent — it
holds up even if the server ever stops treating reactions as `system`.

**Raise `PREVIEW_LOOKBACK` from 10 to 30.** This is the only actual change in this item, and it's driven by
the empty-row defect in §3, not by badges. Finding the last real message needs a window wide enough to skip
past a burst of reactions. The cost is per-row cache observation, and 30 rows per home row is judged
affordable.

### 4. Make the thread header match the channel header

Use the same title chain as `useChannelTitle` (join nick → DM peer nick → channel name → fallback) and the
same avatar rule, and follow the channel's actual kind (`self`/`direct`/`group`) for `kind` too. A room and
its thread are two screens of the same room, so there's no reason for the headers to diverge.

The "Thread" label is dropped from the header and left to the root-message shape at the top of the content
— the structure itself (root + divider + reply list) already says this is a thread.

### 4-1. Treat threads the same as the channel for notifications and scroll too

Unifying the header wasn't enough. If a thread is "another screen of that room," the rules that hold in the
room should hold in the thread too — and two places didn't.

- **In-app push banner.** The check for "don't show a banner for the room currently being viewed" only
  looked at the room route. So **the round trip of my own send bounced back as a banner while replying in a
  thread.** The thread route is now included in that check.
- **Reading scroll position.** Going to a thread unmounts the room page, and coming back, the reverse list
  restarts at `scrollTop 0` (= the bottom). Someone reading through history who taps the reply footer lands
  at the latest message on return. The offset right before leaving is stashed, and the next mount restores
  it **exactly once**.

    **Being one-shot is the point.** Landing on the latest message when entering a room from home is
    messenger convention, so the restore must only attach to "an entry returning from a thread." Restoring on
    every entry would be a different feature.

### 5. Consolidate avatar resolution into one chain

`ThreadFooter`'s replier avatar now resolves with the same priority as the message row (site profile →
member user cache → embedded `owner$`). `buildThreadIndex` keeps embedding the value in
`repliers[].thumbnail`, but **display prioritizes the profile at the display stage.** The point is to keep
the derivation utility from knowing about the profile cache — derivation stays pure, resolution happens in
the UI.

### 6. Mark deleted messages as tombstones in both the room and home

- **Room**: render "This message was deleted" in place of the body for a `hidden` row. Keep the bubble slot
  — if the message just vanished, there's nothing left to tell the reader who was in the middle of reading
  it what happened. The full-view affordance is turned off too (same reason the link preview and chips are
  already off).
- **Home**: if the last message is a tombstone, the preview uses the same copy. The original text is never
  shown.
- One i18n key (`chat.room.deletedMessage`) is shared by both spots.

That `isPreviewableChat` keeps allowing tombstones through is **not changed.** It really is that channel's
last message, and now that both room and home render it as a tombstone, the original premise finally holds.
Excluding it only from the preview would leave home showing stale text while the room shows "deleted" —
the two would disagree.

### Scope

**In** — the chip row's add button · the reactor-detail sheet opened by chip long-press (per-emoji tabs +
profile photos) · widening `PREVIEW_LOOKBACK` · unifying the thread header · suppressing the in-app banner in
threads · thread round-trip scroll restore · unified avatar resolution · tombstone display (room · home) ·
moving `useRecentEmojiStore` (`app/stores/` → `features/channels/stores/`) for ADR-0046 compliance (it's a
chat-domain-only store, so the domain feature owns it).

Along for the ride: **a visual redesign of the in-app banner card** (left accent bar → avatar + title +
snippet, following Slack's convention). This is a presentational change, not an architectural decision, and
it's bundled in because it touches the same files as the banner-suppression work above. The drop-in motion
is already the `top-center` toast's default behavior, untouched.

**Out** — a reaction badge on the home row (rejected, see Alternatives) · push for reactions (the server
doesn't attach a push leg to anything other than `stereo !== 'user'`) · a reaction-specific unread counter
(no slot for it on the server) · touching the home sort criteria · deleting a message sent from `apps/web`
via server soft delete (today it's cache-delete only, a separate piece of work) · server-side aggregation of
reply counts · desktop changes · promoting derivation utilities to `libs`.

## Alternatives

- **A reaction badge on the home row (only when the target is the latest message)** — considered and
  dropped. Coverage is fundamentally half (reactions on an older message stay permanently invisible), so
  users can't learn "reactions show up on home," and its absence reads as "no one reacted." It also doesn't
  lead to action — the preview's job is to help decide "should I open this room," and this doesn't feed that
  decision. `foldReactions`'s call sites would also grow to three, including home, widening the blast radius
  of a contract change.
- **Always promote the reacted-to message to the preview slot** — dropped. Accurately shows what was
  reacted to, but an old message sitting in the newest slot breaks the list's chronological reading.
- **Synthesize a sentence on the home row like "So-and-so reacted 👍"** — dropped. Highest notification value,
  but changes the row's body text even when there's no unread, making it read as if there's an unread
  message. The right tool for "someone reacted to my message" is a notification, and since reactions carry
  no push, this option is a **weak substitute for a notification that doesn't exist**.
- **Bump the row's timestamp to the reaction time** — dropped. The body stays old while the time looks fresh,
  so body and time point at different events.
- **Reactor list as a section inside the message action sheet** — **initially chosen, then reversed** (see
  decision 2). The benefit of not adding a new surface was real, but three things broke it: names alone don't
  identify who's who (faces need vertical space that section doesn't have), a variable-height list shifts the
  quick-reaction row/copy/reply positions depending on reactor count, and with multiple emoji the section
  dominates the sheet. Mitigations were tried — moving the section to the top of the sheet, capping its own
  scroll height — but fundamentally **one sheet was trying to answer two questions.**
- **Chip tap = open detail, long-press = toggle** — dropped. A chip's primary function is toggling, and this
  swaps the most common action onto the harder gesture. The adopted assignment is the reverse (tap = toggle,
  long-press = detail).
- **Always restore room scroll regardless of thread entry** — dropped. Entering a room from home would land
  on a days-old reading position instead of the latest message, breaking the expectation of someone who came
  in to check unreads. Limiting restore to a single thread round trip is far narrower and more accurate.
- **Have the `+` beside the chip open the action sheet** — dropped. There's a benefit to converging on one
  path, but it re-widens the choices right when intent has already narrowed.
- **A two-line thread header (top "Thread" + bottom channel name)** — dropped. Richest context, but grows the
  mobile header height, and splits the room and thread header shapes apart.
- **Exclude tombstones only from the preview** (`isPreviewableChat` gets `!hidden`) — dropped. Cheapest, but
  the room still shows the original text, so the root problem remains, and home shows stale text while the
  two screens disagree.

## Consequences

- **Reactions remain invisible on home.** Even if someone reacts to my message, home stays silent (the
  unread badge doesn't net it in via `metaNo` either). A known, accepted debt — a proper fix needs a
  server-side summary or a notification surface (see Follow-ups).
- **Per-home-row cache observation grows from 10 rows to 30.** Since it's multiplied per row, observation
  cost rises for users with many channels. The first thing to revert if a perceptible performance regression
  shows up.
- **`foldReactions`'s call sites stay at two: room and thread.** The direct benefit of folding the badge.
- **The chat surface now has two long-press gestures** — the bubble (action sheet) and the chip (reactor
  sheet). The threshold is one shared constant, so it feels the same, but users have to learn that which
  sheet opens depends on where their finger landed. The chip is visually distinct enough that this is judged
  manageable.
- **The reactor list depends on the profile cache.** Both name and face resolve via site profile → member
  user cache in order, so a member whose profile hasn't synced yet may show a default avatar and an id. The
  headcount comes from the fold, so it still matches the chip in that case.
- **The thread header now matching the room header weakens the "I'm in a thread" signal.** The root message
  and its divider take over that role, and back-navigation returning to the channel (ADR-0045's two-step
  move) helps too.
- **Avatar resolution now converges in the UI layer.** The derivation utility stays pure, but every place
  that shows an avatar has to reapply the same priority order. Today that's three places: room, thread,
  footer.
- **Cross-client deletion is reflected on mobile for the first time.** A message deleted on desktop, which
  used to show intact, now becomes a tombstone. Conversely, since `apps/web` still has no way to delete a
  sent message, it **can only read tombstones, never create them** — an asymmetry that remains.
- **A thread never shows that channel's in-app banner.** This is intentional, matching the room's rule, but
  messages piling up in the parent channel while lingering long in a thread go unannounced by banner. The
  unread badge and the feed after going back cover that role.
- **Room scroll restore lives in a module-level map.** It accumulates one number per channel visited during
  the session (negligible), and clears on refresh. Since the situation needing restore is itself a single
  round trip, there's no reason to persist it.
- **`useRecentEmojiStore`'s path changes.** This is ADR-0046 compliance; the storage key
  (`chatic.emoji.recent`) is unchanged, so there's no impact on user data.

## Follow-ups

- **Home sort doesn't react to other people's new messages.** Since `'recent'`'s primary key is my own
  join's `updatedAt`, not just reactions but **ordinary messages too** don't reorder home. A preexisting
  characteristic surfaced by this investigation, unrelated to reactions, so it's split out. Separate ADR.
- **How to properly surface reaction visibility on home/notifications.** Once the server carries a recent-
  reaction summary on the channel record, or a notification surface exists, this becomes independent of the
  observation window. Dropping the in-sheet badge was a judgment that "not with this tool, not now," not a
  denial of the need itself. Backend follow-up.
- **Deleting a message sent from `apps/web`.** Today it's cache-delete only (failed/pending rows), so
  tombstones are only ever read, never created. A separate piece of work to add server soft delete.
- Whether to apply the same polish to `desktop-web`'s equivalent surface (hover toolbar · side panel). This
  track only touches `apps/web`.
