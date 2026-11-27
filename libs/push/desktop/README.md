# @chatic/push-desktop

**Push for an Electron main process: the FCM registration, the device token and the incoming pushes.**
It registers as an Android-style FCM client through `@liamcottle/push-receiver` and holds the mtalk
socket in-process, so there is no OS push daemon. An app that does not push installs none of it
([ADR-0375](../../../docs/adr/0375-platform-implementations-live-in-libs-as-families-of-one-port.md)).

Tags: `layer:adapter` · `platform:desktop` · `formfactor:any`.

```ts
import { awaitFcmToken, startPush } from '@chatic/push-desktop';

startPush(fcmConfig, {
    onToken: token => pushFcmToken(host, token), // the app relays it to the web
    onPush: push => pushFcmMessage(host, push),
});
const token = await awaitFcmToken(); // '' after 30 s with no registration
```

The app hands in the FCM config (it reads it from its own env) and what to do with a token and a push;
the bridge events, the IPC and the OS notifications stay in the app. The desktop app's wiring is
`apps/desktop/src/main/mainWindow.ts`, and the bridge side is described in
[`apps/desktop/README.md`](../../../apps/desktop/README.md). An app that installs this package lists
`@liamcottle/push-receiver` in its own `package.json` dependencies, so the bundler keeps it external and
the packager ships it.

| Export                        | Does                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `startPush(config, handlers)` | starts FCM once; a call with no `apiKey`, `senderId` or `appId` does nothing |
| `awaitFcmToken()`             | the token once registration lands, or `''` after 30 s                        |
| `FcmConfig`                   | `apiKey` · `projectId` · `senderId` · `appId` · `packageName`                |
| `FcmPush`                     | `title` · `body` · `deeplink` and the flattened `data` of one push           |

## Rules

- **Started only when configured.** A `prevent-app-suspension` assertion keeps the socket alive through
  macOS App Nap; it is taken only when FCM is configured, so unconfigured builds do not pay the battery cost.
- **Staying connected.** The library has no heartbeat and a half-open socket fires no `close`, with TCP
  keepalive taking about two hours. The socket therefore reconnects on a watchdog timer, on system resume
  and on window focus (throttled). Queued pushes replay on login and persistent ids dedupe them; the saved
  id list is capped at 100, since only unacknowledged pushes can replay and the list is re-sent on every
  connect.
- **Token freshness.** Google expires tokens minted through the unofficial endpoint, and the broker's
  endpoint bound to a dead token is disabled on its first rejected delivery. The token is re-minted every
  launch and on a 12 hour cadence, reusing the saved GCM identity (a full register churns the Android id
  and the socket), and `onToken` fires again with the new one. With no usable credentials the socket still
  comes up from the cached ones.
- **Credentials are best-effort.** They are saved as `chatic-fcm.json` under the app's `userData`; a failed
  write means a fresh register on the next launch.
- **The push is flattened** from the backend's nested `data.payload` and loc args; the receiver decides
  presentation.
