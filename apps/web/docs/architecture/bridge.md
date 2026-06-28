# 네이티브 브릿지

> 대상: `apps/web/src/app/bridge`

네이티브 ↔ 웹 메시지는 `bridge/` 한 곳에서만 주고받는다. feature가 `webClient`를 직접 쓰지 않는다.

## 방향별 패턴

| 방향                           | 패턴                        | 언제                                                                                                 |
| ------------------------------ | --------------------------- | ---------------------------------------------------------------------------------------------------- |
| Web → Native (응답 있음)       | `await appBridge.method()`  | 네이티브가 결과를 돌려주는 요청 (`FetchFcmToken`, `OAuthLogin`, `GetContacts`, `FetchPreference` 등) |
| Web → Native (fire-and-forget) | `appBridge.method()` (void) | 결과 불필요 (`openURL`, `setBadgeCount`, `savePreference`, `notifyWebAppReady` 등)                   |
| Native → Web (push)            | `useOn<EventName>`          | 네이티브가 먼저 보내는 이벤트 (`OnNavigate`, `OnBackgroundStatusChanged`, `OnFetchPreference` 등)    |

- `appBridge` = 모든 outbound 메서드의 단일 진입점. feature는 `appBridge.X()`만 호출한다.
- `useHandleAppMessage` / `useOn*` = inbound push 전용. request-response 흐름에는 쓰지 않는다.
- `GlobalBridgeListener` = 앱 전역에서 구독해야 하는 push 이벤트를 한데 모은 컴포넌트.

## Purchase 예외

`Purchase`는 결과가 `OnPurchaseSuccess` / `OnPurchaseError` push 이벤트로 오므로 `appBridge.purchase()`는 void다. feature(subscription)에서 resolver ref 패턴으로 Promise화한다.

## 디바이스 토큰 등록

네이티브 push 등록은 `bridge/` 레이어에 둔다(앱 시작 시 `GlobalBridgeListener`에서 호출). `isAuthenticated`(`useSessionAuth`) + 앱 환경 게이트 → `appBridge.fetchFcmToken()`으로 토큰 수신 → web-core `useRegisterDeviceToken({ deviceToken, platform, installId, application })`로 전달한다. `deviceId`는 web-core 훅이 내부 주입하고, 중복 제거는 `identityCore`가 담당한다.

## 관련

- preference 읽기/쓰기(`fetchPreference`/`savePreference`)는 [stores](./stores.md)에서 다룬다.
