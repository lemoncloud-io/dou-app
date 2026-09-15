# reactions and threads — two features the server barely models

The backend stores neither a reaction nor a thread as a thing of its own. A reaction is a chat row
with `subType: 'reaction'` carrying `reaction$`; a reply is a chat row carrying `parentId`. Both
arrive mixed into `chat.feed` / `chat.sync` like any other message, and everything a reader sees —
the chips, the counts, the reply list, the unseen dot — is derived on the client from the cache
window that is already loaded.

Two consequences run through this whole document. **Derived numbers are best-effort**, bounded by
what is loaded, so nothing here may be presented as authoritative. And **the derivation has to read
the unfiltered window**, because the rows it needs are exactly the rows the feed filters out.

## Layout

Four pure modules carry the derivations — `foldReactions.ts`, `buildThread.ts`, the curated
`emoji.ts` set (nine categories) and `longPress.ts`, whose single threshold is shared by bubbles and
chips. Everything else is presentation: the chip row, the reactor sheet, the action sheet, the
picker, the thread footer and the thread page. `useRecentEmojiStore` holds the device-local recents.

## Responsibilities

These modules decide **what the loaded rows mean**. They decide nothing about identity: a folded
tally holds user ids, and a thread's repliers hold whatever `owner$` thumbnail came embedded on the
row. Resolving those into a name and a face is the displaying component's job, through
`resolveUserName` / the profile map. Injecting the caches into the derivation would make it
impure and its tests heavy; the cost is that the precedence chain is applied at each display site —
today the message row, the thread footer and the reactor sheet.

## Fold first, filter second

`rawChats` is the cache window before the feed filter. Derive from `messages` instead and the
material is gone — reaction events and replies are precisely what the filter removes, and my own
reaction event is also dropped by `isOwnSystemChat`, so the fold's input has to be the completely
unfiltered list.

The predicates that do that filtering (`isFeedVisible`, `isNotifiableChat`, `isPreviewableChat`,
`compareByChatNo`, `pickPreviewChat`) are **not owned here**. They live in `@chatic/data`
(`domain/chatPreview.ts`) because the home preview's fast path needs the same judgement, and
`apps/web/src/app/utils/chat.ts` only re-exports them. Their definitions and reasoning belong to
[libs/data](../../../../../libs/data/README.md); what this feature does is apply them at the two
points above.

## The fold

`foldReactions(rawChats, myUserId)` returns `Map<targetId, ReactionTally[]>`.

- **The fold key is `NFC` minus variation selectors** — the same `normalizeEmoji` the server
  applies. It has to be: bucket differently and a reaction turned on from one client cannot be
  turned off from another. Skin tones and ZWJ sequences are left alone, because those are genuinely
  different emoji.
- **A tally carries both forms.** `emoji` is the string the event carried, which is what gets
  displayed; `key` is the normalised bucket, which is what callers compare. Comparing display
  strings misjudges `❤️` against `❤`.
- **Last action wins**, per `(targetId, userId, key)`, ordered by `chatNo || MAX_SAFE_INTEGER - index`
  — an event still in flight has no `chatNo`, and the fallback puts it last, which is where an
  optimistic write belongs.
- `hasMyReaction(tallies, emoji)` answers "am I currently reacting with this" on the fold key.

## Toggling

The server does not toggle. `action` is the **target state**, so the caller has to know the current
one — which is why `useReactions().toggleReaction(chatId, emoji, isMine)` takes `isMine` from the
fold rather than looking it up.

The tap resolves to `on` or `off` against the fold, `setReaction` writes the returned event straight
into the chat cache so the chip updates without waiting for the broadcast, and the `chat.sync` echo
carries the same id — an idempotent write, no flicker. A rejection rolls the cache back and sets
`failedId`.

`failedId` is keyed by message id, not a boolean: one hook instance serves the whole room, so the
flag has to say which row it belongs to. Without it the chip appears and vanishes on its own and
the reader is given no reason.

**Only persisted rows can be reacted to or replied to.** `canReact` / `canReply` are
`!!message.chatNo`: an optimistic row's id is temporary, so a reaction aimed at it 404s and orphans
once the persisted row replaces it.

## The gestures

One threshold for the whole chat surface — `LONG_PRESS_DELAY_MS = 450` in
[`utils/longPress.ts`](../../../src/app/features/channels/utils/longPress.ts) — because two values
would make the same gesture feel like two gestures depending on where the thumb landed.

| Target        | Tap                  | Press and hold                     |
| ------------- | -------------------- | ---------------------------------- |
| message body  | —                    | `MessageActionSheet`               |
| reaction chip | toggle that reaction | `ReactionDetailSheet`              |
| chip row `+`  | `EmojiPickerSheet`   | — (not a toggle, no pressed state) |

The chip splits its two gestures by frequency: toggling is common, so it gets the cheap gesture.
The `click` that follows a fired long-press is swallowed so one gesture cannot do both.

The add button exists so a _second_ reaction costs one tap instead of a long press plus a sheet. It
is deliberately not a general entry point: the chip row does not render without chips, so the button
only appears once a message has at least one — a strip reserved under every message would cost more
vertical rhythm than it earns.

`MessageActionSheet` holds a six-slot quick row (recents first, then the fixed `QUICK_REACTIONS`,
then a fallback set), a "more" button into the full picker, and the thread and copy actions. Its
pressed state mirrors the chips, so tapping an emoji already reacted with sends `off`. **Who
reacted is not in this sheet** — this one answers "what can I do to this message", the reactor sheet
answers "who is in this reaction", and faces need room this list has not.

