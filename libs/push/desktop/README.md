# @chatic/push-desktop

**Push for a desktop Node process (the Electron main process or the dou-cli sidecar): the FCM registration, the device token and the incoming pushes.**
It registers as an Android-style FCM client through `@liamcottle/push-receiver` and holds the mtalk
socket in-process, so there is no OS push daemon. An app that does not push installs none of it
([ADR-0375](../../../docs/adr/0375-platform-implementations-live-in-libs-as-families-of-one-port.md)).

Tags: `layer:adapter` · `platform:desktop` · `platform:node` · `formfactor:any`. It imports no `electron`: what differs between hosts comes in as a `PushHost`.

```ts
import { awaitFcmToken, startPush } from '@chatic/push-desktop';

startPush(
    fcmConfig,
    {
        onToken: token => pushFcmToken(host, token), // the app relays it to the web
        onPush: push => pushFcmMessage(host, push),
    },
    { credentialsPath, onWake, onFocus, keepAwake } // the PushHost
);
const token = await awaitFcmToken(); // '' after 30 s with no registration
```

The app hands in the FCM config (it reads it from its own env), what to do with a token and a push,
and the host; the bridge events, the IPC and the OS notifications stay in the app. The Electron app's
host is `apps/desktop/src/main/pushHost.ts` and its wiring `mainWindow.ts` (bridge side:
[`apps/desktop/README.md`](../../../apps/desktop/README.md)); the sidecar's is
[`apps/dou-cli`](../../../apps/dou-cli/README.md#push). The Electron app lists
`@liamcottle/push-receiver` in its own `package.json` dependencies, so its bundler keeps it external and
the packager ships it; dou-cli bundles it and inlines the `.proto` files it loads.

| Export                              | Does                                                                                                     |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `startPush(config, handlers, host)` | starts FCM once; a call with no `apiKey`, `senderId` or `appId` does nothing                             |
| `awaitFcmToken()`                   | the token once registration lands, or `''` after 30 s                                                    |
| `FcmConfig`                         | `apiKey` · `projectId` · `senderId` · `appId` · `packageName`                                            |
| `FcmPush`                           | `title` · `body` · `deeplink` and the flattened `data` of one push                                       |
| `PushHost`                          | `credentialsPath` · `onWake(reconnect)` · `onFocus(reconnect)` · `keepAwake()` · `onError(stage, error)` |

## Rules

- **Started only when configured.** `keepAwake` runs only when FCM is configured, so unconfigured builds
  do not pay the battery cost; the Electron host takes a `prevent-app-suspension` assertion there to keep
  the socket alive through macOS App Nap.
- **Staying connected.** The library has no heartbeat and a half-open socket fires no `close`, with TCP
  keepalive taking about two hours. The socket therefore reconnects on a watchdog timer, at once on the
  host's `onWake` (system resume) and on its `onFocus` (window focus, at most once per 30 s). Queued pushes replay on login and persistent ids dedupe them; the saved
  id list is capped at 100, since only unacknowledged pushes can replay and the list is re-sent on every
  connect.
- **Token freshness.** Google expires tokens minted through the unofficial endpoint, and the broker's
  endpoint bound to a dead token is disabled on its first rejected delivery. The token is re-minted every
  launch and on a 12 hour cadence, reusing the saved GCM identity (a full register churns the Android id
  and the socket), and `onToken` fires again with the new one. With no usable credentials the socket still
  comes up from the cached ones.
- **Credentials are best-effort.** They are saved at the host's `credentialsPath` (the Electron app:
  `chatic-fcm.json` under `userData`); a failed write means a fresh register on the next launch.
- **Failures go to the host.** A failed start, token refresh, register, connect or periodic re-mint calls
  `onError(stage, error)`; a host without it gets the error object on the console. The sidecar logs the stage
  and the error code only, since an error can carry the request that held the config.
- **The push is flattened** from the backend's nested `data.payload` and loc args; the receiver decides
  presentation.
