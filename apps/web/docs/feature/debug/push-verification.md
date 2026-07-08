# 푸시 검증 절차

> 대상: `apps/web/src/app/features/debug` — DebugOverlay 확장 모드의 `PushScreen`, `DeviceInfoScreen`
> 관련: [notifications](../notifications/README.md) · [device-token](../notifications/device-token.md) · [bridge](../../architecture/bridge.md)

푸시 파이프라인(서버 → FCM/APNs → 네이티브 셸 → 웹뷰)이 실제로 동작하는지 **디바이스에서** 확인하는 절차다. 세 가지를 다룬다 — ① deviceId 확인, ② deviceToken 서버 등록여부, ③ 푸시 도착 검증.

## 표시 위치

디버그 오버레이(우하단 `debug` 플로팅 버튼)의 확장 모드에서 본다 — 여는 법은 [README의 게이팅](./README.md#게이팅--런타임-언락) 참고 (DEV/LOCAL은 자동 활성, 그 외는 앱 버전 10탭 언락):

| 스크린                     | 위치                       | 내용                              |
| -------------------------- | -------------------------- | --------------------------------- |
| **Push (Token & Receive)** | 확장 모드 홈 → Push        | 토큰 서버 등록 확인, 수신 목록    |
| **Device Info**            | 확장 모드 홈 → Device Info | deviceId/installId/platform, 복사 |

## 사전 조건

- **네이티브 앱**(iOS/Android)에서 실행해야 한다. 일반 브라우저는 푸시 토큰이 없다(웹은 브릿지로만 토큰을 얻음).
- 알림 권한을 **허용**한 상태.
- **로그인**(세션)이 되어 있어야 한다 — 서버 등록은 인증 세션으로만 호출된다.
- 디버그 언락: 마이페이지 앱 버전 텍스트를 3초 내 10번 탭. (DEV/LOCAL 빌드는 언락 없이 열린다.)

## ① deviceId 확인

**Device Info** 스크린에서 `Device ID`(= `window.CHATIC_APP_DEVICE_ID` = 네이티브 `DeviceInfo.getUniqueId`와 Firebase installation id를 이은 `deviceId:firebaseInstallId` 조합), `Install ID`, `Platform`을 본다. 각 행을 탭하면 클립보드로 복사된다.

> `deviceToken`은 여기 없다 — 네이티브가 글로벌로 주입하지 않으므로 Push 페이지에서 브릿지로 조회한다.

## ② deviceToken 서버 등록여부

Push 스크린 → **Server Registration** → `Check`.

1. 브릿지 `FetchFcmToken`으로 현재 토큰을 가져온다(`Token`).
2. 서버에 **register-device**(멱등, `force`)를 호출한다.
3. 응답을 요약해 판정한다:
    - `Registered on server` + `Endpoint`(SNS ARN) + `Registered`(시각) 표시 → 서버에 등록됨.
    - `Token match = yes`면 서버가 돌려준 토큰이 방금 보낸 토큰과 일치.

> ⚠️ 백엔드에 읽기 전용 조회 API가 없어, 확인은 **멱등 재등록(POST `/users/0/reg-dev`)**으로 이뤄진다. 순수 조회가 아니라 서버 상태를 갱신할 수 있다(정상 등록 흐름과 동일).

상태값: `no-native`(앱 밖) · `no-token`(권한 거부/미발급) · `checking` · `done` · `error`.

## ③ 푸시 도착 검증

**발송** — 대상 기기의 `deviceToken`(또는 해당 사용자)로 푸시를 보낸다. 백엔드 푸시 API 또는 Firebase 콘솔(FCM)에서 발송.

**관측** — 앱 상태별로 도달 지점이 다르다:

| 앱 상태         | 도달 경로                                 | 관측 위치                                          |
| --------------- | ----------------------------------------- | -------------------------------------------------- |
| 포그라운드      | 네이티브 → 브릿지 `OnReceiveNotification` | Push 스크린 **Received** 목록 + Log Buffer(`PUSH`) |
| 백그라운드/종료 | OS 알림 배너 → 탭 → `OnNavigate`          | 배너 표시 후 탭 시 해당 화면으로 이동              |

- 포그라운드 수신은 `useReceivedPushLog`가 목록에 쌓고 `logger.info('PUSH', ...)`로 [Log Buffer](./README.md)에도 남긴다.
- 백그라운드 탭 이동은 payload의 `link`/`clickAction`과 `cid`/`sid`로 목적지를 만든다(`resolvePushPath`).

## 트러블슈팅

- **Token이 `(not fetched)`/`no-token`**: 알림 권한 거부 또는 토큰 미발급. OS 설정에서 권한 확인.
- **`no-native`**: 브라우저에서 연 경우. 네이티브 앱에서 실행.
- **배너는 오는데 Received 목록에 안 뜸**: 앱이 포그라운드가 아니었을 수 있음(백그라운드는 배너 경로).
- **등록은 됐는데 안 옴**: `Endpoint`가 비었는지 확인. 서버 발송 대상 토큰/사용자가 맞는지 대조(Device Info의 deviceId, Push의 Token 복사해 비교).
- **배너 텍스트가 `{0}`으로 뜸(iOS)**: `loc_args` 치환 실패. iOS Notification Service Extension이 `loc_args`를 네이티브 배열/JSON 문자열 양쪽으로 처리하는지, `assets/locales/*.json`이 Extension 타깃에 번들됐는지 확인(`apps/mobile/docs/push.md`). 로컬 재현: `node scripts/send-test-push.js ios <apns-token> --loc-args-array`.
