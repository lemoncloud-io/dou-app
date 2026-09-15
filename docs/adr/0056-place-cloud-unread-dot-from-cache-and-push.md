# ADR-0056: Home unread dot — places from cache, clouds from push marks

> Status: Accepted · Decided: 2026-08-14

## Context

Home has no way to tell the user that a new message arrived somewhere they are not currently looking at.

- **Inactive places** (same cloud): [`HomePage.tsx:146-152`](../../apps/web/src/app/features/home/pages/HomePage.tsx)
  only fetches channels for the active site, so `unreadByPlace` has exactly one key. The comment already
  flags this: "a later step fills in cross-place totals a different way; other places show no dot in the
  meantime" — this ADR is that later step.
- **Other clouds**: the dot in [`CloudSessionSheet`](../../apps/web/src/app/features/home/components/CloudSessionSheet.tsx)
  is the **last cached state** read by `useOtherCloudUnread`. There is one socket per cloud, so messages
  that arrive while you are away from a cloud never reach the cache, and the dot never lights up
  (cross-cloud-push.md §1, which lived in the root docs tree that has since been removed).

The requirement is explicitly **presence, not a count**: "if a push landed for any site in any cloud, just
show a mark; the count refreshes once that place is visited." The active place keeps showing its existing
unread count.

### Facts used to reach the decision

- All three dot UIs already exist: `PlaceItem` (red dot, presence-only) · `CloudItem` · `InviteCloudItem`
  (`hasUnread`). Only the value never arrives.
- [`useChannelUnreads`](../../apps/web/src/app/hooks/useChannelUnreads.ts) already buckets by site
  (`byPlace[sid]`). Covering only the active place is an **input** problem, not a capability gap.
- [`useActiveCloudChannels`](../../apps/web/src/app/hooks/useActiveCloudChannels.ts) already observes
  channels for **every site in the active cloud**, cache-only, and `UnreadBadgeRunner` already uses it to
  compute the app icon badge. The cross-place narrowing (commit `bb00a041`) was about the cost of
  per-channel server sync, not about cache observation.
- Foreground push already reaches the web: [`useFcmHandler.ts:92-104`](../../apps/mobile/src/app/webview/hooks/useFcmHandler.ts)
  → `OnReceiveNotification` (the full `data` payload). What is missing is only a consumer that turns this
  into a dot.
- **Background/terminated push never reaches the web** — native handles only the banner and the badge
  ([push.md](../../apps/mobile/docs/push.md)).
- `apps/desktop-web` already ships this feature: `useCrossCloudPushBadge` (marks the cid on arrival, clears
  it once the cloud switch is confirmed) + `useCloudPushBadgeStore` (persisted) + `resolvePushCloudId`
  (reverse lookup for an empty `cid`, **only when the match is unique** — "no dot beats a wrong dot").
  desktop-web is off-limits to modify, but referencing and porting it is fine.
