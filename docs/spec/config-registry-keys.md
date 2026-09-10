# `@chatic/config` 레지스트리 키 제안

> 상태: **Draft (제안)** · 작성일: 2026-09-08
> 소속: [ADR-0079](../adr/0079-config-registry-and-lane-resolver.md) 미결 #2의 답안.
> 수정: [ADR-0080](../adr/0080-debug-panel-shared-model-and-stage-visibility.md)이 `env.buildStage`를 추가하고
> `debug.overlayEnabled`에 `byStage`·`meta`를 얹는다. ADR-0079 결정 3이 모든 엔트리에 `title`·`description`을
> **필수**로 요구하므로, 아래 84행은 각각 그 둘을 채워야 완성이다 — §미완 참조. 결정 3의 키 선언
> 형태와 결정 4의 레인 표를 전제한다.
> 실측 기준 커밋: `a6a428d4b` (2026-09-08)

## 이 문서가 답하는 것

ADR-0079는 "무엇이 키가 되고 무엇이 빌드 사실로만 남는지"를 미결로 남겼다. 이 문서가 현 트리의 원천을
전수로 분류해 그 답을 제안한다.

**분류 원칙 세 줄.**

1. **레지스트리 한 표에 다 넣는다.** 빌드 사실도 예외가 아니다 — `writableBy: []`(쓸 수 있는 레인 없음)인
   엔트리로 들어온다. 그래야 접근자가 하나이고, "이 값 어디서 왔나"의 답이 한 곳에서 나온다.
2. **정체성과 비밀은 넣지 않는다.** 디버그 패널·서버 레인·영구 셸 KV가 붙은 표에 기기 식별자를 두는 것은
   위험을 늘리기만 한다. §카브아웃 참조.
3. **`byStage`로 표현되는 코드 분기는 키로 승격한다.** 지금 `isDevBuild()`·`VITE_ENV !== 'PROD'` 삼항으로
   흩어진 게이트가 규칙표의 한 행이 된다. §feature 참조.

## 원천 전수 (실측)

| 원천                               | 실측                                                      | 처분                           |
| ---------------------------------- | --------------------------------------------------------- | ------------------------------ |
| `VITE_*` (웹 번들)                 | **20종** 코드 참조                                        | 키 승격 또는 `env.*` 사실      |
| `MAIN_VITE_*` (Electron main)      | **8종** — 데스크톱 메인 프로세스 전용, 별개 Vite 인스턴스 | **범위 밖** (셸 내부 설정)     |
| `.env.example` 선언 중 코드 미참조 | **10종**                                                  | **삭제 제안** (§죽은 env)      |
| 셸 주입 전역 `window.CHATIC_APP_*` | **20종** — 그중 14종은 `deviceInfoStore`가 이미 소유      | 6종만 키, 14종은 카브아웃/사실 |
| `PREFERENCES`                      | **12키**                                                  | 전부 키 (`ui.*` · `debug.*`)   |
| 로그 스위치                        | localStorage 3키 + 빌드 플래그 1 + 주입 전역 1            | **2키로 축약** (§log)          |
| 모바일 `debugSettingsStore`        | **9필드**                                                 | 전부 키 (`debug.*`)            |

## `system.*` — 리졸버 메타 (2키)

| 키                         | type    | default | byStage      | writableBy  | persist | 대체 대상 |
| -------------------------- | ------- | ------- | ------------ | ----------- | ------- | --------- |
| `system.overridesUnlocked` | boolean | `true`  | `PROD:false` | `['shell']` | shell   | 신규      |
| `system.remote.enabled`    | boolean | `false` | —            | `['shell']` | shell   | 신규      |

`overridesUnlocked`는 ADR-0079 결정 5. PROD가 fail-closed다 — 이 리포의 스테이지는 `LOCAL`·`DEV`·`PROD`
셋뿐이고 `STAGING`은 존재하지 않는다(ADR-0079 결정 14의 실측).

**여는 방법과 수명은 지금과 같다.** 웹의 10탭 + 입장 코드로 열고, `persist: 'session'`이라 다음 웹 부팅
때 꺼진다. 앱에는 독자적인 잠금 해제 경로가 없으므로(브릿지 핸들러 하나뿐) 웹이 유일한 열쇠다.

`remote.enabled`는 **원격 레인(1·4행) 자체의 스위치**다. 원격 컨피그가 망가졌을 때 원격으로 끌 수 없으므로
(닭-달걀) 셸만 쓸 수 있다. 기본 `false`이므로 **어댑터가 꽂혀도 이 키를 켜기 전까지 레인은 비어 있다** —
배선과 개시를 분리해 어댑터를 먼저 머지하고 켜는 것은 나중에 결정할 수 있다
([결정 10 §지금 출하하는 것](../adr/0079-config-registry-and-lane-resolver.md)).

## `env.*` — 읽기 전용 사실 (13키, `writableBy: []` · `persist: 'none'`)

| 키                   | type   | 원천                                | 비고                                             |
| -------------------- | ------ | ----------------------------------- | ------------------------------------------------ |
| `env.stage`          | enum   | `VITE_ENV` / `CHATIC_APP_STAGE`     | **리졸버의 입력** — 아래 부트스트랩 참조         |
| `env.buildStage`     | enum   | **`import.meta.env.VITE_ENV`만**    | **보안 규칙 전용** — 위조 불가 (ADR-0080 결정 5) |
| `env.platform`       | enum   | `CHATIC_APP_PLATFORM`               | 지금 **11파일이 직독** 중인 값의 종착지          |
| `env.project`        | string | `VITE_PROJECT`                      |                                                  |
| `env.region`         | string | `VITE_REGION`                       |                                                  |
| `env.host`           | string | `VITE_HOST`                         |                                                  |
| `env.appId`          | string | `subscription/consts` `APP_ID` 삼항 | `byStage`로 표현 (§feature와 같은 승격)          |
| `env.webVersion`     | string | `VITE_APP_VERSION`                  | 사이드바 표시용                                  |
| `env.appVersion`     | string | `CHATIC_APP_CURRENT_VERSION`        |                                                  |
| `env.appBuildNumber` | string | `CHATIC_APP_BUILD_NUMBER`           |                                                  |
| `env.osVersion`      | string | `CHATIC_APP_OS_VERSION`             |                                                  |
| `env.deviceModel`    | string | `CHATIC_APP_DEVICE_MODEL`           | 비식별 기기 사실 (모델명). 식별자는 카브아웃     |
| `env.webviewBaseUrl` | string | `VITE_WEBVIEW_BASE_URL`             | 앱이 어디서 웹을 로드했나. 런타임 변경 불가      |

**스테이지 값은 `LOCAL` · `DEV` · `PROD` 셋뿐이다.** `STAGING`은 이 리포에 없다. 그리고 어휘가 두 벌이라
(`VITE_ENV`의 대문자 3값 vs `app-messages`의 `Env = 'local'|'stage'|'prod'`) 어댑터가 정규화한다 —
ADR-0079 결정 14.

