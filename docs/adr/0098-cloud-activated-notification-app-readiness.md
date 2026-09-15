# ADR-0098: Get the app ready to receive cloud-activated notifications

> Status: Accepted · Decided: 2026-09-07

## Context

The server (`chatic-backend-api`) is starting work to fire a notification to the owner the moment a
cloud resource's provisioning axis moves from `reserved` to `active` (their spec:
`specs/cloud-ready-push`). Delivery is handed to `chatic-sockets-api`'s single-delivery mechanism,
which splits into **websocket if connected, push otherwise.**

| Path      | Envelope                                          | Content                                                                                                                                                         |
| --------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Push      | —                                                 | `type: 'cloud'` · `title_loc_key: 'push_cloud_activate_title'` · `title_loc_args: [name \|\| id]` · `data: { cid, uid }`. No `loc_key`, `link`, or `channel_id` |
| Websocket | `type: 'cloud.activated'` · `subject: cloud:<id>` | `data: { id, name }`                                                                                                                                            |

The canonical spec lives in vault's `dou-app/push-payload`, confirmed by the app team. The server
does not change this spec. But **the app has not yet adopted that confirmed spec**, so if the
server deploys first, notifications break or misbehave. Gaps found by inspecting the code:

1. **The translation key exists nowhere.** `push_cloud_activate_title` is empty in all five
   locations — `libs/i18n-mobile/src/locales/{ko,en}.ts`,
   `apps/mobile/android/app/src/main/assets/locales/{ko,en}.json`,
   `apps/mobile/ios/assets/locales/{ko,en}.json`,
   `apps/mobile/ios/ChaticNotificationServiceExtension/{ko,en}.json`. When the Android FCM service
   and the iOS Notification Service Extension can't find a key, they render the key string itself
   in the banner, so the literal `push_cloud_activate_title` shows up on the lock screen.
2. **A dead key already occupies that slot.** `notification.cloud.sync_complete` ("Cloud '{0}'
   creation complete") sits in the same five locations, and 0 code references it. The canonical
   doc itself notes that nested `notification.*` keys are a leftover from before the naming
   convention.
3. **Foreground gives a false positive.** `CloudPushMarkRunner` doesn't look at the push's `type`
   at all — it only looks at `cid` — and lights up the cross-cloud unread dot (ADR-0056). Since a
   cloud-activation push carries the new cloud's `cid`, **an "unread" dot lights up on a cloud that
   was just created.** The background path is already closed off — Android has the
   `isChatChannel(channelId)` gate, and iOS has `appendPushMarkIfNeeded` inside
   `applyBadgeIncrementIfNeeded`'s chat gate. Only the foreground bridge is open.
4. **Tapping has no destination.** With `link` empty, `resolvePushTapPath` returns `null`, and a
   tap only brings the app to the foreground. The canonical doc says "an empty `link` means root,"
   but the code doesn't go to root — the doc and the code disagree here.
5. **Nobody listens for the websocket event.** No subscriber for `cloud.activated` exists anywhere
   in app or web. The server spec says "if the app doesn't know the type, the websocket delivery is
   dropped and only the push survives," but in practice, the delivery layer **skips the push while
   connected.** A user with the app open receives nothing at all.

Three constraints narrow this decision.

- **C1.** The copy, payload, and channel spec are owned by the canonical document. The app only
  adopts that spec.
- **C2. The app must ship before the server sends.** An older app without the translation key would
  see the literal key.
- **C3.** Web i18n comes from a remote resource (`i18next-xhr-backend`). In-app banner copy has to
  land in that outside-this-repo i18n server first — a different lineage from the native shell
  locale (`apps/mobile/src/app/utils/i18n/locales`, native assets).

## Decision

Get the app into a "can receive it" state before the server sends. Four things.

### 1. Land the translation key, and remove the dead one

Add `push_cloud_activate_title` to all five locations above, with the confirmed copy exactly as
given — Korean `{0} 클라우드가 준비되었습니다`, English `{0} is ready`. In the same change, remove
`notification.cloud.sync_complete`, which has zero references, from all five.

**Missing even one breaks the copy only on that path.** The five locations are five different
consumers — native shell UI, type reachability, Android push assembly, the iOS app, and iOS push
assembly. The iOS Extension locale files also need to be added to the Extension target's Copy
Bundle Resources.

### 2. Gate against the foreground false positive

Change `CloudPushMarkRunner`'s foreground handler so it only lights up the dot for chat pushes. The
data to judge with is already reaching the web — `useFcmHandler` already carries an Android
foreground event's `type` through as `data.type`, and on iOS the top-level `type` in the APNs
`userInfo` already comes through as-is.

**The gate is "chat passes," not "cloud is blocked."** Future notification types should be blocked
automatically — a deny-list that has to be extended every time a new type appears is easy to
forget.

The background path is untouched. It is already inside the `isChatChannel` gate, so the same rule
already holds there.

### 3. Tap goes home

Pin the push tap destination to home (`/`). This makes the code actually follow the canonical
doc's "if `link` is empty, go to root." It does not switch to that cloud — planning confirmed the
destination should be home, and switching cloud runs into the app's other rules (session handshake,
context switching).

