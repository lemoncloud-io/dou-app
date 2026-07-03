# device-token (푸시 토큰 등록)

> 대상: `apps/web/src/app/bridge` (`useDeviceTokenRegistration`, `GlobalBridgeListener`)
> 관련: [notifications](./README.md) · [debug/push-verification](../debug/push-verification.md) · [architecture/bridge](../../architecture/bridge.md)

## 책임

로그인(세션 인증) 후 네이티브 푸시 토큰(FCM/APNs)을 서버에 등록한다. 일반 브라우저에서는 플랫폼이 없어 no-op다.

## 토큰 출처 — 브릿지 전용

- 푸시 토큰은 **네이티브만 발급**한다. 웹은 [`appBridge.fetchFcmToken()`](../../../src/app/bridge/appBridge.ts)(브릿지 `FetchFcmToken` → `OnFetchFcmToken`)로만 취득한다.
- ⚠️ **`deviceToken`은 `window` 글로벌로 주입되지 않는다.** 네이티브가 주입하는 건 `CHATIC_APP_DEVICE_ID`·`CHATIC_APP_INSTALLATION_ID` 뿐이다([`injectionScripts.ts`](../../../../mobile/src/app/webview/utils/injectionScripts.ts)). 따라서 `useDeviceInfo().deviceInfo.deviceToken`은 항상 비어 있다 — 토큰이 필요하면 반드시 브릿지로 물어봐야 한다.
- 반면 `deviceId`(글로벌 `CHATIC_APP_DEVICE_ID`)는 온다. 단, 원시 `DeviceInfo.getUniqueId`가 아니라 **Firebase installation id를 이어붙인 `deviceId:firebaseInstallId` 조합**이다([`buildInjectedUniqueId.ts`](../../../../mobile/src/app/webview/utils/buildInjectedUniqueId.ts), [`AppWebView.tsx`](../../../../mobile/src/app/webview/AppWebView.tsx)). Firebase id는 비동기 조회([`useFirebaseInstallId.ts`](../../../../mobile/src/app/webview/hooks/useFirebaseInstallId.ts))라 아직 없으면 원시 device id만 들어간다. 그래서 디버그의 Device Info 블록은 이 `deviceId`를 글로벌에서 바로 읽는다. (한편 `installId`=`CHATIC_APP_INSTALLATION_ID`는 여전히 원시 device id다.)

## 등록 흐름

```
GlobalBridgeListener (앱 전역 마운트)
  → useDeviceTokenRegistration()
     → 인증됨 && window.CHATIC_APP_PLATFORM 있음?  (아니면 no-op)
     → appBridge.fetchFcmToken()                  # 네이티브에서 토큰 취득
     → body { deviceToken, platform, installId, application: 'chatic' }
     → web-core useRegisterDeviceToken(body)       # deviceId 내부 주입
        → identityCore dedup (같은 토큰이면 skip)
        → POST /users/0/reg-dev                     # signed relay
        → 성공 시 identityCore에 등록 토큰 저장
```

- 진입점: [`GlobalBridgeListener.tsx`](../../../src/app/bridge/GlobalBridgeListener.tsx) → [`useDeviceTokenRegistration.ts`](../../../src/app/bridge/useDeviceTokenRegistration.ts).
- 앱 레벨 등록/중복제거: `libs/web-core/src/hooks/app/useRegisterDeviceToken.ts`.
- API: `POST /users/0/reg-dev` (`libs/web-core/src/api/users.ts`, `registerDeviceToken`).

## 요청/응답 계약

**요청 `RegisterDeviceTokenBody`** — `deviceId`, `deviceToken`, `platform`(`ios`|`android`), `application`(`'chatic'`), `installId`, `version?`, `meta?`.

**응답 `RegisterDeviceResult`** — `deviceToken`(매칭된 토큰), `Application`, `Device`, `User`, `took`.
`User`에는 서버 등록의 진실이 담긴다: `endpoint`(SNS ARN), `registeredAt`, `deviceId`.

## 중복 방지

`identityCore`가 마지막 등록 토큰을 `localStorage`(`chatic-registered-device-token`)에 저장한다. 같은 토큰이면 재등록하지 않고, 토큰이 갱신되면(`onTokenRefresh`) 자동 재등록한다.

## 등록여부 확인 — 읽기 전용 조회는 없음

백엔드에 "내 기기가 등록됐는지" 조회하는 GET 엔드포인트가 **없다.** 확인은 **멱등 재등록(POST `reg-dev`, `force`)** 으로 하고, 응답의 `User.endpoint`/`registeredAt`를 읽어 판정한다. (순수 조회가 아니라 서버 상태를 갱신할 수 있음 — 정상 등록 흐름과 동일.)

디버그 도구가 이 확인을 수행한다 — `/debug/push` 페이지 또는 dev 빌드의 **RuntimeOverlay '디바이스' 탭**(우하단 `debug` 버튼) → 절차는 [debug/push-verification](../debug/push-verification.md).

## 수신 (참고)

- **백그라운드/종료**: 네이티브 배너 → 탭 → `OnNavigate` → [navigation 처리](./README.md).
- **포그라운드**: `OnReceiveNotification`. 프로덕션 toast/nav는 미구현이며, 디버그 소비처 [`useReceivedPushLog`](../../../src/app/features/debug/hooks/useReceivedPushLog.ts)가 수신을 기록하고 `logger.info('PUSH', …)`로 Log Buffer에 남긴다.

## 파일 맵

| 파일                                          | 역할                                              |
| --------------------------------------------- | ------------------------------------------------- |
| `bridge/GlobalBridgeListener.tsx`             | 인증 후 등록 훅을 앱 전역에서 마운트              |
| `bridge/useDeviceTokenRegistration.ts`        | 브릿지로 토큰 취득 → 등록 body 구성               |
| `bridge/appBridge.ts` (`fetchFcmToken`)       | `FetchFcmToken` 브릿지 요청                        |
| web-core `hooks/app/useRegisterDeviceToken.ts`| dedup + `reg-dev` 호출 + 토큰 저장               |
| web-core `api/users.ts` (`registerDeviceToken`)| `POST /users/0/reg-dev` (signed relay)           |
| `features/debug/pages/DebugPushPage.tsx`      | 토큰 조회·등록 확인·포그라운드 수신 목록 (디버그) |
| `dev/overlays/RuntimeOverlay.tsx` ('디바이스')| 위 정보를 dev 오버레이에서도 노출 (동일 훅 재사용) |
