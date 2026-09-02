# 2026-09 죽은 코드 일제 점검 (진입점 없는 심볼·고아 모듈)

> 작성: 2026-09-02 · 대상 트리: `claude/adr-0070-session-hub` (`c64cd8bbb`) · 범위: `apps/**` · `libs/**`
>
> 계기: ADR-0070에서 `@chatic/web-core`·`apps/admin`·레거시 lib 3개를 삭제하고 refresh 체인을
> 걷어낸 뒤, **호출부가 사라진 채 남은 심볼**을 걷어내기 위한 사전 조사. 이 문서는 "무엇을 지울지"
> 까지만 확정하고, 삭제는 아래 배치 단위로 별도 커밋에서 수행한다.

---

## 0. TL;DR

1. **완전 무참조 심볼 57개** — 선언 파일 안에서도, 배럴에서도, 테스트에서도 아무도 안 쓴다. 즉시 삭제 대상.
2. **배럴만 통과하는 심볼 18개**(오탐 1건 정정 후) — 순수 re-export 배럴에 이름만 올라 있고 소비자가 없다. 구현 + 배럴 줄을 같이 지운다.
3. **고아 모듈 26개** — 엔트리포인트에서 import 그래프로 도달 불가능한 파일. 파일째 삭제 후보.
4. **테스트만이 생명유지장치인 심볼 26개** — 이 중 `reset*` 계열 11개는 정당한 테스트 시임이라 **유지**,
   나머지는 프로덕션 경로가 없다.
5. **판단이 필요한 4건(§4)** — 단순 죽은 코드가 아니라 **기능이 배선을 잃은 흔적**이다. 지우기 전에
   "되살릴 것인가"를 먼저 정해야 한다: 서비스 장애 오버레이, 초대 클라우드 자가치유 훅,
   `getActiveServerIdentityToken`(문서와 코드 불일치), `app-runtime/src/http/index.ts` 배럴.
6. **`libs/app-runtime`·`libs/http` 몫은 2026-09-02에 삭제 완료** — 무엇을 지웠고 무엇을 남겼는지는 §6.
7. 부수 발견: **`export`가 불필요한 심볼 459개**(자기 파일 안에서만 쓰임). 삭제가 아니라 가시성 축소
   대상이라 이번 배치에서는 제외한다.

### 탐지 방법과 한계

식별자 빈도 + import 그래프 도달성으로 뽑고, 후보는 전수 `rg`로 재확인했다.

- **오탐 제거:** `index.html`·jest config가 문자열로 가리키는 엔트리(`apps/mobile/src/main-web.tsx`,
  `__mocks__/*`, `jest.setup.ts`, `test-setup.ts`)는 제외했다.
- **오탐 1건 정정:** `WEB_SOCIAL_OAUTH_ENDPOINT`는 죽지 않았다 — 허브가
  `WEB_SOCIAL_OAUTH_ENDPOINT as SOCIAL_OAUTH_ENDPOINT`로 **이름을 바꿔** 재수출하고
  `apps/desktop-web/.../auth/utils/oauth.ts`가 그 별칭을 쓴다. 별칭 재수출은 원래 이름의 참조를
  배럴 한 줄로 만들기 때문에 이 탐지기가 구조적으로 놓치는 지점이다 — **`as` 재수출은 항상 손으로 확인할 것.**
- **한계:** 문자열로 동적 참조되는 심볼, 네이티브(Java/Kotlin/Swift)에서만 불리는 브릿지, 빌드 산출물
  (`*.jsbundle.map`)의 흔적은 신호로 치지 않았다. 아래 목록의 심볼은 전부 TS 소스에서 참조 0을 확인했다.
- **줄 번호는 스윕 시점(`c64cd8bbb`) 기준**이다. 같은 워크트리에서 다른 세션이 작업 중이라
  (`apps/admin-v2/.../client-container.ts`, `libs/app-runtime/docs/**`) 삭제 직전에 심볼 이름으로
  다시 찾을 것.
- 재현 스크립트는 세션 스크래치패드(`deadexports.js` / `dead2.js` / `orphans.js`)에 있다. 상시 도구로
  승격하려면 `scripts/`로 옮기고 `check:undefined-names`처럼 스크립트를 붙이면 된다.