**`env.stage`와 `env.buildStage`는 다른 값이다.** 현행 `env.ts`는 `window.ENV || import.meta.env.VITE_ENV`로
**주입 전역이 빌드 상수를 이긴다.** 지금은 무해하지만(스테이지에 걸린 보안 결정이 없다) 디버그 노출을
스테이지로 판정하면 위조 가능한 값이 보안 게이트가 된다. 그래서 보안 성질을 갖는 `byStage` 규칙
(`debug.*` · `system.overridesUnlocked`)은 `env.buildStage`로 판정한다. 자세한 근거는
[ADR-0080 결정 5](../adr/0080-debug-panel-shared-model-and-stage-visibility.md).

**부트스트랩 순환은 없다.** `byStage` 규칙은 `env.stage`를 입력으로 쓰지만, `env.stage`는
`writableBy: []`이므로 레인 1~4를 건너뛰고 5~6(규칙·기본값)에서만 해석된다. 자기 자신에 `byStage`를 쓰지
않는다는 것이 유일한 제약이고, 리졸버가 그것을 검증한다.

## `net.*` — 엔드포인트 (9키)

| 키                             | type   | default 원천                         | writableBy  | persist | 비고                                   |
| ------------------------------ | ------ | ------------------------------------ | ----------- | ------- | -------------------------------------- |
| `net.relay.backend`            | string | `VITE_DOU_ENDPOINT`                  | `['local']` | session | `getDynamicRelayBackend` · `?_backend` |
| `net.relay.wss`                | string | `VITE_WS_ENDPOINT`                   | `['local']` | session | `getDynamicRelayWss` · `?_wss`         |
| `net.oauth.endpoint`           | string | `VITE_OAUTH_ENDPOINT`                | `[]`        | none    |                                        |
| `net.socialOauth.endpoint`     | string | `VITE_SOCIAL_OAUTH_ENDPOINT`         | `[]`        | none    |                                        |
| `net.iap.endpoint`             | string | `VITE_IAP_ENDPOINT`                  | `[]`        | none    |                                        |
| `net.admin.backend`            | string | `VITE_BACKEND_ENDPOINT`              | `[]`        | none    | admin-v2 전용                          |
| `net.policy.baseUrl`           | string | `byStage`                            | `[]`        | none    | `POLICY_BASE_URL` 삼항 승격            |
| `net.deeplink.scheme`          | string | `'chatic'` / `DEV:'chatic-dev'`      | `[]`        | none    | 모바일 2파일에 같은 삼항 중복          |
| `net.deeplink.desktopProtocol` | string | `VITE_DESKTOP_PROTOCOL` (`'chatic'`) | `[]`        | none    | desktop-web `oauth.ts:21`              |

**엔드포인트에 `'server'`가 없다** — ADR-0079 결정 10. 원격 컨피그가 백엔드 주소를 갈아치우는 수단이 되면
안 된다. 오버라이드 가능한 두 개가 `session`인 것은 현행 `env.ts`가 이미 근거를 적어둔 결정을 그대로
잇는다: 오버라이드는 QA 편의이고, 영구 저장하면 링크 한 번이 앱을 다른 스택에 못박는다.

`net.deeplink.scheme`은 모바일 2파일이 같은 `VITE_ENV === 'DEV' ? …` 삼항을 각자 들고 있던 것을 규칙표
한 행으로 합친 것이다 — §feature의 승격과 같은 종류이며, 도메인상 `net.*`에 둔다.

## `ui.*` — 사용자 옵션 (10키) — `PREFERENCES` 흡수

| 키                          | type            | default | writableBy          | persist | 대체 대상                                   |
| --------------------------- | --------------- | ------- | ------------------- | ------- | ------------------------------------------- |
| `ui.theme`                  | enum d/l/system | `light` | `['shell','local']` | shell   | `PREFERENCES.theme` + `CHATIC_APP_THEME`    |
| `ui.language`               | enum            | `ko`    | `['shell','local']` | shell   | `PREFERENCES.language` + `CURRENT_LANGUAGE` |
| `ui.blurLastMessage`        | boolean         | `false` | `['shell','local']` | shell   | `PREFERENCES.blurLastMessage`               |
| `ui.onboardingCompleted`    | boolean         | `false` | `['shell','local']` | shell   | `PREFERENCES.isFirstRun` (**반전 제거**)    |
| `ui.pushMuted`              | boolean         | `false` | `['local']`         | local   | `PREFERENCES.pushMuted`                     |
| `ui.channelSort`            | json            | `{}`    | `['local']`         | local   | `PREFERENCES.channelSort`                   |
| `ui.pinnedChannels`         | json            | `{}`    | `['local']`         | local   | `PREFERENCES.pinnedChannels`                |
| `ui.recentSearches`         | json            | `[]`    | `['local']`         | local   | `PREFERENCES.recentSearches`                |
| `ui.cloudPromoDismissedAt`  | number          | `0`     | `['local']`         | local   | `PREFERENCES.cloudPromoDismissedAt`         |
| `ui.dismissedUpdateVersion` | string          | `''`    | `['local']`         | local   | `PREFERENCES.dismissedUpdateVersion`        |

**`isFirstRun`의 반전을 없앤다.** 현행은 localStorage에 `'true'`=완료를 저장하면서 상태 이름은 그 역이라
주석으로 경고를 달아야 했다. 키를 `onboardingCompleted`로 두면 저장값과 의미가 일치한다. 레거시 localKey
(`chatic-onboarding-completed`)는 일회성 마이그레이션으로 읽어들인다.

**`ui.theme`은 부팅 전 동기 읽기 계약이 필요하다.** [index.html:25](../../apps/web/index.html:25)의 인라인
스크립트가 번들 로드 **전에** `localStorage` + `window.CHATIC_APP_THEME`을 읽어 다크 플래시를 막는다. config
이관 후에도 이 인라인 읽기가 성립해야 하므로, `persist: 'shell'` 키의 저장 위치와 키 이름이 인라인
스크립트에서 계산 가능해야 한다 — 스펙에서 고정할 계약이다.

`PREFERENCES.canceledInvites`는 승격하지 않는다. 마이그레이션 잔재이며 "줄어들기만 하는" 키라, 배수가
끝나면 은퇴한다. 이관 3단계에서 잔량을 확인하고 그대로 삭제할 것을 제안한다.

## `log.*` — 로깅 (6키) — 로그 레버 5개가 3키로 줄어든다

| 키                       | type    | default | byStage          | writableBy                   | persist | 대체 대상                                     |
| ------------------------ | ------- | ------- | ---------------- | ---------------------------- | ------- | --------------------------------------------- |
| `log.collection.enabled` | boolean | `true`  | —                | `['local']`                  | local   | `LOG_UPLOAD_DISABLED_KEY` (기기 opt-out)      |
| `log.upload.enabled`     | boolean | `true`  | —                | `['shell','local','server']` | local   | `VITE_LOG_UPLOAD_DISABLED` + `..._FORCED_KEY` |
| `log.upload.hold`        | boolean | `false` | —                | `['shell','local']`          | local   | `LOG_UPLOAD_HOLD_KEY` + `APP_LOG_UPLOAD_HOLD` |
| `log.keepDebug`          | boolean | `false` | `LOCAL/DEV:true` | `['shell','local']`          | none    | `import.meta.env.DEV` (main.tsx)              |
| `log.console.mirror`     | boolean | `false` | `LOCAL/DEV:true` | `['shell','local']`          | none    | `CHATIC_APP_CONSOLE_ENABLED`                  |
| `log.perf.runId`         | string  | `''`    | —                | `['shell']`                  | none    | `CHATIC_APP_RUN_ID`                           |

