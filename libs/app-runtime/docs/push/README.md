# Push Device-Token Registration

## 목적

네이티브 셸(모바일 WebView, Electron)로 실행 중일 때 푸시 디바이스 토큰을 홈 브로커(`reg-dev`)에 등록하는 공용 lifecycle 훅을 정의한다. 브로커에 등록된 토큰으로 중앙 pushes-api가 **모든 클라우드**의 메시지를 이 디바이스로 팬아웃한다 — 라이브 WebSocket이 커버하지 못하는 경로(소켓은 현재 접속한 클라우드만 본다)를 보완한다.

정책의 정본은 [`docs/specs/push-device-registration.md`](../../../../docs/specs/push-device-registration.md)와 [ADR-0077](../../../../docs/adr/0077-register-push-device-once-per-install.md)이다. 이 문서는 lib 표면과 소유 경계만 다룬다.

## 공개 표면

| 심볼                                   | 구분          | 설명                                         |
| -------------------------------------- | ------------- | -------------------------------------------- |
| `useDeviceTokenRegistration(delegate)` | lifecycle 훅  | 설치당 1회 등록 (ADR-0077)                   |
| `DeviceTokenDelegate`                  | delegate 계약 | 셸별 토큰 획득 함수 + platform/stage 등 주입 |

```ts
interface DeviceTokenDelegate {
    fetchDeviceToken: () => Promise<string | null>; // null = 획득 불가(권한 거부 등)
    platform: string; // 'ios' | 'android' | 'desktop' ...
    installId?: string; // @deprecated — 미주입 시 useDynamicDeviceId().firebaseInstallationId로 폴백
    application?: string; // 기본 'chatic'
    stage?: string; // 미주입 시 브로커가 자기 기본값('dev')을 쓴다 — 아래 주의
    subscribeTokenChange?: (onChange: () => void) => () => void; // 셸이 토큰 재발급을 알려줄 수 있으면
    nativeRecordMirror?: NativeRecordMirror; // 등록 기록의 내구 저장소 (모바일만)
}
```

`PushRegistrationRecord`는 공개하지 않는다 — 등록 정책의 내부 상태이고, 밖에서 지우거나 심을 이유가 없다. 앱이 주는 것은 그 기록을 어디에 둘지(`nativeRecordMirror`)일 뿐, 기록의 형식이나 판단은 런타임이 갖는다.

## 소유 경계

- **app-runtime 소유**: 등록 정책 전부 — 인증 게이팅, 설치당 1회 dedup과 그 영구 기록, 버스트 floor, 실패 재시도, 겹침 방지, `deviceId`(`useDynamicDeviceId`)·계정 uid(`getRelaySessionUser`) 주입, `data/hooks`의 `useRegisterDeviceTokenMutation` 호출.
- **앱(셸 어댑터) 소유**: 셸 지식 전부 — 토큰 획득 방법, `CHATIC_APP_*` window 전역 판독, "지금 네이티브 셸인가" 판정. 셸이 아니면 `delegate: null`을 넘겨 no-op으로 만든다.

`SocketSessionDelegate`와 같은 역전 패턴이다 — 런타임은 셸을 모르고, 앱이 획득 경로만 주입한다.

## 등록 전략 (설치당 1회)

등록 성공을 `PushRegistrationRecord`에 남기고, 그 기록이 현재 **계정 · 디바이스 · platform · 토큰**과 일치하는 한 다시 부르지 않는다. 기록은 불리언이 아니라 **등록에 성공한 토큰**을 담는다 — 스킵의 의미가 "이미 한 번 했다"가 아니라 "바뀐 게 없다"여야 하기 때문이다.

계정 uid는 `getRelaySessionUser()`에서 읽는다. `useSessionIdentity().userId`는 **활성 슬롯**의 토큰에서 나오므로 클라우드에 진입하면 값이 흔들리고, 그걸로 키를 만들면 "설치당 1회"가 "클라우드 전환당 1회"로 무너진다.

실제로 호출할 때는 항상 `force: true`다. 브로커는 1시간 내 재등록을 통째로 스킵하는 가드를 갖고 있고, `force`가 그걸 뚫는 유일한 수단이다.

### 기록은 두 계층이다

- **웹 계층** — `@chatic/shared`의 `storage`(네이티브 셸 안에서는 localStorage). **동기**라서 포그라운드 복귀 경로가 브릿지 왕복 없이 판단할 수 있다.
- **네이티브 계층** — `nativeRecordMirror`를 준 셸에서만. WebView 캐시 삭제를 견디며, **비동기**라 마운트 후 1회 hydrate해 메모리에 올린다. 웹 계층이 비었는데 네이티브가 답할 수 있으면 웹 계층을 백필한다.

hydrate는 복귀 fast path보다 **뒤에서**, 그리고 토큰 fetch와 **나란히**(`Promise.all`) 실행한다. 뒤에 두는 건 브릿지 왕복을 피하려고 브릿지 왕복을 하면 앞뒤가 안 맞기 때문이고, 직렬로 엮지 않는 건 둘 다 10초 타임아웃짜리 브릿지 request라 늘어질 때 타임아웃이 연달아 붙기 때문이다. 아직 hydrate 전인 부팅은 최악의 경우 쓸데없는 토큰 fetch를 한 번 하지만, 뒤따르는 토큰 비교가 호출 자체는 막는다.

