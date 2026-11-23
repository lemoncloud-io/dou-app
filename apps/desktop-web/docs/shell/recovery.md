# Recovering from a broken page or a dead socket

What the shell does when the page throws, the network drops, the socket stops verifying after a sleep,
or a new build is offered. The pieces are in `src/app/shared/components/` and `src/app/shared/hooks/`.

## A page that throws

`AppErrorBoundary` wraps the whole app. Without it, two ordinary failures ended in a blank window with
no way out: a render that throws, and (more often in the installed app) a lazy route chunk that 404s
because the build it belongs to was replaced while the app was open. Both are fixed by reloading.
The error screen's button does a full `window.location.reload()`, not a state reset: re-rendering the
same tree after a stale chunk would land on the same error. It is a class component because React has
no hook for catching a render error.

## The connection banner

`ConnectionBanner` reads `runtime.connection.useConnectivity()`, which composes `navigator.onLine`
with the socket's state, and shows nothing while the status is `online`.

- **Offline is claimed only when the browser reports no network and no socket is verified to
  contradict it.** A down socket on a working network reads as "Reconnecting…".
- **A cloud or place switch hides the banner.** A switch closes the socket and verifies it again on
  purpose, so "Reconnecting…" during one would read as a failure. The switch is detected from the
  switch mutations in the mutation cache.
- **`quiet`** also hides "Reconnecting…" (never "offline") for a screen that does not use the socket
  yet, such as the invite page, whose guest socket is still coming up.

## A socket that dies in sleep

Both hooks below run only where the host says the page owns its window (`appShell.ownsWindow`, see
[host](../host/README.md)); a browser tab is never poked or reloaded.

- **Wake recovery** (`useSocketWakeRecovery`). After a short sleep the socket is dead without saying
  so. When the app comes to the foreground or the network returns, and only while the socket is
  unverified, the hook force-closes it. The close is not a manual stop, so the SDK's reconnect
  controller reconnects and signs in again. Wake events are coalesced to one attempt per
  `RECOVER_THROTTLE_MS` (5 s), so rapid focus changes do not churn the socket.
- **Wedge reload** (`useSocketWedgeReload`). After a long sleep the cloud-token refresh can fail and
  the socket stays unverified for good, so live messages and same-cloud banners stop until a manual
  reload; only a full reload re-bootstraps the credentials the refresh accepts. So when a socket that
  verified at least once this session stays unverified for `WEDGE_GRACE_MS` (25 s), and the user is
  still signed in, the page reloads once. The grace lets wake recovery and the SDK's own retries run
  first. A socket that has never verified this session is a slow start, not a wedge.
- **One reload per five minutes.** The reload time is stamped in `tabStore` and a second wedge inside
  `RELOAD_GUARD_MS` does not reload: if the reload did not fix it, the credential is truly expired.
  The stamp is removed when the socket verifies, so a later sleep can recover again.

## The update banner

`UpdateBanner` stays mounted (it renders nothing when idle or dismissed) so the update status
subscription in `useAppUpdate` lives on every route. `useUpdateStore` is in memory only; a relaunch
asks the update feed again.

- The shell re-checks the feed every 30 minutes, so the same offer arrives repeatedly.
  "Later" holds for it: the banner comes back only when the status changes or a newer version is
  offered. Download-progress ticks do not clear it.
- The percent is not a live region (`aria-live` is off while downloading); a polite region would read
  every tick.
