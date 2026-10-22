# The 13 domains

> Status: Live · Last updated: 2026-10-13 · Shared rules in the [repositories README](./README.md) · Canonical code: [repositories/](../../src/repositories/)

The per-domain facade catalogue for `repositories/`. A table for looking up which method reads local
and which hits remote, and what rule differs per domain — **a document you look things up in**, not one
you read through.

The shared rules — contracts, context, cache clear — are in [README.md](./README.md).

Some domains have no `local` and some have no `socket`. Which domain receives what is held as a table in
[repository wiring](./README.md#repository-wiring).

---

### Channel

`observeList` · `observeItem` · `refreshList(query)` · `fetchList(query)` · `syncChannels(since)` ·
`createChannel` · `startDm` · `updateChannel` · `inviteChannel` · `leaveChannel` · `deleteChannel` ·
`getSelfChannel` · `evictLeftChannels` · `dropMemberFromChannels` · `cache*`

- `startDm({ peerId })` — opens or returns the 1:1 with a peer in the session's place (one room per pair per place), and caches it when it names a place. Its place is the one a place-keyed id (`<sid>@<uidA>@<uidB>`) names, else the server's field (`dmPlaceOf`) — never the ambient place, which during a place switch already names the next one. A pair-key room whose answer names none is returned uncached and arrives with the next `syncChannels`.
- **The place rule** (`domain/channelScope.ts`) — every room is listed in its own place: `isInPlaceList(channel, sid)` is `channel.sid === sid`, a subscription cloud's 1:1 included. `isCloudDm` says whether a row is such a 1:1 (a named cloud other than the relay); `placeOfDmId` reads the place out of a place-keyed id, and `dmPlaceOf` is a 1:1's place in the order the cache uses. `cacheRead(id)` is a one-shot read of one cached row, for a caller that needs a room's place without observing it (a push tap).
- `syncChannels(since)` — interprets the result of `channel.sync({ since })`. `since: 0` is a full sync, `since > 0` is a delta. The response's `list` is the snapshot of changed channels, `ids` is every channel id I currently belong to, and `syncedAt` is the value to store as the next `since`. The repository writes `list` to local and **stale-removes** any channel missing from `ids`. A changed channel with no place (`$.sid`) is dropped, with two exceptions. The Self Channel belongs to the account rather than a place, and the relay sends it with an empty `$`; the local store keeps such a row under `ACCOUNT_CHANNEL_SID` (`@account`) until a read names its place. A subscription cloud's 1:1 (`isCloudDm`) is kept too: its place is the one its id names, else its field, else empty — the cache never fills a cloud 1:1's place from the context.
- `refreshList(query)` — the secondary initial-load path, based on `channel.mine`. In a sync-centred structure the canonical source is `syncChannels`.
- `fetchList(query)` — the counterpart to `refreshList`, except it **returns the result without writing to local.** Use it when the server list is needed without touching the cache.
- `leaveChannel` / `deleteChannel` — optimistic local remove (with the leave guard below), restored on failure. A self-leave empties that channel's chat cache too, **after the server responds** → [leaving and rejoining](./README.md#leaving-and-rejoining).
- `evictLeftChannels(channelIds, requestContext)` / `dropMemberFromChannels(channelIds, userId, requestContext)` — the channel side of a place leave, for channels the **server has already** taken someone out of (`place.leave` names them). The first gives each channel what a confirmed self-leave gives it — row removed, leave guard set, messages purged — through the same code `leaveChannel` uses; the second takes `userId` out of each cached roster, the cache side of a kick, and skips a channel with no cached row. Both work in the `requestContext` the place leave was asked in, not the live one. Neither sends anything: the Place domain calls them after `place.leave` answers.
- For a short window right after leaving or deleting (`LEFT_CHANNEL_GUARD_MS`, 10 seconds), a `refreshList`/`syncChannels` response is not written back to the cache even if that channel is in it. It guards against an in-flight response issued just before the leave or delete resurrecting a channel that was just removed. **Being time-bounded is the point** — held forever, a rejoined channel could never return to the list for the rest of the session.
- The same race runs the other way after `createChannel` and `startDm`: a response issued just before the room existed does not list it, and its stale-remove would delete the row the create had just written — the room then stays off the list until a reload. For the same window (`NEW_CHANNEL_GUARD_MS`) the new id is skipped by both stale-removes. It only stops the stale-remove — writes of that room go through as usual — and a room the user opens again after leaving it also drops its leave guard. It never keeps a room alive: one the server really removed in that window goes with the first sync after it.
- **It does not fetch chat messages.** Channel sync refreshes the channel list only. The actual messages are fetched separately by the chat screen through `ChatRepository.refreshList` (= `chat.feed`).
- The server ships a `lastChat$` on each channel, but **the mapper does not read it.** The last message and its timestamp belong to the chat cache (ADR-0057, `domain/mappers.ts`). It is not used as a preview seed either.

### Chat

`observeList` · `observeLastList` · `refreshList(query, options?)` · `uncoveredFeed(channelId, low, high)` · `getChat` · `sendChat` · `updateChat` ·
`deleteChat` · `setReaction` · `cache*` · `cacheClearByChannelId(channelId)` · `startUploads` ·
`completeUploads` · `createPendingImageChat` · `sendPendingImageChat` · `failPendingImageChat` ·
`listPendingImageChats(channelId)`

- `sendChat` — creates an optimistic pending message, marked `isFailed` on failure. It takes a `ChatSendPayload`: the socket SDK's send input plus the `mention` the composer picked, which the chats service keeps as the message's `mention$`. The pending row carries that mention in the record's shape, so a resend rebuilt from a failed row calls the same people; an image message's pending row keeps it the same way and sends it with the text.
- `startUploads` / `completeUploads` — `upload.start` / `upload.complete` passed straight through, checked against the upload contract and never cached (a ticket holds signed URLs). They sit on the chat facade because an upload exists only to become a message's attachment.
- `createPendingImageChat` · `sendPendingImageChat` · `failPendingImageChat` · `listPendingImageChats` — the pending row of an image message, written **before** any byte moves, with local-only `PendingUploadSlot`s and the message's text when it has one; the send posts that text with the upload ids, swaps the server row in the way `sendChat` does, then reads it back once with `chat.get`, because the send's answer carries no image address. The sequence that drives them, and why the rows outlive a reload → [uploads](../uploads/README.md#pending-image-rows).
- `updateChat` — optimistic: the new body is written to the cache before the request and rolled back if it fails. Callers must not write the cache themselves; two writers race over one row.
- `deleteChat` — **not optimistic.** The server soft-deletes (`PUT { hidden: true }`), and the row is hidden only once that answer arrives. It used to hide first and restore on failure, but the restore could not work: `cacheWrite` merges, so writing the previous record back cannot clear a key that record never had — and `hidden` was a key the optimistic write added. A failed delete left the message looking deleted while it was alive on the server. There is no rollback now because there is no optimistic write to undo (ADR-0103).
- `refreshList` — merges the `chat.feed` response into local. It can return cursor metadata (`cursorNo`, `readNo`, …) as a `ChatRefreshResult`, but **the render source for messages is always the local stream.** The returned metadata is input for pagination only. An optional `onFetched` callback runs once the server page arrives, before the cache write, so a caller timing the refresh can tell the two apart. Every page also records the chat-number range it answered for; `markMissingHidden` marks a cached row inside that range the page left out as deleted (`hidden` + `hiddenByFeed`, reversible), and `cursorIsRow` tells it the request cursor is a numbered row → [What a feed page proves](./README.md#what-a-feed-page-proves).
- `uncoveredFeed` — the parts of a chat-number range no page has answered for in this run, which is how a screen tells unfetched history from deleted messages. Memory only; forgotten by the chat cache clears.
- The list query key is built from **every field that reaches storage** — seven parts: `chats`, `channel`, `cursor`, `limit`, `unsent`, `sort`, `keyword` (`local/data-sources/ChatLocalDataSource.ts`). Drop even one and two different reads collapse onto one key and share a wrong answer. That is why an earlier page and the latest page are different queries.
- `setReaction` is a UI write command (`chat.reaction`). `observeLastList` is the per-channel last-message path the home preview uses (ADR-0057).
- `isMentioningViewer(chat, viewerIds)` / `toMentionRecord` / `toMentionBody` (`src/domain/mention.ts`) — whether a message calls its reader, read from `mention$` alone (everyone, or one of the reader's ids: the account uid and the room-cloud uid the member list holds), and the conversion between the send's `mention` and the stored record (`all` is `true` from a read, `1` from `chat.sync`, and always sent as `true`). It lives here so both clients ask one rule; `apps/desktop-web` still judges by text.
- `canModifyMessage(chat, isMine)` / `isMessageEdited(chat)` (`src/domain/messageEdit.ts`) — whether a message may be edited or deleted, and whether it has been. They live here, not in an app, because both clients ask them and one of the answers is a stopgap: the server has no edit flag, so `isMessageEdited` infers an edit from `updatedAt` moving past `createdAt`. **`apps/desktop-web` still carries its own copy of both rules** — this one is canonical, and the copies are merged the day a real server flag arrives (ADR-0103).
- On the split of cursor responsibilities → [chat cursors](./README.md#chat-cursors).
- `cacheClearByChannelId(channelId)` — empties one channel's messages. There are only two callers: `ChannelRepository` (a self-leave) and the join sync plan (being kicked, leaving from another device) → [leaving and rejoining](./README.md#leaving-and-rejoining).

### Cloud

`observeList` · `observeItem` · `getCloud` · `updateCloud` · `fetchCloudCatalog` ·
`verifyCloudEmail` · `makeCloud` · `releaseCloud` · `cache*`

- The socket axis is based on `CloudGateway`'s `get` / `update`. **Neither `cloud.create` nor `cloud.delete` is in the socket bundle** — a cloud is made and removed over HTTP (`makeCloud` / `releaseCloud`).
- `getCloud` and `updateCloud` go to the **relay** whichever cloud is active. The name lives on the catalog row the relay's backend owns; a cloud server keeps its own copy of the row, and nothing syncs the two, so reading or writing there would split the name. A rename therefore never needs the renamed cloud's own session, and an invited member reads the name its owner set.
- A get or update result writes only its `name` into the cache, and the row keeps its own `cid`. The relay's view carries the owner's head and email, which would overwrite the inviter an invited row keeps; and the mapper fills `cid` from the request context — the active cloud — which is a different cloud whenever another one is read or renamed from there.
- The HTTP axis handles the catalogue (`list`) plus `make` / `release` / `verifyEmail`. **HTTP results are not written to local** — the catalogue's cache owner is a react-query adapter.
- Cloud is the top-level organizational unit (`cid`); unlike place/site it acts as the scope root.

### Join

`observeList` · `readChat` · `updateJoin` · `sendRead` · `sendJoinUpdate` · `writeMyJoinLocally` · `cache*`

- **My join's writes are state writes** ([outbox](../outbox/README.md)). `readChat` and `updateJoin` write locally at once, hand the write to the outbox and return a `WriteReceipt` once the local write is done; `receipt.delivered` settles when the server has it. Neither calls the socket. On the wire, a read is `chat.read` and a nick or notification change is `join.update` through the first-class `JoinGateway`.
- `readChat` — moves my read cursor. A failure is **never** rolled back: the user has seen the messages whether or not the server heard yet, and restoring the old cursor put the unread badge back on a room just read. The unread count is not settled by the single `chat.read` result; it is settled as the join snapshot and the channel snapshot meet again.
- `updateJoin` — sets my nick and/or notification setting, each its own outbox key so the two cannot overwrite each other. Only my own row: a `userId` that is not mine throws, and a row that is not cached throws as before. A refusal puts back the last accepted value.
- `sendRead` · `sendJoinUpdate` · `writeMyJoinLocally` — the outbox's delivery and restore hooks: the socket half alone, and a local-only write. Screens do not call them.
- **A cached read cursor never moves backwards.** `JoinLocalDataSource` keeps the stored cursor (`readNo`/`chatNo`, with the `metaNo` taken at it — the two only mean something as a pair) when a write carries an older one, and still takes every other field from that write. Answers arrive out of order: a join sync that left before a read was marked lands after it, and its older cursor would bring the badge back.
- Read-state sync is handled by the external orchestrator: the join sync plan fetches `join.get` itself and pushes the result in through `cacheWrite` / `cacheDelete`, and `JoinRepository` owns the local cache of that result.

### Place

`observeList` · `observeItem` · `refreshList(query?)` · `createPlace` · `updatePlace` · `deletePlace` · `leavePlace` ·
`removeMember` · `isPlaceDeleted` · `cache*`

- Based on `PlaceGateway` (`place.create/update/delete/leave`) plus `UserGateway.mySite` for listing.
- `deletePlace(id)` — asks the server first and removes the local row only after it agrees. It is not optimistic like `deleteChannel`: the app moves the session out of a place whose row has gone, and a refusal that restored the row would not move it back.
- `leavePlace(id)` / `removeMember(id, userId)` — both are `place.leave`; the second names the member the place owner is removing. Neither is optimistic, for the same reason as the delete, and a refusal (`403` for an owner leaving, or a non-owner removing) throws with the cache untouched. After the answer:
    - `leavePlace` clears the channels the answer's `leftChannelIds` names through the Channel domain's `evictLeftChannels`, then drops the place row — even the last one, since an empty list snapshot leaves the cache alone and nothing else would remove it. The channels are the server's list, never "the cached channels of this place": the server's record of what it took me out of is the one that counts.
    - `removeMember` takes the member out of those channels' cached rosters (`dropMemberFromChannels`) and leaves the place row alone.
    - `failedChannelIds` are channels the server already counted the person out of. They are logged and the call still succeeds.
    - The clean-up runs in the scope the request was made in, so a cloud switch while it ran cannot aim it at another cloud. Which place the session moves to afterwards is the app's call, not this repository's.
- **A deleted place is a stamped row, not a missing one.** The server's delete is soft: it sets `deletedAt` and goes on listing the place, to its owner and its members alike, and it tells nobody. `refreshList` therefore leaves any row with `deletedAt` set out of what it writes and prunes its cached row (`isDeletedPlace`), and an answer whose every row is deleted still prunes — it is a real answer, not the empty one a switch can produce. `isPlaceDeleted(id)` asks `place.get` about one place: 404 or a stamped row is deleted; a row without the stamp — a place I left or was removed from — is not; any other failure rejects.
- A Place is the workspace unit a user belongs to or created. Rather than a periodic delta sync, it re-reads the current cloud's place list with `refreshList` on a scope (cid) switch.
- Local-first: remote results are written to `PlaceLocalDataSource` and then read through `observe*`.

### Profile

`observeList` · `observeItem` · `refreshItem(id)` · `getMyProfile()` · `setMyProfile` ·
`syncProfiles(since)` · `syncProfilesOf(userIds, siteId)` · `cache*`

- The per-site user profile domain, **fully separated from the User domain**. It depends only on the dedicated `ProfileGateway` (`get`/`getMine`/`set`/`sync`).
- `refreshItem(id)` — writes the result of `profile.get` (id = `${sid}:${uid}`) to local.
- `getMyProfile()` — writes the result of `profile.get-mine` (the current session) to local.
- `setMyProfile(body, siteId)` — optimistic write with rollback on failure (a row that did not exist before is deleted, not left behind). The server stores the profile on the site **its session is on** and ignores the payload's `siteId`, so `siteId` cannot steer the write; it is checked against the response instead. When the response names another site the write already happened there: that row is cached as the server now holds it, the optimistic row is rolled back, and the call rejects. `profile.set` is also **update-only**: on a site where I have no row yet (one I just created or just entered) it answers 404, so the repository sends `profile.get-mine` — a get-or-create that makes the row — and retries the write once. It does not retry when `get-mine` answers for another site: the retry would create and fill a row there.
- `syncProfiles(since)` — upserts/removes the `profile.sync` delta into the local cache. A `null` for a given uid in the response deletes that profile.
- `syncProfilesOf(userIds, siteId)` — the same `profile.sync` with `userIds` and no `since`: the current profiles of exactly those people, stored through the same save path (upsert, `null` deletes). Two rules come with it. **It returns no `syncedAt`**: the place-wide cursor belongs to the background delta sync, which follows only my rooms' members, and storing a by-id answer's cursor there would make that sync skip their changes. **`siteId` must be the session's place**: the server answers for the session's place and the rows are filed under the place named, so asking from elsewhere files one place's profiles under another. An empty id list sends nothing — without `userIds` the server would answer for my rooms' members instead.
- Cache keys take the form `${sid}:${uid}`.

### User

`observeList` · `observeItem` · `getMyProfile` · `updateProfile` · `requestInvite` ·
`requestInviteBatch` · `syncChannelUsers` · `listPlaceMembers` · `listRelayUsers` · `tryFetchProfile` · `cache*`

- `listPlaceMembers({ placeId, sessionPlaceId, pageSize? })` — `place.list-user`, every member of one place (its role holders plus its owner, including people with no room and invitees who have not accepted). It lives here, not under Place, because what it answers is users — the same reason `channel.list-user` is here. Pages are read from 0 until an **empty page** or the answer's `total`; a short page is not the end, because the server drops members who left after cutting the page and `total` is counted before that. A page that adds nobody new also stops it, so a server ignoring `page` cannot spin it.
    - After each page it starts the Profile domain's `syncProfilesOf` with that page's ids — never more ids than one page holds, since list and profiles share the socket's answer size limit — **only when `sessionPlaceId` equals `placeId`**; the caller passes `null` while a switch is in flight. The loads run alongside the paging and are awaited together at the end, so the wait is set by the list's own round trips. Before each one the repository checks it is still on the cloud the list was asked in: a profile answer is filed under the cloud current when it is sent, so a switch between pages stops the remaining loads. A failed or stopped load leaves the members in the result (`profiles: 'failed'`).
    - The list is **not cached**: it is a per-open read, so it is returned, with the `{ cid, sid }` it was asked for, for the caller to drop if its scope has moved. That makes it an exception to "reads come from a local stream", like `listRelayUsers`; the profiles it loads do go through the cache. Each member is a `DomainPlaceMember` — id, the user's own `name`/`nick`, the picture moved from the server's `photo` to `thumbnail`, and `isOwner`, which is per place and so never written to the cloud-wide user cache. Nothing else the answer carries is kept.
    - It rejects without asking while the socket is still bound to another cloud (`isForeignContext`).

- `syncChannelUsers` — writes the result of `channel.sync-users` to local.
- `updateProfile` (`user.update`) edits the user's own **account** profile, which is separate from the site profile (→ the Profile domain).
- The HTTP axis (`listRelayUsers`, `tryFetchProfile`) is the relay console and profile probe path.
- It reads the `join` and `place` local sources too, in order to assemble invite candidates.
- `refreshList` is **not on the interface** — it exists only as a public class method. Channel, Chat and Place declare it on their interfaces (Join has none), so User is the one exception.

### Invite

`list` · `create` · `get` · `accept` · `cancel` · `reject` · `dismiss` · `undismiss` ·
`observeList` · `cacheReadList` · `cache*`

- The 1:1 DM invite-code domain. The composition root **pins** the gateway to the relay slot — it must not follow the active cloud (ADR-0089).
- Reading one's own list is local-first (ADR-0052 introduced the `invite` cache slot), but the remaining commands (`create`/`accept`/`cancel`/`reject`/`get`) have no cache slot.
- `dismiss` / `undismiss` are local display state, not server state.

### Auth

`sendPhoneCode` · `verifyPhoneCode` · `confirmPhoneCode` · `verifySocialAccount` ·
`confirmSocialAccount` · `registerUser` · `registerUserV2` · `findAlias` · `verifyAlias` ·
`loginWithInviteCode` · `fetchInviteInfo` · `registerDevice` · `login` · `verifyNativeToken` ·
`exchangeCode` · `verifyOAuthCode` · `delegateCloud` · `exchangeToken`

- **Remote-only.** A surface of session identity commands with nothing to cache.
- On the socket axis every phone/social proof goes out as the single `auth.linkAccount` packet — assembling `type`/`mode`/`step` is `AuthSocketDataSource`'s monopoly.
- The HTTP axis carries signup, aliases and invite login plus the session-material actions (`login`, `exchangeCode`, `verifyOAuthCode`, `delegateCloud`, `exchangeToken`). What is missing is the two refresh calls, and they cannot be added because the wire vocabulary itself no longer has them → [http.md's gateway Pick](../remote/http.md#gateway-pick).

### Device

`syncDevice` · `syncStatus` · `updateRemotePushMute`

- **Remote-only.** Lookup signals and push settings, so there is nothing to cache.
- Only the socket gateway is routed — `save`/`read`/`sync` go to the `active` slot, while `updateRemote`, the relay-owned push setting, goes to relay (ADR-0027).
- Push-token registration is **not** here: `libs/app-runtime` registers through the HTTP user gateway directly (`data/hooks/device.ts`), and `useDeviceTokenRegistration` owns the once-per-install gate (ADR-0077).

### Report

`submitIssue` · `uploadLogBatch`

- **Remote-only and HTTP-only.** It does not even have a socket data source.
- Diagnostics are not domain data, but they are a data call, so they pass through this layer (ADR-0036). Errors are thrown as they are, unwrapped — the status code is the input to classification upstream → [http.md's report lane](../remote/http.md#the-report-lane).

### Subscription

`fetchPlans` · `fetchMembershipInfo` · `validateMembership` · `fetchAdminMemberships` ·
`updateMembershipByAdmin` · `fetchAdminClouds`

- **Remote-only and HTTP-only.** The same shape as `Report`.
- Tiers and quotas are decided by the server (ADR-0060). The cache semantics belong to a react-query adapter on the consumer side.
- The last three are the admin console surface (ADR-0101). Being remote-only is the point for them: these reads are other users' records and must never reach a local cache. `fetchAdminClouds` rides this repository rather than `Cloud` on purpose → [http.md's admin console surface](../remote/http.md#the-admin-console-surface).

### SyncMeta

`getSyncedAt(kind)` · `setSyncedAt(kind, syncedAt)` · `cacheClear()`

- **A local-only repository with no remote data source.** It stores and reads sync cursors (for instance `channel.sync`'s `since`) under the `cid`/`uid` scope.
- **The scope is its graph's, named on every call.** The local data sources are shared by the app graph and every scoped graph, and on their own they fall back to the selected cloud. A cursor written through cloud A's scoped graph while cloud B is on screen therefore has to carry A's `cid`/`uid` down, or it lands in B's partition — and the next time A is entered, the app graph reads A's partition, finds no cursor, and pulls the whole list again.
- In other words, this repository is the answer to "where does the next `since` get stored".
- A cursor points at another domain's data, so when that data moves storage the cursor starts lying that it has "already synced". `routingFingerprint` catches that mismatch (ADR-0053).
- The same lie follows from clearing that data while the cursor stays. `cacheClear()` exists for the caller that clears a partition's data, and it runs **after** the data, so a sync landing mid-clear cannot leave a fresh cursor over an empty store. A sync that answers after the cursor clear still can, which is what the data source's `cursorsValidAfter` is for: a cursor saved before that instant reads as 0 (reason `cache-cleared`). The assembler supplies it — `libs/app-runtime` moves it to the first boot after a cache clear.

---
