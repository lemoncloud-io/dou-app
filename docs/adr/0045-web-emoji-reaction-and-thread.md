# ADR-0045: Add emoji reactions and threads to apps/web — full-screen thread, action sheet, app-local utilities

> Status: Accepted · Decided: 2026-08-05
> Follows: [ADR-0008](./0008-threads-client-derived-from-parentid.md) (threads derived by the client from `parentId`, with mobile deferred as out of scope) · [ADR-0024](./0024-group-chat-room-figma-redesign.md) · [ADR-0032](./0032-dm-chat-room-screen.md)
>
> External contract source: `chatic-sockets-api` `docs/specs/chat-emoji-reaction/` (01-spec.md ·
> 05-client-guide.md, Rev 2026-07-31)

> **Naming note (2026-09-01):** the `*RemoteDataSource` · `RemoteGatewayBundle` · `*DomainGateway` ·
> `remoteFactory` · `remote/data-sources/` names used in this document are **the names of the time**.
> The mapping after the socket axis moved to the `Socket` prefix is in
> [libs/data/docs/remote/README.md](../../libs/data/docs/remote/README.md#naming-history). This is a
> record, so the body stays as written.

## Context

The chat room in `apps/web` (mobile) has neither emoji reactions nor thread replies. Both go in.

### This is a port, not a new implementation

Both features are fully implemented in `apps/desktop-web/src/app/features/chat/`, and the thread design
is recorded as a decision in ADR-0008. ADR-0008 explicitly deferred "mobile (apps/web) is out of scope",
and that is what this work opens.

**The engine layer is already finished.** There is no new wiring to run.

- `ChatRepository.setReaction()` handles creating the optimistic event row (the `chatNo: 0` sentinel,
  which the fold sorts last), replacing it with the server event, and deleting it on failure
  (`libs/data/src/repositories/ChatRepository.ts:190`).
- `ChatRemoteDataSource.setReaction()` calls the `chat.reaction` packet
  (`libs/data/.../ChatRemoteDataSource.ts:77`).
- `sendChat` passes `parentId` through and `createOptimisticChat` reads it too
  (`ChatRepository.ts:277`).

**It is only that nobody in apps/web calls either of them.**

### apps/web is broken in front of reactions today — this is an urgent fix, not a feature

A reaction event is **an ordinary chat** with `stereo:'system'` and `subType:'reaction'`, and it arrives
mixed straight into `chat.feed` and `chat.sync`. The server does not filter it out (spec §3). apps/web
has no feed visibility filter:

- **Room screen** — `useChats` passes it through unfiltered, `ChannelRoomPage.tsx:518` branches on
  `isSystem`, `systemMessageSuffixKey('reaction')` is `null`, and the legacy Korean-regex fallback
  renders `content` (undefined) → **an empty `SystemNotice` pill**. My own events are filtered by
  `isOwnSystemChat`, but other people's are not.
- **Home list** — `useLastChat.ts:52` skips only "my own system messages" → **someone else's reaction
  event rises to the row's last-message preview.**
- **Thread replies** are also mixed plainly into the main feed for the same reason.

In other words, if someone presses an emoji on desktop, mobile breaks right now. The filter is not an
add-on.

### The type gap — it had to be closed before starting

The installed `@lemoncloud/chatic-socials-api@0.26.412` has neither `reaction$` nor
`subType:'reaction'` (checked directly:
`Type '"reaction"' is not assignable to type '"" | "join" | "leave" | undefined'`). So the engine is
pushing it in with a raw `as DomainChat` cast, and the `ChatDomainGateway` Pick is missing `'reaction'`
while `ChatRemoteDataSource` references `ChatDomainGateway['reaction']` — runtime works, only the types
do not line up (`libs/data/src/remote/gateways/index.ts:26`).

**The bump was investigated and is purely additive.** From `0.26.412 → 0.26.721`, only 5 `.d.ts` files
change, with not a single removal or narrowing.

| Change                          | Content                                            |
| ------------------------------- | -------------------------------------------------- |
| `ChatSubType`                   | `'reaction'` added (union widened)                 |
| `ChatModel`                     | `reaction$?: ChatReaction` · `metaNo?` added       |
| `JoinModel`                     | `metaNo?` added                                    |
| New                             | `ChatReaction` · `SetReactionBody` · `DMStartBody` |
| `SiteRole`                      | `dummy` added (union widened)                      |
| `generated/field-registry.d.ts` | checksum only                                      |

Every place where widening a union is dangerous (exhaustive `Record<ChatSubType, …>` mappings) was
checked, and the only usage site is a `Partial<Record<…>>`
(`apps/desktop-web/.../systemMessage.ts:12`), which is safe. The difference between the `0.26.720` the
spec named and the latest `0.26.721` is a single unused `DMStartBody`.

### Constraints

- **The server neither stores nor returns reaction aggregates.** The client folds the events in `chatNo`
  order and takes the last `action` per `(chatId, emoji, ownerId)` as the current value (spec §2).
- **`action` is the target state.** The server does not decide the toggle — the client looks at the
  current state and sends `'on'` or `'off'`.
- **Both the response and `chat.sync` arrive.** Reactions have no `broadcast.exclude`, so the sender gets
  an echo too. Deduplication by chat id is needed, and the engine cache already satisfies it with
  idempotent writes keyed by `id`.
- **`chat.feed` has no `parentId` filter**, and roots have no `replyCount` (ADR-0008). Threads are
  derived only from what is loaded into the local cache, so counts and content are best-effort.
- **`parentId` is double-encoded** — sending uses the parent's full id `<channelId>:<chatNo>`, storage
  and broadcast use the root's bare `chatNo` string, and the optimistic row uses the payload as-is.
  Matching has to accept both.
- **The emoji fold key must match the server's `normalizeEmoji`** — NFC plus U+FE0F removal. If it
  differs, a reaction one client turned on cannot be turned off on another.
- **Mobile has neither the desktop hover toolbar nor the trailing side panel.** What apps/web has is a
  long press (450ms) → a Radix dropdown with one item: copy.
- **Reactions have no push** (`stereo !== 'user'`, so the push leg is never attached). **Replies do** —
  they are ordinary `stereo:'user'` chats.

## Decision

### 1. Put emoji and threads in as one track

They touch the same places — the message long-press action surface, the feed visibility filter, the
`MessageRow` slots, the home preview filter. Split them and we edit the same files twice.

### 2. Add the feed visibility filter first (bug fix)

Put `isFeedVisible = chat => !chat.parentId && chat.subType !== 'reaction'` into the mapping step of
`useChats`. Deleted messages stay (the server delete is a soft delete, so a tombstone holds its place).
System join/leave stays too (rendered as a notice line).

The home preview adds one more condition —
`isPreviewableChat = isFeedVisible && !isSystem && !isFailed`. join/leave has no body, so the preview
becomes an empty line, and a failed send never even reached the channel yet holds `chatNo: 0` forever,
pinning the preview.

### 3. Keep the derived utilities separately in apps/web — no promotion to libs

Implement `foldReactions` · `buildThread`/`buildThreadIndex` · `feedVisibility` · `previewChat` as
app-local code in `apps/web/src/app/features/channels/utils/`. The desktop code is not touched.

The priority of this track is to cage the diff inside apps/web and make the desktop regression risk zero.
Promoting to `libs` would change desktop import paths too, spreading the review scope across two apps.

### 4. The thread surface is a full-screen route

`ROUTES.channels.thread` = `:channelId/thread/:chatNo`. Back navigation, deep links, and page transition
animations ride on the existing routing as-is, and the reply input gets room for the keyboard to come up.
A bottom sheet would have to hold the scrolling list, the input, and the keyboard inside the sheet, which
creates a fight over height.

**Flat, root-only (two levels).** A reply's `parentId` is always the thread root. Reply to a reply and the
server normalizes it to the root — there are no nested threads.

### 5. Put a reply footer on the thread root, and implicitly highlight unseen replies

Attach a "Replies N · avatar of the most recent replier" footer under the root row, and if there are
replies past my read cursor (`join.readNo`), mark it with a dot and emphasis.

Without this, replies genuinely get lost. Replies are `stereo:'user'`, so they are caught by the unread
badge, but they are hidden from the main feed. You see 3 badges, enter the room, find nothing new, and
because the read cursor is based on `chatNo` it is simply marked read — **so the badge disappears without
you ever seeing the replies.** On desktop the side panel is always up so it is less noticeable, but on
mobile the surface is separate. All the material is local (the loaded replies plus `readNo`), so no
separate state design is needed.

Inlining replies into the main feed, which ADR-0008 argued against, is not adopted — it would split the
mental model from desktop.

### 6. Change the message long press from a Radix dropdown to a BottomSheet

One sheet holds: **a quick-pick emoji row** (recently used plus defaults, 6 of them) → **Copy** →
**Reply (open thread)**. Failed and pending rows keep their existing retry and delete.

Reuse `BottomSheet`/`SheetOption` from `libs/web-ui-kit` (keyboard aware, `--keyboard-height`). The ko/en
translations **already have an unused `chat.room.messageActions` key** — a trace that this was the
original direction. A narrow dropdown cannot fit a quick-pick emoji row.

### 7. Emoji selection is a quick-pick row plus a full picker

Finish in one tap from the row of 6 at the top of the action sheet, and "More" opens the desktop's
6-category curated picker (`EMOJI_CATEGORIES`, no external emoji DB) as a sheet. Recently used emoji are
kept locally.

### 8. Bump `@lemoncloud/chatic-socials-api` to `^0.26.721`

Since it is confirmed additive, no local augmentation is used. Along with the bump:

- Remove the `as DomainChat` raw cast in `ChatRepository.setReaction`.
- Add `'reaction'` honestly to the `ChatDomainGateway` Pick (`libs/data/.../gateways/index.ts:26`).

### Scope

**In** — reaction chips, quick pick, full picker, toggle · feed and preview visibility filters · the
thread full-screen route and reply sending · the root reply footer and unseen-reply emphasis · the message
action BottomSheet · the socials-api bump and the cast and Pick cleanups that come with it · ko/en
translation keys.

**Out** — a `parentId` filter on `chat.feed` and server-side reply aggregation (backend follow-up,
deferred by ADR-0008) · nested threads · reaction push · a detail sheet listing who reacted · desktop code
changes · promoting the derived utilities to libs · a reply-only unread counter (no slot on the server).

**Channel kinds are not distinguished** — group, DM, and self chat all behave the same. Putting a reaction
or a reply on your own memo in self chat is harmless, and branching on it only grows the code.

## Alternatives

- **Promote the derived utilities to `libs` and share them across both apps** — dropped this time. Server
  contracts like the `parentId` double encoding and the emoji fold key then exist in two places, so the
  drift risk is real (the `feedVisibility` comment carries that warning itself). Even so, zero desktop
  regression risk and a bounded review scope were valued higher on this track. Unification is a separate
  refactoring track — until then the drift is accepted.
- **Emoji first, threads on the next track** — dropped. The two features touch the same 4 files, so the
  same code would be edited twice.
- **The thread as a bottom sheet** — dropped. The sheet would have to hold the scrolling list, the input,
  and the keyboard together, which creates a fight over height. The loss outweighs the benefit of keeping
  the channel context behind it.
- **The thread as an inline expansion under the root** — dropped. It is the lightest since there is no new
  surface, but the feed collapses once there are many replies, and it is the option ADR-0008 explicitly
  rejected.
- **Keep the Radix dropdown and just add items** — dropped. The smallest change, but a quick-pick emoji row
  does not fit a narrow dropdown, and it does not suit mobile touch targets either.
- **Local type augmentation instead of the bump** — dropped. Once the bump was confirmed additive, the
  advantage of writing the contract anonymously disappeared.
- **Quick-pick emoji row only (fixed 6, no full picker)** — dropped. The lightest, but the reaction set
  would diverge from desktop.

## Consequences

- **A bug that exists today is closed.** Desktop-originated reaction events showing up as empty pills on
  mobile, and occupying home row previews, both disappear with this filter.
- **Reply counts and thread content are best-effort** (inherited from ADR-0008). Only replies within the
  loaded cache range are counted — an old thread needs history paging before its old replies appear. The UI
  must not present the count as authoritative. The escape hatch is the deferred `chat.feed` `parentId`
  filter, and this design is shaped so that the local filter can be swapped for a server query when it
  arrives.
- **Unread badges do not inflate on reactions.** `useChannelUnreads.ts:36` offsets system events with
  `chatNo - metaNo`, and reaction events are `stereo:'system'` so they are caught by `metaNo` — checked,
  nothing to touch.
- **Replies are still caught by the badge.** There is no slot for a reply-only counter on the server. The
  root footer and the implicit emphasis from decision 5 are the mitigation, not a full fix.
- **Derived logic exists in two apps.** If the server contract changes (say, the reaction response starts
  carrying aggregates), two places need fixing. Debt taken on knowingly.
- **The `ChatSubType` union widens.** It is safe today because only a `Partial<Record<…>>` exists, but any
  future exhaustive mapping over this union must handle the `'reaction'` case.
- **`BottomSheet` takes on message actions too.** With the dropdown gone, the right-click (`contextmenu`)
  path converges on the sheet as well — in a mobile WebView that effectively means a single long press.
- **Replies do get push.** Unlike reactions they are ordinary `stereo:'user'` chats, so the existing push,
  `viewing`, and `mutedUserIds` rules apply as-is. There is no extra work, but the product has to accept
  the behaviour that replying in a thread pushes to the whole channel.

## Follow-ups

- Backend work to add a `parentId` filter to `chat.feed` and root reply aggregates (`replyCount`,
  `lastReplyAt`). Once it lands, reply counts gain authority and the best-effort hints can be removed from
  the UI. Separate ADR.
- A `libs` unification refactor of the derived utilities (`foldReactions`, `buildThread`,
  `feedVisibility`, `previewChat`). Separate ADR.
- A detail sheet showing who reacted. `foldReactions` already holds `userIds`, so only the UI is left.
