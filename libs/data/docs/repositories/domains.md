# The 13 domains

> Status: Live · Last updated: 2026-09-14 · Shared rules in the [repositories README](./README.md) · Canonical code: [repositories/](../../src/repositories/)

The per-domain facade catalogue for `repositories/`. A table for looking up which method reads local
and which hits remote, and what rule differs per domain — **a document you look things up in**, not one
you read through.

The shared rules — contracts, context, cache clear — are in [README.md](./README.md).

Some domains have no `local` and some have no `socket`. Which domain receives what is held as a table in
[repository wiring](./README.md#repository-wiring).

---

### Channel

`observeList` · `observeItem` · `refreshList(query)` · `fetchList(query)` · `syncChannels(since)` ·
`createChannel` · `updateChannel` · `inviteChannel` · `leaveChannel` · `deleteChannel` ·
`getSelfChannel` · `getUnreads` · `cache*`

- `syncChannels(since)` — interprets the result of `channel.sync({ since })`. `since: 0` is a full sync, `since > 0` is a delta. The response's `list` is the snapshot of changed channels, `ids` is every channel id I currently belong to, and `syncedAt` is the value to store as the next `since`. The repository writes `list` to local and **stale-removes** any channel missing from `ids`.
- `refreshList(query)` — the secondary initial-load path, based on `channel.mine`. In a sync-centred structure the canonical source is `syncChannels`.
- `fetchList(query)` — the counterpart to `refreshList`, except it **returns the result without writing to local.** Use it when the server list is needed without touching the cache.
- `leaveChannel` / `deleteChannel` — optimistic local remove, restored on failure. A self-leave empties that channel's chat cache too, **after the server responds** → [leaving and rejoining](./README.md#leaving-and-rejoining).
- For a short window right after leaving (`LEFT_CHANNEL_GUARD_MS`, 10 seconds), a `refreshList`/`syncChannels` response is not written back to the cache even if that channel is in it. It guards against an in-flight response issued just before the leave resurrecting a channel that was just removed. **Being time-bounded is the point** — held forever, a rejoined channel could never return to the list for the rest of the session.
- **It does not fetch chat messages.** Channel sync refreshes the channel list only. The actual messages are fetched separately by the chat screen through `ChatRepository.refreshList` (= `chat.feed`).
- The server ships a `lastChat$` on each channel, but **the mapper does not read it.** The last message and its timestamp belong to the chat cache (ADR-0057, `domain/mappers.ts`). It is not used as a preview seed either.

### Chat

`observeList` · `observeItem` · `observeLastList` · `refreshList(query)` · `getChat` · `sendChat` ·
`updateChat` · `deleteChat` · `setReaction` · `cache*` · `cacheReadLastList` ·
`cacheClearByChannelId(channelId)`

- `sendChat` — creates an optimistic pending message, marked `isFailed` on failure.
- `refreshList` — merges the `chat.feed` response into local. It can return cursor metadata (`cursorNo`, `readNo`, …) as a `ChatRefreshResult`, but **the render source for messages is always the local stream.** The returned metadata is input for pagination only.
- The list query key is built from **every field that reaches storage** — seven parts: `chats`, `channel`, `cursor`, `limit`, `unsent`, `sort`, `keyword` (`local/data-sources/ChatLocalDataSource.ts`). Drop even one and two different reads collapse onto one key and share a wrong answer. That is why an earlier page and the latest page are different queries.
- `setReaction` is a UI write command (`chat.reaction`). `observeLastList` / `cacheReadLastList` are the per-channel last-message path the home preview uses (ADR-0057).
- On the split of cursor responsibilities → [chat cursors](./README.md#chat-cursors).
- `cacheClearByChannelId(channelId)` — empties one channel's messages. There are only two callers: `ChannelRepository` (a self-leave) and the join sync plan (being kicked, leaving from another device) → [leaving and rejoining](./README.md#leaving-and-rejoining).

### Cloud

`observeList` · `observeItem` · `getCloud` · `updateCloud` · `deleteCloud` ·
`fetchCloudCatalog` · `verifyCloudEmail` · `makeCloud` · `releaseCloud` · `cache*`

- The socket axis is based on `CloudGateway`'s `get` / `update` / `delete`. **`cloud.create` is not in the socket bundle.**
- The HTTP axis handles the catalogue (`list`) plus `make` / `release` / `verifyEmail`. **HTTP results are not written to local** — the catalogue's cache owner is a react-query adapter.
- Cloud is the top-level organizational unit (`cid`); unlike place/site it acts as the scope root.

### Join

`observeList` · `observeItem` · `refreshList(query)` · `getJoin` · `readChat` · `updateJoin` ·
`joinChannel` · `cache*`

- Single-item read and write go through the first-class `JoinGateway` (`getJoin` = `join.get`, `updateJoin` = `join.update`); marking read (`readChat` = `chat.read`) and joining (`joinChannel` = `channel.join`) are helper commands.
- `readChat` — advances the read cursor optimistically, restored if remote fails. The unread count is not settled by the single `chat.read` result; it is settled as the join snapshot and the channel snapshot meet again.
- `updateJoin` — edits the nick / notify / role metadata.
- Read-state sync is handled by the external orchestrator pushing `getJoin` results in through `cacheWrite` / `cacheDelete`, and `JoinRepository` owns the local cache of that result.

### Place

`observeList` · `observeItem` · `refreshList(query?)` · `createPlace` · `getPlace` ·
`updatePlace` · `deletePlace` · `cache*`

- Based on `PlaceGateway` (`place.create/get/update/delete`) plus `UserGateway.mySite` for listing.
- A Place is the workspace unit a user belongs to or created. Rather than a periodic delta sync, it re-reads the current cloud's place list with `refreshList` on a scope (cid) switch.
- Local-first: remote results are written to `PlaceLocalDataSource` and then read through `observe*`.

### Profile

`observeList` · `observeItem` · `refreshItem(id)` · `getMyProfile()` · `setProfile` ·
`setMyProfile` · `syncProfiles(since)` · `cache*`

- The per-site user profile domain, **fully separated from the User domain**. It depends only on the dedicated `ProfileGateway` (`get`/`getMine`/`set`/`sync`).
- `refreshItem(id)` — writes the result of `profile.get` (id = `${sid}:${uid}`) to local.
- `getMyProfile()` — writes the result of `profile.get-mine` (the current session) to local.
- `setProfile` / `setMyProfile` — optimistic write with rollback on failure.
- `syncProfiles(since)` — upserts/removes the `profile.sync` delta into the local cache. A `null` for a given uid in the response deletes that profile.
- Cache keys take the form `${sid}:${uid}`.

### User

`observeList` · `observeItem` · `getMyProfile` · `updateProfile` · `requestInvite` ·
`requestInviteBatch` · `syncChannelUsers` · `listRelayUsers` · `tryFetchProfile` ·
`updateProfileHttp` · `cache*`

- `syncChannelUsers` — writes the result of `channel.sync-users` to local.
- `updateProfile` (`user.update`) edits the user's own **account** profile, which is separate from the site profile (→ the Profile domain).
- The HTTP axis (`listRelayUsers`, `tryFetchProfile`, `updateProfileHttp`) is the relay console and profile probe path.
- It reads the `join` and `place` local sources too, in order to assemble invite candidates.
- `refreshList` is **not on the interface** — it exists only as a public class method. Channel, Join and Place declare it on their interfaces, so User is the one exception.

### Invite

`list` · `create` · `get` · `accept` · `cancel` · `reject` · `dismiss` · `undismiss` ·
`observeList` · `cacheReadList` · `cache*`

- The 1:1 DM invite-code domain. The composition root **pins** the gateway to the relay slot — it must not follow the active cloud (ADR-0033).
- Reading one's own list is local-first (ADR-0052 introduced the `invite` cache slot), but the remaining commands (`create`/`accept`/`cancel`/`reject`/`get`) have no cache slot.
- `dismiss` / `undismiss` are local display state, not server state.

### Auth

`sendPhoneCode` · `verifyPhoneCode` · `confirmPhoneCode` · `verifySocialAccount` ·
`confirmSocialAccount` · `registerUser` · `registerUserV2` · `findAlias` · `verifyAlias` ·
`loginWithInviteCode` · `fetchInviteInfo` · `registerDevice` · `login` · `verifyNativeToken` ·
`exchangeCode` · `delegateCloud` · `exchangeToken`

- **Remote-only.** A surface of session identity commands with nothing to cache.
- On the socket axis every phone/social proof goes out as the single `auth.linkAccount` packet — assembling `type`/`mode`/`step` is `AuthSocketDataSource`'s monopoly.
- The HTTP axis carries signup, aliases and invite login plus the session-material actions (`login`, `exchangeCode`, `delegateCloud`, `exchangeToken`). What is missing is the two refresh calls, and they cannot be added because the wire vocabulary itself no longer has them → [http.md's gateway Pick](../remote/http.md#gateway-pick).

### Device

`syncDevice` · `syncStatus` · `updateRemotePushMute` · `registerPushDevice`

- **Remote-only.** Lookup signals and push settings, so there is nothing to cache.
- Only the socket gateway is routed — `save`/`read`/`sync` go to the `active` slot, while `updateRemote`, the relay-owned push setting, goes to relay (ADR-0027).
- `registerPushDevice` is on the HTTP axis and is injected with `IDeviceRegistrationHttpSource` (a single method) only. **This repository imposes no limit of its own** — it passes `body` and `opts?.force` straight through. The once-per-install gate lives in `useDeviceTokenRegistration` in `libs/app-runtime` (ADR-0077).

### Report

`submitIssue` · `uploadLogBatch`

- **Remote-only and HTTP-only.** It does not even have a socket data source.
- Diagnostics are not domain data, but they are a data call, so they pass through this layer (ADR-0036). Errors are thrown as they are, unwrapped — the status code is the input to classification upstream → [http.md's report lane](../remote/http.md#the-report-lane).

### Subscription

`fetchPlans` · `validateGoogle` · `validateApple` · `fetchActiveSubscriptions` ·
`fetchReceiptDetail` · `fetchMembershipInfo` · `validateMembership` ·
`fetchAdminMemberships` · `updateMembershipByAdmin` · `fetchAdminClouds`

- **Remote-only and HTTP-only.** The same shape as `Report`.
- Tiers and quotas are decided by the server (ADR-0060). The cache semantics belong to a react-query adapter on the consumer side.
- The last three are the admin console surface (ADR-0082). Being remote-only is the point for them: these reads are other users' records and must never reach a local cache. `fetchAdminClouds` rides this repository rather than `Cloud` on purpose → [http.md's admin console surface](../remote/http.md#the-admin-console-surface).

### SyncMeta

`getSyncedAt(kind)` · `setSyncedAt(kind, syncedAt)`

- **A local-only repository with no remote data source.** It stores and reads sync cursors (for instance `channel.sync`'s `since`) under the `cid`/`uid` scope.
- In other words, this repository is the answer to "where does the next `since` get stored".
- A cursor points at another domain's data, so when that data moves storage the cursor starts lying that it has "already synced". `routingFingerprint` catches that mismatch (ADR-0053).

---
