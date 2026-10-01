# ADR-0119: Every joined cloud keeps a socket session

> Status: Accepted (decision 1's cap and decision 5's sign-off rule are amended for a cloud a write is in flight to → [ADR-0122](0122-a-chat-send-is-addressed-to-the-cloud-it-was-written-in.md); decision 1's invited clouds are the ones the device user accepted → [ADR-0156](0156-an-invited-cloud-is-entered-with-the-invite-login-answer.md)) · Decided: 2026-09-28 · Implemented: `feat/cloud-background-slots`
> · Scope: `libs/app-runtime/src/socket/backgroundClouds.ts` · `libs/app-runtime/src/socket/auth/**` ·
> `libs/app-runtime/src/connection/**` · `libs/app-runtime/src/session/store/cloudStore.ts` ·
> `libs/app-runtime/src/session/auth/cloudSession.ts` · the apps' `BackgroundCloudsRunner`
> · Builds on: [ADR-0115](./0115-a-socket-slot-is-keyed-by-the-cloud-it-serves.md) (slots keyed by cid) ·
> [ADR-0116](./0116-the-active-socket-slot-is-a-pointer-the-binder-sets.md) (the active slot is a pointer) ·
> [ADR-0117](./0117-socket-auth-is-keyed-by-the-slot-s-cloud.md) (auth keyed by the slot's cloud) ·
> [ADR-0118](./0118-a-sync-target-belongs-to-its-cloud-s-slot.md) (a sync target belongs to its cloud's slot)
> · Amends: [ADR-0116](./0116-the-active-socket-slot-is-a-pointer-the-binder-sets.md) decision 3 — a
> switch between two kept clouds only moves the pointer, and the reconcile is keyed on the active slot
> too · [ADR-0117](./0117-socket-auth-is-keyed-by-the-slot-s-cloud.md) decision 4 — terminal expiry
> drops the cloud's own cached tokens whether or not it is committed, and leaving a cloud keeps the
> other clouds' cache
> · The module docs are [libs/app-runtime/docs/socket](../../libs/app-runtime/docs/socket/README.md#background-slots)
> and [docs/auth](../../libs/app-runtime/docs/auth/README.md#tokens-for-a-background-slot-before-it-boots)

## Context

The runtime opened a relay socket and one cloud socket: the committed cloud's. Switching from cloud A
to cloud B booted B and tore A down, and going home tore A down after telling it `auth.logout`. So a
cloud had a socket only while it was on screen, and three things could not be done:

- **A write could not be addressed to its cloud.** A chat send, or an upload's completing
  `chat.send`, that the user started in A and that was still in flight when they moved to B lost its
  socket: A's in-flight requests failed with 499, and anything retried afterwards went out on B's.
- **Switching back cost a full reconnect and, often, a token exchange** — two HTTP calls and a new
  handshake for a cloud the user had been in a minute earlier.
- **Nothing about a cloud not on screen could be kept current**, because nothing was connected to it.

ADRs 0115–0118 made a slot able to be for any cloud, not just "the cloud": keyed by the cloud it
serves, with its own authentication and renewal, its own sync targets, and a pointer — not the set of
bound slots — deciding which one the app is looking at. What was left was to bind more than one.

## Decision

1. **Every cloud the account belongs to holds a slot, up to five, besides the committed one.** The app
   hands over membership (`connection.useBackgroundClouds(cids)`, fed from the owned catalog and the
   invited-cloud cache); the runtime drops the relay and the committed cloud, orders the rest by recent
   use, and caps at `MAX_BACKGROUND_CLOUDS = 5`. The committed cloud's slot is the only one ever made
   active.
2. **Recent use is recorded, not inferred.** Every successful switch moves its cloud to the front of a
   persisted list (`chatic-recent-clouds`, at most 20), cleared with the account. Past the cap, the
   clouds entered most recently keep their sockets; the app's order breaks ties.
3. **A background cloud's tokens are issued before its slot boots**, by a preparer that owns the
   cloud's cache entry until the slot binds, and never after — once bound, the credential guard owns
   it, because only the guard re-registers the socket as it re-issues. A slot is derived only for a
   cloud whose cached entry has more than one refresh cycle left, so no slot is ever booted on a token
   about to be replaced. A failed issue backs off per cloud (60s, doubling, capped at 15 min), and so
   do an issue that leaves the cloud unusable and a cloud whose socket session just expired. A cloud's
   token exchange runs once at a time: a switch, the preparer and a renewal asking for the same cloud
   join one exchange instead of each writing the cache.
4. **A switch to a cloud with a live slot commits that slot's tokens as they are.** It reads the cache
   margin-blind instead of re-issuing, so the committed store holds exactly what the socket registered
   and signs with. The binder then only moves the pointer: nothing reconnects.
5. **Leaving a cloud is not signing out of it.** `clearSession` no longer clears the per-cloud token
   cache, so going home keeps the cloud as a background slot, and its socket is not told
   `auth.logout`. A slot that is torn down while its session is still good — the cloud still joined,
   pushed past the cap — is signed off first, by the binder, as it goes; `logoutCloudSession` signs
   off only a cloud that is no longer joined or whose tokens are gone, so no socket hears it twice. A
   committed cloud's terminal expiry drops its own cached tokens and no one else's. The relay logout
   is the one place every cloud's tokens go.
6. **The reconciler is keyed on the active slot as well as the slot set.** A switch between two kept
   clouds changes neither the set nor any reboot key.

## Alternatives

- **Send over HTTP to a cloud that is not on screen.** Chat is sent over the socket today; an HTTP
  path per write would be a second protocol for the same operation, with its own signing and
  its own failure modes, and would still leave the reconnect on every switch back.
- **Open a slot only while a write is in flight ("hold").** It fixes the lost write and nothing else:
  every switch back still reconnects and re-exchanges, and a cloud not on screen still receives
  nothing. The hold is still needed for a cloud outside the cap, and it lands with its first caller —
  the cloud-addressed send.
- **Queue a write until its cloud is entered again.** The user sees a message they sent sit unsent for
  as long as they stay elsewhere, with no way to tell that is why.
- **No cap.** An account in many clouds would hold a socket and a token lifetime per cloud on every
  device. Five is the largest tier's allowance of owned clouds, so an account that only owns clouds
  never reaches it; invited clouds are bounded by no plan, and past five the most recently entered win.
- **Order by the app's list alone.** The catalog order says nothing about which clouds the user
  actually goes to; past the cap it would keep whichever clouds were created first.
- **Keep telling the cloud's socket `auth.logout` on going home.** It would end the session the
  background slot is about to keep, so the switch back would reconnect and re-register — the cost this
  decision removes.
- **Let the preparer renew bound clouds too.** It would re-issue a token under a live socket without
  re-registering it, leaving the socket registered with one token and signing with another. That is
  the guard's job, done in one step.

## Consequences

- **Several clouds hold connections from the same device id at once.** Until this, a switch never had
  two clouds connected even for a frame. The socket model registers one main connection per device,
  so this depends on the cloud servers keeping separate device records; if they shared one, each
  cloud's `device.save` would displace another's connection. The backend had not confirmed it when
  this was decided, so it was measured: on the dev servers, one device held relay, a committed cloud
  and a background cloud for 30 minutes with every slot connected and verified throughout, not one
  reconnect (`connectCount` stayed at 1 on all three), both clouds' SDK refreshes landing, and no
  `invalid sign` or `401`. That is evidence the two clouds keep separate device records, not the
  backend's word for it; if they turn out to share one, the symptom to look for is a background
  slot's `connectCount` climbing.
- **Going home no longer tells the cloud's socket it logged out.** Whatever that cloud's server keys
  on the socket's authentication — presence, and possibly which device its pushes go to — now stays as
  it was while the user was inside. That is the state cross-cloud unread wants; it is also a change a
  user could notice.
- **A screen can no longer render one cloud's rows under another's selection, even for a render.** A
  switch used to take a token exchange and a connect before the incoming cloud could answer anything,
  and that delay hid a one-render window in which list hooks still held the outgoing cloud's rows: a
  row registered its place or channel under the incoming cloud, and the place auto-select switched to
  the outgoing cloud's first place. With the incoming cloud already connected, those ids reached it at
  once (`place.get` 404, `auth.switch` "siteId is invalid"). The apps' list hooks now filter rows to the
  selected cloud at render.
- A background slot has no sync targets yet, so its cloud's cache is exactly as fresh as it was when
  the user left. Receiving in the background is the next step, and it is what makes the kept sockets
  pay for themselves beyond sends and switches.
- Background slots follow a relay session: every cloud token is minted from it, so without one there
  are none, and the relay logout ends them all.
- `RuntimeSocketSlots` gains an optional `background[]`, `ISocketManager` gains `getSlotStatuses()` for
  the debug overlay, `cloudSession.switchTo` takes `{ hasLiveSlot }`, and `cloudStore` gains
  `clearCachedCloudTokens` and the recent-cloud trio. `connection.useBackgroundClouds` is the one new
  app surface.
