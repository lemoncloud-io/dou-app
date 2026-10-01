# Push

This shell owns FCM/APNs permission, token registration, Android notification channels, the app-icon
badge, and relaying a foreground push to the WebView. Notification-tap navigation is not handled
here — it is delegated to the deep-link coordinator (`useDeepLinkNavigation`), so a tap and an OS
deep link share one `OnNavigate` owner. See [Click routing](#click-routing).

There is no JS `setBackgroundMessageHandler` and no offline push queue. Android background/killed
delivery is handled by the native `ChaticFirebaseMessagingService`; iOS background/killed banners are
localized by the native `NotificationServiceExtension`. iOS foreground and notification-tap APNs
events arrive through `PushNotificationIOS`.

A background chat push also increments the app-icon badge natively (the socket and the web are
suspended then), and the web re-aggregates the true count on the next foreground. That lifecycle
(foreground aggregation, background increment, resume reconcile) is covered separately in
[badge.md](./badge.md).

## Files

| File                                                               | Role                                                                                                                                                                                                 |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/App.tsx`                                                  | creates the Android notification channels at mount                                                                                                                                                   |
| `src/app/services/notification/NotificationService.ts`             | permission, token, APNs registration, channel creation, badge, FCM/APNs listeners                                                                                                                    |
| `src/app/utils/i18n/formatPushCopy.ts`                             | builds a banner's title/body from `loc_key`/`loc_args` for the iOS foreground path — see [Chat message body](#chat-message-body)                                                                     |
| `src/app/services/notification/PushEventManager.ts`                | in-memory foreground-event broker between OS/native events and the WebView bridge                                                                                                                    |
| `src/app/webview/hooks/useFcmHandler.ts`                           | WebView bridge handler for token, badge and push-mark requests, and the foreground push relay (`OnReceiveNotification`)                                                                              |
| `src/app/webview/hooks/useDeepLinkNavigation.ts`                   | single owner of inbound navigation: notification taps + OS deep links → `OnNavigate` (paths built by `resolvePushTapPath` / `resolveDeepLink` in `deeplinkUtils`)                                    |
| `src/app/bridge/BadgeSyncBridge.ts`                                | Android-only mirror of the web's true badge total, so a background push increments from it                                                                                                           |
| `src/app/bridge/PushMarksBridge.ts`                                | drains the cross-cloud push-mark records a background push wrote natively                                                                                                                            |
| `src/app/bridge/SharedLanguageBridge.ts`                           | copies the web's language choice to where the two push services read it — see [../system/language.md](../system/language.md)                                                                         |
| `android/.../push/ChaticFirebaseMessagingService.kt`               | Android FCM receiver: localizes copy in the pinned language else the device's, emits the foreground event, writes the badge/push-mark, merges `cid`/`sid` into the tap link                          |
| `android/.../push/BadgeStore.kt`, `PushMarkStore.kt`               | the shared-preferences badge counter and the push-mark ring buffer (cap 100), same file                                                                                                              |
| `android/.../push/LanguagePreferenceStore.kt`                      | the language choice the messaging service reads (its own `chatic_language` file)                                                                                                                     |
| `ios/Chatic/AppDelegate.swift`                                     | wires APNs callbacks to `RNCPushNotificationIOS`; suppresses the foreground system banner; hands the badge base to the App Group before backgrounding                                                |
| `ios/ChaticNotificationServiceExtension/NotificationService.swift` | localizes background/killed banners from `assets/locales/{lang}.json` (pinned language, else the device's); increments the shared badge and appends a push-mark record while the app is backgrounded |

There is no native push diagnostics screen any more — `NotificationTestScreen.tsx` was removed with
the rest of the native debug UI (ADR-0080); the equivalent is the web debug panel's `Push` screen
(`apps/web/src/app/features/debug/overlay/screens/PushScreen.tsx`).

## Structure

```mermaid
flowchart TD
    App["App.tsx"] --> Channels["NotificationService.createNotificationChannel"]

    AndroidFCM["Android FCM"] --> AndroidService["ChaticFirebaseMessagingService"]
    AndroidService -->|"foreground"| DeviceEvent["DeviceEventEmitter:onForegroundPushReceived"]
    AndroidService -->|"background/killed non-silent"| NativeBanner["Native notification banner"]
    AndroidService -->|"background/killed silent"| DropBanner["skip native banner"]
    NativeBanner --> MainActivity["MainActivity deep link intent"]

    IOSAPNs["iOS APNs"] --> AppDelegate["AppDelegate UNUserNotificationCenterDelegate"]
    IOSAPNs -->|"background/killed non-silent"| NSE["NotificationServiceExtension localizes loc_args"]
    NSE --> IOSBanner["Native notification banner"]
    AppDelegate --> PushIOS["RNCPushNotificationIOS"]

    FCMJS["@react-native-firebase/messaging"] --> NotificationService["NotificationService"]
    PushIOS --> NotificationService
    DeviceEvent --> FcmHandler["useFcmHandler"]
    NotificationService --> FcmHandler
    FcmHandler --> PushEventManager["PushEventManager"]
    PushEventManager --> WebView["WebView OnReceiveNotification"]
    NotificationService -->|"notification tap"| DeepLinkNav["useDeepLinkNavigation"]
    DeepLinkNav --> Navigate["bridge.pushEvent(OnNavigate)"]
    Navigate --> WebView
```

## Android delivery

`ChaticFirebaseMessagingService` receives a data message and reads these fields:

| Payload field                    | Meaning                                                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `id` / `messageId`               | notification identifier                                                                                     |
| `type`                           | app-level notification type                                                                                 |
| `channel_id` / `channelId`       | Android notification channel, defaults to `dou_chat`                                                        |
| `link` / `clickAction`           | the URL the tap routes to                                                                                   |
| `title_loc_key`, `titleLocKey`   | localized title key                                                                                         |
| `title_loc_args`, `titleLocArgs` | localized title args                                                                                        |
| `loc_key`, `bodyLocKey`          | localized body key                                                                                          |
| `loc_args`, `bodyLocArgs`        | localized body args                                                                                         |
| `data` / `payload`               | custom JSON metadata (`cid`/`sid` included); forwarded as the foreground event and merged into the tap link |
| `silent`                         | skips the native banner while the app is background/killed                                                  |

```mermaid
sequenceDiagram
    participant FCM as FCM
    participant Native as ChaticFirebaseMessagingService
    participant JS as DeviceEventEmitter
    participant Handler as useFcmHandler
    participant Broker as PushEventManager
    participant Web as WebView

    FCM->>Native: data message
    Native->>Native: localize title/body from assets/locales
    alt app foreground
        Native->>JS: onForegroundPushReceived
        JS->>Handler: native foreground event
        Handler->>Broker: emitReceiveNotification
        Broker->>Web: OnReceiveNotification
    else app background/killed and silent
        Native->>Native: skip native banner
    else app background/killed and not silent
        Native->>Native: merge cid/sid into link, bump badge/push-mark, display native notification
    end
```

A background/killed **chat** push (channel `dou_chat` or `dou_chat_muted`) also increments the shared
badge counter (`BadgeStore`) and, if the payload carries `cid`/`uid`/`channelId`, appends a raw
cross-cloud push-mark record (`PushMarkStore`, ADR-0056) — see [Cross-cloud push mark](#cross-cloud-push-mark).
Notice, marketing and cloud pushes touch neither.

## iOS delivery

`AppDelegate` sets `UNUserNotificationCenter.current().delegate` and forwards APNs callbacks to
`RNCPushNotificationIOS`.

A foreground APNs notification reaches JS via
`RNCPushNotificationIOS.didReceiveRemoteNotification(...)`, and the system foreground-presentation
callback answers `[]`, so iOS shows no system banner while the app is active.

**That path never runs the Notification Service Extension**, so nothing has translated the push by
the time it reaches JS: `getTitle()`/`getMessage()` are the APNs `alert` the push server filled
without knowing the reader's language (for a chat message with no text, an empty body). The shell
therefore builds the copy itself — `handleAPNs` hands `getData()`'s top-level `loc_key`/`loc_args`
(and the title pair) to `formatPushCopy`, in the same language the native handlers resolve, and
falls back to the `alert` only for a payload with no key or a field that formats to nothing. A silent
push is left as it came: the server sends it with the loc keys but no `alert`, and the web recognises
it by its empty title and body, so building copy for it would turn it into a banner. The
in-app banner the web draws is then the same copy the extension would have put on the lock screen.

**A tap** rides a _different_ JS event than foreground receipt. iOS delivers a tap as a
`UNNotificationResponse`, and `AppDelegate.userNotificationCenter(_:didReceive:)` forwards it to
`RNCPushNotificationIOS.didReceive(response)`. On the JS side this surfaces as the **`localNotification`**
event — not the `notification` event (foreground receipt) and not FCM's `onNotificationOpenedApp`
(FCM never sees the tap, because the delegate is wired manually). `NotificationService.onNotificationOpenedApp`
subscribes to `localNotification` on iOS for exactly this reason; without that branch a background/warm
tap on iOS is silently lost and never reaches `OnNavigate`. A cold-start tap instead arrives through
`getInitialNotification()`.

A background/killed non-silent push (sent with `mutable-content: 1`) is intercepted before the banner
is shown by the **Notification Service Extension**
(`ChaticNotificationServiceExtension/NotificationService.swift`). It reads `title_loc_key`/`loc_key`
and `title_loc_args`/`loc_args`, resolves the template from `assets/locales/{lang}.json` — `lang` being the
language pinned in Settings if there is one, read from the App Group, else the device's
([../system/language.md](../system/language.md)) — and
substitutes `{0}`-style placeholders into the banner title/body (`dou_chat_muted`/`dou_marketing` also
mute the sound). A silent push never runs the extension.

`loc_args`/`title_loc_args` may arrive as a native JSON array (`["Raine"]` — the real backend's APNs
shape) or as a JSON-encoded string (`"[\"Raine\"]"` — FCM-shaped test tooling), and the extension
accepts both. Missing or unparseable args no longer leave a literal `{0}` on the banner — see
[Unfilled placeholders](#unfilled-placeholders).

```mermaid
sequenceDiagram
    participant APNs as APNs
    participant AppDelegate as AppDelegate
    participant PushIOS as RNCPushNotificationIOS
    participant Service as NotificationService
    participant Handler as useFcmHandler
    participant Broker as PushEventManager
    participant Web as WebView

    APNs->>AppDelegate: willPresent notification
    AppDelegate->>PushIOS: didReceiveRemoteNotification
    AppDelegate->>APNs: completionHandler([])
    PushIOS->>Service: notification event
    Service->>Handler: onMessage callback
    Handler->>Broker: emitReceiveNotification
    Broker->>Web: OnReceiveNotification
```

## WebView bridge API

Requests `useFcmHandler` answers:

| Request           | Result                                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FetchFcmToken`   | requests permission, registers APNs on iOS, returns the APNs token (iOS) or FCM token (Android)                                                                                       |
| `DeleteFcmToken`  | drops the FCM token so the next `FetchFcmToken` mints a fresh one (used by the web debug panel's push screen to test re-registration); reports success whether a token existed or not |
| `FetchBadgeCount` | returns the native launcher badge count                                                                                                                                               |
| `SetBadgeCount`   | sets the native launcher badge count                                                                                                                                                  |
| `FetchBadgeBase`  | returns the shared badge base (`BadgeSyncBridge.getBase()`) — Android only; `null` means unknown on iOS or an older shell, never zero                                                 |
| `FetchPushMarks`  | drains the cross-cloud push-mark records (`PushMarksBridge.drain()`)                                                                                                                  |

It also subscribes to (foreground receipt only):

- `notificationService.onMessage(...)`
- `DeviceEventEmitter.addListener('onForegroundPushReceived', ...)`
- `pushEventManager.onReceiveNotification(...)`

Notification taps (`onNotificationOpenedApp`, `getInitialNotification`) are subscribed by
`useDeepLinkNavigation`, not here.

## Cross-cloud push mark

A background chat push carries the current-cloud badge count, but a device may hold several clouds,
and the socket for the _other_ clouds is suspended the whole time the app is backgrounded — so a
message in one of them never reaches the web at all until the next launch. Android's
`ChaticFirebaseMessagingService` and iOS's `NotificationServiceExtension` each append a raw hint
(`cid`, `uid`, `channelId`, `sid`, `channelName` — whichever the payload carries) to a shared,
platform-local store the moment they bump the badge (ADR-0056). Neither side interprets the hint; that
happens once, on the web (`resolvePushCloudId.ts`).

Both stores are a capped ring buffer of **100** records and are drained (read once, then cleared) by
`FetchPushMarks` → `PushMarksBridge.drain()` on the next launch or foreground, so a cloud whose only
sign of life was a backgrounded push can still be marked unread.

## Click routing

Notification-tap navigation belongs to `useDeepLinkNavigation`, not the push handler. On a tap,
`deeplinkService.resolvePushTap` (implemented by `resolvePushTapPath`) resolves a WEBVIEW_URL-relative
path and hands it straight to the web as an `OnNavigate` bridge event — there is **no** `Linking.openURL`
round-trip. `AppBridgeHost` buffers the event until `WebAppReady`, so a cold-start tap is delivered as
soon as the web handshake completes, with no extra startup delay.

`resolvePushTapPath` reads the notification's `link` (falling back to `clickAction`) and merges the
`cid`/`sid` from `payload` into its query, because the web reads cloud/site context from the
navigation query (see the web's `resolvePushNavigation`). With no link it returns `null` and the tap
only foregrounds the app. Android merges `cid`/`sid` natively (see [Android delivery](#android-delivery)),
so `resolvePushTapPath`'s own merge mainly serves the iOS path.

The route from tap to `useDeepLinkNavigation` differs per platform: Android warm/background taps
arrive through FCM's `onNotificationOpenedApp`, iOS warm/background taps through the
`localNotification` event (see [iOS delivery](#ios-delivery)). Cold-start taps use
`getInitialNotification()` on both platforms.

The `OnNavigate` contract that a push tap and a deep link converge on is covered in
[../system/deeplink.md](../system/deeplink.md).

```mermaid
sequenceDiagram
    participant OS as OS notification tap
    participant Service as NotificationService
    participant Handler as useDeepLinkNavigation
    participant Resolve as resolvePushTapPath
    participant Bridge as AppBridgeHost

    OS->>Service: onNotificationOpenedApp or getInitialNotification
    Service->>Handler: RemoteMessage
    Handler->>Resolve: link + payload(cid/sid)
    Resolve-->>Handler: /path?cid=..&sid=.. (or null)
    Handler->>Bridge: pushEvent(OnNavigate, { path })
    Bridge->>Bridge: buffer until WebAppReady, then flush to WebView
```

## Badge behavior

- `NotificationService.onMessage`, `onNotificationOpenedApp` and `getInitialNotification` all call `clearBadge()`.
- `AppDelegate.applicationDidBecomeActive` also clears the iOS app-icon badge.
- The WebView can explicitly fetch and set the badge count over the bridge.

The full badge lifecycle — background increment, foreground reconcile — is in [badge.md](./badge.md).

## Chat message body

The server picks a chat push's body key; the device only fills in the copy. A message with text sends
the text, whatever it has attached; an attachment-only message is described by what it carries,
judged from each upload's `stereo` — the server's kind for a file (`image`, `video`, `audio`,
`file`), with an upload that has none counted as `image`.

| Message                                              | `loc_key`                    | `loc_args` | ko / en                                          |
| ---------------------------------------------------- | ---------------------------- | ---------- | ------------------------------------------------ |
| has text (attachments or not)                        | `push_chat_message_body`     | `[text]`   | the text                                         |
| one photo / several                                  | `push_chat_image_body`       | absent     | `사진을 보냈습니다` / `Sent a photo`             |
|                                                      | `push_chat_images_body`      | `["3"]`    | `사진 3장을 보냈습니다` / `Sent 3 photos`        |
| one video / several                                  | `push_chat_video_body`       | absent     | `동영상을 보냈습니다` / `Sent a video`           |
|                                                      | `push_chat_videos_body`      | `["2"]`    | `동영상 2개를 보냈습니다` / `Sent 2 videos`      |
| one file / several                                   | `push_chat_file_body`        | absent     | `파일을 보냈습니다` / `Sent a file`              |
|                                                      | `push_chat_files_body`       | `["3"]`    | `파일 3개를 보냈습니다` / `Sent 3 files`         |
| mixed kinds, or audio                                | `push_chat_attachments_body` | `["3"]`    | `첨부 3개를 보냈습니다` / `Sent 3 attachments`   |
| neither text nor attachments (a blocks-only webhook) | `push_chat_message_body`     | absent     | `새 메시지` / `New message` — the fallback below |

One and several are separate keys because every assembler here does positional substitution only; none
knows plural rules. The count is the message's attachment count, which is what the room shows: the app
only sends uploads that finished storing.

**Rollout order is part of the design.** A build that does not have a key shows the key name itself on
the banner, so the server only starts sending the attachment keys once a build that has them has
spread. Until then an attachment-only message still arrives as `push_chat_message_body` with no args,
and the guard below turns it into `새 메시지` / `New message`. The channel list's preview uses the same
nouns (`사진 3장` against `사진 3장을 보냈습니다`) — see the web's home feature docs — so a change to one
side's copy is a change to both.

### Unfilled placeholders

All three assemblers — `formatPushTemplate` in `ChaticFirebaseMessagingService.kt` (Android, every app state),
the extension's `formatTemplate` (iOS background/killed) and `formatPushCopy` (iOS foreground) — apply
the same rule when a template names a `{n}` that the args do not reach:

- **body** — the result is replaced by `push_chat_fallback_body` (`새 메시지` / `New message`) from the
  same locale. The server never sends that key; it exists for this.
- **title** — the unfilled placeholders are removed and the rest trimmed. An empty title is then left
  to the platform: the extension keeps the `alert` title, and Android leaves the title line blank (the notification header still names the app).

The hole is judged on the template, not on the substituted text, so a message that itself contains
`{0}` is shown verbatim. **A key that is not found is left alone** — the key name staying visible is
the signal that a payload outran the installed build, and hiding it would hide the rollout mistake.

To send these payloads without the server, `scripts/send-test-push.js` takes `--loc-key` and
`--loc-args` (`'["3"]'`, or `none` to leave the field out the way the server does for a message with
no text); add `--loc-args-array` on iOS for the backend's array shape.

## Cloud activation push

When a cloud is first activated, the server sends its owner one notification: over the socket
(`cloud.activated`, handled by the web) if connected, otherwise a push. The push spec:

| Field                  | Value                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `type`                 | `cloud` → the push service derives channel `dou_cloud` (the server does not send `channel_id`) |
| `title_loc_key`        | `push_cloud_activate_title`                                                                    |
| `title_loc_args`       | `[cloud name \|\| cloud id]`                                                                   |
| `loc_key` / `loc_args` | **absent** — the title is the whole message                                                    |
| `link`                 | **absent**                                                                                     |
| `data`                 | `cid` (cloud id), `uid` (owner id)                                                             |

### Translation keys

Every `push_*` key — `push_cloud_activate_title` here, and the chat keys above — must exist in **all
four** locale sets. Each has a different consumer, so a missing one only breaks that path:

| Location                                              | Consumer                         | If missing                               |
| ----------------------------------------------------- | -------------------------------- | ---------------------------------------- |
| `src/app/utils/i18n/locales/{ko,en}.ts`               | shell UI, and `formatPushCopy`   | literal key on the iOS foreground banner |
| `android/app/src/main/assets/locales/{ko,en}.json`    | `ChaticFirebaseMessagingService` | literal key on the Android banner        |
| `ios/assets/locales/{ko,en}.json`                     | iOS app                          | literal key in the app                   |
| `ios/ChaticNotificationServiceExtension/{ko,en}.json` | the extension                    | literal key on the iOS background banner |

The copy is ko `{0} 클라우드가 준비되었습니다`, en `{0} is ready` — the particle is detached from the
variable (Korean grammar picks "이" or "가" by the name's final sound, which cannot be fixed for an
arbitrary name). Every new key that carries a variable follows the same rule.

It is not in `TranslationKey` (`src/app/utils/i18n/types.ts`) — no push key is. They never go through
the shell's `t()`: the natives assemble them, and the shell's one push path uses `formatPushCopy`.

[`localeParity.test.ts`](../../src/app/services/notification/localeParity.test.ts) is what keeps the four
sets in sync: it diffs the native three against the shell locale's flat `push_*` key set, checks for
empty values, and checks that the activation title still has a `{0}` slot (a missing arg makes the
fallback title a literal `cloud`). For the chat bodies it checks that the four plural keys keep their
`{0}` and that the three singular keys and the fallback carry no `{` at all — a placeholder there would
send every such push to the fallback.

**The Extension target's bundled resources are outside that test's reach.** If
`ios/ChaticNotificationServiceExtension/*.json` is missing from the Extension target's Copy Bundle
Resources, the file exists but only the banner breaks — check manually.

### Tap destination

With no `link`, the app must apply the spec's "empty `link` means root" rule itself, and **the tap's
route to the web differs per platform, so both need fixing together.**

| Path                             | No-link handling                                                                                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS tap (warm, background, cold) | if the type is in `resolvePushTapPath`'s `ROOTED_PUSH_TYPES` (currently just `cloud`), resolves to `'/'`                                                                   |
| Android background/killed tap    | `ChaticFirebaseMessagingService.rootTapLinkFor` puts `<scheme>://` on the intent's data URI, and RN `Linking` → `resolveDeepLink` reads it as `{ kind: 'web', path: '/' }` |

**Android needs its own path** because `displayNotification` attaches no data URI to the intent at all
when the link is empty. RN `Linking` only ever surfaces the data URI (`MainActivity` never reads the
`clickAction` extra), and a data-only push never fires FCM's `onNotificationOpenedApp` either — so a
JS-only fix would leave **Android taps going nowhere**, which is exactly the path a user who keeps the
app closed relies on. The scheme comes from the flavor's `app_scheme` string resource (`chatic` prod,
`chatic-dev` dev).

**Narrowing by type** matters because a missing link means two different things: a cloud push has no
link by contract, but a chat push missing its link is a malformed payload. Sending the latter home too
would steal the screen the user was on. A `link`, when present, always wins regardless of type.

**The two lists are kept in sync by hand** — Kotlin's `PUSH_TYPE_CLOUD` and JS's `ROOTED_PUSH_TYPES`
share no type. Adding a rooted type means updating both.

The tap does not switch to the activated cloud — product decided the destination is home, and the
title alone says which cloud (hence no body).

### Badge and unread

`dou_cloud` is not a chat channel. Android's `isChatChannel(channelId)` gate and iOS's
`applyBadgeIncrementIfNeeded` chat gate already exclude it, so **native code does nothing extra here**
— neither the badge nor a cross-cloud mark moves for this push.

## Constraints

- JS background push handling does not go back into `main.tsx` unless the native Android/iOS lifecycle
  design changes.
- Android localized notification text comes from `ChaticFirebaseMessagingService` reading
  `assets/locales/{lang}.json`, falling back to English when missing. On both platforms `lang` is the
  language pinned in the web's Settings, copied to shared storage by the app, else the device's.
- iOS background/killed banner text is localized by the Notification Service Extension from
  `assets/locales/{lang}.json` (English fallback); `loc_args`/`title_loc_args` accept both the native
  JSON array (APNs) and a JSON string. `assets/locales/*.json` must be bundled into **both** the app
  target's and the **Extension** target's Copy Bundle Resources.
- A template's unfilled `{n}` never reaches a banner: a body falls back to `push_chat_fallback_body`, a
  title drops the placeholder. The rule is written three times — Kotlin, the extension, `formatPushCopy`
  — and the three must change together.
- Foreground push delivery is deliberately decoupled through `PushEventManager` — the WebView may not
  be mounted yet when the OS/native callback fires.
- Background/killed silent Android pushes currently skip the native banner and are not persisted to a
  JS offline queue.
- `cid`/`sid` reach the web only through the `OnNavigate` path query, never a separate channel: Android
  merges them into the link URI natively, iOS merges them in `resolvePushTapPath`. The web strips them
  in `resolvePushNavigation`.

## Change checklist

- Does the change touch Android native delivery, iOS APNs delivery, or the JS bridge delivery — or more than one?
- Does Android foreground delivery still emit `onForegroundPushReceived` with the fields `useFcmHandler` expects?
- Does the tap payload still carry `link` (or `clickAction`)?
- Do `cid`/`sid` still reach the web — merged into the link query on Android, via `resolvePushPath` on iOS?
- Do `NotificationService.createNotificationChannel` and `ChaticFirebaseMessagingService.createNotificationChannel` still agree on channel behavior?
- If payload localization changed, does the iOS Notification Service Extension still resolve `loc_args` (both native-array and JSON-string shapes) from `assets/locales`, and is that JSON bundled into the Extension target?
- Is the foreground system banner still suppressed on both platforms as intended?
- If a push key or its copy changed, is it in all four locale sets, does iOS foreground still build its copy through `formatPushCopy`, and do the three assemblers still share the unfilled-placeholder rule?
