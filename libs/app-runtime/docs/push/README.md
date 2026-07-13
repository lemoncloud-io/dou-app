# Push Device-Token Registration

## 목적

네이티브 셸(모바일 WebView, Electron)로 실행 중일 때 푸시 디바이스 토큰을 홈 브로커(`reg-dev`)에 등록하는 공용 lifecycle 훅을 정의한다. 브로커에 등록된 토큰으로 중앙 pushes-api가 **모든 클라우드**의 메시지를 이 디바이스로 팬아웃한다 — 라이브 WebSocket이 커버하지 못하는 경로(소켓은 현재 접속한 클라우드만 본다)를 보완한다.

## 공개 표면

| 심볼                                   | 구분          | 설명                                            |
| -------------------------------------- | ------------- | ----------------------------------------------- |
| `useDeviceTokenRegistration(delegate)` | lifecycle 훅  | 인증·포그라운드 복귀 시점에 force 등록 (스로틀) |
| `DeviceTokenDelegate`                  | delegate 계약 | 셸별 토큰 획득 함수 + platform/installId 주입   |

```ts
interface DeviceTokenDelegate {
    fetchDeviceToken: () => Promise<string | null>; // null = 획득 불가(권한 거부 등)
    platform: string; // 'ios' | 'android' | 'desktop' ...
    installId?: string; // @deprecated — 미주입 시 useDynamicDeviceId().firebaseInstallationId로 폴백
    application?: string; // 기본 'chatic'
}
```

## 소유 경계

- **app-runtime 소유**: 등록 정책 전부 — 인증 게이팅, force 재등록, 60초 스로틀, 실패 재시도, 겹침 방지, `deviceId`(`useDynamicDeviceId`) 주입, web-core `useRegisterDeviceTokenMutation` 호출.
- **앱(셸 어댑터) 소유**: 셸 지식 전부 — 토큰 획득 방법(모바일은 `FetchFcmToken` request/response, Electron은 이벤트 응답), `CHATIC_APP_PLATFORM` 류 window 전역 판독, 그리고 "지금 네이티브 셸인가" 판정. 셸이 아니면 `delegate: null`을 넘겨 no-op으로 만든다.

`SocketSessionDelegate`와 같은 역전 패턴이다 — 런타임은 셸을 모르고, 앱이 획득 경로만 주입한다.

## 등록 전략 (왜 force + 스로틀인가)

토큰 동일성 dedup(과거 web-core `hooks/app/useRegisterDeviceToken` 방식)은 쓰지 않는다. SNS는 배달 실패 한 번으로 platform endpoint를 disable하는데, `CreatePlatformEndpoint`는 disabled endpoint를 되살리지 않으므로 토큰이 안 바뀌는 한 dedup이 재등록을 영원히 막아 디바이스가 푸시를 못 받는 상태로 고착된다. 그래서:

- 등록은 항상 `force: true` — 브로커가 endpoint를 재생성/재활성화할 기회를 준다. (전제: 브로커 `reg-dev`가 기존 endpoint에 `SetEndpointAttributes Enabled=true`를 수행해야 완전한 효과. apps/desktop-web의 운영 노트에서 검증된 전략이다.)
- 재등록 트리거는 60초 스로틀로 묶어 `reg-dev` 호출량을 제한한다.

### 트리거와 재시도 규칙

| 시점                                     | 동작                                                         |
| ---------------------------------------- | ------------------------------------------------------------ |
| 인증 완료(런치, 재로그인·계정 전환 포함) | 스로틀 무시하고 즉시 등록 — 새 세션은 반드시 등록되어야 한다 |
| focus / `visibilitychange`(visible)      | 스로틀(60초) 내면 무시, 지나면 재등록                        |
| fetch 실패·빈 토큰·등록 API 실패         | 스로틀 리셋 — 다음 트리거에서 즉시 재시도                    |
| 등록 진행 중 겹치는 트리거               | 무시 (in-flight guard)                                       |

### 매 시도마다 토큰을 새로 fetch한다

토큰을 캐시하지 않고 시도마다 `delegate.fetchDeviceToken()`을 다시 호출한다. 이것으로 dedup 시절의 미등록 케이스들이 자동 복구된다:

- **늦은 권한 허용** — 런치 시 권한 거부로 fetch가 null이어도, 사용자가 OS 설정에서 허용하면 다음 포그라운드 복귀에서 등록된다.
- **FCM 토큰 로테이션** — 세션 중 토큰이 바뀌어도 다음 트리거가 최신 토큰을 등록한다.
- **계정 전환** — 등록은 인증 사용자 단위이므로, dedup이 없어 B 계정 로그인 시에도 반드시 등록된다.

## 사용 예 (apps/web 어댑터)

```tsx
// apps/web/src/app/bridge/useDeviceTokenRegistration.ts — 셸 지식만 남긴 어댑터
const delegate = useMemo<DeviceTokenDelegate | null>(() => {
    const platform = window.CHATIC_APP_PLATFORM;
    if (!platform) return null; // plain browser → no-op
    return {
        fetchDeviceToken: () =>
            appBridge
                .fetchFcmToken()
                .then(r => r.data?.token ?? null)
                .catch(() => null),
        platform,
        installId: window.CHATIC_APP_INSTALLATION_ID,
        application: 'chatic',
    };
}, []);

useDeviceTokenRegistration(delegate);
```

마운트 위치는 앱 자유다 — apps/web은 `GlobalBridgeListener`에서 호출한다. `SessionBackgroundRunner`에 내장하지 않은 이유: delegate가 앱(셸) 컨텍스트를 요구하므로 인자 없는 runner에 넣을 수 없다.

## 비책임

- 셸에서 토큰을 만드는 방법(FCM/APNs 권한 요청·토큰 발급) — 네이티브 셸 소유.
- 수신 푸시 라우팅/알림 표시 — 셸과 앱의 브리지 이벤트 경로 소유.
- 등록 API 자체 — web-core `useRegisterDeviceTokenMutation`이 소유하며 여기서는 호출만 한다.

## 관련 코드

- 훅: `libs/app-runtime/src/push/useDeviceTokenRegistration.ts`
- apps/web 어댑터: `apps/web/src/app/bridge/useDeviceTokenRegistration.ts`
- 전략 원본(운영 노트 포함, 아직 자체 구현 유지): `apps/desktop-web/src/app/shared/hooks/useDeviceTokenRegistration.ts`
