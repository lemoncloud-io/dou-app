# chat room — the surface a conversation is read on

[`ChannelRoomPage`](../../../src/app/features/channels/pages/ChannelRoomPage.tsx) is the container:
it owns data, derivation and orchestration (send, read, scroll, gestures) and nothing visual.
Everything drawn comes from `@chatic/web-ui-kit` primitives, assembled here — `ChatRoomHeader`,
`DateDivider`, `SystemNotice`, `SystemMessage`, `MessageRow`, `MessageBubble`, `ReadReceipt`,
`MessageInput`, `FloatingDateChip`.

This document covers the room's own surface. Reactions, the action sheet and the thread page are in
[reactions-and-threads.md](./reactions-and-threads.md); the hooks feeding this screen are in
[data-layer.md](./data-layer.md); the 1:1 footer and composer lock are in
[dm-and-self-chat.md](./dm-and-self-chat.md).

## Responsibilities

The page decides **what the room means**: which stereo it is, who the participants are, what is
read, what may be sent. It does not decide how a bubble looks. The rule that keeps this honest is
that a stereo branch lives in a component, not in the page: `ChannelRoomPage` derives `isSelfChat`
/ `isDmChat` / `isGroupChat` and then passes a `variant` or a gate down. `RoomIntro` is the model —
one component, three variants, one call site.

## The header