**레버 5개가 3키로 줄어드는 것이 레인 모델의 첫 배당금이다.**
[logUploadSwitch.ts](../../apps/web/src/app/runtime/logging/logUploadSwitch.ts)의 `FORCED_KEY`는 "빌드가
껐지만 그래도 보내라"는 뜻인데, 이는 **오버라이드 레이어가 없어서 존재하는 두 번째 키**다. 빌드 플래그가
`log.upload.enabled`의 기본값이 되고 강제가 그 키의 로컬 레인 오버라이드가 되면, 키 하나로 같은 일을 한다.

세 레버의 **도달 범위 차이는 유지된다** — 그 구분이 원 설계의 요점이었다. `collection.enabled`는
프라이버시(수집 자체 중단, 큐 폐기)라 **서버가 못 켠다**. `upload.hold`는 디버깅용(쌓되 보내지 않음)이라
별 키로 남는다. 우선순위(hold가 forced를 이긴다)는 소비 지점의 조합 규칙으로 그대로 옮긴다.

## `debug.*` — 디버그 도구 (6키)

| 키                              | type              | default                    | writableBy          | persist | 대체 대상                                             |
| ------------------------------- | ----------------- | -------------------------- | ------------------- | ------- | ----------------------------------------------------- |
| `debug.overlayEnabled`          | boolean           | `false` / `LOCAL,DEV:true` | `['shell','local']` | session | `PREFERENCES.debugSettings` + `CHATIC_APP_DEBUG_MODE` |
| `debug.entryCode`               | string            | `''`                       | `[]`                | none    | `VITE_DEBUG_CODE` (fail-closed)                       |
| `debug.mockService.mode`        | enum off/local/fx | `off`                      | `['shell']`         | shell   | `mockServiceMode`                                     |
| `debug.mockService.baseUrl`     | string            | `''`                       | `['shell']`         | shell   | `mockServiceBaseUrl`                                  |
| `debug.overlay.backdropOpacity` | number            | `0.35`                     | `['shell']`         | shell   | `overlayBackdropOpacity`                              |
| `debug.overlay.contentOpacity`  | number            | `1`                        | `['shell']`         | shell   | `overlayContentOpacity`                               |

**`meta: true`인 키는 범용 패널이 렌더하지 않는다** — `system.overridesUnlocked` · `system.remote.enabled` ·
`debug.overlayEnabled` · `debug.entryCode` 4종. 그러지 않으면 잠금을 풀어야 들어가는 패널이 잠금을 푸는
스위치를 담는다 ([ADR-0080 결정 6](../adr/0080-debug-panel-shared-model-and-stage-visibility.md)).

**`debug.overlayEnabled`의 `byStage`가 LOCAL/DEV를 기본 노출로 만든다** — 로컬 개발에서 10탭 마찰이
사라지고, 웹과 네이티브가 같은 행을 읽으므로 정책이 어긋날 수 없다. PROD는 `false`를 유지해 지금과 같이
언락을 요구한다. `'local'`을 남기는 것은 의도적이다: PROD 이슈를 브라우저·desktop-web에서 재현할 때
10탭+코드가 유일한 입구다. **엔트리 코드 검증은 config가 아니라 호출부 플로우가 소유한다.**

**웹 주소를 바꾸는 두 키는 뺐다.** `debug.webviewBaseUrl`과 `debug.environmentSettings`가 사라졌고,
읽기 전용 빌드 사실 `env.webviewBaseUrl`만 남는다. 기능 자체를 없앴기 때문이다
([ADR-0080 결정 13](../adr/0080-debug-panel-shared-model-and-stage-visibility.md)) — 목록으로 제한해도
PROD는 계속 닫아야 하므로, 닫힌 채로 둘 기능을 위해 목록·검증·복구를 다 만드는 셈이 된다.

**`debug.overlayEnabled`와 `system.overridesUnlocked`는 다른 키다.** 전자는 _화면 진입_(세션 수명), 후자는
_쓰기 레인 개방_(셸 영구). 지금도 각각 `debugSettings`(session)와 네이티브 FAB 게이트로 분리돼 있고, 수명과
쓰는 주체가 다르므로 합치면 안 된다.

`customZipLocalRoot`/`customZipServerUrl`은 승격하지 않는다 — 후자는 원 코드가 "persist하면 흰 화면"이라고
명시한 런타임 전용 값이고, 둘 다 모바일 내부 프로세스 상태에 가깝다. 셸 내부 상태로 남긴다.

## `feature.*` — 삼항으로 흩어진 게이트를 규칙표로 (6키)

지금 `isDevBuild()`와 `VITE_ENV !== 'PROD'` 분기로 표현된 것들이다. **전부 `byStage` 한 행으로 표현되며,
이것이 "빌드나 스테이징 정보에 따라 기본값이 바뀐다"의 실물이다.** 승격하면 스테이징 빌드에서 개별로 켜고
끌 수 있게 된다 — 지금은 빌드를 바꿔야 한다.

| 키                               | type    | default / byStage          | writableBy                   | 현행 위치                                        |
| -------------------------------- | ------- | -------------------------- | ---------------------------- | ------------------------------------------------ |
| `feature.auth.phoneLogin`        | boolean | `false` / `LOCAL,DEV:true` | `['shell','local','server']` | `LoginPage.tsx:37`                               |
| `feature.auth.phoneDevSwitches`  | boolean | `false` / `LOCAL,DEV:true` | `['shell','local']`          | `usePhoneVerify.ts:521`                          |
| `feature.auth.lenientVerifyCode` | boolean | `false` / `LOCAL,DEV:true` | `['shell','local']`          | `VerificationCodeInput.tsx:21`                   |
| `feature.auth.socialLogin`       | boolean | `true` / `PROD:false`      | `['shell','local','server']` | desktop-web `oauth.ts:29`                        |
| `feature.subscription.dryRun`    | boolean | `false` / `LOCAL,DEV:true` | `['shell','local']`          | `useAddCloud.ts:53` · `useVerifyEmailCode.ts:42` |
| `feature.limits.enforced`        | boolean | `true` / `LOCAL,DEV:false` | `['shell','local','server']` | `HomePage.tsx:284,301`의 `!isDevBuild()`         |

`feature.limits.enforced`는 한도값이 아니라 **한도 우회 게이트**다. 현행 `!isDevBuild() &&`가 그 게이트를
빌드 종류에 못박아 둔 것이고, 키로 올리면 스테이징 빌드에서 개별로 풀 수 있다. 한도값 자체(`MAX_PLACES` ·
`MAX_CHANNELS_PER_PLACE`)는 **config에 넣지 않는다** — §카브아웃 5 참조.