---

## 1. 배치 A — 완전 무참조 (참조 0, 즉시 삭제)

### A-1. apps/web

| 심볼                                                                                                                                                                                                                                                                                              | 위치                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `useOnGetContacts` · `useOnSetCanGoBack` · `useOnOpenModal` · `useOnCloseModal` · `useOnUploadProgress` · `useOnUploadComplete` · `useOnFinishPurchaseTransaction` · `useOnFetchCurrentPurchases` · `useOnFetchProducts` · `useOnFetchFcmToken` · `useOnNavigate` · `useOnFetchPreference` (12개) | `src/app/bridge/useHandleAppMessage.ts:35-93`      |
| `KOREAN_PHONE_DIGITS_MAX`                                                                                                                                                                                                                                                                         | `src/app/features/channels/utils/koreanPhone.ts:9` |
| `resetRelayAccountGateway`                                                                                                                                                                                                                                                                        | `src/app/runtime/relayAccountGateway.ts:39`        |
| `PreferenceName` (type)                                                                                                                                                                                                                                                                           | `src/app/stores/preferenceKeys.ts:181`             |

`useHandleAppMessage.ts`는 이미 같은 이유로 링버퍼 훅 4개를 지운 전례가 파일 주석에 남아 있다
("had no consumers even before that"). 이번 12개도 같은 성격 — 범용 `useHandleAppMessage(type, handler)`가 있어서
편의 래퍼가 필요 없었다. **지금 실제로 쓰이는 래퍼**(`useOnBackPressed` ·
`useOnReceiveNotification` · `useOnUpdateDeviceInfo` · `useOnBackgroundStatusChanged` ·
`useOnPurchaseSuccess` · `useOnPurchaseError` · `useOnOAuthLogin`)는 남긴다.

### A-2. apps/admin-v2 (`features/socket-lab`)

`Sparkline`(`components/charts/Sparkline.tsx:10`) · `createDefaultDeviceDraft`(`demo-model.ts:115`) ·
`formatViewing`(`:214`) · `formatRelativeTime`(`:222`) · `statusOf`(`lib/stats.ts:55`) ·
`statusColor`(`:60`) · `stripE2eMarker`(`runtime/client-container.ts:122`) ·
`DemoJoinView`/`DeviceRegistryEntry`(type, `demo-model.ts:53,79`).

### A-3. apps/mobile

`postAppMessage`(`webview/core/bridge.ts:53`) · `receiveWebMessage`(`:70`) ·
`extractCampaignParams`(`services/deeplinks/deeplinkUtils.ts:97`) · `isDeepLinkDomain`(`:50`) ·
`DEEPLINK_DOMAIN_PROD`(`:30`) · `DEEPLINK_DOMAIN_DEV`(`:31`) ·
`DEFAULT_UPLOAD_POLICY`(`services/upload/types.ts:68`) · `LogTag`(type, `services/log/types.ts:11`).

> `postAppMessage`/`receiveWebMessage`는 브릿지 파일에 있지만 네이티브에서 문자열로 불리는 대상이
> 아니다(주입 스크립트는 `createBridge` 경로를 쓴다). 삭제 전 `bridge.ts` 헤더 주석만 확인할 것.

### A-4. apps/landing

`generateFingerprint`(`features/deeplink/utils/fingerprint.ts:1`) — 파일째 고아(§3).

### A-5. libs