The header takes its `kind` from the channel's stereo, which picks the fallback glyph; its title from
`useChannelTitle` (with my join nick and the peer's profile nick as overrides); and its avatar from
`resolveChannelAvatar` — my place-profile photo in a self chat, the peer's in a DM, and
`channel.thumbnail` otherwise. Its only menu item is Settings, navigated with
`state: { roomDistance: 1 }`.

The participant stack is `orderMemberIdsOwnerFirst(ownerId, activeMemberIds, 5)` — owner leftmost,
then active members, capped at five — with each id resolved through the site profile and then the
member's user row. The count beside it is the full `memberCount`, not the five.

Self and DM headers stay single-line: no `meta`. Neither reads `channel.thumbnail`, because neither
room has a photo of its own and the row stands for a person.

`loading` renders placeholders while the channel is unresolved. Without it the title falls back to
the "unnamed channel" label for a beat, which reads as having opened the wrong room.

## The stream

The list is `flex-col-reverse`, so `scrollTop: 0` is the **bottom** and scrolling up is negative.
Every scroll rule below follows from that.

Messages are grouped by calendar day into a `DateDivider` per day. Consecutive messages collapse
into one visual group only when `isSameGroup` holds: same owner, same minute, same read count, same
pending/failed status, and neither is a system row. The read count is part of it deliberately — two
messages a minute apart whose receipts differ must not share one meta line.

`RoomIntro` is pinned at the start of the thread, under the oldest date divider, and stays there
once messages exist. The gate is `rawChats.some(chat => chat.chatNo === 1)`: holding row 1 is proof
the thread's beginning is loaded, where "oldest loaded group and nothing more to fetch" was an
inference that flipped as pages landed and walked the intro down the history.

While the list is scrolling, `FloatingDateChip` shows the date of the group crossing the top edge
and fades once scrolling stops.

## A message row

[`ChannelMessageRow`](../../../src/app/features/channels/components/ChannelMessageRow.tsx) renders
the body and then, as separate rows in the same column, the things that comment on it: the sender's
own `attach$` card, then the link preview the client derived, then the reaction chips, then the
thread footer.

The order of the first two is the argument for the whole list: `attach$` is part of what the sender
sent, the unfurl is something the client found. The last three sit **outside** the long-press
target, or the gesture would eat taps on them.

**Block Kit or a bubble.** A webhook send arrives as an ordinary `stereo: 'user'` chat carrying
Block Kit in `blocks$`, or as JSON in `content`. `resolveChatBlocks` + `hasDrawableBlocks` (both
from `@chatic/block-kit`, so the row and the renderer cannot disagree) decide whether the row draws
a `BlockKitMessage` card instead of a bubble. Nothing drawable falls back to the plain body in a
bubble. Three states never reach the card: a tombstone, a pending send and a failed send — the
bubble draws those states, and a card would show a finished-looking message for a send that has not
landed.

**Truncation is the bubble's affordance.** Over 200 characters the bubble cuts, appends an ellipsis
outside the tokenizer's output, and offers "view all" → `MessageDetailDialog`. A card never
truncates because it has no bubble to cut. The cut also suppresses linking a URL that runs into it
— it may be a fragment — and closes a code fence left dangling, so the unfurl agrees with the
bubble about what is literal text.

**Status.** A pending row shows a clock, a failed row shows the failure line with retry and delete
(mine only; that delete is a cache delete — it clears the row from this screen and the server never
heard about the message. The server delete lives in the action sheet and is a different action with
different wording). Otherwise, if `read.show`, the row draws
`ReadReceipt` — or a spinner until `read.isReady`, meaning the join cursors have synced.

The receipt's gates are set by the page: `show = !isSelfChat && activeMemberIds.length >= 2`, and
`mode = isDmChat ? 'dm' : 'count'`. `count` prints `read N` plus `unread M` when M is non-zero;
`dm` prints the single unread badge and nothing once it is read. A self chat never shows one.

**Editing.** A message of mine can be edited in place from the action sheet: the bubble becomes a
field where it sits, so the surrounding conversation stays put and the position says which message
is changing. `useMessageEditing` owns the state for both this page and the thread page — one hook,
because two copies would be two chances to answer the same question differently.

Pressing save **locks the editor and waits**; only the server's acceptance closes it. A rejection
comes back to an editor that still holds what was typed and can be saved again. Desktop closes
immediately instead; mobile is the side that fails more often, and there closing on the press means
a failure has nowhere to return to. While an editor is open the composer is disabled — two live
fields and there is no telling which one you are typing into — and leaving with unsaved changes is
confirmed.

The editor is seeded from `message.content`, **never from what the bubble drew**. The bubble
truncates at 200 characters, and seeding from the rendered string would destroy everything past the
cut on the first save. A test pins this.

**Edited marker.** `isMessageEdited` from `@chatic/data` decides it, and it is an inference: the
server has no edit flag, so what it really detects is that the row was written again. It excludes
tombstones, unsent rows and missing timestamps. Marking early is deliberately not done — it would
mean un-marking on failure.

**On the editor's own screen the marker is late, and later than "after the server responds."**
Measured 2026-09-17 against the dev server: the server does advance `updatedAt` on an edit, but the
`chat.update` RESPONSE carries the pre-update value (observed `updatedAt === createdAt` right after a
successful edit, and `updatedAt > createdAt` for the same row once re-fetched). `updateChat` writes
that response verbatim, so the person who just edited sees no marker until that room's rows are
fetched again. Another client's view should not be affected, because it writes the row the server
pushes over the socket rather than this response — but that was NOT verified (no second client in a
shared room was available at the time), so treat it as reasoning, not measurement. Whether anything should be done here is undecided — do not "fix" it by
writing a client-side timestamp, which would assert an edit time the server never gave.

**Long press.** 450ms, or a right-click, opens the action sheet. `pointerdown`'s default is only
prevented for a mouse: cancelling it on touch kills the browser's own panning for that gesture, and
a thread is mostly bubbles, so scrolling died in bands down the screen. Selection is suppressed with
`select-none` instead. A drift past 10px cancels the hold, and the `click` that follows a fired
long-press is swallowed so a link does not also navigate.

**Tombstones.** `message.hidden` is a message another client soft-deleted. The row keeps its place
— a message vanishing mid-read leaves no account of what happened — and renders the shared
`chat.room.deletedMessage` string in muted italic. The body, the unfurl, the chips and the action
sheet are all withheld; the sheet especially, since Copy would hand the deleted text back.
`apps/web` can render a tombstone and cannot create one.

## System notices

Joining and leaving leave one `stereo: 'system'` row in the channel, with `subType: 'join' | 'leave'`
and **an empty `content`**. The server stores no sentence, so the client composes one:
[`systemMessageSuffixKey`](../../../src/app/features/channels/utils/systemMessage.ts) maps the
subType to an i18n key holding only the trailing clause, and the actor's name is rendered separately
as a bold prefix. That split is what makes both languages read naturally — Korean puts the particle
after the name, English puts the verb after it.

The name comes from the site profile first, then the row's `ownerName`.

`subType` empty or unknown returns `null`, and the row falls back to the legacy path: older rows
stored the whole sentence in `content`, and a regex splits the name off it. The fallback does not
branch on tone, because without a `subType` there is no trustworthy way to tell a departure from an
arrival, and re-deriving it from the sentence is precisely what the fallback exists to avoid.

Tone is `default` (a tinted pill) everywhere except a **1:1 `leave`**, which draws as untinted red
text. A DM is one other person, so their leaving is not something the room can report neutrally.
Groups keep the pill for both events.

My own join and leave rows never render at all — `useChats` drops them, since they carry nothing for
their own subject. System rows are also excluded from grouping, and they never show a read receipt.

Unread badges count user messages only; the home list subtracts `channel.metaNo` (the non-counting
event total) for that, which is the home feature's concern.

## Attachments (`attach$`)

`ChatModel.attach$` is a Slack-lineage payload — `pretext`, `title`, `text`, `color`, `username`,
`ts`, `footer`, `sourceUrl`, `fields[]` — that the sender fills in as `meta` on the send body
(`meta` itself is reserved by `CoreModel`). **The server preserves it and never interprets it**, so
every check is the client's:

Three predicates carry it: whether there is anything to draw at all (an empty `{}` renders no card),
what colour the left rail is, and whether `sourceUrl` is a link the client may offer.

Nothing in the domain or cache layer handles `attach$` specially: `ChatView` does not exclude it,
`toDomainChat` spreads, `ClientChatView` extends `DomainChat`, and the native cache stores the row
as a `data` blob. A package version bump is the whole integration.

**Colour.** `danger` → `--destructive`, `good` → `--main-accent`, `warning` → the literal `#F5A623`
(the kit has no amber token), a `#hex` verbatim. Anything else, including nothing, falls to the
neutral `--input-border`: inventing a colour would misstate severity, and leaving it blank would
erase the rail.

**Links, guarded twice.** Only `http`/`https` survive `safeAttachmentUrl`; a filtered link means no
button is drawn at all. This matters because the body is webhook input stored verbatim, and the
value is handed to `openExternalUrl`, which in the native shell passes it to the OS browser. Opening
externally rather than in the WebView is the second guard — the same rule every URL in a message
follows.

`ts` is in **epoch seconds**, the only timestamp in this app that is; everything else is
milliseconds.

Known limits: `fields` render in one column (the contract has no `short` flag), and `text` is drawn
as plain text — no markdown, no URL tokenizing — because the sender is outside the trust boundary
and linkifying their text widens it.

## Message text is not markdown

[`messageTokens.ts`](../../../src/app/features/channels/utils/messageTokens.ts) splits a body into
four token kinds: `text`, `url`, `code` (inline backticks) and `codeBlock` (triple-backtick fences).
Bold, italics, headings, lists, quotes and link syntax stay literal. Widening that set is a product
decision, not a refactor.

Code resolves **before** URLs, so `https://…` inside a code span is neither linked nor offered to
the unfurl card. Trailing sentence punctuation and unbalanced brackets are trimmed off a matched
URL, so `…see https://example.com/a.` links to `/a`.

`useUrlMetadata` fetches the unfurl's metadata through the bridge and caches the answer — including
a null answer — in a module-level FIFO map of 500, so scrolling never re-asks and a page with no og
tags is not retried.

## The composer

`MessageInput` is a floating pill over the list, with no surface of its own, so messages scroll
behind it right to the screen edge. Its bottom inset is
`max(8px, --safe-bottom, --keyboard-height + 8px)` — a max, never a sum, or the keyboard's own
edge-to-edge height gets the safe inset added on top of it.

**The keyboard must not close between sends.** Three things together achieve that, and removing any
one of them breaks it:

1. An idle send button is `aria-disabled`, never really `disabled` — a disabled form control
   receives no pointer events at all, so step 2 would never run.
2. Both `pointerdown` and `mousedown` have their default prevented, on the whole bottom bar. iOS
   WKWebView moves focus on `mousedown`, so cancelling `pointerdown` alone leaks. `touchstart` is
   left alone: cancelling it would kill the send `click` too.
3. `touch-manipulation` on the composer, so rapid taps are not read as a double-tap gesture.

The composer is disabled outright when the DM peer is gone — see
[dm-and-self-chat.md](./dm-and-self-chat.md).

## Scrolling

[`useChatScroll`](../../../src/app/features/channels/hooks/useChatScroll.ts) owns the container ref
and reconciles four behaviours in the reversed list:

- **Stay at the bottom** when a genuinely new latest message arrives, with 48px of slack for "the
  reader is still at the newest messages".
- **Hold the anchor** across a `loadMore`: capture `scrollTop` before the older rows render, restore
  it in a layout effect after.
- **Trigger `loadMore`** near the top, debounced.
- **Re-pin** when the composer grows — a growing composer height is the only signal a native WebView
  gives that the software keyboard opened.

Per-channel offsets are remembered through `useScrollRestoration`: stashed on unmount, restored once
on the next mount. Restoration beats the bottom pin (the first page arriving otherwise reads as a
new latest message and overwrites it), and it is consumed exactly once, so entering from the home
list still lands at the newest message.

`suppressAutoScroll` stands the bottom pin down while a message jump is positioning the view;
`scrollToBottom` defers to a `requestAnimationFrame` that runs after every effect, so without it the
pin always won.

## What not to do

- **Do not add a stereo branch to the page.** Pass a variant into a component. Scroll anchoring,
  keyboard compensation, grouping, reactions, threads, read cursors and pagination are identical
  across all three stereos, and splitting the page duplicates all of it to serve seven branches.
- **Do not render a name inline.** `resolveUserName`
  ([`utils/displayName.ts`](../../../src/app/features/channels/utils/displayName.ts)) is the one
  chain — site profile nick, then the member row's nick and name, then the chat row's embedded
  `owner$.name`, then a label — and every candidate passes `isRawIdNick` first, because the server
  seeds an unnamed user's `name` with their account UUID. A fourth hand-copied chain is how the same
  person ends up with two names one line apart.
- **Do not open a URL with an anchor's default.** Everything outbound goes through
  `openExternalUrl`, or the native WebView navigates away from the app carrying the session and
  offers no way back.
- **Do not prevent `pointerdown` on touch** anywhere in the list. See the long-press note above.

## Notes for implementers and tests

- `ChannelRoomPage` has no test file, and it is the largest file in the feature. Logic added for
  this screen goes into a pure util or a component so it can be tested — that constraint is why
  `orderMemberIds`, `systemMessage`, `chatAttachment`, `messageTokens` and `displayName` exist as
  pure modules.
- Attachment behaviour is pinned by `chatAttachment.test.ts` (scheme filter, empty attachment,
  colour mapping) and `MessageAttachment.test.tsx` (field rendering, external open, no link for a
  dangerous scheme, rail colour, seconds-based `ts`).
- A webhook message is indistinguishable from a user message for unread and push purposes, so the
  client does nothing special for it; `isSystem` is `stereo === 'system'` alone, which is why it
  draws as an ordinary bubble.
- The room suite:

```bash
npx jest --config apps/web/jest.config.js --runInBand --watchman=false apps/web/src/app/features/channels
```

## Further reading

- [data-layer.md](./data-layer.md) — where `messages`, `getReadCount` and the scroll hooks come from.
- [reactions-and-threads.md](./reactions-and-threads.md) — the action sheet, chips and the thread page.
- [dm-and-self-chat.md](./dm-and-self-chat.md) — the per-stereo title, avatar and footer rules.