- Native shared storage already exists: iOS App Group `group.io.chatic.dou` (registered in both the app's
  and the NSE's entitlements, [badge.md](../../apps/mobile/docs/badge.md)) · Android
  [`BadgeStore.kt`](../../apps/mobile/android/app/src/main/java/io/chatic/dou/push/BadgeStore.kt)
  (SharedPreferences). Wherever the badge is incremented by +1 is exactly where a mark can be recorded too.
- Push payload: `cid` is in the spec but has variants — the relay sentinel `'#'` (ADR-0045) and an empty
  string (deployed backend, cross-cloud-push.md §0, root docs tree, since removed). **`sid` is not in the
  spec** — the code only reads it optimistically.
- Undercount bug: the unread formula in `apps/web` does not convert the read cursor to user-message scale
  (a violation of ADR-0048, already recorded there as a follow-up), and it errs **on the side of not
  showing the dot**.

## Decision

### 1. Place dots come from cache — push is not used for them

Change HomePage's input to `useChannelUnreads` from the active site's channels to **all channels in the
active cloud** (`useActiveCloudChannels`, cache-only). `byPlace` fills in for every site and the existing
dot on `PlaceItem` lights up. Freshness is handled by the existing 60-second cloud-wide delta
(`useBackgroundSync`) plus foreground resume — **zero added server requests, zero added sync
registrations**. The dot is presence-only, so this cadence is enough.

Why push is not used as a place-level signal: `sid` is not in the push spec. We do not hang a feature on a
field the spec does not define.

The active place keeps its unread count exactly as today. "Refresh on visit" is already the system's
default behavior (enter → channel/join sync → re-derive from cache).

### 2. Cloud dots come from push marks — port desktop-web

On receiving `OnReceiveNotification`, determine the source cloud and record a `Record<cloudId, true>` mark
(zustand + persist), clearing it once the **switch to that cloud is confirmed**. The resolution rule
follows desktop-web's `resolvePushCloudId`:

- `cid === '#'` → relay (ADR-0045 sentinel)
- `cid` valid → use it as is
- `cid` empty → reverse lookup across cross-partition cache (`$join.userId === data.uid` first,
  `channelId` as a fallback). **Mark only on a unique match** — a false-positive dot is worse than a
  missed one.
- Push that arrives for the active cloud is not marked (the socket already handles it).

The final value of the dot is `(cache hint from useOtherCloudUnread) OR (push mark)`.

### 3. Background arrivals are recovered through native marks

At the exact spot where the badge is incremented by +1 — iOS NSE's `applyBadgeIncrementIfNeeded`,
Android's FCM service background branch — also record the `cid` mark in the **existing shared storage**
(App Group UserDefaults / SharedPreferences). The same guards apply as today (chat channels only, no
foreground, no silent pushes). The web reads this via the bridge on boot and on foreground resume, merges
it into the web mark store, and clears the native side as soon as it is read (consume-once).

- The iOS App Group is already in both entitlements, so **no re-provisioning is needed.**
- Native code does not resolve `cid` — it stores the raw `cid` (including empty and `'#'`) as is, and
  resolution happens only at the web's single point (the rule in decision 2). We do not duplicate the
  normalization logic across three runtimes.

### 4. A second surface for the cloud dot

Add a dot overlay to the cloud-switcher button in the home header (`AppHeader`'s `onSwitcher`). The sheet
is invisible until it is opened, so a dot inside the sheet alone would not be discoverable
(cross-cloud-push.md §4 recommendation, root docs tree, since removed).

### 5. Fix the ADR-0048 undercount along with this

Bring `countUnread` in line with the formula by converting the read cursor to user-message scale. This
directly affects the dot's accuracy (in the direction of misses), and it is an existing follow-up, so it
is included in this scope.

**In scope:** apps/web (swap the data source · port the push mark store/hook · switcher-trigger dot ·
`countUnread` fix), apps/mobile (record marks in the iOS NSE and Android service, bridge to read/clear
marks), docs.

**Out of scope (follow-up):**

- **Place-level (sid) push marks.** Revisit once `sid` is added to the spec.
- **The Android foreground `channelId` clobber bug** ([`useFcmHandler.ts:123-133`](../../apps/mobile/src/app/webview/hooks/useFcmHandler.ts)
  overwrites the notification channel id with the chat channel id — this disables in-app banner
  dedup on Android). This feature only uses `cid`/`uid`, so it does not depend on that bug. Separate fix.
- Extracting a dot primitive (three inline duplicates today) — cosmetic.
- A server-side cross-cloud unread summary API.

## Alternatives

- **Server provides a cross-cloud unread summary** — most accurate, but needs a new backend API and is
  out of this track's scope. Rejected.
- **Re-register cloud-wide per-channel sync** (restoring the approach from commit `cb79954f`) — brings
  back the per-cycle server-request cost that `bb00a041` deliberately removed, one request per channel.
  That freshness is overkill for a dot. Rejected.
- **Drive place dots from push too** — `sid` is not in the push spec, so this would depend on an
  undocumented field. The cache path already resolves sid. Unnecessary. Rejected.
- **Accept the background limitation (no native marks)** — cheapest, web-only, but the other-cloud dot
  stays silent in the scenario users hit most (a push that arrives while they are not looking at the
  app). Rejected, given that the infrastructure (App Group · SharedPreferences) already exists and makes
  marking cheap.
- **Introspect the notification tray on resume** (read delivered notifications) — works without touching
  the NSE or the service, but the mark disappears if the user clears the notification, and tray access has
  permission and platform variance. Storage-based marks are already cheap. Rejected.
- **Sync counts instead of a dot** — the requirement is explicitly a dot. Other-cloud counts would be
  last-cached anyway, so the number would lie. Rejected.

## Consequences

**What is gained**

- Both inactive places and other clouds show a dot for new activity. Behavior parity with desktop.
- The place dot lights up at zero server cost — it reuses the cache observation the app badge already
  relies on.
- Background arrivals are recovered as a dot on resume. Same storage, same guards as the badge counter, so
  there is little room for the badge and the dot to disagree.
- The conservatism of the empty-`cid` reverse lookup (unique match only) structurally blocks
  false-positive dots.

**Trade-offs accepted**

- Native marks only take effect **after an app release**. Older shells fall back to foreground marks plus
  the last-cached hint (a graceful degradation).
- An empty `cid` with a failed reverse lookup (non-unique match) means no dot — an intended conservatism,
  but misses do occur.
- NSE and FCM service logic grows. Native code has no compile verification in CI, so a real device build
  check is required.
- The only way to clear a mark is "switch to that cloud." If a user sees the dot in the sheet and does not
  switch, the dot stays — this is the intended behavior of a presence indicator.
- Home's unread computation input grows from active site to the whole cloud. This is cache-only
  observation, so there is no network cost, but recomputation frequency on clouds with many channels is
  worth watching.
