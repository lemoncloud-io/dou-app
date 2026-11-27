# @chatic/host-mobile

**The shell side of the host capabilities in a React Native app.** When a web page inside the app
asks the host for something only the device can do — copy to the clipboard, pick a photo or a document,
read contacts, ask a permission, open the SMS composer, preview a link, follow a deep link, change the
app icon, check the store version, report a native error — a bridge handler in the app calls one of
these services ([ADR-0375](../../../docs/adr/0375-platform-implementations-live-in-libs-as-families-of-one-port.md)).
The web page asks through the bridge messages in
[`@chatic/bridge-messages`](../../bridge-messages/README.md); these services do the work.

Tags: `layer:adapter` · `platform:mobile` · `formfactor:any`.

```ts
import { ClipboardService, DeviceService, DynamicAppIconService } from '@chatic/host-mobile';
import { CUSTOM_SCHEMES, resolveDeepLink } from '@chatic/host-mobile/links';

const device = new DeviceService(logger);
const appIcon = new DynamicAppIconService(logger, keyValueStore, nativeIconSwitcher);
```

The mobile app builds every service once in `apps/mobile/src/app/services/provider.ts` and hands in
what is its own: the logger, its key-value store, and its native modules (`AppIconManager` for the
icon, `AppRestart` for the reload, Crashlytics for the previous-run crash). Crashlytics comes in from the app rather than
being imported here: the mobile app resolves its own `@react-native-firebase/crashlytics`, a different
version from the one the workspace root carries, and a library under `libs/` would load the root's
against the app's native module. An app that installs this package lists the native SDKs below in
its own `package.json` so React Native autolinks them.

| Export                                                                      | Does                                                                                    | Native SDK                                                                             |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `ClipboardService(logger)`                                                  | writes text                                                                             | `@react-native-clipboard/clipboard`                                                    |
| `DeviceService(logger)`                                                     | photo and camera picking, document picking, contacts, the share sheet, opening Settings | `react-native-image-picker`, `@react-native-documents/picker`, `react-native-contacts` |
| `PermissionService(logger)`                                                 | `check`, `status`, `request`                                                            | `react-native-permissions`                                                             |
| `SmsService(logger)`                                                        | opens the composer with recipients and body                                             | React Native `Linking`                                                                 |
| `UnfurlService(logger)`                                                     | fetches a link's `og:` tags behind a public-host guard                                  | —                                                                                      |
| `VersionService(logger)`                                                    | the store's live version, cached, and opening the store page                            | `react-native-device-info`                                                             |
| `DynamicAppIconService(logger, store, switcher)`                            | lists, reads and changes the app icon, remembering the choice in `store`                | the app's own icon module, as `switcher`                                               |
| `DeepLinkManager(logger)` · `DeeplinkService(manager, logger)`              | the cold-start URL, later URLs, and their resolution into a route or a push-tap path    | React Native `Linking`                                                                 |
| `PendingReportQueueService()`                                               | error reports waiting for the web to collect them                                       | `react-native-mmkv`                                                                    |
| `installNativeErrorDetection(deps)` · `checkCrashOnPreviousExecution(deps)` | queues uncaught JS errors, unhandled rejections and a crash of the previous run         | the app's Crashlytics and promise tracker, as `deps`                                   |
| `createAppRestart(deps)`                                                    | reloads the JS context and leaves the next one a note of why                            | the app's own reload module, as `deps.reload`                                          |

**`@chatic/host-mobile/links` loads no native SDK but `react-native-config`.** It holds the deep-link helpers
(`resolveDeepLink`, `CUSTOM_SCHEMES`, `DEEP_LINK_DOMAINS`, `isChannelRoomPath`, …) so the WebView's URL
trust check and the router can use them without pulling the picker or contacts SDKs into
their module graph. The custom scheme (`chatic` or `chatic-dev`) is read from `react-native-config`'s
`VITE_ENV`.

**The link and store-URL helpers still come from `@chatic/shared`**, which is tagged `platform:web`.
Every import of this package therefore carries an `@nx/enforce-module-boundaries` exception with its
reason, until those helpers move to a platform-free package.

How each service behaves where the reason is not visible in the code (permission states, the SMS URL
per platform, the unfurl guard) is in
[`apps/mobile/docs/native/device-services.md`](../../../apps/mobile/docs/native/device-services.md);
the restart note in [`apps/mobile/docs/native/`](../../../apps/mobile/docs/native/README.md); error
reports in [`apps/mobile/docs/native/logging.md`](../../../apps/mobile/docs/native/logging.md).