| 심볼                                                                         | 위치                                                                                  |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `MAX_RETRIES`                                                                | `libs/http/src/error/classify.ts:18`                                                  |
| `BRIDGE_VERSION_INFO`                                                        | `libs/bridges/src/version.ts:18`                                                      |
| `AppLogInfoLogContext` (type)                                                | `libs/bridges/src/logger/appLogInfoCodec.ts:19`                                       |
| `WEB_HOST` · `WEB_WS_ENDPOINT`                                               | `libs/web-config/src/env.ts:130,137`                                                  |
| `useGoBack`                                                                  | `libs/shared/src/hooks/usePageTransition.ts:41`                                       |
| `PaginationType` · `ErrorMessageType` (type)                                 | `libs/shared/src/types/index.ts:28` · `consts/index.ts:46`                            |
| `SiteProfileBody` · `SiteProfileView` · `DomainInviteCloud` (type)           | `libs/data/src/data/domain/models.ts:50,51,55`                                        |
| `CacheStorageItem` (type)                                                    | `libs/data/src/data/local/ports/cacheStorage.ts:44`                                   |
| `ScrollDataPayload` · `WebMessageAppHandler` · `WebMessageHandlerMap` (type) | `libs/app-messages/src/types/model/system.ts:235` · `web-message-response.ts:105,127` |
| `CloudSessionIssueTokenResult` (type)                                        | `libs/app-runtime/src/session/store/types.ts:74`                                      |
| `IconProps` (type)                                                           | `libs/web-ui-kit/src/resources/icons/index.ts:35`                                     |

`MAX_RETRIES`·`ISocketClient`는 삭제 완료(§6). `CacheStorageItem`은 문서
(`libs/db/docs/architecture.md`)에 이름이 남아 있으니 삭제 커밋에 문서 수정도 포함한다.

---

## 2. 배치 B — 배럴만 통과 (구현 + 배럴 줄 동시 삭제)

해당 `index.ts`가 전부 순수 re-export임을 확인했다.

| 심볼                                                               | 구현                                                                       | 배럴                                                                                |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `MainLayout` · `PublicLayout` · `SafeAreaLayout`                   | `apps/web/src/app/ui/layouts/{MainLayout,PublicLayout,SafeAreaLayout}.tsx` | `apps/web/src/app/ui/layouts/index.ts:1,3,4`                                        |
| `InviteCodeCard`                                                   | `apps/web/src/app/features/channels/components/InviteCodeCard.tsx:10`      | 같은 폴더 `index.ts:3`                                                              |
| `LimitExceededDialog` · `SettingsControl`                          | `apps/web/src/app/ui/components/`                                          | `apps/web/src/app/ui/components/index.ts`                                           |
| `ModalScreen`                                                      | `apps/mobile/src/app/features/main/screens/ModalScreen.tsx:12`             | 같은 폴더 `index.ts:2`                                                              |
| `Loader` · `TokenGeneratorModal`                                   | `libs/shared/src/components/`                                              | `libs/shared/src/components/index.ts`                                               |
| `useBlocker` · `useDeviceId` · `useLocalStorage` · `usePagination` | `libs/shared/src/hooks/`                                                   | `libs/shared/src/hooks/index.ts`                                                    |
| `deleteUndefinedProperty`                                          | `libs/shared/src/utils/deleteUndefinedProperty.ts:1`                       | `libs/shared/src/utils/index.ts`                                                    |
| `useAppChecker`                                                    | `libs/device-utils/src/hooks/useAppChecker.ts:5`                           | `libs/device-utils/src/hooks/index.ts:2`                                            |
| `getTranslations`                                                  | `libs/i18n-mobile/src/translate.ts:12`                                     | `libs/i18n-mobile/src/index.ts:3`                                                   |
| `resetWebTransport`                                                | `libs/app-runtime/src/http/transport.ts:73`                                | `libs/app-runtime/src/http/index.ts:29` (그 배럴 자체가 고아, §4-4)                 |
| `waitForVerified`                                                  | `apps/desktop-web/src/app/shared/utils/waitForVerified.ts:8`               | `apps/desktop-web/.../utils/index.ts:1` — **보류**(desktop-web은 이번 배치 대상 외) |