## 카브아웃 — 레지스트리에 넣지 않는다 (23종)

**1. 기기 정체성 (5종)** — `CHATIC_APP_DEVICE_ID` · `UNIQUE_DEVICE_ID` · `INSTALLATION_ID` ·
`FIREBASE_INSTALLATION_ID` · `DEVICE_TOKEN`.
디버그 패널·서버 레인·영구 셸 KV가 붙은 표에 식별자를 두면 노출 표면만 늘어난다. 설정이 아니라 정체성이고,
이미 [`deviceInfoStore`](../../libs/device-utils/src/stores/deviceInfoStore.ts)가 소유한다. 그대로 둔다.

**2. 서버 파생 상태 (2종)** — `CHATIC_APP_LATEST_VERSION` · `CHATIC_APP_SHOULD_UPDATE`.
업데이트 점검의 *결과*이지 설정이 아니다. 기본값·스테이지 규칙·오버라이드가 모두 무의미하다.
`deviceInfoStore.versionInfo`에 남는다.

**3. Electron 메인 프로세스 env (9종)** — `MAIN_VITE_*` 8종 + `VITE_DESKTOP_LANGUAGE`. 별개 Vite
인스턴스이거나 `process.env`로 읽히며(후자), 웹 번들이 볼 수 없는 셸 내부 설정이다. 데스크톱 셸 자신의
문제로 남긴다.

**4. 모바일 IAP·OAuth 상수 (4종)** — `VITE_SUBSCRIPTION_IAP_*` 3종 · `VITE_GOOGLE_WEB_CLIENT_ID`.
RN 네이티브 모듈 초기화에 들어가는 빌드 상수로, 런타임에 바뀔 수 없다. 필요해지면 `env.*` 사실로 편입한다.

**5. 제품 엔타이틀먼트 (3종)** — `MAX_PLACES` 10 · `MAX_CHANNELS_PER_PLACE` 100 · `GUEST_MAX_CHANNELS` 3
([consts.ts](../../apps/web/src/app/utils/consts.ts)).

이것은 판단을 한 번 뒤집은 항목이다. number 토글의 좋은 사례로 보였지만, **이미 승인된 ADR이 반대 방향을
정해 두었다.** [ADR-0060](../adr/0060-subscription-tier-quota-from-server.md)이 클라우드 한도의 출처를
**서버 상품 목록**으로 옮겼고, 클라이언트는 `useCloudQuota`가 플랜 카탈로그를 조인해 읽는다 — 서버에는
`guardQuota` 강제도 있다. 채널 생성 역시 이미 `planTier !== 'free'`로 등급에 묶여 있다.

즉 이 세 값은 운영 튜너블이 아니라 **구독 등급의 일부**다. config 레지스트리에 넣으면 제품 한도의 출처가
두 개가 되고, 클라이언트 오버라이드가 서버 강제와 어긋나면 "UI는 허용, 서버는 거절"이 된다. ADR-0060의
경로(서버 상품 목록)로 옮기는 것이 맞고, 그것은 이 트랙이 아니라 별도 트랙이다.

**`limit.*`의 범위는 운영 가드로 한정한다** — 등급과 무관하고 서버 강제가 없는 것(이미지 크기, SMS 재전송,
검색 결과 수)만 남긴다.

## 죽은 env — 삭제 제안 (10종)

`.env.example`에 선언돼 있으나 **코드 참조가 0건**이다. 레지스트리에 넣지 말고 `.env.example`에서 지운다.

`VITE_FIREBASE_API_KEY` · `VITE_FIREBASE_APP_ID` · `VITE_FIREBASE_AUTH_DOMAIN` ·
`VITE_FIREBASE_MEASUREMENT_ID` · `VITE_FIREBASE_MESSAGING_SENDER_ID` · `VITE_FIREBASE_PROJECT_ID` ·
`VITE_FIREBASE_STORAGE_BUCKET` · `VITE_FRONT_ENDPOINT` · `VITE_IMAGE_API_ENDPOINT` · `VITE_SOC_ENDPOINT`

> Firebase 7종은 웹에 Firebase SDK 초기화 경로가 없는데도 예제에 남아 있다. 푸시는 셸이 FCM으로 처리한다.
> 삭제 전에 배포 파이프라인(`.github`)이 이 이름들을 주입하는지 확인이 필요하다 — 주입만 하고 아무도 읽지
> 않는 상태일 가능성이 높다.

## 2차 스윕 — 튜너블 (타이밍 · 재시도 · 한도)

1차는 "설정처럼 보이는 것"(env · 주입 전역 · preference)만 훑었다. 실제로 운영 중 바꾸고 싶어지는 값
대부분은 **`libs/*`에 박힌 상수**다 — 브릿지 타임아웃, 세션 리프레시 주기, 재시도 횟수, 캐시 TTL. 이들이
지금은 전부 코드 상수라 **바꾸려면 빌드와 배포가 필요하다.**

**이 스윕이 `config`의 위치를 검증한다.** 아래 키의 절반이 `libs/app-runtime` · `libs/http` · `libs/data` ·
`libs/bridges` · `libs/logger`에 산다. ADR-0079 결정 1의 "`@chatic` 의존 0"이 아니었다면 이 lib들이 config를
임포트할 수 없어(순환) 스윕 결과의 절반이 실현 불가였다.

### 스키마 확장 — `appliesAt`이 필요하다

튜너블에는 1차 키에 없던 성질이 있다: **값을 바꿔도 즉시 듣지 않는 것이 있다.** `AUTH_OPTIONS`는 소켓 생성
시점에 SDK로 넘어가므로([SocketManager.ts:621](../../libs/app-runtime/src/socket/SocketManager.ts:621))
재접속해야 적용된다. 이걸 표시하지 않으면 디버그 패널이 "껐다"고 말하는데 실제로는 안 꺼진 상태가 되고,
그건 표가 없는 것보다 나쁘다.

```ts
/** 값 변경이 실제로 듣는 시점. 디버그 패널이 이 값을 그대로 라벨로 쓴다. */
appliesAt: 'live' | 'reconnect' | 'restart';
```

1차 키는 전부 `'live'`이므로 기본값을 `'live'`로 두면 기존 선언은 바뀌지 않는다.

### `bridge.*` — 브릿지 타이밍 (2키)

| 키                               | type   | default  | appliesAt   | 현행 위치                                               |
| -------------------------------- | ------ | -------- | ----------- | ------------------------------------------------------- |
| `bridge.request.timeoutMs`       | number | `15_000` | **restart** | [provider.ts:14](../../libs/bridges/src/provider.ts:14) |
| `bridge.handshake.waitTimeoutMs` | number | `10_000` | live        | **4파일 중복** (web 3 · desktop-web 1)                  |