`QUICK_REACTIONS` is two fixed emoji and is deliberately not reordered by recency: a button's value
is that the hand learns where it is. Recents are a device-local LRU of 16 in `useRecentEmojiStore`,
read by both the quick row and the picker's recents tab, and persisted under a key shared with
desktop.

`ReactionDetailSheet` opens on the tab of the chip that was held, reads the **live** fold, and falls
back to the first remaining tab if the one being viewed disappears because someone withdrew their
reaction.

## Threads

### The `parentId` encoding contract

Three encodings for one relationship, and matching has to accept them all:

| Where                    | `parentId` holds                                                         |
| ------------------------ | ------------------------------------------------------------------------ |
| a send                   | the root's **full id** `<channelId>:<chatNo>` — a bare chatNo 404s       |
| a stored / broadcast row | the root's `chatNo` as a string; the full id survives in `parent$.id`    |
| an optimistic reply      | whatever the payload carried, i.e. the full id, until the persisted swap |

`threadRootId` normalises to the chatNo string, which is what the route
(`ROUTES.channels.thread(channelId, rootNo)`) and the footer key off. Threads are flat: the server
folds a reply-to-a-reply back onto the root, so the action sheet inside a thread offers no reply.

### What is derived

`buildThreadIndex(rawChats)` produces one `ThreadMeta` per root — the loaded reply `count`,
`lastReplyAt`, `lastReplyNo`, `lastReplyOwnerId`, the unique `repliers` in first-seen order, and
`entries` (every loaded reply as `chatNo` + author). `buildThread(rawChats, rootNo)` assembles one
root plus its replies for the thread page.

`entries` exists because the footer prints **how many** replies are new, and no aggregate can answer
that: the read baseline is per-viewer and arrives long after the derivation runs. Subtracting
`lastReplyNo` from a cursor would be wrong too — reaction rows and ordinary messages consume the
same `chatNo` sequence.

### The unseen dot

Replies are `stereo: 'user'`, so they count toward the unread badge, but they never appear in the
feed. Entering the room would therefore clear the badge for replies nobody has read. The footer
answers that with `countUnseenReplies(meta, baselineReadNo, userId)`, where `baselineReadNo` is my
read cursor **snapshotted on entry**: the live cursor is useless here, since the read marker
advances it to the channel head within a beat of entering. My own reply never dots my own thread.
Leaving and re-entering takes a fresh snapshot, so a thread visited in between loses its dot —
exactly the semantics the read cursor already has.

### The thread page

[`ThreadPage`](../../../src/app/features/channels/pages/ThreadPage.tsx) derives everything from the
same channel window, so it composes like the room: one join subscription, the member roster, the
profile map.

- **The header names the screen, not the room.** Title `chat.thread.title`, no avatar. A thread is
  one conversation inside a channel; wearing the channel's name and face would read as having
  navigated to the channel. Back returns to the room.
- **The root renders as the thread's subject**, not as another message: a 36px avatar and name on
  one line, then the body as plain text with no bubble and no side, then its chips. A bubble would
  put the subject in the same visual class as the replies, and a right-aligned one would push it to
  the edge of the screen it opens. It carries no time and no receipt — the room row it was opened
  from has both.
- A full-bleed 4px band separates the subject from the conversation about it.
- **Sending** posts `parentId: root.id` (the full id) and then advances the read cursor with the
  returned `chatNo`, because a reply consumes a channel chatNo like any other row.
- **A root that has paged out** shows `chat.thread.unavailable` and, while `hasMore`, a "load older"
  button — the derivation is bounded by the loaded window, so the honest answer is to offer more of
  it.
- The room hands the root across in navigation state (`state: { rootChat }`), because the cache's
  first emission is asynchronous even when warm and the thread would otherwise open on a spinner
  under a translucent header.

Scroll position in the room survives the trip through `useChatScroll`'s per-channel restoration —
see [chat-room.md](./chat-room.md).

## What not to do

- **Do not derive from `messages`.** Fold and thread-index inputs must be `rawChats`.
- **Do not compare emoji as display strings.** Use the tally's `key`, or `hasMyReaction`.
- **Do not change the fold key or the `parentId` matching in one client.** Both are shared
  contracts: the fold key with the server's `normalizeEmoji`, the encoding with `getThreadRoot`.
  `apps/desktop-web` keeps its own copies of these files and the two must not drift.
- **Do not present a count as authoritative.** Reply counts and reactor lists are what the local
  window holds.
- **Do not offer a reaction or a reply on a row with no `chatNo`.**

## Notes for implementers and tests

- A reaction event is invisible in the feed but still consumes a `chatNo`, so a burst of them can
  fill the newest rows of a window. Surfaces that read "the last real message" widen their window
  instead of filtering after the fact — that is the home list's concern, see
  [../home/README.md](../home/README.md).
- Reply pushes are ordinary message pushes, so a tap lands on the channel first and hops to the
  thread only if the pushed chat turns out to be a reply. That routing lives in
  [bridge/push-navigation.md](../../bridge/push-navigation.md).
- The derivations are pure and tested directly: `foldReactions.test.ts` (normalisation convergence,
  last-action-wins, optimistic ordering), `buildThread.test.ts` (both encodings, reactions excluded,
  `lastReplyNo` / owner), plus component tests for the chips, the sheets and the footer.

```bash
npx jest --config apps/web/jest.config.js --runInBand --watchman=false apps/web/src/app/features/channels
```

## Further reading

- [chat-room.md](./chat-room.md) — where the chips and the footer sit in a row, and the long-press gesture.
- [data-layer.md](./data-layer.md) — `rawChats`, the observe window, and the reaction write.
- [libs/data](../../../../../libs/data/README.md) — the feed and preview predicates.
