# push-verification — proving the push pipeline on a device

Server → FCM/APNs → native shell → WebView is four hops, and a push that never arrives gives the
same symptom at every one of them. This is the on-device procedure that narrows it down, using two
screens of the debug panel: **Push** and **Device Info**. It answers three questions in order —
which device am I, is its token registered on the server, and does a push actually land.

Both screens are marked `requiresShell`, so the panel refuses to render them in a plain browser.
That is not a limitation to work around: a browser has no push token, and there is nothing here to
verify without the shell.

## Preconditions

- Running inside the **native app**, iOS or Android.
- Notification permission granted.
- **Signed in** — registration is an authenticated call.
- Debug mode unlocked. On LOCAL/DEV the stage rule opens the panel for you; otherwise it is the
  10-tap plus entry code described in the [README](./README.md#the-gate-is-a-gesture-and-a-code-and-it-fails-closed).

## 1. Which device am I

The **Device Info** screen lists six rows, each tappable to copy: Device ID, Install ID, Platform,
Model, Stage, Application. They come from the globals the shell injects, so an absent field renders
as `-` rather than throwing.

`Device ID` is `deviceInfo.uniqueDeviceId` on its own. **The push token is deliberately not here** —
the shell never injects it as a global, so it can only be fetched over the bridge, which is what the
Push screen does.

## 2. Is the token registered on the server

Push screen → **Server Registration** → `Check`.

1. `FetchFcmToken` over the bridge returns the live token, shown in the `Token` row.
2. That token is sent to `register-device` with `force: true`.
3. The response is summarized: `Registered on server` or `Not registered`, plus `Endpoint` (the SNS
   ARN), `Registered` (a timestamp) and `Status` when the server supplies one.

**This check writes.** The backend exposes no read-only lookup, so the only way to ask "is this
token registered" is an idempotent re-registration — the same call production makes. It can refresh
server state; it cannot corrupt it.

It also uses the same identity production uses: `useDynamicDeviceId()` supplies `deviceId` and
`firebaseInstallationId`, so the record this confirms is the record the app actually writes.
The `state` line reports where the run stopped:

| `state`     | Meaning                                                       |
| ----------- | ------------------------------------------------------------- |
| `no-native` | opened outside the app shell — there is no token to find      |
| `no-token`  | the shell returned none: permission denied, or not issued yet |
| `checking`  | the register call is in flight                                |
| `done`      | the server answered; read the summary                         |
| `error`     | the call threw; the message is printed below the rows         |

## 3. Does a push land

**Send** one from the backend push API or the Firebase console, addressed to the token copied in
step 2. Where it arrives depends on the app's state:

| App state            | Path                                    | Where to look                        |
| -------------------- | --------------------------------------- | ------------------------------------ |
| Foreground           | native → bridge `OnReceiveNotification` | Push screen, **Received** section    |
| Background or killed | OS banner → tap → bridge `OnNavigate`   | the banner, then the screen it opens |

The Received list is in-memory and holds the **last 20** foreground pushes (`useReceivedPushLog`).
It starts empty on every panel mount and is not written to the log buffer, so a push received before
the screen was opened leaves no trace here.

What happens after a tap — turning the payload into a route, and holding it until the router is
ready — belongs to `app/bridge/navigation/`; see [notifications](../notifications/README.md).

### Reproducing a push without a server

The Push screen's operations row drives the shell directly: delete the FCM token, request
notification permission, raise a local notification, read or zero the badge count, and **reproduce a
push tap**. The last one calls `openURL` with the app's own scheme, so the OS hands the URL back as
an inbound deeplink — the same round trip a real tap makes. The scheme is resolved per build by
`buildAppDeeplink`, never written literally, because a dev build registers a different one and a
hardcoded scheme would open the other channel's app on a device that has both.

Operations that answer are labelled with their result; `openURL` and `setBadgeCount` are fire-and-forget
posts and say so instead of implying a reply.

## Troubleshooting

| Symptom                                      | Likely cause                                                                                       |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `Token` shows `(not fetched)`, or `no-token` | Notification permission denied, or the token has not been issued yet. Check OS settings.           |
| `no-native`                                  | Opened in a browser. The screen only works inside the app.                                         |
| Banner arrives, Received stays empty         | The app was not in the foreground — that is the banner path, and it does not reach this list.      |
| Registered, but nothing arrives              | Check `Endpoint` is not empty, then compare the token you sent against the one in the `Token` row. |
| Banner text renders as `{0}` on iOS          | `loc_args` substitution failed in the iOS notification service extension.                          |

## Further reading

- [README](./README.md) — the gate, the panel, and the rest of the catalogue.
- [notifications](../notifications/README.md) — device token registration in production, and push
  tap routing.
- [architecture/bridge.md](../../architecture/bridge.md) — the single native ↔ web message seam.
