# @chatic/push-mobile

**Push for a React Native app: the device token, permission, Android channels, the badge and the
foreground and tap listeners.** Firebase Cloud Messaging (`@react-native-firebase/messaging`) carries
the token and the Android pushes, notifee creates the channels and sets the badge, and
`@react-native-community/push-notification-ios` delivers the iOS foreground and tap events. An app that
does not push installs none of them
([ADR-0375](../../../docs/adr/0375-platform-implementations-live-in-libs-as-families-of-one-port.md)).

Tags: `layer:adapter` · `platform:mobile` · `formfactor:any`.

```ts
import { NotificationService, PushEventManager, acquirePushToken } from '@chatic/push-mobile';

const notifications = new NotificationService(logger, {
    copy: { channelName, localize }, // the app's own words
    badgeMirror, // where the app mirrors the badge total for its native push receiver
    beforePrompt: () => splash.whenRevealed(),
});
const token = await acquirePushToken(notifications, Platform.OS);
```

An app that installs this package lists the three native modules in its own `package.json` so React
Native autolinks them. The mobile app's options are in `apps/mobile/src/config/families.ts`; how push
works end to end (the native receivers, the localized keys, the bridge relay) is in
[`apps/mobile/docs/push/`](../../../apps/mobile/docs/push/README.md).

| Export                                            | Does                                                                                               |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `NotificationService(logger, options)`            | permission, token, APNs registration, channels, badge, FCM and APNs listeners                      |
| `PushEventManager(logger)`                        | in-memory broker that hands a foreground push to every listener, one failure not stopping the rest |
| `acquirePushToken(notifications, os)`             | asks permission, then returns the APNs token on iOS and the FCM token elsewhere; throws if none    |
| `foregroundAPNsCopy(data, title, body, localize)` | the title and body of an iOS foreground push, built from its `loc_key`s                            |

## Options

| Option         | What the app hands in                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| `copy`         | `channelName(channel)` for the five Android channels, `localize(key, args, field)` for a push's `loc_key`s |
| `badgeMirror`  | `setBase(count)`, called after every badge write so a background push increments from the true total       |
| `beforePrompt` | awaited before an OS permission prompt that would actually show; defaults to nothing                       |

## Rules

- **Copy is read when it is used.** `channelName` runs when the channels are created and `localize` for
  each foreground push, so both follow the language in effect at that moment.
- **A silent push gets no copy**, and a push with no `loc_key`s keeps the APNs alert as it arrived.
- **The prompt waits only when it will show.** Android below 13 never prompts, and an answered
  permission never prompts again, so neither waits for `beforePrompt`.
- **Every listener clears the badge.** `onMessage`, `onNotificationOpenedApp` and
  `getInitialNotification` each set it to zero, in notifee and through the badge mirror.
- **Most failures read as nothing.** Channel creation, `getToken`, `deleteToken`, APNs registration, the
  badge calls and the cold-start lookup log the error and return `null`, `0` or nothing. `hasPermission`,
  `requestPermission` and `getAPNSToken` do throw, and `acquirePushToken` throws when it gets no token.
