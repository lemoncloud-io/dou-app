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

```text
apps/web/src/app/features/channels/hooks/
├── index.ts                     barrel — 23 hooks
├── useChannel.ts                channel row + sync registration → ClientChannelView
├── useChannelJoins.ts           the join observer: joins, myJoin, activeMemberIds, cursorByUser
├── useChannelMembers.ts         roster × join × user cache → ChannelMember[]
├── useChannelProfiles.ts        site profiles (nick/photo) per member, polled
├── useChannelTitle.ts           the title chain, for single-channel screens
├── useChats.ts                  the message window: messages, rawChats, loadMore, loadUntil
├── useChatScroll.ts             reverse-scroll anchoring and restore
├── useForegroundChatRefresh.ts  refetch the newest page on entry / foreground (warm cache only)
├── useJoinPositions.ts          read counts + per-member join sync registration
├── useReadMarker.ts             advances my read cursor in two stages
├── useMessageJump.ts            scroll to and flash a searched message
├── useUrlMetadata.ts            link-preview metadata, module-level FIFO cache
├── useReactions.ts              reaction toggle (see reactions-and-threads.md)
├── useDmPeer.ts / useDmPeers.ts the other participant, for one room / for a list
├── useDmInviteState.ts          peer-gone + invite state (see dm-and-self-chat.md)
├── useInviteCandidates.ts       invitable people from cache alone (see invite.md)
└── use*Mutations.ts             the four write hooks, below
```

23 hooks, 18 of them with a co-located `*.test.ts`. The command that says which five have none:

```bash
cd apps/web/src/app/features/channels/hooks && \
  for f in $(ls *.ts | grep -v '\.test\.' | grep -v index.ts); do \
    [ -f "${f%.ts}.test.ts" ] || echo "$f"; done
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

| Hook                 | Observes                                             | Registers                                                     |
| -------------------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| `useChannel`         | `channel.observeItem(channelId)`                     | `runtime.sync.useChannelSync(channelId)`                      |
| `useChats`           | `chat.observeList({ channelId, limit })`             | `runtime.sync.useChatSync(channelId)`                         |
| `useChannelJoins`    | `join.observeList({ channelId, activeOnly: false })` | nothing — the screen registers (below)                        |
| `useJoinPositions`   | nothing                                              | `sync.registerJoin` on `<channelId>@<userId>`, per member     |
| `useChannelProfiles` | `profile.observeList({ sid })`                       | `sync.registerProfile` on `<sid>@<userId>`, per active member |
| `useChannelMembers`  | `user.observeList({ channelId, detail })`            | nothing — it calls `syncChannelUsers` itself                  |

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

### A network read waits for `isVerified`

Anything that talks to the server — `syncChannelUsers`, `registerJoin`, `registerProfile` — is
gated on `runtime.connection.useRuntimeSocketState().isVerified` and takes it as an effect
dependency, so it retries itself on the `false → true` edge after a reconnect or a site switch.
Cache observation is never gated: the screen renders whatever is already local.

`useJoinPositions` carries a second gate, `isMember` (from
[`isChannelMember`](../../../src/app/features/channels/utils/membership.ts)). The server refuses
another member's join row to a non-member, so a room reached by a stale push would otherwise poll a
403 per participant.

### One observer per cache per screen

`useChannelJoins` exists because four consumers wanted the same join list: the roster's read state,
the read cursors, my own row (nick / notify) and the active-member set. They shared the storage
read and not the React state, so one join write produced three callbacks and three derivations.
The screen now subscribes once and passes `joins` down — `useChannelMembers` takes them as a
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
| `useChatMutations`    | `sendMessage` · `readMessage` · `deleteMessage`                                        | chat, join                   |
| `useJoinMutations`    | `updateJoin` (my nick / notify)                                                        | join                         |
| `useUserMutations`    | `requestInvite` · `requestInviteBatch`                                                 | user                         |

Two of these are worth knowing before you call them:

- **`deleteMessage` is a cache delete.** There is no server chat-delete API here. `apps/web` can
  render a tombstone that another client created, and cannot create one.
- **A kick writes the join row itself.** `leaveChannel({ channelId, userId })` removes someone
  else, and nothing server-side pushes a join update for the target, so the hook marks their row
  `joined: 0, reason: 'kicked'` in the same local join cache the member list observes. Without it
  the removed member keeps rendering.

`useCreateChannel` and `useCreateInviteBatch` are thin wrappers over the two below them
(`createChannel`, and `requestInvite` plus the SMS/clipboard hand-off).

## Usage

```tsx
const { channel, isLoading, isError } = useChannel(channelId, { seed });
const { joins, myJoin, activeMemberIds, cursorByUser } = useChannelJoins(channelId);
const { members } = useChannelMembers({ channelId, memberIds: channel?.memberIds, joins });
const { profileMap } = useChannelProfiles(channel?.sid ?? null, activeMemberIds);
const { messages, rawChats, hasMore, loadMore } = useChats({
    channelId,
    limit: 100,
    joinedNo: myJoin?.joinedNo,
});
```

The order matters: `useChannelJoins` feeds three of the calls below it, and `useChannelProfiles`
needs the `sid` off the channel row.

### Adding a hook

1. Put it in `hooks/`, one hook per file, and export it from `hooks/index.ts`.
2. Read through `runtime.data.useRuntimeRepositories()`. Never import a data source or a gateway.
3. If it observes a cache another hook on the same screen already observes, take that list as a
   parameter instead — see `useChannelMembers({ joins })`.
4. If it fetches, gate it on `isVerified` and keep that gate in the dependency array.
5. If it registers a sync target, return the disposer from the effect. Registration is synchronous
   so an early cleanup cannot race it.
6. Co-locate `*.test.ts`.

### What not to do

- **Do not fetch on mount to fill a screen.** The sync layer primes a cold room
  (`usePrimeChat`) and `useForegroundChatRefresh` covers a warm one. The two conditions are
  mirrored on purpose — cold fetches there, warm fetches here, every entry fetches exactly once.
  Add a third and every room entry doubles its requests.
- **Do not derive display names in a list row with `useChannelTitle`.** It calls `useMyProfile`,
  which triggers a fetch per call. Lists resolve `myNick` once in the parent and call
  `resolveChannelTitle` directly.
- **Do not read absence out of an empty `profileMap`.** It starts empty and this hook is
  downstream of the channel row, so the first renders legitimately know nothing. `hasSnapshot`
  tells "no profile" from "not read yet".
- **Do not treat the first `null` from `observeItem` as a missing channel.** It answers from the
  local cache alone, so a room the device has never seen answers `null` while the fetch is in
  flight. `useChannel` keeps `isLoading` true until a row arrives or a 10s timeout turns it into
  `isError`; acting on that first `null` used to redirect home, which unmounted the sync that would
  have cached the row, and the room could never be opened again. A `null` _after_ a row has been
  seen is a real removal and resolves immediately.

## Notes for implementers and tests

- `useChannel` accepts a `seed` — the row the navigating screen already had, passed through
  navigation state. It renders the room instantly and disarms the resolve timeout, but it does not
  touch resolution semantics: a cold cache's first `null` is still "fetch in flight".
- Sync targets are scoped to the account that registered them, so `useJoinPositions` and
  `useChannelProfiles` both take the session `userId` as a dependency and re-register on an account
  change.
- Profile polling runs at 20s in a room and 60s on list surfaces
  (`LIST_PROFILE_SYNC_INTERVAL_MS`) — one target per member means the request rate is
  `members / interval` for as long as the screen is open. First paint never waits for a tick: the
  hook one-shots `refreshItem` for members the cache does not hold.
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