**기본값이 두 개로 갈라져 있다.** `provider.ts`는 `timeoutMs: 15000`을 넘기는데
[`WebBridgeClient.ts:52`](../../libs/bridges/src/web/WebBridgeClient.ts:52)의 자체 기본값은 `?? 10000`이다.
어느 쪽이 실효인지는 provider를 거치느냐에 달렸다 — 키로 올리면 하나가 된다.

`HANDSHAKE_WAIT_TIMEOUT_MS = 10_000`은 `usePushNavigate` · `useSearchNavigate` · `useRelayInviteFlow` ·
desktop-web `HomePage`에 **같은 값이 네 번** 선언돼 있다. §feature의 삼항 중복과 같은 종류다.

### `auth.*` — 세션 · 인증 리프레시 · 시도 횟수 (10키)

| 키                                      | type   | default   | appliesAt     | 현행 위치                               |
| --------------------------------------- | ------ | --------- | ------------- | --------------------------------------- |
| `auth.sdk.refreshRatio`                 | number | `0.8`     | **reconnect** | `socket/constants.ts:26` `AUTH_OPTIONS` |
| `auth.sdk.maxFailures`                  | number | `3`       | **reconnect** | 같음 (SDK 기본 5에서 낮춘 값)           |
| `auth.sdk.refreshIntervalMs`            | number | `300_000` | **reconnect** | 같음 (`SDK_REFRESH_CYCLE_MS`의 원천)    |
| `auth.verify.timeoutMs`                 | number | `10_000`  | live          | `DEFAULT_VERIFY_TIMEOUT_MS`             |
| `auth.staleness.checkIntervalMs`        | number | `30_000`  | live          | `useSessionStalenessGuard.ts:99`        |
| `auth.staleness.forceRefreshCooldownMs` | number | `60_000`  | live          | 같음 `:106` (스톰 가드)                 |
| `auth.init.maxRetries`                  | number | `3`       | live          | `useRelaySessionInit.ts:11`             |
| `auth.init.retryDelayMs`                | number | `2_000`   | live          | 같음 `:12`                              |
| `auth.keepAlive.retryFloorMs`           | number | `5_000`   | live          | `useRelaySessionKeepAlive.ts:17`        |
| `auth.credential.retrySleepMs`          | number | `60_000`  | live          | `useCloudCredentialGuard.ts:68`         |

`auth.sdk.*` 3키는 `writableBy`에서 **`'server'`를 뺀다.** 토큰 갱신 주기를 원격으로 잘못 내리면 전 기기가
동시에 갱신 폭주를 일으킬 수 있고, 그 상태를 원격으로 되돌리려면 다시 이 값을 써야 하는데 그때는 이미
백엔드가 부하 중이다. 셸·로컬만 허용한다.

### `sync.*` — 소켓 · 동기화 주기 (6키)

| 키                               | type   | default   | appliesAt | 현행 위치                         |
| -------------------------------- | ------ | --------- | --------- | --------------------------------- |
| `sync.profile.channelIntervalMs` | number | `20_000`  | live      | `useChannelProfiles.ts:16`        |
| `sync.profile.listIntervalMs`    | number | `60_000`  | live      | `useDmPeers.ts:15`                |
| `sync.unregisterGraceMs`         | number | `30_000`  | live      | `socket/sync/constants.ts:22`     |
| `sync.wake.kickThrottleMs`       | number | `5_000`   | live      | web + desktop-web에 같은 값 중복  |
| `sync.resume.initialCooldownMs`  | number | `30_000`  | live      | `bootstrapSocketConnection.ts:45` |
| `sync.resume.maxCooldownMs`      | number | `300_000` | live      | 같음 `:46`                        |

`sync.profile.*`와 `sync.resume.*`는 `'server'`를 **포함한다** — 백엔드가 힘들 때 폴링 주기를 원격으로
늘리는 것이 이 레인의 가장 정당한 용도다.

### `net.retry.*` — HTTP 재시도 (2키)

| 키                      | type   | default | appliesAt | 현행 위치                                             |
| ----------------------- | ------ | ------- | --------- | ----------------------------------------------------- |
| `net.retry.maxRetries`  | number | `4`     | live      | [retry.ts:53](../../libs/http/src/policy/retry.ts:53) |
| `net.retry.baseDelayMs` | number | `1_000` | live      | 같음 `:80` `Math.pow(2, attempt) * 1000`              |

지수(`2^attempt`)는 노출하지 않는다 — 백오프 형태를 런타임에 바꾸는 것은 값 조정이 아니라 알고리즘 교체다.

### `cache.*` — 캐시 TTL (3키)

| 키                        | type   | default     | appliesAt | 현행 위치                                                     |
| ------------------------- | ------ | ----------- | --------- | ------------------------------------------------------------- |
| `cache.ttl.defaultMs`     | number | `1_800_000` | live      | `local/ports/policy.ts` (channel·join·profile·site·user 공통) |
| `cache.ttl.metaMs`        | number | `300_000`   | live      | 같음 — **마이그레이션 임시값**                                |
| `cache.retiredGroupTtlMs` | number | `60_000`    | live      | `data-sources-v2/types.ts:83`                                 |

**`cache.ttl.metaMs`가 이 스윕 전체에서 가장 설득력 있는 사례다.** 코드 주석이 직접 이렇게 적고 있다:

> TEMPORARY (migration): held at 5 minutes while data is migrating. … Cost: every user returning from
> an inactivity gap over 5 minutes pays a full re-sync, which is real server load.
> **Restore to `30 * MINUTE_MS` once the migration is done.**

지금 이 복구는 **코드 수정 + 빌드 + 배포**다. 키로 올리면 마이그레이션이 끝난 날 서버 레인에서 값 하나
바꾸는 일이 된다. 실제 서버 부하가 걸린 값이 배포 사이클에 묶여 있는 상태다.

### `log.upload.*` 확장 (5키)

| 키                       | type   | default                    | appliesAt   | 현행 위치             |
| ------------------------ | ------ | -------------------------- | ----------- | --------------------- |
| `log.upload.batchSize`   | number | `50`                       | **restart** | `uploadPolicy.ts:18`  |
| `log.upload.intervalMs`  | number | `60_000`                   | **restart** | 같음 `:19`            |
| `log.upload.backoffMs`   | json   | `[5_000, 30_000, 120_000]` | **restart** | 같음 `:20`            |
| `log.upload.maxAttempts` | number | `5`                        | **restart** | 같음 `:29`            |
| `log.perf.samplePercent` | number | `10`                       | live        | `perf/sampling.ts:23` |

전부 `'server'`를 포함한다 — 수집기가 힘들 때 배치·주기·샘플률을 원격으로 조이는 것이 로그 파이프라인
운영의 핵심 레버다.

