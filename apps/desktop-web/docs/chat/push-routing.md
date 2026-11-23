# Pushes: which cloud, which place, and what opens

How a forwarded push is attributed to a cloud, how a banner or toast decides to show, and the link a
click carries. The presenter is `useCrossCloudPushNotifications`; the helpers are `resolvePushCloudId`,
`pushLandingPlace` and `parsePushDeeplink` in `src/app/shared/`. The relay's `#` source and the
duplicate rules are in [notifications.md](./notifications.md#a-push-from-the-relay).

## Who presents what

The shell raises no banner for a push itself. It forwards every push through the push port's
`notifications`, and this hook owns the whole decision, as `useDesktopNotifications` does for live
messages of the active cloud: do-not-disturb lives in one place, ships with the web build (no shell
reinstall), and focus is judged from one source (`document.hasFocus()`).

- **Focused: a toast. Unfocused: an OS banner** through `push.localBanner` (macOS drops banners of a
  focused app). Silent and data-only pushes and click-routing events carry no content and show nothing;
  other readers consume them for badges.
- Do-not-disturb silences banner and toast alike. The OS-notification master switch gates banners only;
  toasts are in-app. My own message is dropped: the push names its author by the owner id of the cloud it
  came from, and `data.uid` is the recipient (me) in that same id space, so either that or my account id
  marks it as mine; a webhook is never mine.
- A push for the channel already open shows nothing.
- **The notify mode is read from the engine cache**, confined to the source cloud (channel ids collide
  across clouds), because the push carries no channel record: a muted channel stays silent and a
  mentions-only one drops messages that do not mention me. A channel the server has as mentions-only is
  trusted: the server sends a push there only when the mention record names the member, so the push
  arriving is the answer and the text, which may call me by another name, is not asked again. A mode that
  exists only as this device's own setting leaves the server possibly sending everything, so the text
  decides. A 1:1 has no mentions-only level. The text is read from `data.content` flattened to plain text
  (a mention lives in a Block Kit message's text, not in the JSON that carries it), else from the body.
- **Duplicates.** A push for the active cloud is not banner'd again, since the live socket path already
  did. The suppression applies only when the push provably belongs to the active cloud; an unresolved
  source shows, because a duplicate beats a missed cross-cloud message.
- **No sender name.** Cross-cloud pushes show channel and message only: the name the backend bakes in is
  unreliable and the sender's per-place nick cannot be resolved across clouds. An attachment-only push
  names its attachment here (the shell's body is a bare count or nothing), see `pushBody`.

## Which cloud a push belongs to

The deployed backends do not stamp `data.cid` (it arrives as an empty string), so
`resolvePushCloudId` finds the cloud by reverse lookup in the engine's cache, which partitions every
record by cloud, and any cloud the person is a member of has been visited and so cached. The repository
layer is scoped to the active cloud, so the lookup scans the raw IndexedDB store read-only
(`readCacheRecords`, which returns nothing when IndexedDB is unavailable and the caller degrades).
When a backend does stamp `cid`, it wins and the lookup never runs.

- **By uid first.** `data.uid` is the recipient's id in the source cloud, and every cached channel of
  that cloud carries it as `$join.userId`. The account id is identical across the catalog's clouds, so
  uid is trusted only when it resolves to exactly one cloud.
- **Then by channel.** Channel ids are per-cloud sequences, so a bare id collides. Narrow by place and
  channel name, each filter applying only if it leaves a candidate (a stale cached name must not erase a
  true match), and answer only on a unique match: no badge beats a wrong one.
- The same scope rule applies to finding the cached channel record: by cloud when known, else by uid,
  else only a unique match.

## What a click opens

`buildOpenDeeplink` and `parsePushDeeplink` are one grammar; both banner producers encode through the
same function so the sides cannot drift, and the parser's own target type makes the round trip checkable.

- `chatic-open:<place>|<channel>` for a message in the active cloud.
- `chatic-open:<cloud>|<place>|<channel>` for another cloud, so the click switches cloud, then place,
  then channel.
- `chatic-open:<cloud>|<place>|<channel>|<root>` for a thread reply; the cloud segment is empty when the
  push is same-cloud. The segment count discriminates the forms, which is why a root needs four
  segments: a three-segment `place|channel|root` would read as cross-cloud. The shortest form that
  carries every present field wins. A reply is hidden from the main feed, so without its root the click
  could only select the channel and the pushed message would be on no screen. Cross-cloud pushes carry
  no root yet, because the server's payload has no `parentId`.
- `chatic[-dev]://message/<cloud>/<place>/<channel>/<chatNo>[?root=<id>]` is a copied message link; the
  feed lands on that message instead of the bottom. Both schemes are read, since receiving one is
  harmless and only the shell decides which it sends.
- A raw `channel?channelId=` or `/channels/<id>/room` link is the fallback when the source cloud cannot
  be resolved: best effort, opens in the current cloud only.
- Anything else (sign-in deeplinks, a malformed escape) is not an open target and returns null. Anything
  on the machine can open the scheme, so a malformed escape is refused rather than thrown into the
  listeners that share the event.

The place is the room's own, from `pushLandingPlace`: a push names the place its sender wrote from, but a
1:1 belongs to the place it was opened in, so a 1:1 lands on its own place (the cached row's, else the
place a place-keyed id names) and falls back to the push's place only when it names neither. A relay 1:1
lives in the relay's one place and keeps the push's.

The click sets the pending-open target (`usePendingOpenStore`), which the always-mounted notification
listener writes and routes to home; `HomePage` consumes it once the target's channels load, switching
cloud and place first. That decouples notification handling from the home route being mounted.
`useOpenAtBottomStore` is a one-shot flag from a notification click: the message pinged is the newest,
so the feed lands at the bottom instead of the unread divider, and a later plain open keeps the divider.

## A push can bring a lost cloud back

An invited cloud's endpoints live only in the local cache row, so a reinstall or cache clear drops
clouds the relay catalog cannot refill, and a push is the one signal that still names one.
`usePushInvitedCloudRecovery` runs beside presentation, never inside it (the presenter drops silent
pushes, muted channels, own messages and do-not-disturb windows, but a dropped cloud still needs its
endpoints), and re-derives the cloud's endpoints from a fresh delegation token. In-flight recoveries are
keyed by cloud so a burst from a chatty channel is one `delegate-cloud` call. The relay and owned
catalog clouds are skipped. The rail side is in [cloud-rail.md](../shell/cloud-rail.md).