`ModalScreen`은 모달 라우트가 이미 제거된 흔적이 있다(`e6387b136` "remove unused modal navigation
types"). 현재 어떤 navigator에도 등록돼 있지 않다.

---

## 3. 배치 C — 고아 모듈 (파일째 삭제)

엔트리포인트(`apps/*/src/main.tsx` · `apps/desktop/src/{main,preload}` · `apps/mobile/index.js` ·
`libs/*/src/index.ts` · 모든 테스트 · 설정 파일)에서 import 그래프로 도달하지 못한 파일.

**apps/web (7)** — `features/auth/utils/index.ts` · `features/channels/stores/index.ts` ·
`features/home/types/index.ts` · `features/invite/accept/lib/index.ts` ·
`features/invite/components/index.ts` (이상 소비자 없는 배럴, ADR-0046 배럴 위생과 같은 방향) ·
`features/home/hooks/useReconcileInvitedClouds.ts`(§4-2) ·
`ui/components/ServiceUnavailableOverlay.tsx`(§4-1).

**apps/admin-v2 (6)** — `features/socket-lab/api/deviceApi.ts` ·
`components/charts/Sparkline.tsx` · `hooks/{use-client-container,use-device-list,use-metrics,use-store}.ts`.

**apps/landing (5)** — `features/deeplink/utils/{fingerprint.ts,index.ts}` ·
`shared/hooks/{index.ts,useToast.ts}` · `i18n/index.ts`.

**libs/ui-kit (12)** — 아무도 import 하지 않는 shadcn 프리미티브: `accordion` · `alert` · `badge` ·
`breadcrumb` · `checkbox` · `command` · `pagination` · `scroll-area` · `select` · `separator` ·
`tabs` · `textarea`. (`libs/ui-kit/src/index.ts`는 `./utils`만 내보내고, 나머지는
`@chatic/ui-kit/components/ui/<name>` 딥 임포트로 소비된다 — 위 12개는 그 딥 임포트가 0건.)
**결정 필요:** 디자인 시스템 재고로 남길지, 필요할 때 shadcn CLI로 다시 받을지.

**libs/app-runtime (1)** — `src/http/index.ts` (§4-4).

---

## 4. 판단이 필요한 건 (지우기 전에 결정)

### 4-1. 서비스 장애 오버레이 — 기능이 통째로 배선을 잃었다

- `setServiceUnavailable`(`libs/app-runtime/src/session/hooks/app/useServiceUnavailable.ts:13`)을
  호출하는 곳이 **하나도 없다.** 도입 커밋은 `8641140cf` "block app access on server 5xx errors
  during cloud token refresh" — 5xx 감지 지점이 web-core refresh 체인이었고, 그 체인은
  ADR-0070(`0f336f2c2`)에서 사라졌다.
- 소비자 `ServiceUnavailableOverlay`도 `ada4e9b78`(채널 라우팅 리팩터)에서 `app.tsx`의 마운트가
  빠지면서 고아가 됐다.
- 따라서 지금 트리에서 **서버 5xx 차단 화면은 존재하지 않는다.** 선택지: (a) 게이트웨이 에러 경로에
  다시 배선하고 오버레이를 `app.tsx`에 마운트, (b) 기능 폐기로 확정하고 `useServiceUnavailable` ·
  `getServiceUnavailable` · `setServiceUnavailable` · `ServiceUnavailableOverlay` · 허브 배럴 항목 ·
  `libs/app-runtime/jest.config.js`의 관련 주석까지 일괄 삭제.

### 4-2. `useReconcileInvitedClouds` — 자가치유 훅이 마운트되지 않는다

`apps/web/src/app/features/home/hooks/useReconcileInvitedClouds.ts:20`. 게스트가 초대로 담은
클라우드를 나중에 실계정으로 로그인했을 때 `cloudType:'invited'` 캐시 행을 청소하는 훅인데, 호출부가
없다. 즉 **그 오분류가 지금은 스스로 낫지 않는다.** ADR-0070 마이그레이션 스펙
(`docs/specs/adr-0070-migration.SPEC.md:115`)은 이 훅을 `useCloudSessionCatalog` 소비자로 세고 있어
살아 있다고 가정한다. 선택지: (a) `HomePage`에 마운트, (b) 삭제 + 스펙 표 갱신.

### 4-3. `getActiveServerIdentityToken` — 문서와 코드가 어긋난다

`libs/app-runtime/src/session/store/contexts.ts:32`. 참조 0인데
`apps/web/docs/architecture/data-flow.md:28`은 `useSocketDelegate`의 `getSocketToken`이 이걸 쓴다고
적어 놓았다. 실제 배선을 확인해 **문서를 고치고 심볼을 지울지**, 아니면 배선이 빠진 것인지 판정한다.
같은 파일의 `getRelaySessionContext`(:18) · `getSessionIdentityContext`(:23) · `clearCloudSession`(:57)과
`session/store/signal.ts`의 `readLocalJson`(:18) · `writeLocalJson`(:27),
`session/auth/services.ts:294`의 `selectDefaultCloudSession`도 같은 상태 —
**`public-surface.test.ts`(배럴 스냅샷 가드)만이 이들을 붙잡고 있다.** 삭제 시 그 스냅샷 목록도 함께 줄인다.

### 4-4. `libs/app-runtime/src/http/index.ts` — 문서를 담은 고아 배럴

ADR-0070 결정 1·4의 근거를 서술한 헤더 주석이 이 파일에 있는데, 정작 `src/index.ts`는 이 배럴을
거치지 않고 `./http/transport` 같은 딥 경로를 직접 재수출한다. 선택지: (a) 허브 배럴이 이 파일을
경유하게 바꿔 문서를 살린다, (b) 헤더 주석을 `HttpManager.ts`로 옮기고 배럴을 지운다. (b)를 택하면
`resetWebTransport`(배치 B)도 같이 사라진다.

---

## 5. 유지 판정 (죽어 보이지만 지우지 않는다)

- **테스트 시임 `reset*` 11개** — `resetGateways` · `resetNativeCacheSupport` · `resetPerfMetrics` ·
  `resetRouteTrail` · `resetWebRunId` · `resetNativeUploadQueueSupport` · `resetCacheDomainVersions` ·
  `resetNativeBatchReadSupport` · `resetNativeLastChatsSupport` · `__resetUrlMetadataCache` ·
  `createMockSocketGateways`. 모듈 싱글턴을 테스트에서 격리하기 위한 정당한 표면이다.
- **`IconImage` · `IconUsers` 등 아이콘 배럴** — 배럴 주석이 "outline 짝은 의도적으로 유지"라고
  명시한다.
- **`libs/ui-kit`의 나머지 shadcn 컴포넌트** — 딥 임포트 소비자가 있다.

한편 **테스트만이 붙잡고 있으나 프로덕션 경로가 없는** 것들은 삭제 후보로 남긴다:
`useSyncTarget` · `useProfileSync`(`libs/app-runtime/src/socket/sync/hooks/useSyncTarget.ts:19,88` —
`libs/app-runtime/docs/public-surface.md:43`이 이미 "내부 전용(앱 미사용)"이라고 적어 둠) ·
`formatPhoneNumber`(`apps/web/.../auth/utils/phone.ts:16`) ·
`RoomNotificationDialog`(`apps/web/.../channels/components/RoomNotificationDialog.tsx:19`) ·
`ButtonGroup`(`libs/web-ui-kit/.../ButtonGroup.tsx:15`) · admin-v2 `demo-model.ts`의 포맷터 8개.
이들은 **테스트/스토리까지 같이 지워야** 하므로 배치 A·B와 분리해 커밋한다.

---

## 6. 실행 기록

### 2026-09-02 · `ISocketClient` 삭제 (완료)

사용자 지시로 `ISocketClient` 하나만 떼어 삭제했다. 배치 A(§1-A-5)의 항목이며, 폴더에 이
인터페이스밖에 없어 `remote/socket-clients/` 자체가 사라졌다.

| 삭제                         | 파일                                                  |
| ---------------------------- | ----------------------------------------------------- |
| `ISocketClient` (interface)  | `libs/data/src/data/remote/socket-clients/clients.ts` |
| 배럴 파일째                  | `libs/data/src/data/remote/socket-clients/index.ts`   |
| `libs/data` 루트 배럴 재수출 | `libs/data/src/index.ts`                              |

부수 갱신: `libs/data/docs/remote/README.md` 3곳(구성 트리 · 폴더 설명 · 2026-09-01 리네임 표의
`remote/sockets/clients/` 행).

### 2026-09-02 · `libs/app-runtime` + `libs/http` 배치 (완료)

사용자 지시로 이 두 lib에 한정해 삭제했다. `apps/**`는 이번 배치에서 손대지 않았다.

| 삭제                                                                                                          | 파일                                                                                                               |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `MAX_RETRIES`                                                                                                 | `libs/http/src/error/classify.ts`                                                                                  |
| `CloudSessionIssueTokenResult` (type)                                                                         | `libs/app-runtime/src/session/store/types.ts`                                                                      |
| `getRelaySessionContext` · `getSessionIdentityContext` · `getActiveServerIdentityToken` · `clearCloudSession` | `libs/app-runtime/src/session/store/contexts.ts` (미사용 import `RelayContext`·`rebuildSessionIdentity` 동반 정리) |
| `readLocalJson` · `writeLocalJson`                                                                            | `libs/app-runtime/src/session/store/signal.ts`                                                                     |
| `selectDefaultCloudSession`                                                                                   | `libs/app-runtime/src/session/auth/services.ts`                                                                    |
| `resetWebTransport` (테스트도 안 쓰는 시임)                                                                   | `libs/app-runtime/src/http/transport.ts`                                                                           |
| `src/http/index.ts` 파일째 (§4-4을 (b)안으로 처리)                                                            | `libs/app-runtime/src/http/`                                                                                       |

부수 갱신: `public-surface.test.ts`의 EXPECTED 목록에서 7개 제거 · `libs/http/docs/architecture.md`
2곳.

**검증:** `tsc -b`(app-runtime · http · apps/web · admin-v2 · testbed) 전부 0 · `jest` app-runtime
52스위트 486케이스 · http 12스위트 72케이스 통과 · eslint 신규 경고 0(`services.ts:420`의 `target`
경고는 선재, 콜백 형태 유지를 위한 의도된 인자).

**남긴 것 / 넘긴 것:**

- **§4-1 ServiceUnavailable 클러스터 보류.** `getServiceUnavailable`·`setServiceUnavailable`·
  `useServiceUnavailable`은 삭제하려면 `apps/web`의 오버레이까지 같이 지워야 해서, 이번 범위 밖이자
  "되살릴지" 결정이 먼저다. 허브 표면 목록에도 그대로 남겨 뒀다.
- **`useSyncTarget`·`useProfileSync` 유지.** `useChatSync`/`useChannelSync`/`usePlaceSync`/
  `useJoinSync`와 한 가족으로 문서화된 대칭 API이고 `useSyncTarget`은 같은 파일에서 실제로 쓰인다.
  `useProfileSync`만 떼면 가족이 깨진다.
- **테스트 시임 유지** — `resetGateways` · `resetNativeCacheSupport` · `getNativeCacheSupport`.
- **후속 문서 2건(다른 세션 소유라 손대지 않음):**
  `libs/app-runtime/docs/architecture.md:154`가 방금 지운 `http/index.ts`를 "존재할 수 있다"의
  근거로 든다 — 그 문서는 지금 다른 세션이 전면 개정 중이라 건드리지 않았다. 그리고
  `apps/web/docs/architecture/data-flow.md:28`은 **코드에 존재하지 않는** `useSocketDelegate`가
  `getActiveServerIdentityToken()`을 쓴다고 적어 놨다(심볼 삭제 이전부터 이미 틀린 문장).

---

## 7. 실행 순서 제안

| 배치 | 내용                                          | 검증                                                                     |
| ---- | --------------------------------------------- | ------------------------------------------------------------------------ |
| 0    | ~~`libs/app-runtime`·`libs/http`~~ (완료, §6) | ✔                                                                       |
| 1    | §1 배치 A 나머지 (참조 0 심볼)                | `nx run-many -t typecheck` · 영향 앱 build                               |
| 2    | §2 배치 B (구현 + 배럴)                       | 동일 + `libs/app-runtime` `public-surface.test.ts` 스냅샷 갱신 여부 확인 |
| 3    | §3 배치 C (고아 파일)                         | 동일 + `apps/landing`·`apps/admin-v2` build                              |
| 4    | §5 후단 (테스트 동반 삭제)                    | 해당 lib/app 테스트 스위트                                               |
| 5    | §4 결정 항목                                  | 결정에 따라 배선 복구 커밋 또는 삭제 커밋                                |

`apps/desktop-web`은 이번 스윕에서 **참조만** 하고 손대지 않는다(별도 세션의 미커밋 작업 존재).