모바일만 미러를 준다(`pushRegistration` preference). 데스크톱은 Electron main에 Preference 핸들러가 없어 웹 계층만 쓴다. 그리고 웹 번들이 앱보다 먼저 배포되므로, **릴리스 직후 미러가 동작하지 않는 것이 정상이다** — 구버전 앱은 쓰기를 `PREF_KEY_NOT_WRITABLE`로 거부하고 읽기는 빈 값을 준다. 둘 다 삼켜지고 웹 계층만으로 종전과 동일하게 동작한다.

> **감수한 것**: SNS는 배달 실패 한 번으로 platform endpoint를 disable하고 `CreatePlatformEndpoint`는 그것을 되살리지 못한다. 매번 force 재등록하던 이전 전략은 그 자가복구를 노린 것이었고, 설치당 1회는 그것을 포기한 대가로 호출량을 얻는다. 남은 복구 경로는 스펙 문서 S8에 정리되어 있다.

### 트리거

| 시점                                     | 동작                                                                         |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| 인증 완료(런치, 재로그인·계정 전환 포함) | 토큰을 fetch해 기록과 비교 — 다르면 등록. 토큰 로테이션이 잡히는 유일한 지점 |
| focus / `visibilitychange`(visible)      | 기록이 있으면 **토큰 fetch도 없이 즉시 종료**. 없을 때만 등록 시도           |
| `subscribeTokenChange` 알림 (셸 제공 시) | floor를 비우고 즉시 재등록                                                   |
| fetch 실패·빈 토큰·등록 API 실패         | 기록을 남기지 않고 floor 리셋 — 다음 트리거에서 즉시 재시도                  |
| 등록 진행 중 겹치는 트리거               | 무시 (in-flight guard)                                                       |

부팅에서만 fetch하고 복귀에서 건너뛰는 비대칭은 의도적이다. 로테이션 감지는 부팅에서만 일어나야 하고, 복귀는 하루 수십 번 도는 경로라 브릿지 왕복까지 없애야 한다.

### 60초 floor의 역할

재등록 간격이 아니다 — 상한은 기록이 담당한다. 남은 역할은 두 가지다: 한 번의 포그라운드 전환이 `focus`와 `visibilitychange`로 두 번 들어오는 것을 흡수하고, 계정 uid를 얻지 못해 기록을 쓸 수 없는 폴백 상태에서 호출이 폭주하는 것을 막는다.

### uid를 얻지 못하면

키를 만들 수 없으므로 기록을 읽지도 쓰지도 못한다. 이때는 **기존 동작(매번 등록)으로 폴백한다.** 등록을 건너뛰어 디바이스를 조용히 죽이는 것보다, 호출이 안 줄어드는 편이 안전한 실패 방향이다.

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
        nativeRecordMirror, // Fetch/SavePreference — key 'pushRegistration'
    };
}, []);

useDeviceTokenRegistration(delegate);
```

마운트 위치는 앱 자유다 — apps/web은 `GlobalBridgeListener`, apps/desktop-web은 `DesktopRuntime`에서 호출한다. `RuntimeConnectionHost`에 내장하지 않은 이유: delegate가 앱(셸) 컨텍스트를 요구하므로 인자 없이 Host에서 호출할 수 없다.

### `stage` 주의

데스크톱은 `stage`를 반드시 주입한다. 없으면 브로커가 자기 기본값(`dev`)으로 등록하고, 토큰이 귀속된 Firebase 프로젝트와 SNS 자격증명 프로젝트가 어긋나 FCM이 `SENDER_ID_MISMATCH`로 거부하며, SNS는 그 endpoint를 자동 Disable한다. 등록 API는 성공을 반환하므로 로그로는 드러나지 않는다. 모바일은 빌드 flavor의 `google-services.json`을 쓰므로 현재 주입하지 않는다.

## 비책임

- 셸에서 토큰을 만드는 방법(FCM/APNs 권한 요청·토큰 발급) — 네이티브 셸 소유.
- 수신 푸시 라우팅/알림 표시 — 셸과 앱의 브리지 이벤트 경로 소유.
- 등록 API 자체 — `data/hooks`의 `useRegisterDeviceTokenMutation`(→ 게이트웨이)이 소유하며 여기서는 호출만 한다.

## 관련 코드

- 훅: `libs/app-runtime/src/push/hooks/useDeviceTokenRegistration.ts`
- 등록 기록: `libs/app-runtime/src/push/registrationRecord.ts`
- apps/web 어댑터: `apps/web/src/app/bridge/useDeviceTokenRegistration.ts`
- apps/desktop-web 어댑터: `apps/desktop-web/src/app/shared/hooks/useDeviceTokenRegistration.ts`
- 수신 이후 경로(배지·토스트·cid 역추적)와 운영 인시던트 기록: [`docs/specs/cross-cloud-push.md`](../../../../docs/specs/cross-cloud-push.md)