> **`appliesAt` 정정 (실측).** 위 네 개를 처음에 `live`로 적었으나 틀렸다.
> [`LogUploadScheduler`](../../libs/logger/src/upload/LogUploadScheduler.ts) 생성자가
> `this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS` 식으로 **인스턴스 필드에 캡처**하므로,
> 값을 바꿔도 스케줄러를 다시 만들기 전에는 아무 일도 일어나지 않는다. `bridge.request.timeoutMs`도 같다
> ([`WebBridgeClient`](../../libs/bridges/src/web/WebBridgeClient.ts) 생성자 캡처).
> `log.perf.samplePercent`는 반대로 `isSampledRun(runId, percent = PERF_SAMPLE_PERCENT)` 기본 인자라
> 호출마다 읽히므로 `live`가 맞다.
>
> **교훈이 규칙이 된다: `appliesAt`은 소비 형태를 확인하고 적어야 하며, 확인 전 기본값은 `'restart'`다.**
> 나머지 키의 `appliesAt`도 같은 확인을 거쳐야 하고, 그 전까지 이 문서의 `live` 표기는 주장이지 사실이
> 아니다 — §스펙 단계로 넘기는 미결 참조. `log.upload.enabled`(1차)와 함께 쓰면 "완전 차단"과 "부하 경감"을 구분할 수 있다.

### `limit.*` 확장 (4키)

| 키                                  | type   | default      | appliesAt | 현행 위치                             |
| ----------------------------------- | ------ | ------------ | --------- | ------------------------------------- |
| `limit.image.maxBytes`              | number | `10_485_760` | live      | **5파일 중복** (10MB)                 |
| `limit.auth.resendLimit`            | number | `5`          | live      | `usePhoneVerify.ts:27` `RESEND_LIMIT` |
| `limit.feedback.maxPhotos`          | number | `5`          | live      | `FeedbackPage.tsx:26`                 |
| `limit.search.maxResultsPerSection` | number | `20`         | live      | `useGlobalSearch.ts:27`               |

`limit.auth.resendLimit`은 남용 방지 레버라 `'server'`를 포함한다 — SMS 비용이 튀는 날 원격으로 조일 수
있어야 한다.

## config로 만들지 않는 것 — 튜너블 중에서

**1. UI 마이크로 타이밍.** 원격·로컬에서 바꿀 운영상의 이유가 없고, 20개를 표에 넣으면 표가 노이즈로
덮인다. 코드 상수로 남긴다.

`LONG_PRESS_DELAY_MS` 450 · `TOAST_REMOVE_DELAY` 1000 · `SUCCESS_CLOSE_DELAY` 1300 ·
`DIVIDER_CLEAR_DELAY_MS` 1000 · `EMPTY_SETTLE_MS` 600 · 검색/읽음 `DEBOUNCE_MS` 300·500 ·
`REFETCH_DEBOUNCE_MS` 300 · `REFRESH_COALESCE_MS` 1000 · `PERSIST_DEBOUNCE_MS` 1000

**2. 디버그 화면 자체의 갱신 주기.** `CacheMetricsScreen` `REFRESH_MS` 1000 · `MetricsCollector`
`ROLLING_WINDOW_MS` 10000 · `LogBufferScreen` `LOG_FETCH_LIMIT` 20 등. 관측 도구의 내부 상수이고,
디버그 화면에서 자기 갱신 주기를 토글로 노출하는 것은 순환이다.

**3. 프로토콜 정합성 상수.** `EXPIRY_CONFIRMATION_MS` 30000(`renewers.ts` — 토큰 만료 판정 창) ·
`IndexedDBDatabase` `DB_VERSION` 3 · `UNSENT_CHAT_NO` 0. 값이 어긋나면 동작이 나빠지는 게 아니라 **깨진다.**
런타임에 쓸 수 있게 만들면 안 된다. 필요하면 `writableBy: []` 읽기 전용 엔트리로만 노출한다.

**4. 제품 문구 규칙.** `MAX_NAME_LENGTH` 30 · `MAX_DESC_LENGTH` 100 · `MAX_INPUT_LENGTH` 5000 등. 서버
검증과 짝이 맞아야 하므로 클라이언트만 런타임에 바꾸면 어긋난다. 서버 계약이 config로 내려오는 날 다시 본다.

**단, 중복은 별건으로 정리한다.** 위 "유지" 판정은 "지금 위치에 그대로 둔다"가 아니다.
`MAX_IMAGE_SIZE` 10MB가 **5파일**, `LONG_PRESS_DELAY_MS` 450이 **2파일**, `UNFURL_TIMEOUT_MS` 3000이
desktop·mobile **2파일**에 각각 재선언돼 있다. 키로 올리지 않더라도 공유 상수로 합치는 것은 필요하며,
이관과 무관한 독립 정리 항목이다.

## 합계

| 도메인      | 1차 | 2차 (튜너블) | 계     |
| ----------- | --- | ------------ | ------ |
| `system.*`  | 2   | —            | 2      |
| `env.*`     | 13  | —            | 13     |
| `net.*`     | 9   | 2            | 11     |
| `ui.*`      | 10  | —            | 10     |
| `log.*`     | 6   | 5            | 11     |
| `debug.*`   | 6   | —            | 6      |
| `feature.*` | 6   | —            | 6      |
| `limit.*`   | —   | 4            | 4      |
| `bridge.*`  | —   | 2            | 2      |
| `auth.*`    | —   | 10           | 10     |
| `sync.*`    | —   | 6            | 6      |
| `cache.*`   | —   | 3            | 3      |
| **합계**    | 52  | 32           | **84** |

원천(20 `VITE_*` · 20 전역 · 12 `PREFERENCES` · 로그 레버 3 · 모바일 9 = 중복 제외 64개)에서 **줄어드는
쪽**은 카브아웃 23종(기기 정체성 5 · 서버 파생 2 · 모바일 빌드 상수 4 · Electron 9 · 제품 엔타이틀먼트 3), 승격 안 함 3종
(`canceledInvites` · customZip 2), 그리고 같은 개념의 원천 병합이다 — `theme`·`language`·`debugMode`·`stage`가
각각 env와 주입 전역 두 원천을 갖고 있어 4키가 줄고, 로그 레버 5개가 3키로 합쳐져 2키가 줄어든다.
**늘어나는 쪽**은 삼항 승격 11종(§feature·`env.appId`·`net.policy.baseUrl`)과 신규 2종(`system.*`)이다.

도메인 하나가 15키를 넘지 않으므로 ADR-0079 결정 2의 도메인별 모듈 분할이 그대로 성립한다.
중복 키는 테스트가 잡는다 — 실행 중에는 앱을 죽이지 않고 나중에 온 키만 버린다. 편집 지점은
키당 **레지스트리 한 행**이다 — 현행 `PREFERENCES` 키 하나가 요구하는 5곳과 대비된다.

## 노출면 분포 — 84키가 누구 화면에 뜨는가

ADR-0079 결정 3의 `surface` 축이다. 도메인(주제)·`writableBy`(쓰기 경로)와 직교한다.
**이번에 화면을 붙이는 것은 `user` · `labs` · `dev` 셋이다**(결정 15). `internal`은 화면이 없는 키다.

