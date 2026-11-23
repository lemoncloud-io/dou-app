# runtime

What the page keeps running under every route (`src/app/runtime/`, mounted by `DesktopRuntime`, and
the boot in `src/main.tsx`): the connection host, the credential refreshers, the background list sync
and the notification wiring. No feature starts any of this; the layer assembles `@chatic/runtime`'s
declarative pieces and adds the few policies that are this app's own. The host ports it runs on are in
[host](../host/README.md), where state is kept in [storage](../storage/README.md).

## Boot

`main.tsx` points the app's stores at the window's store set, then starts the runtime the page
declares (`src/config/desktop-web.ts`) before anything renders. That start initialises `@chatic/config`
from the declaration's ports, publishes the host's ports before anything that renders could read one,
loads the shell's vault when it keeps one, then builds each port and boots the runtime. It is the app's
only boot call, and nothing above it reads the session. A failed start is logged under its own tag and
thrown on, so it stays the uncaught error a boot failure always was and the page does not render on a
runtime that never came up. After that the stored reading preferences go onto the document root before
the first paint, so a reader who picked a larger text size never sees the default flash.

The declaration also sets the **chat cache cap** to 1000 messages per channel. Desktop stays open for
days, so an unbounded cache grows without end. 1000 is twenty load-more pages of scrollback; evicted
history comes back from the server when the reader scrolls to it. It is set here and not in the shared
runtime because web storage serves every non-native client, so a limit in the shared layer would also
truncate the browser app and the admin console.

## The connection host

