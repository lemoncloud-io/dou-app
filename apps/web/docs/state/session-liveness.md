# session liveness — keeping credentials, sockets and presence current

The runtime owns the sessions; the app only decides **when** to ask it to check. These runners and
hooks (all mounted in `app/runtime/AppRuntime.tsx`) are that policy. None of them logs the user out on
its own.

## Relay signing credential — `useRelayCredentialRefresh`

The relay's HTTP requests are signed with a credential that lives about an hour. Nothing refreshes it
at boot: the socket's first `auth.update` reply carries no token, so the first write-back lands one
refresh cycle (about five minutes) after connect. Until then every relay-signed request, notably the
calls that enter a cloud, can fail.

- **Trigger on the rising edge of relay verification, not on a timer.** The refresh owner only exists
  inside a live authenticated socket, so polling at mount would fail until the handshake finishes.
  The edge asks it to run now instead of at the next cycle. A cloud entry inside that first second or
  two can still fail once.
- **Also trigger on foreground return**, because a socket that survived suspension fires no edge while
  the credential may have lapsed. The foreground check is skipped while the relay slot is unverified;
  the edge covers that case later.
- Both triggers refresh regardless of the stored expiry: at those moments it is a poor proxy for
  "still signs".
- A failed refresh just waits for the next edge. Ending the session after a terminal `expired` is the
  socket layer's job, after a confirmation window, and is not this hook's.
- `useCloudCatalogRelayResync` (in `app/hooks/useCloudCatalog.ts`) is the matching repair for the cloud
  catalog. A user returning after more than an hour boots with an expired credential, so the catalog's
  boot read and its one retry fail before the handshake and nothing would read it again. The hook
  re-reads once each time the relay socket verifies with a failure standing, and once when a read fails
  while the socket is already verified. "Failed" means the last settled read, not the query's
  `status`: a refetch with no data puts `status` back to `pending`, so keying on it would loop.

## Cloud credentials — `useCloudCredentialRenewal`

A cloud credential that lapses while its socket is down cannot be refreshed, only re-issued from the
relay identity. The runtime's guard arms itself off the credential's own expiry; the app adds the
foreground-return trigger, because a suspended WebView does not fire timers on time.

- It never logs out and never tears the session down; losing a cloud is recoverable by entering it
  again.
- The same foreground return re-checks the clouds this device entered through a pairing. One the relay
  stopped delegating (approval revoked, or the approving device signed out) is torn down by the
  runtime, and this hook then tells the user and signs the device out once, however many clouds ended
  in the same round. An ended approval ends the sign-in it gave.

## Wedged sockets — `useSocketWakeRecovery`

After a WebView suspension a socket can be a half-open zombie; waiting for the keep-alive loop to
notice delays recovery. On every foreground signal the hook asks the runtime to recover the sockets
and to refresh the background clouds.

- Foreground arrives twice (native message and `visibilitychange`), so kicks are throttled to one per
  five seconds.
- The recovery is a no-op for a slot not yet booted, so mounting it before login is inert.
- `useBackgroundSync` skips its own foreground refresh on an unverified socket; the rising edge after
  recovery re-syncs, so the refresh is deferred, not lost.

## Presence — `useDeviceSync`

Reports to the server which room this device is looking at and whether it is foregrounded
(`green`/`yellow`), so pushes for the room being read are filtered out.

- The viewed channel is derived from the route. The room and its thread report the same channel, so
  moving between them is not a change and the server never sees a gap it could push into.
- Backgrounding clears the viewed channel and restores it on return.
- Sends are fire-and-forget, so they are gated on a verified socket; a send on a dead socket would be
  lost. The refs holding what was last delivered are reset whenever the socket stops being verified,
  which is what makes the next verified edge re-assert both status and channel.
- A first settle with nothing to view records the empty state without sending a clear.

## Which clouds keep a socket — `BackgroundCloudsRunner`

The runner hands the runtime every cloud the account belongs to (owned catalog, invited cache and the
relay); which of them get a socket, and in what order, is the runtime's decision.

- Nothing is handed over until membership is known, because a partial list reaching a runtime that
  outlived the page would tear down background sockets that were fine. Known means the catalog has
  answered and the invited-cloud cache has answered, or `INVITED_CACHE_WAIT_MS` (5 s) has passed since
  the catalog answered, whichever is first.
- A catalog failure counts as an answer only once the relay socket is verified; before that it says
  nothing about the owned clouds.
- Owned clouds are also passed on as owned-reclaim candidates, together with owned clouds cached as
  invited: an owner who accepted their own invite link on this device, or a guest who later signed in to
  the owning account, still holds a token issued to the guest.

## Invited clouds have no list API — `InvitedCloudDurabilityRunner`

Invited clouds are the one cache type with nothing server-side to refill it from, so the runner repairs
a named cloud when it is seen missing.

- A foreground push naming a source cloud that is not cached re-derives and re-caches it so
  cross-cloud routing can resolve it. A push with no cloud id, or from the relay (`'#'`), is ignored.
- Recoveries in flight are tracked per cloud, so a burst of pushes issues one `delegate-cloud`.
- It also mounts the runtime's invited-cloud name sync, because the delegation token carries no cloud
  name and the real one has to be fetched once the cloud is verified.
- The push repair only runs where the app hands the page its notifications (the native WebView).
