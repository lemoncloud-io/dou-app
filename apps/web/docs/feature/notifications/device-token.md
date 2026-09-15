# device-token — the shell adapter that hands a push token to the runtime

A push can only reach this install once its device token is registered with the broker. The token
itself is native property: only the shell can ask FCM or APNs for one. This document covers the two
files in `apps/web` that bridge that gap, and nothing else — **the registration policy is not the
app's**, it belongs to [`@chatic/app-runtime`](../../../../../libs/app-runtime/docs/push/README.md)
and is canonical there.

## Layout

```text
apps/web/src/app/bridge/
├── GlobalBridgeListener.tsx          mounts the hook app-wide, above the router
├── useDeviceTokenRegistration.ts     the shell delegate — 2 pieces of shell knowledge, nothing else
└── appBridge.ts                      `fetchFcmToken`, `fetchPreference`, `savePreferenceConfirmed`
```

Two source files and one test (`useDeviceTokenRegistration.test.ts`). There is no
`DebugPushPage.tsx` and no `/debug/push` route to open: verification lives in the debug overlay's
Push screen — see [debug](../debug/README.md).

## Responsibilities

| Layer                 | What it decides                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `apps/web` (this doc) | How a token is obtained, which platform string to send, and where the durable record can be mirrored                       |
| `@chatic/app-runtime` | Whether to register at all: auth gating, once-per-install dedup, the record's shape and storage, the retry floor, the call |

The split is an inversion, the same one the socket auth delegate uses: the runtime never learns what
a shell is, and the shell never learns the policy. Outside a native shell the delegate is `null` and
the runtime hook is a no-op — a plain browser tab registers nothing.

## What the app supplies

```ts
// apps/web/src/app/bridge/useDeviceTokenRegistration.ts
const platform = window.CHATIC_APP_PLATFORM;
if (!platform) return null; // plain browser → the runtime hook is a no-op

return {
    fetchDeviceToken: () =>
        appBridge
            .fetchFcmToken()
            .then(r => r.data?.token ?? null)
            .catch(() => null),
    platform,
    application: 'chatic',
    nativeRecordMirror,
};
```

Four fields, and each one is a decision:

- **`fetchDeviceToken`** is the whole reason this adapter exists. A rejected fetch resolves to `null`
  rather than throwing — a denied permission prompt is an ordinary outcome, and the runtime retries
  on the next trigger.
- **`platform`** comes from the injected `window.CHATIC_APP_PLATFORM`. Shell globals are written
  before the web app boots, so the `useMemo` has no dependencies and resolves once.
- **`nativeRecordMirror`** is a durable home for the runtime's record, reached through the
  `pushRegistration` preference. Both halves are best-effort by design, for the reason below.
- **`stage` is deliberately absent.** A mobile build carries its stage in the flavour's
  `google-services.json`, so the broker's default is the right project. Desktop is the shell where
  omitting it is a bug — the contract for that is in the
  [app-runtime push doc](../../../../../libs/app-runtime/docs/push/README.md).

`installId` is not passed either. The runtime resolves device identity itself through
`useDynamicDeviceId`, the same source the socket side uses, so passing a second one from here would
introduce a way for the two to disagree.

## The token does not arrive as a global

Only `CHATIC_APP_PLATFORM`, `CHATIC_APP_DEVICE_ID` and `CHATIC_APP_INSTALLATION_ID` are injected
into the WebView. `CHATIC_APP_DEVICE_TOKEN` is read by `@chatic/device-utils` but nothing writes it,
so **`useDeviceInfo().deviceInfo.deviceToken` is always empty**. Asking the bridge is the only way
to hold a token, and code that reads the global instead fails silently rather than loudly.

`deviceId` does arrive, but it is not the raw hardware id: the shell concatenates the Firebase
installation id onto it. That lookup is asynchronous, so a very early read can see the raw id alone.
`installId` (`CHATIC_APP_INSTALLATION_ID`) stays the raw id. The mobile side of that composition is
documented in [apps/mobile](../../../../mobile/README.md).

## The mirror is allowed to fail

The record decides whether `reg-dev` is called at all, so it has to outlive the WebView's own
storage — a cache clear would otherwise read as "never registered" and re-register every device it
touched. The native `pushRegistration` preference is that second copy.

Writes go through the shell's bridge allowlist. An app build whose allowlist predates the key
refuses the write with `PREF_KEY_NOT_WRITABLE`, and reads are not allowlisted at all, so they come
back empty. **The web bundle deploys ahead of the app, so a refused mirror is the normal state right
after a release.** Both outcomes are swallowed; the runtime keeps its web-storage copy and behaves
exactly as it does without a mirror. Treating either as an error would turn a routine deploy window
into a flood of reports.

## Where it is mounted

`GlobalBridgeListener` — rendered once in `app.tsx`, outside the router. The hook needs no route
context, and mounting it above the router means a push token is registered on a login that happens
on any screen. The same listener owns the device-info update reaction and the foreground
resume-overlay dismiss; nothing else.

Mounting is the app's choice rather than the runtime's, because the delegate needs shell context
that a zero-argument host cannot supply.

## Notes for implementers

- `POST /users/0/reg-dev` is built by `libs/http`'s `users` gateway and reached through the
  runtime's mutation. The app never calls it directly — the debug screen's check is the one
  exception, and it goes through the same runtime mutation so that it confirms the record
  production actually writes.
- **There is no read-only "is my device registered" endpoint.** Confirming registration means an
  idempotent re-register and reading `User.endpoint` / `registeredAt` off the response, which can
  update server state. That is what the debug overlay's Push screen does.
- A delegate whose identity changes every render will not re-subscribe to token changes; the runtime
  reads `subscribeTokenChange` once on mount.

## Further reading

- [app-runtime push](../../../../../libs/app-runtime/docs/push/README.md) — the registration policy,
  the record's two tiers, the triggers, and the endpoint-recovery trade it accepts
- [notifications](./README.md) — what happens to a push once it arrives
- [debug](../debug/README.md) — the overlay screen that checks registration on a real device
- [apps/mobile](../../../../mobile/README.md) — permission prompts, token issuance, notification
  channels