`DesktopRuntime` mounts `runtime.connection.RuntimeAuthHost`, the host variant **without background
guest login**. The sibling host keeps a session-less visitor alive as a guest, which on this shell
meant a new guest account per window: the welcome screen painted for about a second before the
background login claimed the route, so Google sign-in, invite login and the development sign-in form
were unreachable, and Log out dropped the person straight into a fresh guest session. Desktop has an
explicit door instead (Welcome's "start as guest" registers the device itself), so nothing needs a
session before someone asks for one.

The trade is deliberate: a session the server revokes mid-flight now ends at the welcome screen
instead of silently re-entering as a guest. That is one tap from recovery, and it no longer hides the
revoke from the person it happened to.

Around the host the layout is a column: the connection banner and the update banner stacked at the
top as rows, then the router and the toaster under them. They are rows in the layout, not fixed
overlays: fixed, they covered the shell's top row, and when both fired the update banner sat entirely
under the connection banner. Stacked, both show and the app below gives up exactly their height. The
toaster sits inside the area under the banners, so a banner pushes toasts down with the header. One
tooltip provider serves the whole app (Radix needs an ancestor, and a chat pane renders dozens of
message toolbars at once); its delay is short because these tooltips name icon-only controls, where
the label is the only way to learn what a button does. The connection banner stays quiet while an
invite attempt is held, because the device guest's socket is still coming up and nothing on that page
uses it.

The debug frame log (inbound socket envelopes) starts from an effect, not at import, because it reads
the runtime engine, which exists only after the entry point has started it and this module is imported
earlier. It starts once for the app's life and is deliberately not stopped on unmount, so the debug
page opens onto a buffer that was already filling.

## Credentials

Two credentials go stale while the window stays open, and both fail in a way that does not look like
what it is.

- **The relay's HTTP signing credential** (`useRelayCredentialRefresh`). A relay-signed request with a
  stale signature is rejected by the API gateway with a 403 that carries no CORS header, so the browser
  hides the response and the app sees only a bare `Network Error` with no status. Cloud entry
  (`delegate-cloud`) is just the first relay-signed call a person touches; every one fails the same way
  in that window. The refresh is therefore **edge driven, never polled**: on the rising edge of relay
  verification, and on returning to the window while the relay is verified. A refresh can only reach
  its owner through a live authenticated socket, so polling at mount would only log failures until the
  handshake completes. The return-to-window trigger exists because a socket that survived sleep fires no
  rising edge, yet the credential may have lapsed while the machine was suspended; the wake recovery
  hook only heals the socket, and the credential is a separate cache. It is gated on the relay being
  verified for the same reason (an ungated return, the state a machine wakes in, would only log a
  failure; the rising edge covers that case once the socket is back). Both triggers refresh without
  consulting the stored expiry, since at exactly those moments it is a bad proxy: the handshake's
  update carries no token, so boot runs on the pre-sleep credential until the SDK's own five-minute
  timer fires. The guard throttles to once a minute. It **never logs out**: relay logout is manual here,
  and a failed refresh simply retries on the next edge.
- **A cloud's credential** (`runtime.session.useCloudCredentialGuard`). It also lives about an hour,
  and the only thing that re-mints it mid-session is the cloud socket's refresh, so a session that
  stays inside one cloud, or whose cloud socket drops, would let it lapse and every cloud-signed request
  would fail the same opaque way. It is called with no policy on purpose: the guard arms itself off the
  credential's own expiry, so there is no cadence to pick; checking when the window becomes visible is on
  by default and this shell gets real visibility events, so no local wiring is needed; and it must not be
  gated on the cloud socket, because recovery is a re-issue from the relay identity rather than a
  refresh, which works precisely when that socket is down.

## Background sync (`useBackgroundSync`)

Keeps the place, channel and profile lists fresh on every route, not only home.

- **Triggers:** the rising edge of socket verification (app entry, reconnect, the end of a switch), and
  a timer every 60 seconds while verified. The cadence is coarse on purpose: these lists only
  re-discover added and removed entries. A cloud or place switch commits a new identity and
  re-authenticates the socket, so the rising edge fires exactly when the new session is verified, never
  against the stale one.
- **Not during a switch.** The timer is skipped while a cloud or place switch is in flight, which the
  hook sees through the switch mutation keys, because the other components that trigger switches have a
  pending flag this hook cannot see. This closes the optimistic window in which the old session is
  still verified.
- **Watermarks advance.** The place list is a full snapshot with no cursor. Channels and profiles are
  deltas: the stored time is passed as the cursor and the returned one is saved. Channel sync spans the
  whole cloud, so its cursor is keyed by cloud; the profile cursor is keyed by cloud and place. Asking
  from zero every tick would re-pull everything and lose removal deltas. A failed pull leaves the
  cursor where it was, so the next tick retries from the same point.
- **The place the socket is on.** `channel.mine` answers for whichever place the socket session is on,
  and naming the place the app believes it is on is what tags the rows and gates the prune of stale ones.

Next to it, `BackgroundSyncRunner` also repairs the local record of the cloud the person is in (for an
invited cloud that record is the only thing keeping it on the rail once they leave) and
`useEnsureSelfChannel` makes sure the notes-to-self room exists. A subscription cloud does not create
that room by itself; it exists once something asks `channel.get-self`, which gets or creates it, one
per person per cloud. Without the ask a new cloud member had no such room in the sidebar until they
picked themselves in the new-message picker. The relay needs nothing, since its sync already brings
the room. The ask is made once per cloud per app session, when the socket is verified, a place is open
(the answer carries no place, and the row is tagged with the one it is handed) and no switch is in
flight; a failure is logged and asked again the next time those hold.

## Live place profiles (`useRealtimeProfileSync`)

The plan-based sync only pulls profiles, so without more a peer's nick or photo edit would wait for the
60-second poll. The hook pulls the profile delta at once on the server's `profile.sync` broadcast, and
again when the window regains focus, to catch edits made while it was in the background. The broadcast
is a bare nudge: its payload is the changed profile, but the hook ignores it, because the delta pull is
idempotent and already knows which place to ask for. (`channel.sync-site-profile` is only the name of
the pull request, never a pushed frame, so subscribing to it would leave edits waiting for the poll.)
The broadcast, the focus pull and the poll share one cursor (`profile-sync:{cloud}:{place}`), so they
never double-apply.

## Notifications run only while signed in

The notification wiring (banners, toasts, the cross-cloud badge, inbox capture, the offline outbox,
wake recovery) is mounted only with a live session. The Electron push receiver keeps running and the
device stays registered after logout, so without the gate the previous person's pushes would still
raise toasts, badges and OS banners on the logged-out window. Unmounting drops the listeners; they
register again on the next sign-in. Among them: the wake and wedge recovery hooks run only where the
app owns its window ([host](../host/README.md)), and the offline outbox is a desktop opt-in (the browser
app keeps its manual resend button).

## Routes (`src/app/routes.tsx`)

The router has a signed-out branch and a signed-in branch, each built from lazy chunks (the auth
screens, the messenger shell, and the settings, profile and debug pages are separate chunks, so the
first load ships only what the current branch needs). The screens that must outlive a branch flip are
held open by flags the flows set: the invite page, a Google start's Welcome, the pairing code page
and phone sign-in keep their route while a sign-in made mid-flow flips the router
([auth](../auth/README.md), [pairing](../pairing/README.md)). The phone page and the hand-off page exist on
both sides.

- **The hand-off page works with a stale session.** `/auth/oauth-response` is registered on both
  branches because a browser may hold a (possibly stale) authenticated session when the relay returns;
  otherwise the return would bounce home and lose the code before it reached the shell.
- **Some dialogs are route-independent.** The shortcuts sheet and its hint bar (the line of hints a held
  modifier key shows), the Appearance popup and the join-with-invite dialog are mounted at the router, so
  the keyboard "?" and the account menu work on every page. The join dialog used to be mounted by the
  home page only, so a guest who tapped Join on the account hub got nothing, and the dialog popped up
  later on returning to chat. They share a Suspense boundary of their own, so the chat chunk loading
  does not blank the page.
- **One listener for notification taps and menu links.** Mounted inside the router (so it can navigate)
  and independent of the route, so opening works from the profile or settings pages and not just home.
  Two things feed the same pending-open store: the OS banner's click, delivered as a deeplink on the
  notification feed (same cloud, another cloud, and the thread-reply form that also carries the root),
  and an in-app toast's click. A set target routes home, guarded on there being a live target so the home
  page clearing it back to nothing does not navigate again. The menu bar's `chatic-ui:` links ride the
  same message: settings, back and forward (the same presses as the keyboard chords), the shortcuts sheet,
  and the quick switcher and search, which navigate home first because the home screen mounts them. The
  listener exists only where the host hands the page its notifications.
- **The boot fallback is chosen from the address bar.** The app root sits outside the router, so it reads
  the location itself: a reload on settings must not boot into the home shell's skeleton. The chat-shell
  skeleton is for home only, a page skeleton for the other signed-in routes, and the plain loader signed
  out.