| 도메인      |     계 | `user` | `labs` |  `dev` | `internal` |
| ----------- | -----: | -----: | -----: | -----: | ---------: |
| `system.*`  |      2 |        |        |      2 |            |
| `env.*`     |     12 |        |        |     12 |            |
| `net.*`     |     11 |        |        |      4 |          7 |
| `ui.*`      |     10 |      4 |        |        |          6 |
| `log.*`     |     11 |        |        |     11 |            |
| `debug.*`   |      8 |        |        |      8 |            |
| `feature.*` |      6 |        |        |      6 |            |
| `limit.*`   |      4 |        |        |      4 |            |
| `bridge.*`  |      2 |        |        |      2 |            |
| `auth.*`    |     10 |        |        |     10 |            |
| `sync.*`    |      6 |        |        |      6 |            |
| `cache.*`   |      3 |        |        |      3 |            |
| **계**      | **84** |  **4** |  **0** | **67** |     **13** |

소수파 17개만 열거하면 나머지 67개는 전부 `dev`다.

**`user` (4)** — 설정 화면에 컨트롤이 뜨고 일반 사용자가 켜고 끈다.
`ui.theme` · `ui.language` · `ui.blurLastMessage`(메시지 미리보기 블러) · `ui.pushMuted`

**`internal` (13)** — 어떤 화면에도 컨트롤이 없다. 코드가 읽거나 제품 UI가 자기 흐름으로 쓴다.
`ui.onboardingCompleted` · `ui.channelSort` · `ui.pinnedChannels` · `ui.recentSearches` ·
`ui.cloudPromoDismissedAt` · `ui.dismissedUpdateVersion` · `net.oauth.endpoint` ·
`net.socialOauth.endpoint` · `net.iap.endpoint` · `net.admin.backend` · `net.policy.baseUrl` ·
`net.deeplink.scheme` · `net.deeplink.desktopProtocol`

> `ui.channelSort`·`pinnedChannels`·`recentSearches`가 `user`가 **아닌** 것이 이 축의 쓸모다. 사용자가
> 바꾸는 값은 맞지만 바꾸는 자리가 채널 목록의 정렬 선택기·핀 제스처·검색창이지 설정 화면이 아니다.
> `user`로 두면 자동 생성된 설정 화면에 "고정 채널" 행이 뜨는데, 그건 말이 안 된다.

**`labs` (0)** — 비어 있다. **이번 범위에 화면은 들어오지만 그 안에 넣을 키가 아직 없다**
([ADR-0079 결정 15](../adr/0079-config-registry-and-lane-resolver.md)).

승격 후보로 적었던 `feature.*` 6개는 다시 보면 후보가 아니다. 전부 개발 빌드에서만 열리는
게이트(전화 로그인 · 결제 dry-run 등)라 **사용자에게 내보낼 성격이 아니다.** 실험실에 넣을 기능은 따로
정해야 한다.

**서버 레인이 없어도 끌 수 있다.** `writableBy`가 레지스트리에 있고 레지스트리는 웹 번들 안에 있으므로,
웹 배포로 `'local'`을 빼면 3행이 자격을 잃고 사용자가 켜둔 값이 무시된다. 느린 킬 스위치가 이미 있는
셈이고, 서버 레인은 그것을 배포 없이 즉시 만드는 것이다.

### 여기서 나오는 판단 하나

**80%(67/84)가 `dev`다.** 이 레지스트리는 사용자 설정 표가 아니라 **운영 표**다. 그래서:

- **범용 디버그 패널은 값어치가 크다** — 67행이 키별 코드 없이 그려진다.
- **범용 설정 화면은 아직 아니다** — `user`가 4행뿐이라 [SettingsPage](../../apps/web/src/app/features/mypage/pages/SettingsPage.tsx)를
  레지스트리 구동으로 바꿔도 얻는 게 거의 없고, 사용자 화면은 문구·배치·묶음이 제품 결정이라 자동 생성이
  오히려 손해다. `surface: 'user'`는 **"이 4개가 사용자 노출"이라는 사실을 표에 적어두는 값**이지,
  화면을 생성하라는 지시가 아니다.
- `labs`가 생기면 이 판단이 바뀔 수 있다 — 실험실은 항목이 자주 늘고 줄며 문구가 일정하므로 자동 생성에
  맞는 형태다.

## 키가 아닌 것 — 디버그 화면의 동작 3개

레지스트리는 key-value만 담는다. 값을 갖지 않는 **동작**은 여기 들어오지 않는다. 디버그 화면에 넣기로 한
동작 셋은 [ADR-0080 결정 14](../adr/0080-debug-panel-shared-model-and-stage-visibility.md)가 소유한다 —
로그 지금 보내기 · 지금 설정 전체 보기 · 캐시 도메인별 비우기. 셋 다 기능은 이미 있고 부를 길만 없다.

## 시나리오 — 실제로 어떻게 쓰이나

규칙만 보면 이해가 안 된다. 이 리포에 실제로 있는 값으로 여덟 가지를 따라가 본다. 각 사례 끝에 **어느
행이 이겼는지** 적었다. 그게 [레인 표](../adr/0079-config-registry-and-lane-resolver.md)를 읽는 법이다.

### 1. 서버 부하를 지금 줄여야 한다

`libs/data`의 캐시 정책 파일에 이런 주석이 있다.

> 마이그레이션 중이라 5분으로 잡아둠. 5분 넘게 쉬었다 돌아온 사용자는 전체 재동기화를 한다.
> **실제 서버 부하다.** 마이그레이션 끝나면 30분으로 되돌릴 것.

**지금은** 되돌리려면 코드를 고치고 빌드하고 배포해야 한다.
**바뀌면** 마이그레이션이 끝난 날 `cache.ttl.metaMs`를 30분으로 바꾼다. 배포가 없다.

→ **4행(서버 기본값)이 이긴다.** 개발자가 자기 기기에서 다른 값으로 시험 중이면 3행이 이긴다.

### 2. 로그 수집 서버가 힘들다

앱들이 60초마다 50건씩 보낸다. 수집기가 버거워한다.

**지금은** 웹을 다시 배포해야 하고, 앱은 심사를 기다린다.
**바뀌면** 서버에서 `log.upload.intervalMs`를 5분으로, `log.upload.batchSize`를 20으로 내린다.

**다만 즉시 듣지 않는다.** `LogUploadScheduler`가 생성자에서 값을 복사하므로 `appliesAt: 'restart'`이고,
패널도 "다시 시작해야 적용"이라고 표시한다. **정말 급하면** `log.upload.enabled`를 끈다. 이건 보낼 때마다
확인하므로 즉시 멈춘다.

→ **4행.** 급할 때 쓰는 `enabled`는 서버가 `enforced`로 내리면 **1행**이 된다.

### 3. 내보낸 기능이 망가졌다

새 기능을 켰는데 특정 기기에서 앱이 죽는다.

**지금은** 방법이 없다. 킬 스위치가 아예 없다.
**바뀌면** 서버가 그 키를 `enforced`로 끈다.

→ **1행이 전부를 이긴다.** 개발자가 로컬에서 켜둔 기기도 같이 꺼진다. 그게 킬 스위치를 맨 위에 둔 이유다.

