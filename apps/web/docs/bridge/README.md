# bridge — the app-side seam over `@chatic/bridges`

> Scope: `apps/web/src/app/bridge/` (21 files). The transport itself — `webClient`, readiness
> polling, timeouts, the message vocabulary — is [`@chatic/bridges`](../../../../libs/bridges/README.md);
> this document covers only the wrapper this app builds on top of it.

`app/bridge/` is the one place in `apps/web` that touches `@chatic/bridges`. No feature imports
`webClient`, `appBridge`, or `isNative` from anywhere else — a feature that needs the native shell
goes through this folder's hooks.

```bash
grep -rln "from '@chatic/bridges'" apps/web/src/app/features --include='*.ts' --include='*.tsx'
```

This document is also the index for the category. Two subjects are large enough to own their own
file, and both are bridge code rather than feature code — there is no `features/notifications/`
folder:

| Document | Owns |
| --- | --- |
| [push-navigation.md](./push-navigation.md) | Where a tapped push lands — path handover, session state, and the back stack |
| [device-token.md](./device-token.md) | The shell adapter that hands a push token to `runtime.push`, and its native mirror |

## Outbound: `appBridge`

`appBridge` (`appBridge.ts`) wraps every `webClient.post`/`webClient.request` call the app makes —
53 methods, one per native capability (FCM tokens, OAuth, camera, clipboard, purchases, config
mirrors, and more). A feature calls `appBridge.openURL(url)`, never `webClient.post({ type:
'OpenURL', ... })` directly — that keeps the message-type strings and payload shapes in one file.

| Pattern                  | Shape                       | When                                                                         |
| ------------------------ | --------------------------- | ---------------------------------------------------------------------------- |
| Request (native replies) | `await appBridge.method()`  | `fetchFcmToken`, `oAuthLogin`, `getContacts`, `fetchPreference`, …           |
| Fire-and-forget          | `appBridge.method()` (void) | `openURL`, `setBadgeCount`, `savePreference`, `notifyWebAppReady`'s siblings |

## Inbound: `useHandleAppMessage` and `GlobalBridgeListener`

`useHandleAppMessage(type, handler)` (`useHandleAppMessage.ts`) subscribes to one native→web push
event through `webClient.onEvent`; every `useOn<EventName>` hook in that file (18 of them —
`useOnNavigate`, `useOnPurchaseSuccess`, `useOnFetchFcmToken`, …) is a typed alias over it. It is
push-only: a request/response exchange goes through `appBridge`, never through one of these hooks.

`GlobalBridgeListener` (mounted once in `app.tsx`) is where the app-wide subscriptions live:
`useDeviceTokenRegistration()`, the `OnUpdateDeviceInfo` listener that feeds the version-check
store, and `useAppForeground` for dismissing the native resume overlay. A feature-local push (e.g. a
purchase result inside `useSubscriptionIap`) subscribes directly with its own `useOn*` hook instead
of routing through this component.

## Foreground detection

`useAppVisibility` (`useAppVisibility.ts`) merges two independent signals — the native
`OnBackgroundStatusChanged` message and the web `visibilitychange` event — because a plain browser
tab never gets the native message and a suspended WebView can miss `visibilitychange`. Same-direction
repeats within a 1s window are collapsed; `useAppForeground` is the filtered "came to foreground
only" view most callers use.

## The Purchase exception

Every other outbound call resolves through its own request/reply. `Purchase` cannot: the native
shell answers with `OnPurchaseSuccess` / `OnPurchaseError` push events instead, arriving on their own
timing relative to the store checkout flow. `appBridge.purchase()` is therefore `void`, and
`useSubscriptionIap` (`features/subscription/hooks/`) holds a `purchaseResolverRef` that the two push
handlers resolve or reject — turning an event pair back into the `Promise` the call site needs.

## Device token registration

Summarised here; the file-level detail is [device-token.md](./device-token.md). Registration policy (auth gating, once-per-install dedup, retry) lives in `@chatic/app-runtime`'s
`runtime.push`. `useDeviceTokenRegistration.ts` supplies only the three pieces only this shell can:
the FCM token fetch (`appBridge.fetchFcmToken()`), the platform read off
`window.CHATIC_APP_PLATFORM`, and a native-side mirror of the registration record
(`appBridge.fetchPreference` / `savePreferenceConfirmed`) so a WebView storage clear cannot look like
a fresh install. Outside the native shell `CHATIC_APP_PLATFORM` is unset, the delegate is `null`, and
the runtime hook is a no-op.

## Without a native shell

`isNative()` (from `@chatic/bridges`) is false in a plain browser tab, and every `appBridge` request
call rejects `NATIVE_NOT_SUPPORTED` after its timeout instead of resolving. A caller that can avoid
paying that wait branches on `isNative()` first rather than calling through and catching.

## Related

- Preference read/write over the bridge (`FetchPreference`, `PreferenceLoader`) is
  [stores.md](../state/stores.md).
- The web→native log relay (`setupBridgeLogger`) is [logging.md](../observability/logging.md).
- Push-tap routing (`app/bridge/navigation/`) is [push-navigation.md](./push-navigation.md).
