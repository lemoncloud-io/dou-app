# data flow — observe, write, and who triggers a refresh

`apps/web` reads through `observe*`, writes through a repository method, and never calls a socket or
an HTTP endpoint directly. The mechanics of observing and writing belong to
[`@chatic/data`](../../../../libs/data/README.md); this document covers the half that is the app's
own: how the runtime boots, and the triggers that decide _when_ a screen's data is refreshed.

## 1. Bootstrap — `RuntimeConnectionHost`

`app/runtime/AppRuntime.tsx` wraps the whole app in `runtime.connection.RuntimeConnectionHost`. The
host owns session-init gating, relay keep-alive, and mounting `SocketBinder` /
`SocketReauthBinder` — the app never mounts init, keep-alive or token-refresh by hand.

```tsx
export const AppRuntime = () => (
    <runtime.connection.RuntimeConnectionHost>
        <ActiveCloudDataProvider>
            {/* background runners, then */}
            <Router />
        </ActiveCloudDataProvider>
    </runtime.connection.RuntimeConnectionHost>
);
```

Re-authentication is automatic and the app never sends `auth.update` itself: expired-credential
refresh and reconnect re-auth are the SDK's `ClientSocketAuth`, and an identity change on a live
socket (guest → social promotion) is `SocketReauthBinder`.

Further reading: [libs/app-runtime/docs/session/](../../../../libs/app-runtime/docs/session/README.md),
[libs/app-runtime/docs/socket/](../../../../libs/app-runtime/docs/socket/README.md).

## 2. Reading connection and session state

Both socket state and session/selection state come from one library, `@chatic/app-runtime`:

| Value                                | Source                                                  |
| ------------------------------------ | ------------------------------------------------------- |
| `isVerified`, `isConnected`, `state` | `runtime.connection.useRuntimeSocketState()`            |
| `selectedSiteId` (place)             | `runtime.session.useSessionSelection().selectedSiteId`  |
| `selectedCloudId`                    | `runtime.session.useSessionSelection().selectedCloudId` |
| connection mode (`relay` / `cloud`)  | `runtime.session.useGlobalSession().activeServer.kind`  |

`isVerified` means "`auth.update` has been acknowledged for this connection." A call that goes
through the socket gateway should wait for it, or it runs against the outgoing session.

## 3. Reading data — observe

A screen subscribes to `repos.<domain>.observeList(query, cb)` / `observeItem(id, cb)`. The callback
re-fires whenever the cache changes, from either a local refresh or a sync push.

**Scope pinning.** Re-emit routing keys on `{cid, uid}` (the same partition as cache storage; place
and channel exclude `sid` from the key). `ActiveScope` derives this on every read from the session
store (`libs/app-runtime/src/session/scope/ActiveScope.ts`) — there is no ancestor binder pushing it
into a context on a delay, so there is no window where a descendant subscribes under a stale scope.
The home list hooks (`useHomePlaces`, and its siblings for channels) still pass an explicit
`{ cid, uid }` override to `observeList` rather than relying on the ambient provider, because
`ActiveScope.getContext()` also folds in the socket's bound cid (`socketCid`) — an extra field these
observers deliberately keep out of their key. See `PlaceLocalDataSource.test.ts` for the re-emit
routing this pins down.

**An empty cache is not an empty answer.** `observeList` answers from local storage, so for a cloud
this device has never opened it fires immediately with `[]` — before the first fetch behind it has
even been sent. "The cache emitted" is therefore not the same signal as "the server answered", and a
screen that reads it as one asserts "this cloud has no places / no rooms" over a cloud whose data is
still on its way. That is what a cold cloud switch used to look like: an empty home, instantly.

So an empty list keeps reading as _loading_ until something explains it. Three things can, and which
ones apply differs per list:

| Surface                        | What ends the wait                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| `useHomePlaces`                | rows, or the window — `PlaceRepository` discards an empty snapshot, so no answer says "none"  |
| `useAccessiblePlaceIds`        | the same two; until then it answers `null`, so no channel is filtered off a list or the badge |
| `useActiveCloudChannelsSource` | rows, the first delta answering, or the window — an empty PLACE is common, so it gets a mark  |

The window is `app/hooks/useColdListWindow.ts` — a 15s bound, restarted whenever `{cid, uid}` moves,
that exists so the wait always ends. Nothing marks a list as answered before the socket verifies, so
without it a device that never reaches the server would hold a skeleton forever; a wrong-but-terminal
screen beats one that never resolves. It is a backstop, not the normal path — rows land in well under
a second on a warm cloud, and re-entering a cloud visited before is unchanged.