**자동 복구가 붙어 있다.** 서버가 킬을 멈추면 TTL이 지나 저절로 풀린다. 서버에 못 닿는 기기가 영원히
잠기지 않는다. **1행이 고장 나면** 조용히 다음 행으로 넘어간다 — 오류로 전부 꺼버리면 더 큰 사고다.

### 4. QA가 개발 서버로 테스트한다

QA가 링크에 `?_backend=...`를 붙여 다른 서버를 본다.

**지금은 운영 앱에서도 그냥 된다.** 링크 한 줄로 백엔드가 바뀐다. 막는 것이 없다.

| 환경                         | 바뀐 뒤      |
| ---------------------------- | ------------ |
| 개발 빌드                    | 그대로 된다  |
| 운영 빌드                    | **무시된다** |
| 운영 빌드 + 앱에서 잠금 해제 | 된다         |

잠금을 여는 `system.overridesUnlocked`는 **앱만 쓸 수 있다.** 웹은 자기 잠금을 못 푼다.

→ **3행.** 잠겨 있으면 이 행을 건너뛰고 5·6행으로 내려간다.

### 5. 사용자가 테마를 바꾼다

1. 웹이 3행에 쓴다. 화면이 바로 바뀐다.
2. 앱에도 넘겨 저장한다.
3. 앱이 WebView 캐시를 날려도 값이 남는다.
4. 다음에 켤 때 앱이 값을 미리 넣어준다. 흰 화면이 깜빡이지 않는다.

→ **2행(앱 저장값).** 웹 캐시가 날아가도 앱이 들고 있다. 서버는 못 건드린다 — 사용자 설정이라
`writableBy`에 `server`가 없다.

### 6. 새 토글을 하나 추가한다

"메시지 번역"을 실험실에 넣는다.

**지금은** 앱에 저장하려면 세 곳을 고치고 **앱 심사를 기다린다** — 브릿지 키 목록, 앱 허용 목록, 앱 분기문.
**바뀌면** 웹 파일 하나에 한 줄 넣고 배포한다. **앱 릴리스가 0회다.**

```ts
'feature.translate': {
    title: '메시지 번역',
    description: '받은 메시지를 눌러 번역한다.',
    type: 'boolean', defaultValue: false,
    surface: 'labs',
    writableBy: ['shell', 'local', 'server'],
    persist: 'shell',
}
```

앱은 이 키가 무슨 뜻인지 몰라도 된다. 글자로 저장할 뿐이다.

**규칙 하나.** 실험실 키는 `writableBy`에 `server`가 반드시 있어야 한다. 원격으로 못 끄는 실험은
사용자에게 내보내지 않는다.

### 7. 운영에서만 나는 버그를 잡는다

1. 앱 디버그 메뉴에서 잠금을 푼다.
2. 웹 디버그 패널이 열린다.
3. `log.upload.hold`를 켜서 쌓인 로그를 읽는다.
4. `cache.ttl.metaMs`를 짧게 바꿔 다시 시도한다.

**개발 환경에서는 잠금 해제가 필요 없다.** `debug.overlayEnabled`의 `byStage`가 `LOCAL`·`DEV`를 열어두므로
바로 열린다. 10번 탭할 필요가 없다.

### 8. 개발자가 키 이름을 겹쳐 썼다

**테스트에서** 깨진다. 머지가 안 된다.
**혹시 통과해서 배포됐다면** 먼저 선언된 키가 남고 나중 것은 버려진다. 로그가 남고 **앱은 정상으로 켜진다.**

개발자용 키가 80%인데 그중 하나의 실수로 모든 사용자 앱이 안 켜지면 안 되기 때문이다.

## 미완 — `title` · `description` 84행

ADR-0079 결정 3이 모든 엔트리에 사람이 읽을 이름과 한 문장 설명을 요구한다. 셸의 범용 패널이 키별 코드
없이 화면을 그리는 근거가 그 둘이므로, **비어 있으면 패널에 `sync.resume.initialCooldownMs`가 그대로
뜬다.** 아래 표들은 아직 그 두 열을 담고 있지 않다 — 84행 전부를 채우는 것이 스펙 단계의 실제 작업량이고,
이 문서가 그 작업의 대상 목록이다.

`surface`도 84행 전부에 채워야 한다 — 위 §노출면 분포가 그 답안이다(소수파 17개 열거, 나머지 `dev`).

문체는 아래 세 개로 고정한다: **`title`은 명사구, 조사 없이 짧게. `description`은 "무엇을 바꾸는가"를 한
문장으로, 기본값 반복 금지(표에 이미 있다), 왜 존재하는지가 자명하지 않으면 그것까지.**

```ts
'cache.ttl.metaMs': {
    title: '동기화 커서 수명',
    description: '이 시간을 넘겨 쉬면 델타 대신 전체 재동기화를 한다. 짧을수록 서버 부하가 커진다.',
    type: 'number', defaultValue: 300_000, surface: 'dev',
    writableBy: ['shell', 'local', 'server'], persist: 'local',
},
'auth.sdk.maxFailures': {
    title: '인증 갱신 연속 실패 한도',
    description: '이 횟수를 넘기면 세션을 만료로 판정한다. SDK 기본값 5에서 낮춘 값이다.',
    type: 'number', defaultValue: 3, surface: 'dev',
    writableBy: ['shell', 'local'], persist: 'none', appliesAt: 'reconnect',
},
'log.upload.hold': {
    title: '로그 전송 보류',
    description: '큐를 비우지 않고 쌓아 둔다. 기기가 만든 로그를 되읽기 위한 디버깅 레버이고, 수집 거부와는 다르다.',
    type: 'boolean', defaultValue: false, surface: 'dev',
    writableBy: ['shell', 'local'], persist: 'local',
},
```

## 스펙 단계로 넘기는 미결

1. **`ui.theme`의 부팅 전 인라인 읽기 계약** — 저장 키 이름·형식을 인라인 스크립트가 계산할 수 있어야 한다.
2. **`json` 타입 검증 깊이** — `channelSort`/`pinnedChannels`의 맵 파서(현행 4개)를 레지스트리가 어디까지 소유할지.
3. **`log.*` 조합 규칙의 소유자** — hold가 forced를 이기는 우선순위를 리졸버가 아니라 소비 지점이 갖는다는 전제 확인.
4. **`feature.limits.enforced` vs `limit.*` 중복** — 한도값을 무한대로 두는 것으로 갈음할 수 있는지(키 1개 절약).
5. **죽은 env 10종의 배포 파이프라인 확인** — `.github` 워크플로가 주입 중인지.
6. **`appliesAt` 전수 검증.** 소비 지점이 값을 **호출마다 읽는지**(→ `live`) **생성자·클로저에 캡처하는지**
   (→ `restart`) **연결 수립 시 넘기는지**(→ `reconnect`)를 84키 전부에 대해 확인한다. 이미 `log.upload.*`
   4개와 `bridge.request.timeoutMs`가 잘못 적혀 있었다. 기본값을 `'restart'`로 두고 `live`는 구독 소비자를
   지목해 증명하게 하는 편이 안전하다 — 드리프트 게이트(ADR-0079 미결 ⑧)가 검사할 수 있는 형태다.
