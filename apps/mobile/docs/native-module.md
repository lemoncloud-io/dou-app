# native-module — the three-way parity contract

A native capability the WebView cannot reach on its own — OS permissions, background execution, or
a value only the native side ever observes — is a TypeScript wrapper under `bridge/`, a Kotlin
implementation under `android/`, and a Swift/Obj-C one under `ios/`. Shipping two of the three leaves
one platform failing at runtime with no type error, since `NativeModules.<Name>` resolves to
`undefined` rather than a compile failure.

## Layout

| Layer                        | Path                                                            |
| ---------------------------- | --------------------------------------------------------------- |
| TypeScript wrapper           | [`src/app/bridge/*Bridge.ts`](../src/app/bridge/) — 7 files     |
| Android package + module     | `android/app/src/main/java/io/chatic/dou/bridge`, `.../module`  |
| Android push delivery        | `android/app/src/main/java/io/chatic/dou/push`                  |
| Android background upload    | `android/app/src/main/java/io/chatic/dou/service`, `.../worker` |
| iOS bridge                   | [`ios/Bridges`](../ios/Bridges)                                 |
| iOS app delegate integration | `ios/Chatic/AppDelegate.swift`                                  |

## Responsibilities

This layer normalizes a native call or event into a plain TypeScript surface — a `Promise` that
resolves or rejects, or an emitter a service subscribes to. It does not decide _when_ to call native
code or what to do with the result; that is a service's job (see [service.md](./service.md)). A
bridge file also owns the platform branch: `Platform.OS !== 'android'` guards inside
`BadgeSyncBridge.setBase` and `SystemBarsBridge`/`BackNavigationBridge`, so a caller never has to
know which platform implements a given capability.

## The shared contract

Seven TypeScript wrappers, one native counterpart per platform where the feature exists on that
platform:

| Feature         | TypeScript                | Android                                                                   | iOS                                                                                            |
| --------------- | ------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Upload          | `UploadManagerBridge.ts`  | `UploadManagerModule.kt`, `UploadBackgroundService.kt`, `UploadWorker.kt` | `Upload/UploadManager.swift`, `Upload/UploadManager.m`                                         |
| File            | `FileManagerBridge.ts`    | `FileManagerModule.kt`                                                    | `FileManager.m`                                                                                |
| App icon        | `AppIconBridge.ts`        | `AppIconManagerModule.kt`                                                 | `AppIconManager.m`                                                                             |
| System bars     | `SystemBarsBridge.ts`     | `SystemBarsModule.kt`                                                     | no-op — `Platform.OS !== 'android'` short-circuits                                             |
| Back navigation | `BackNavigationBridge.ts` | `BackNavigationModule.kt`, `BackNavigationHandler.kt`                     | no-op — same guard, iOS uses the OS swipe-back gesture                                         |
| Push marks      | `PushMarksBridge.ts`      | `PushMarksModule.kt` (+ `PushMarkStore.kt`)                               | `PushMarksModule.m`                                                                            |
| Badge sync      | `BadgeSyncBridge.ts`      | `BadgeSyncModule.kt`, `push/BadgeStore.kt`                                | none — base captured natively in `AppDelegate` from the live icon badge, not reachable from JS |
| Push delivery   | none                      | `push/ChaticFirebaseMessagingService.kt`                                  | `AppDelegate.swift` forwards APNs callbacks to `RNCPushNotificationIOS`                        |

`PushMarksBridge.drain()` is a read-once call: it reads every pending mark recorded by a background
chat push (Android's FCM service, iOS's Notification Service Extension) and clears native storage in
the same call. It is consumed by `useFcmHandler`, one of the webview handlers, rather than by a
service — the mark data has no processing beyond forwarding it to the web.

One native module falls outside this table: `NativeLoggerModule` (Android and iOS) is an
event-emitter the native side pushes logs through, wired directly in
[`services/log/native/nativeLoggerBridge.ts`](../src/app/services/log/native/nativeLoggerBridge.ts)
rather than as a `bridge/*Bridge.ts` command wrapper — there is nothing for JS to call, only a
`ChaticNativeLog` event to subscribe to.

## Usage

### Adding a native capability

1. Define the request/response shape the wrapper exposes (an interface in the same file is enough;
   this is not the WebView message contract — that lives in `@chatic/app-messages` and is a separate
   step, described in [service.md](./service.md)).
2. Implement the Kotlin module and register its package under `android/app/src/main/java/io/chatic/dou/`.
3. Implement the Swift or Objective-C counterpart under `ios/Bridges/` and register it with RN's
   bridge export macros.
4. Write the TypeScript wrapper in `src/app/bridge/`, guard the platform that lacks an
   implementation, and warn rather than throw when `NativeModules.<Name>` is `undefined` — a missing
   module should degrade, not crash a screen that never needed it.
5. Add both platforms in the same change. A one-platform bridge is the failure mode this contract
   exists to catch.

### What not to do

- Do not call `NativeModules.<Name>` outside `bridge/`. Every wrapper already guards the missing-module
  case; a second call site has to repeat that guard or crash on an old install.
- Do not let a bridge decide business logic (retry policy, when to persist, what counts as
  "authoritative"). That belongs to the service that calls it — `BadgeSyncBridge` only carries the
  count across the boundary, it does not decide when to sync it.
- Do not assume feature parity. `SystemBarsBridge` and `BackNavigationBridge` are Android-only by
  platform behaviour (iOS has no equivalent system chrome to hide, and no back button to intercept);
  document the asymmetry in the wrapper's own comment, as both already do, rather than leaving a
  silent no-op unexplained.

## Notes for implementers and tests

- A `console.warn` on a missing module is the intended failure mode for a build where native code has
  not been recompiled yet — it lets JS-only changes still pass `yarn mobile:test` without a native
  build. It is not a substitute for shipping both platforms.
- None of this is checked by `tsc` or `jest`. Kotlin and Swift only compile inside a real build
  (`yarn mobile:android:dev`, `yarn mobile:ios:dev`); a bridge that references a method neither native
  side implements passes every JS-side command and fails only on device.
- `BadgeSyncBridge.getBase()` returning `null` versus `0` is deliberate (ADR-0075) — `0` is a valid
  badge count, so treating "unknown" and "zero" as the same value would let a caller apply a base that
  was never actually read.

## Further reading

- [service.md](./service.md) — the layer that calls these wrappers and owns the behaviour around them.
- [badge.md](./badge.md) — the badge-count flow `BadgeSyncBridge` and `PushMarksBridge` both feed.
- [push.md](./push.md) — the push-delivery path with no TypeScript wrapper of its own.