### 4. Pin `cloud.activated` to a slot-scoped subscription on the relay slot

Add a **slot-scoped subscription** to `SocketManager`, and bind `cloud.activated` to the relay
slot. On receipt, it does two things — **invalidate the cloud list cache** (`cloudsKeys.all`) and
**show an in-app banner.**

**Pinning to relay is the crux.** `SocketManager.onType()` today only binds to the active slot, and
active is "cloud if there is one, relay otherwise." But this unicast goes out with
`targetType: 'user'`, **from the relay-server deployment.** So subscribing on active would **miss
it whenever the user is inside a cloud** — which is exactly the typical situation of adding a
second or third cloud. Since both slots stay attached at the same time
(`entries: Map<SocketKind, ClientEntry>`), the relay client is still alive at that point.

The new subscription follows the same ownership rule as the existing `onType` — the manager owns
the entry, and reattaches it whenever the slot rebinds. Instead of reacting to active-slot
switches, it reacts to the **relay slot rebinding.**

The banner does not switch to that cloud when tapped — its destination is kept consistent with the
push tap (decision 3).

### Scope

**In:** the four items above.
**Out:**

- The server's send side, delivery, and push transmission (`chatic-backend-api`,
  `chatic-sockets-api`, `chatic-pushes-api`)
- Retries and dead-lettering — neither exists anywhere in the delivery path
- Come-back, setup-failure, deletion-complete, and expired-inactivity notifications — planning
  hasn't decided yet
- Badge/unread reflection for cloud notifications — keeps the existing decision that this is
  chat-channel only
- Per-type layout branching in the in-app banner card (see Alternatives below)

## Alternatives

- **Ignore the websocket event and prepare push only** — since the delivery layer skips push while
  connected, a user with the app open would get nothing. The assumption that "the connected user's
  experience can't get worse than it already is" — which is what this alternative would leave
  unsolved for the disconnected case it was meant to fix — turned out false. Rejected.
- **Use today's active-slot `onType` as-is** — shorter code, but misses the most common case: adding
  another cloud while already inside one. Rejected.
- **Have the server unicast to both the relay and the active cloud** — smaller app change, but
  creates a dependency on another repo and requires building new duplicate-suppression for the same
  notification arriving twice. Rejected.
- **Switch to that cloud on tap** — technically possible since `data.cid` exists. But planning
  confirmed the destination should be home, and the canonical doc's copy is written on that premise
  ("since tapping doesn't switch to that cloud, the title has to say which cloud it is"). Rejected.
- **Add per-type branching to the in-app banner now** — the canonical doc lists this as a follow-up
  item. But checking the code shows `useInAppPushMessage`'s two suppression rules (self-echo by
  `ownerId`, current room) silently become no-ops for cloud pushes, and it harmlessly renders as a
  title-only card with no click target. Not worth splitting apart something that isn't broken.
  Rejected — the doc is the stale side here.
- **Reuse `notification.cloud.sync_complete`** — already sits in all five locations with similar
  meaning. But it differs from the confirmed key name and copy ("creation complete" vs. "is
  ready"), and nested keys are a pre-convention leftover. The server only sends the confirmed key.
  Rejected.

## Consequences

**What is gained**

- The moment the server deploys, notifications land with correct copy. The app side stops being the
  bottleneck.
- Both connected and disconnected cases are covered — websocket and push fill in each other's gaps.
- The false-positive unread dot on a new cloud disappears, and future notification types are
  automatically blocked by the same gate.
- Five dead keys disappear.

**Trade-offs**

- **`SocketManager`'s public API grows.** A slot-scoped subscription has different rebind rules
  from an active subscription, so the two subscription styles now coexist. Which one to use becomes
  a judgment call for the caller.
- **Deployment order becomes a constraint.** If the server turns on sending before this build has
  propagated through app-store review, older-version users see the literal key. This has to be
  coordinated with the server team, and it runs opposite to this repo's usual convention of web
  deploying before the app.
- **In-app banner copy depends on outside this repo.** Since web i18n is a remote resource, a
  change in this repo alone won't produce the banner copy (C3).
- **The websocket envelope's type string stays server-owned.** Since the app hardcodes the string
  `cloud.activated` to subscribe, a server rename silently breaks it. The contract isn't enforced by
  types.
- **If the relay deployment ever gets a cloud identifier configured, push is rejected outright.**
  A server-side open item that the app cannot guard against. In that case only the websocket path
  survives.

> **Later change (2026-09-14).** The shell locale moved from `libs/i18n-mobile` to
> `apps/mobile/src/app/utils/i18n/locales` — since `apps/mobile` was its only consumer, the library
> boundary was removed. The four-file structure and the `localeParity.test.ts` comparison are
> unchanged. The `libs/i18n-mobile/...` paths in the Context above reflect the investigation date
> (2026-09).

## References

- Server spec — `chatic-backend-api/specs/cloud-ready-push` (high-levels, SPEC, PLAN)
- Canonical spec — vault `dou-app/push-payload`
- App push architecture — [apps/mobile/docs/push.md](../../apps/mobile/docs/push.md)
- Cross-cloud push mark — [ADR-0056](0056-place-cloud-unread-dot-from-cache-and-push.md)
