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
  → useDeviceTokenRegistration()                   # 셸 지식만 있는 어댑터
     → window.CHATIC_APP_PLATFORM 있음?            (없으면 delegate: null → no-op)
     → runtime.push.useDeviceTokenRegistration(delegate)
        → 인증됨?                                   (아니면 종료)
        → 등록 기록이 이 계정·기기·토큰을 이미 덮고 있나?  → 종료
        → appBridge.fetchFcmToken()                # 네이티브에서 토큰 취득
        → POST /users/0/reg-dev?force=true          # signed relay
        → 성공 시에만 등록 기록 저장
```

- 진입점: [`GlobalBridgeListener.tsx`](../../../src/app/bridge/GlobalBridgeListener.tsx) → [`useDeviceTokenRegistration.ts`](../../../src/app/bridge/useDeviceTokenRegistration.ts) — 이 파일은 토큰 취득 방법과 platform만 주입하는 어댑터다.
- 등록 정책 전부: `libs/app-runtime/src/push/` → [push-device-registration.md](../../../../../docs/specs/push-device-registration.md).
- API: `POST /users/0/reg-dev` (`libs/http/src/gateways/users.ts`, `registerDevice`).

## 요청/응답 계약

**요청 `RegisterDeviceTokenBody`** — `deviceId`, `deviceToken`, `platform`(`ios`|`android`), `application`(`'chatic'`), `installId`, `version?`, `meta?`.

**응답 `RegisterDeviceResult`** — `deviceToken`(매칭된 토큰), `Application`, `Device`, `User`, `took`.
`User`에는 서버 등록의 진실이 담긴다: `endpoint`(SNS ARN), `registeredAt`, `deviceId`.

## 중복 방지 — 설치당 1회

app-runtime이 등록 성공을 `push-reg:v1:<uid>:<deviceId>:<platform>`(localStorage)에 남기고, 그 기록이 현재 계정·기기·토큰과 일치하는 한 다시 호출하지 않는다. 기록은 불리언이 아니라 등록에 성공한 **토큰**을 담으므로 토큰 로테이션·계정 전환은 그대로 재등록된다.

같은 기록을 네이티브 `pushRegistration` preference(MMKV)에도 민다 — WebView 캐시가 지워져도 살아남게 하기 위해서다. 부팅 시 1회 hydrate해서 localStorage가 비었으면 네이티브 값으로 백필한다. 쓰기는 `apps/mobile`의 브릿지 화이트리스트를 타므로, **웹이 앱보다 먼저 배포되는 구간에서는 거부되는 게 정상**이고 그동안은 localStorage만으로 종전과 같이 동작한다.

포그라운드 복귀는 기록이 있으면 브릿지 왕복도 하지 않는다. 부팅 시에는 토큰을 fetch해 비교하는데, 모바일에서 토큰 로테이션이 잡히는 지점이 거기뿐이기 때문이다.

⚠️ 이 dedup은 SNS endpoint 자가복구를 포기한 대가다(ADR-0077). endpoint가 죽은 기기는 재설치·토큰 로테이션·계정 전환·정책 버전 상향 중 하나가 있어야 복구되며, 개별 구제는 아래 디버그 도구로 한다.

## 등록여부 확인 — 읽기 전용 조회는 없음

백엔드에 "내 기기가 등록됐는지" 조회하는 GET 엔드포인트가 **없다.** 확인은 **멱등 재등록(POST `reg-dev`, `force`)** 으로 하고, 응답의 `User.endpoint`/`registeredAt`를 읽어 판정한다. (순수 조회가 아니라 서버 상태를 갱신할 수 있음 — 정상 등록 흐름과 동일.)

디버그 도구가 이 확인을 수행한다 — `/debug/push` 페이지 또는 dev 빌드의 **RuntimeOverlay '디바이스' 탭**(우하단 `debug` 버튼) → 절차는 [debug/push-verification](../debug/push-verification.md).

## 수신 (참고)

- **백그라운드/종료**: 네이티브 배너 → 탭 → `OnNavigate` → [navigation 처리](./README.md).
- **포그라운드**: `OnReceiveNotification`. 프로덕션 toast/nav는 미구현이며, 디버그 소비처 [`useReceivedPushLog`](../../../src/app/features/debug/hooks/useReceivedPushLog.ts)가 수신을 기록하고 `logger.info('PUSH', …)`로 Log Buffer에 남긴다.

## 파일 맵

| 파일                                                   | 역할                                               |
| ------------------------------------------------------ | -------------------------------------------------- |
| `bridge/GlobalBridgeListener.tsx`                      | 인증 후 등록 훅을 앱 전역에서 마운트               |
| `bridge/useDeviceTokenRegistration.ts`                 | 셸 델리게이트 어댑터 (토큰 취득 + platform)        |
| `bridge/appBridge.ts` (`fetchFcmToken`)                | `FetchFcmToken` 브릿지 요청                        |
| app-runtime `push/hooks/useDeviceTokenRegistration.ts` | 등록 정책 전부 (트리거·dedup·재시도)               |
| app-runtime `push/registrationRecord.ts`               | 설치당 1회 등록 기록                               |
| `libs/http` `gateways/users.ts` (`registerDevice`)     | `POST /users/0/reg-dev` (signed relay)             |
| `features/debug/pages/DebugPushPage.tsx`               | 토큰 조회·등록 확인·포그라운드 수신 목록 (디버그)  |
| `dev/overlays/RuntimeOverlay.tsx` ('디바이스')         | 위 정보를 dev 오버레이에서도 노출 (동일 훅 재사용) |