The mark is `app/stores/useChannelSyncMarkStore.ts`, written by `useBackgroundSync` (§5) — the only
owner of list discovery, and so the only place that knows a delta was asked for. A failed delta marks
too: it says something about reachability, not about the cloud, and waiting for success would hold a
skeleton up through every outage.

**Only channels get a mark, and the asymmetry is the data layer's.** `ChannelRepository.syncChannels`
returning means the server answered, so a place with genuinely no rooms — every place, at the start —
can say so within a round trip. `PlaceRepository.refreshList` carries no such meaning: it discards an
empty snapshot without writing it, because a session that is not ready yet answers empty right after a
switch and pruning against that would wipe the real rows. A completed refresh therefore cannot
testify that a cloud has no places, and marking on it would put the original bug back — this time
with the gate's own blessing. A cloud with zero places waits out the window instead, which is the
degenerate case, not the common one.

**Sync registration.** A mounted screen also registers a sync target so polling, push, and
reconnect catch-up run for as long as it is on screen:

- Fixed single id: `runtime.sync.useChatSync(channelId)`, `useChannelSync(channelId)`,
  `usePlaceSync(placeId)`.
- Dynamic list: `runtime.sync.getSyncManager().registerChannel(id)` / `registerPlace(id)` /
  `registerProfile(id)` / `registerJoin(id)`, called per id and disposed on cleanup —
  `useMyJoins.ts` (`useJoinSyncRegistration`) is the app's example. `useChannelProfiles.ts` is the
  deferred variant, which registers only after a read — see [data-layer.md](../feature/channels/data-layer.md).
  Pass the cloud as the third argument (`registerJoin(id, undefined, { cid })`) whenever the caller
  knows it, and build any `<id>@<uid>` from `runtime.session.useUidInCloud(cid)`: without a cloud
  the target lands on whichever cloud is selected when the effect runs, and the session uid is only
  the committed cloud's. Gate the effect on that cloud's own slot,
  `runtime.connection.useCloudVerified(cid)`; `app/hooks/useCloudScope.ts` holds the normalised
  selection these hooks share.

```tsx
useEffect(() => {
    if (siteIds.length === 0) return;
    const sync = runtime.sync.getSyncManager();
    const disposers = siteIds.map(id => sync.registerPlace(id, undefined, { cid }));
    return () => disposers.forEach(d => d());
}, [siteIdsKey, cid]);
```

A chat room's history loads through the sync registration layer (`useChatSync`'s internal prime),
not through the page. The page only calls `refreshList({ channelId, cursorNo, limit })` for one
thing — paging further into the past — and widens its `observeList` window to match.

The registration mechanics (ref-counting, per-slot runtimes, plan cadence) are
[libs/app-runtime/docs/sync/](../../../../libs/app-runtime/docs/sync/README.md)'s.

## 4. Writing data — through a repository, always

Direct socket `send` / `emit` is not a path the app has. Every write goes through a repository —
`runtime.data.useRuntimeRepositories()`, except a chat send, which names its cloud
(`runtime.data.sendChatInCloud`; see [feature/channels/data-layer.md](../feature/channels/data-layer.md)):

| Action                                            | Repository method                                                                                    |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Send a message                                    | `runtime.data.sendChatInCloud(cid, { channelId, content })`                                          |
| Mark read                                         | `repos.join.readChat({ channelId, chatNo })`                                                         |
| Create / edit / invite / leave / delete a channel | `repos.channel.createChannel` / `updateChannel` / `inviteChannel` / `leaveChannel` / `deleteChannel` |
| Create / edit a place                             | `repos.place.createPlace` / `updatePlace`                                                            |
| Edit a profile                                    | `repos.user.updateProfile(...)`, or for a place profile `useSetMyPlaceProfile` (not the repository)  |

## 5. Refresh timing

The sync runtime replays registered targets automatically on a socket swap (reconnect / re-auth). A
`sid`/`cid` context change alone does **not** trigger a re-fetch — that is the app's job.
`app/runtime/useBackgroundSync.ts` owns it, with five numbered triggers in its own comments:

```ts
await Promise.all([
    repos.place.refreshList(), // place has no delta gateway → always full
    repos.user.getMyProfile(),
    /* channel-sync:${cid} delta via repos.channel.syncChannels(since) */
    /* sent relay invites — skipped for a cloud session or a guest */
    /* profile-sync:${cid}:${sid} delta via repos.profile.syncProfiles(since, sid) */
    ,
    ,
    ,
]);
```

