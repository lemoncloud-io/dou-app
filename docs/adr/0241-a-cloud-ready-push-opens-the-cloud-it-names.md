# ADR-0241: A cloud-ready push opens the cloud it names

> Status: Accepted · Decided: 2026-10-27
> Scope: `apps/mobile/src/app/services/deeplinks/deeplinkUtils.ts` ·
> `apps/mobile/android/app/src/main/java/io/chatic/dou/push/ChaticFirebaseMessagingService.kt` ·
> `apps/web/src/app/bridge/navigation/usePushNavigate.ts` · the `push_cloud_activate_title` copy in the
> mobile locales · `apps/web/public/locales/*/translation.json` (`notifications.cloudActivated.title`)
> Supersedes: decision 3 ("Tap goes home") of
> [ADR-0098](./0098-cloud-activated-notification-app-readiness.md), and the copy decision 1 gave the
> title. The rest of that record — the slot-scoped `cloud.activated` subscription, the cache
> invalidation, the banner that renders only when its key resolves — stands.

## Context

When a cloud finishes provisioning, its owner gets one notification: `cloud.activated` over the
relay socket when connected, a push otherwise. The push carries no `link`, only `data: { cid, uid }`.
ADR-0098 sent its tap to the root of whatever cloud was open, because planning had then set the
destination as home and a cloud switch brings the session handshake and context-switch rules with it.

The product requirements now say otherwise: the notification reads `[클라우드 알림] <cloud name> 생성이
완료되었습니다.`, and tapping it goes to the cloud that was created. Landing on the root of the cloud
already open tells the owner nothing the title did not, and makes them find the new cloud in the
switcher themselves. The requirements also say what happens when that cloud is gone by the time of
the tap: no move, and an error.

Two facts made this cheap. The web already reads `?cid=` on any push path and switches to that cloud
before landing (`usePushNavigate`), so `/?cid=<cid>` is a route the app already understands. And the
in-app banner's key, `notifications.cloudActivated.title`, had never been added to either web bundle,
so the banner ADR-0098 built had never shown — fixing the copy fixes that too.

## Decision

1. **The tap opens the named cloud.** `resolvePushTapPath` turns a linkless `cloud` push into
   `/?cid=<cid>`, carrying the cloud only — not a place or a chat, since the push is about the cloud.
   With no `cid` it is still the bare root. An Android tap with the app in the background or closed
   never reaches that function — the native service puts the scheme root on the intent itself — so
   `rootTapLinkFor` adds the same cloud there (`<scheme>://?cid=<cid>`), which `resolveDeepLink`
   reads as `/?cid=<cid>`.
2. **A failed switch into that cloud does not land.** Every other push lands best-effort after a
   failed switch, so a switch failure never strands the reader. For a push whose whole destination
   is another cloud's root, landing would show the cloud the reader was already in as if it were the
   one the push named. `usePushNavigate` stays where it is and shows the switch-failed toast instead.
   The same holds when the socket never verified for the switch to run — the usual way a cold start
   from a closed app fails. Only a place switch failing after the cloud switched stays best-effort.
3. **The push title and the banner say one sentence.** `[클라우드 알림] {0} 생성이 완료되었습니다.` in
   all four mobile locale sets, and the same with `{{name}}` in both web bundles. The product's push
   draft also names the brand in that line; it is left out, so the push and the in-app copy match.
4. **The server payload does not change.** The destination is built from the `cid` the push already
   carries, rather than asking the server to add a `link`.

## Alternatives

- **Ask the server for a `link`.** It would move the destination's definition to the sender, where
  it belongs for chat pushes. It was not taken because it needs a server release for something the
  client can derive from a field it already has, and the push's other consumers would see a new field.
- **Land best-effort as before, then toast.** The reader would end on a screen that looks like an
  answer to the tap and is not — the old cloud's home under a "could not switch" toast. Staying put
  makes the toast the only thing that changed.
- **Check the catalog for the cloud before switching.** It catches a released cloud before any switch
  begins, but it is a relay read on every cloud-push tap, and a cloud present in the catalog can still
  fail to switch. The switch's own failure covers both.
- **Give the banner the same tap.** The banner reaches an owner who is already in the app, where the
  switcher shows the new cloud as ready; moving them on a toast they did not tap was not asked for.

## Consequences

- The copy lives in the native bundles, and the Android background tap is native code, so both reach
  users only with a native release. The iOS tap's path (`resolvePushTapPath`) is in the mobile JS
  bundle. The web banner and the web's handling of `/?cid=` ship with a web deploy.
- An app built before this change keeps sending the tap to `/`, and the web lands on the root as it
  did.
- `resolvePushTapPath` and `usePushNavigate` now both have to agree that `/` plus `cid` means "this
  cloud's main screen". The web side keys on the target being exactly the root.
