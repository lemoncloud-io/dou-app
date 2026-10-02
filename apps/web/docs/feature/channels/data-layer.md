# data layer — the hooks a channel screen reads and writes through

Every channel screen gets its data from `features/channels/hooks`. No page calls a repository
directly: the hooks own the subscription, the sync registration and the mapping into the view
models in [`types/index.ts`](../../../src/app/features/channels/types/index.ts)
(`ClientChannelView`, `ClientChatView`, `ChannelMember`).

The caches, the cursors and the re-emit rules underneath belong to `@chatic/data` and are
documented there — [`libs/data/README.md`](../../../../../libs/data/README.md) and
[`docs/repositories/`](../../../../../libs/data/docs/repositories/README.md). This document says
what the app layer does with them.

## Layout

One hook per file under `features/channels/hooks/`, exported from one barrel. Four stay out of it and
are imported by path from their callers: `useSendImages` (see [Writes](#writes)), `usePhotoPicker`, and
the two behind a message's images, `useImageAddressRefresh` and `useCachedImages`
([image-send.md](./image-send.md)). They fall into five groups: the observers (`useChannel`, `useChannelJoins`, `useChannelMembers`, `useChannelProfiles`,
`useChats`), the sync registrars (`useJoinPositions`, `useForegroundChatRefresh`), the screen
mechanics (`useChatScroll`, `useReadMarker`, `useMessageJump`, `useUrlMetadata`), the four
`use*Mutations` write hooks, and `useSendImages`.

34 hooks, 29 of them with a co-located `*.test.ts` or `*.test.tsx`. The command that says which five have none:

```bash
cd apps/web/src/app/features/channels/hooks && \
  for f in $(ls *.ts | grep -v '\.test\.' | grep -v index.ts); do \
    [ -f "${f%.ts}.test.ts" ] || [ -f "${f%.ts}.test.tsx" ] || echo "$f"; done
```

## Responsibilities

This layer decides **what a screen observes, when a fetch is allowed to run, and what shape the
row arrives in.** It refuses to decide presentation: no hook here returns a label, a colour or an
i18n key. `useChannelTitle` is the one that looks like an exception and is not — it resolves the
title through [`lib/resolveChannelTitle.ts`](../../../src/app/features/channels/lib/resolveChannelTitle.ts)
so that the room, settings, the home list and place channel management cannot disagree.

## The shared contract

### Observe from the cache, register sync separately

The read path is always `repository.observe*` — a subscription to the local cache, never a fetch.
Keeping the cache fresh is a second, separate act:

| Hook                 | Observes                                             | Registers                                                                         |
| -------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| `useChannel`         | `channel.observeItem(channelId)`                     | `runtime.sync.useChannelSync(channelId)`                                          |
| `useChats`           | `chat.observeList({ channelId, limit })`             | `runtime.sync.useChatSync(channelId)`                                             |
| `useChannelJoins`    | `join.observeList({ channelId, activeOnly: false })` | nothing — the screen registers (below)                                            |
| `useJoinPositions`   | nothing                                              | `sync.registerJoin` on `<channelId>@<userId>`, per member                         |
| `useChannelProfiles` | `profile.observeList({ sid })`                       | `sync.registerProfile` on `<sid>@<userId>`, per active member with a profile here |
| `useChannelMembers`  | `user.observeList({ channelId, detail })`            | nothing — it calls `syncChannelUsers` itself                                      |

Both registrars register with an explicit `{ cid }`: `useJoinPositions` takes the room's cloud from
its caller (the channel row's `cid`), `useChannelProfiles` uses the selected cloud — the one its
observation reads. A target registered without a cloud lands on whichever cloud is selected when the
effect runs, and during a switch that is not necessarily the cloud the screen is showing.

`registerJoin` and `registerProfile` are refcounted by key, so the room re-registering my own join
dedups with whatever the home surface already holds.

### The user cache has no sync plan

`channel`, `chat`, `join` and `profile` each have a runtime sync plan. **`user` does not.**
`useChannelMembers` calling `syncChannelUsers` is the only thing that ever fills it, which is why
membership is built from the roster (`channel.memberIds`) and the join rows — both of which _are_
synced — and the user cache only decorates a row it happens to hold. Building the list the other
way round (`users.map(...)`) hid every member whose user row had not arrived; in a self-chat that
is the only member there is, so the section rendered empty forever. `ChannelMember` is
`Partial<DomainUser> & { id }` for exactly this reason.

### A network read waits for its socket to verify

Anything that talks to the server is gated on verification and takes it as an effect dependency,
so it retries itself on the `false → true` edge after a reconnect or a site switch. Which socket
depends on where the call goes:

- A sync target registered for a named cloud (`registerJoin`, `registerProfile`) runs on that
  cloud's own slot, so it waits for that slot — `runtime.connection.useCloudVerified(cid)`, which
  reads a missing id as the relay.
- A call through the app graph (`syncChannelUsers`, a `refreshList`) goes out on the active slot, so
  it waits for `runtime.connection.useRuntimeSocketState().isVerified`.

Cache observation is never gated: the screen renders whatever is already local.

`useJoinPositions` carries a second gate, `isMember` (from
[`isChannelMember`](../../../src/app/features/channels/utils/membership.ts)). The server refuses
another member's join row to a non-member, so a room reached by a stale push would otherwise poll a
403 per participant.

### One observer per cache per screen

`useChannelJoins` exists because four consumers wanted the same join list: the roster's read state,
the read cursors, my own row (nick / notify) and the active-member set. They shared the storage
read and not the React state, so one join write produced three callbacks and three derivations.
The screen subscribes once and passes `joins` down — `useChannelMembers` takes them as a
parameter rather than opening its own observer.

### `myJoin`, never `channel.$join`

`channel.$join` is a projection and lags the join cache. Anything that has to reflect a write
immediately — my nick, my notification flag, my read boundary — reads `useChannelJoins().myJoin`.

### Paging widens the window; it does not append

`chat.observeList` returns the newest `limit` rows (a `chat_no`-descending cursor). To reveal older
history the _observe window_ grows so the cache re-emits with the older page included:

```text
loadMore():
  oldestNo = min(chatNo) over the current window
  refreshList({ channelId, cursorNo: oldestNo, limit: 50 })
  fetchedCount === 0 → hasMore = false
  otherwise          → pageLimit += 50   # re-subscribe, older page comes back in the emit
```

`loadUntil(targetNo)` widens the same window without any round trip — the search jump's target is
usually already cached and only the window was too narrow. It keeps its own `jumpLimit` axis so a
jump cannot disturb `isThreadStartLoaded`, which reads "the cache could not fill the page" as
"there is nothing older". The observe limit is `max(pageLimit, jumpLimit)`.

The two chat cursors are not interchangeable: `channel.chatNo` detects the newest message,
`cursorNo` fetches an older page. The rule and its reasoning are canonical in
[libs/data's repository doc](../../../../../libs/data/docs/repositories/README.md).

### The join window is applied where the cache is read

`useChats` takes `joinedNo` (my `join.joinedNo`) and filters the cache through `isInJoinWindow`
before anything else — `messages`, `rawChats` and the paging cursor all share one boundary.
Leaving a room does not delete its cached rows, so a re-joiner would otherwise see history the
server has stopped serving, and `rawChats` would claim the conversation started at row 1 for them.
The gate itself is `@chatic/data`'s; its contract is in
[libs/data](../../../../../libs/data/docs/repositories/README.md).

`joinedNo` is deliberately _not_ part of the paging reset: it arrives from the join cache slightly
after mount, and treating a late arrival as a channel change would discard the window the reader is
already looking at.

### `messages` is filtered, `rawChats` is not

`useChats` returns both. `messages` drops my own system rows and everything `isFeedVisible`
excludes (reaction events, thread replies), sorts oldest → newest, and maps each row to
`ClientChatView` — owner name resolved `user cache → owner$.name → ownerId`, `timestamp` from
`createdAtMs`, `isSystem` from `stereo === 'system'`. Optimistic rows have no server `chatNo` yet
and sort as `+Infinity` so they sit at the bottom, not pinned to the top at 0.

`rawChats` is the same window _before_ the feed filter. Reaction folding and thread building must
read it — derive them from `messages` and the material is already gone.

### Reads advance in two stages

`useReadMarker` sends `channel.chatNo` on entry, before messages load, then corrects upward to the
newest committed message and re-sends on foreground return. A just-sent message is read by
definition, so the send path calls `markSent(chatNo)`. Only what the server accepted is recorded to
`readMarkRegistry` — an optimistic value would make a failed read look like a cache that fell
behind.

`useJoinPositions.getReadCount(chatNo)` counts active members whose cursor (`max(readNo, chatNo)`
from `useChannelJoins`) has reached that row. A member whose join row has not synced counts as
unread until it lands; a message's own sender never inflates the unread count, because sending
advances their cursor.

### Writes

Four mutation hooks, split by the repository they talk to, each with per-action pending flags so
independent buttons only reflect their own in-flight state.

| Hook                  | Actions                                                                                | Repository                   |
| --------------------- | -------------------------------------------------------------------------------------- | ---------------------------- |
| `useChannelMutations` | `createChannel` · `updateChannel` · `deleteChannel` · `leaveChannel` · `inviteChannel` | channel (+ join, for a kick) |
| `useChatMutations`    | `sendMessage` · `retryMessage` · `readMessage` · `deleteMessage`                       | chat, join                   |
| `useJoinMutations`    | `updateJoin` (my nick / notify)                                                        | join                         |
| `useUserMutations`    | `requestInvite` · `requestInviteBatch`                                                 | user                         |

Image messages have their own write hook, `useSendImages` (`sendImages` · `retry` · `canRetry` ·
`discard`, on chat). It is not a `use*Mutations` sibling because it holds state beyond one request —
the picked files a retry needs — and it is not in the hooks barrel yet: nothing imports it until the
composer's picker is wired. Everything about it → [image-send.md](./image-send.md).

Worth knowing before you call them:

- **A send names its cloud.** `sendMessage(cid, payload)` goes through
  `runtime.data.sendChatInCloud`, not the app graph. A send is an optimistic cache write followed by
  a socket request, and the app graph resolves each from the selection at the moment it happens — so
  a cloud switch landing in between put the row in one cloud and the message on another's socket.
  The caller reads `cid` when the user presses send: the room uses the channel row's `cid` (the
  selection only until the row has loaded), the thread the root's.
- **A retry goes back where the message was sent.** `retryMessage(row)` deletes the failed row from
  `row.cid`'s partition and resends to `row.cid`, carrying `parentId` and `contentType` across
  (`toResendPayload`, which also rebuilds a bare-chatNo `parentId` into `<channelId>:<chatNo>`). A
  retry that dropped them would turn a failed thread reply into a top-level message. Today only the
  room retries, and the room shows no replies, so that half is latent until a thread offers a retry.
  The payload is checked before the delete, so a row the send would refuse is kept, not removed.
- **`deleteMessage(cid, id)` is a cache delete** — the ✕ beside a failed send, addressed to the
  cloud the row lives in. The server delete is `deleteServerMessage`, a different action.
- **A kick writes the join row itself.** `leaveChannel({ channelId, userId })` removes someone
  else, and nothing server-side pushes a join update for the target, so the hook marks their row
  `joined: 0, reason: 'kicked'` in the same local join cache the member list observes. Without it
  the removed member keeps rendering.

`useCreateChannel` and `useCreateInviteBatch` are thin wrappers over the two below them
(`createChannel`, and `requestInvite` plus the SMS/clipboard hand-off).

## Usage

A screen calls the observers in dependency order: `useChannel` first, then `useChannelJoins` — whose
`joins` and `activeMemberIds` feed `useChannelMembers`, `useChannelProfiles` (which also needs the
`sid` off the channel row) and `useChats`'s `joinedNo`. Passing those down is the rule in § One
observer per cache per screen, not a convenience.

### Adding a hook

1. Put it in `hooks/`, one hook per file, and export it from `hooks/index.ts`.
2. Read through `runtime.data.useRuntimeRepositories()`. Never import a data source or a gateway.
3. If it observes a cache another hook on the same screen already observes, take that list as a
   parameter instead — see `useChannelMembers({ joins })`.
4. If it fetches, gate it on verification and keep that gate in the dependency array — the named
   cloud's `runtime.connection.useCloudVerified(cid)` for work addressed to a cloud, the active
   slot's `isVerified` for a call through the app graph (§ A network read waits for its socket).
5. If it registers a sync target, pass its cloud (`{ cid }` as the last argument), build any
   `<id>@<uid>` from `runtime.session.useUidInCloud(cid)`, keep both in the dependency array, and
   return the disposer from the effect. Register synchronously when you can, so an early cleanup
   cannot race it; if registration has to wait on a read (as `useChannelProfiles` does for uncached
   members), check a `disposed` flag before each `register` and collect the disposers in an array
   the cleanup drains.
6. Co-locate `*.test.ts`.

### What not to do

- **Do not fetch on mount to fill a screen.** The sync layer primes a cold room
  (`usePrimeChat`) and `useForegroundChatRefresh` covers a warm one. The two conditions are
  mirrored on purpose — cold fetches there, warm fetches here, every entry fetches exactly once.
  Add a third and every room entry doubles its requests.
- **Do not derive display names in a list row with `useChannelTitle`.** It calls `useMyProfile`,
  which triggers a fetch per call. Lists resolve `myNick` once in the parent and call
  `resolveChannelTitle` directly.
- **Do not read absence out of `profileMap`.** A member missing from it means this device does not
  hold their row yet — a cold cache, a fetch still in flight or one that failed — not that they have
  no profile. The hook once returned a `hasSnapshot` flag for this, but it turned true on the local
  cache's first emission, before the server had answered; with my row missing from IndexedDB the
  room settings prompted a user who had a profile to create one, and a save from that blank form
  overwrites the real nick. Whether _I_ have no profile is the server's answer
  (`usePlaceProfileAbsent`, which waits for `profile.get-mine`); nobody can act on anyone else's.
- **Do not treat the first `null` from `observeItem` as a missing channel.** It answers from the
  local cache alone, so a room the device has never seen answers `null` while the fetch is in
  flight. `useChannel` keeps `isLoading` true until a row arrives or a 10s timeout turns it into
  `isError`. Acting on that first `null` — redirecting home, say — unmounts the sync that would have
  cached the row, and the room can never be opened again. A `null` _after_ a row has been seen is a
  real removal and resolves immediately.

## Notes for implementers and tests

- `useChannel` accepts a `seed` — the row the navigating screen already had, passed through
  navigation state. It renders the room instantly and disarms the resolve timeout, but it does not
  touch resolution semantics: a cold cache's first `null` is still "fetch in flight".
- A sync target is tagged with the uid the account has in the target's cloud and only runs while
  that still matches, so `useJoinPositions` and `useChannelProfiles` both take
  `runtime.session.useUidInCloud(cid)` as a dependency and re-register on an account change. Not
  the session `userId`: every cloud gives the account a different uid, and the session's is only
  the committed cloud's.
- For the same reason `ChannelRoomPage` recognises me by `useUidInCloud(<room's cid>)`, not the
  session `userId` — every "is this me" it asks compares against ids the room's cloud minted (the
  roster, join rows, owner ids, profile keys), and `allMemberIds` builds `<channelId>@<uid>` join
  ids out of it. `useChannelJoins` and `useChats` still pick `myJoin` / `isOwner` by the session
  uid; the two agree everywhere except inside a switch.
- Profile polling runs at 20s in a room and 60s on list surfaces
  (`LIST_PROFILE_SYNC_INTERVAL_MS`) — one target per member means the request rate is
  `members / interval` for as long as the screen is open. First paint never waits for a tick: the
  hook one-shots `refreshItem` for members the cache does not hold.
- That one-shot also decides whether the member is polled at all. A cached member is registered
  straight away; an uncached one only after the read, and **not at all if it answered 404**. A
  profile exists per place, and only once its owner has opened that place, so a cloud 1:1's peer
  from another place, say, has none here — a poll would only re-read the 404 until the scheduler stopped
  the target and logged "local rows dropped". They fall back to the user record, and a profile they
  create later arrives through the site-wide `profile.syncProfiles` delta when the room's place is
  the active one, and on the next mount otherwise. Any other bootstrap failure — a timeout, no
  socket, or a 403, which a re-auth of the same socket answers for a moment — still registers,
  because the poll is what recovers from that.
- `useChannelMembers` reaches `syncChannelUsers` through a narrow cast, because the published
  `@chatic/data` types do not surface it on `IUserRepository` yet.
- Jest runs the channels suites with the app config:

```bash
npx jest --config apps/web/jest.config.js --runInBand --watchman=false apps/web/src/app/features/channels
```

## Further reading

- [README.md](./README.md) — the screens these hooks serve, and the directory map.
- [chat-room.md](./chat-room.md) — what the room does with `messages`, `getReadCount` and the scroll hooks.
- [reactions-and-threads.md](./reactions-and-threads.md) — the derivations that read `rawChats`.
- [libs/data](../../../../../libs/data/README.md) — caches, cursors, the join window, re-emit.