**Trigger 1 — `isVerified` rising edge (false → true).** Covers app entry, reconnect, and switch
completion in one shot: a site or cloud switch commits a new token, the SDK re-authenticates, and
the edge fires exactly when the new session verifies — never against the stale one. On this edge the
hook also calls `loadSelfChannel()` (`channel.get-self`, relay only — cloud servers have no
notes-to-self channel) and pre-advances a `prevSiteRef` watermark so Trigger 4 does not re-fire the
same fetch for a cloud switch (which lands on a new `sid` too).

**Trigger 2 — periodic poll (60s) while verified**, skipped during an in-flight switch
(`useIsMutating` on the switch mutation keys) so the optimistic window before the new session
verifies is never fetched against.

**Trigger 3 — app foreground return**, via `useAppForeground` (`app/bridge/useAppVisibility`,
merging the native `OnBackgroundStatusChanged` bridge event with the web's own `visibilitychange`).
A suspended WebView freezes the poll timer and can miss a push, and if the socket survives
suspension there is no reconnect (no rising edge) to close that gap otherwise. Gated on `isVerified`;
a dead socket is left to Trigger 1 once the runtime's own wake recovery re-verifies it.

**Trigger 4 — active `sid` change**, for a site switch. A site switch calls the SDK's `auth.switch`
on the _same_ socket and stays `authenticated`, so it produces no rising edge — without this trigger
a site reached only by switching would never be fetched and its channel list would stay empty. Fires
once the switch settles (verified, not mid-switch) and only when `prevSiteRef` actually changed, so
a cloud switch (already handled by Trigger 1) is not double-fetched.

**Trigger 5 — on request**, from home's pull-to-refresh. The hook is mounted once under
`AppRuntime`, so a screen cannot call into it; it registers a handler in
`app/runtime/backgroundRefresh.ts`, and the screen calls `requestBackgroundRefresh()`, which settles
when the pass has. The pass is Trigger 1's — lists plus `loadSelfChannel()` — under Trigger 3's
guards: unverified or mid-switch, nothing is sent and the request settles at once, so an indicator
never waits on a socket answering for the wrong session. A request made while one is still running
joins it instead of starting a second pass, since two passes read the same delta watermark and the
last to answer writes it. The place snapshot is awaited inside `Promise.all` rather than
fired and forgotten: the automatic triggers ignore the returned promise either way, but a pull has
to keep its indicator up until the place rail has been re-asked too.

**Chat feed.** The chat plan has no poll — only live push and reconnect catch-up — so a missed push
does not self-heal. `app/features/channels/hooks/useForegroundChatRefresh.ts` complements
`usePrimeChat` (which fetches only a _cold_ room): it re-aligns the plan baseline and refetches the
latest page, but only for a _warm_ room, on entry (gated on `isVerified`, to protect a cold start)
and again on every foreground return (not gated — a socket that resumed in a stuck "verified but
dead" state would otherwise never get a retry). Keep the two conditions mirrored if either changes.
Both send their fetch through `runtime.sync.fetchRoomFeed`, which hands a caller the room's fetch
already in flight, or one that finished within two seconds. The home list's row tap starts that fetch
(`runtime.sync.prefetchRoomFeed`), so on a list entry the request is out during the page transition,
and the hook that applies joins it rather than sending its own. The foreground-return refresh is the
exception: it passes `fresh` and always sends, because a fetch still in flight may predate the
suspension whose missed pushes it is there to recover. The
cache read, the baseline and the fetch are one cloud's: the cloud is read once before the cache read,
the baseline goes to it by name, and if the selection moved while the read was pending the hook stops
there rather than hand that cache's baseline to another cloud.

## 6. Logout

`useSessionLogout` performs a best-effort socket logout and store teardown, then
`relaySession.clearAndRedirect()` reloads the document at `/?logout=1`. The reload — not a manual
call — is what clears the react-query cache; there is no `DataManager.destroy()` in this codebase.
On the next boot, `initAppRuntime` reads the `logout=1` flag and sweeps every `@`-prefixed storage
key except the i18n language key and `@chatic/config`'s own lane
(`libs/app-runtime/src/session/auth/logoutStorageSweep.ts`) — because the actor that decides to log
out and the code that can safely clear storage run in two different page lifetimes.

Further reading: [libs/app-runtime/docs/session/](../../../../libs/app-runtime/docs/session/README.md).
