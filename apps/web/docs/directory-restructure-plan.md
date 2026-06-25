# apps/web route 기반 디렉터리 재배치 플랜

> 작성일: 2026-06-25 · 상태: 완료
> 참조: [`directory-structure.md`](./directory-structure.md) · [`migration-playbook.md`](./migration-playbook.md) · [`runtime-migration.md`](./runtime-migration.md)
> 브랜치: `feature/raine-migrate-socket` · tsc 베이스라인: **256 에러**(대부분 socket-로직, 이 패스 대상 아님)

## 1. 목표와 배경

`apps/web/src/app`의 **feature 디렉터리를 새 route 규격([`routes/paths.ts`](../src/app/routes/paths.ts))에 정렬**한다. paths.ts의 top-level 그룹이 곧 feature 경계가 되도록 재배치하는 것이 이 패스의 **중점**이다. socket→runtime 로직 마이그레이션은 분리(범위 결정 1) — 이 패스는 구조 작업만 한다.

**성공 기준:** paths.ts top-level 키 ↔ `features/<name>` 1:1 정렬. 재배치는 **depth-preserving**(같은 `features/<f>/pages` 깊이로 이동)이라 기존 `../shared` 깨진 import 에러 수를 **증가시키지 않는다**. 부수 작업(import 수리·dead code)으로 구조 에러는 감소.

## 2. route ↔ feature 정합 분석 (근거)

| paths.ts 그룹 | route | 현재 소유 | 조치 |
|---|---|---|---|
| auth | /auth/* | `features/auth` | 유지 |
| account | /account/* | `features/account` | 유지 |
| home | / | `features/home` | CreateRoom 분리 후 유지 |
| join | /join | `features/join` | 유지 |
| notifications | /notifications | `features/notifications` | 유지 |
| mypage | /mypage/* | `features/mypage` | subscription 분리 후 유지 |
| **channels** | /channels/{create,room,settings,…} | **chats(room/settings) + home(create) 분산** | **→ `features/channels` 통합** |
| **place** | /place/* | `features/places` | **→ `features/place` 개명** |
| **subscription** | /subscription/* | **mypage 안** | **→ `features/subscription` 분리** |
| (없음) | /explore/* | `features/explore` | **제거**(규격 외 라우트) |

외부 배럴 importer 확인: `features/chats`·`features/places`·home의 `CreateRoomRoutes`·mypage의 `SubscriptionRoutes` 모두 **`routes/PrivateRoutes.tsx` 한 곳**에서만 소비 → 이동 안전.

## 3. 범위

**포함 (중점 = route 기반 재배치)**
1. `routes/` 디렉터리명 **유지**(개명 안 함, 범위 결정) + `directory-structure.md`를 `routes` 기준으로 갱신.
2. `explore` 제거(feature + route + UnifiedLayout 참조).
3. `chats` → `channels` 통합 + home의 `CreateRoomPage`/`CreateRoomRoutes` 흡수.
4. `places` → `place` 개명.
5. `subscription`을 mypage에서 `features/subscription`으로 분리(+`useSubscriptionIap` 훅 동반 이동).

**포함 (부수)**
6. 깨진 `../shared/*` import 수리(타깃이 `ui/`·`stores/`·`utils/`에 실존하는 것만 repoint).
7. dead code 삭제(§6 후보 → 승인 후).
8. **디바이스 토큰 등록 재작성**(사용자 지정) — 죽은 로컬 `useDeviceTokenRegistration`을 web-core `useRegisterDeviceToken`으로 교체 + 실제 마운트. (구조 패스 중 유일한 **로직 변경** — 사용자 명시 요청으로 in-scope.)

**제외 (그리고 왜)**
- socket→runtime 로직 마이그레이션(범위 결정 1, playbook 소유).
- 최상위 `hooks/` 도메인 훅 분산(범위 결정 2 — 깨진 socket 의존, 마이그레이션 ride-along).
- 타깃이 삭제된 socket-결합 import(`waitForVerified`/`shared/types`/`chats/apis/invite-api`) — deferred 마이그레이션 소유, 건드리지 않음.
- mypage 내부 account/policy/debug 그룹핑(범위 결정 3 — 평면 유지).
- feature→feature import 위반 전면 정리. **단 SubscriptionPlansPage→`home/EmailVerifyDialog`는 기존 위반이 subscription 분리 후에도 잔존** → §6에 flag(ui 승격 옵션, 강제 아님).

## 4. 현재 상태 (근거)

- `shared/` 부재 — 횡단 코드는 이미 `ui/`(components·layouts)·`hooks/`·`stores/`·`utils/`로 이동. 단 24파일이 옛 `../shared/*` 경로 import로 깨짐(tsc 256 중 ~34).
- `routes/` 미개명. `app/routes`는 [AppRuntime.tsx:7](../src/app/runtime/AppRuntime.tsx) `Router`만 직접 import. `routes/paths`(ROUTES)는 26파일이 import.
- `explore` 실참조 2곳뿐: [PrivateRoutes.tsx](../src/app/routes/PrivateRoutes.tsx)(lazy + `explore/*`), [UnifiedLayout.tsx:10](../src/app/ui/layouts/UnifiedLayout.tsx)(`MAIN_VARIANT_PATHS`에 `/explore`). BottomNavigation 탭에는 없음.
- subscription 결합: 두 페이지가 mypage `../hooks`의 `useSubscriptionIap`(+`PurchaseProduct` 타입) 의존. SubscriptionPlansPage는 `home/components/EmailVerifyDialog`도 import(feature 위반).
- 0-importer dead 후보: `hooks/useSocketAuth.ts`, `hooks/useDeviceTokenRegistration.ts`, `utils/consts.ts`, 그리고 `hooks/index.ts`의 stale `export * from './useForegroundResync'`(파일 이미 삭제됨).

## 5. 구현 단계

각 단계 후 repo 루트에서 `npx tsc -p apps/web/tsconfig.app.json --noEmit 2>&1 | grep -cE "error TS"`로 **증가 없음** 확인. **순수 이동/개명 커밋과 삭제/로직 커밋 분리**(disciplined).

1. **`routes/` 유지 + 문서 갱신(개명 없음).**
   - 디렉터리/import 변경 없음(26파일 churn 회피).
   - `directory-structure.md`의 `routing/` 표기를 `routes/`로 변경: §1 레이아웃 주석, §5의 "routes/ → routing/ 개명" 항목 제거, §3 라우트 소유 예시(`routing/private/PrivateRoutes.tsx`→`routes/PrivateRoutes.tsx`).
   - **문서 커밋.**
2. **`explore` 제거.**
   - `git rm -r features/explore`; PrivateRoutes의 `ExploreRoutes` lazy import + `explore/*` 라우트 제거; UnifiedLayout `MAIN_VARIANT_PATHS`에서 `/explore` 제거.
   - **삭제 커밋.**
3. **`chats` → `channels` 통합 + CreateRoom 흡수.**
   - `git mv features/chats features/channels`(components/hooks/utils/pages 동반).
   - **Chat* → Channel* 심볼 전부 개명**: `ChatRoutes`→`ChannelRoutes`, `ChatRoomPage`→`ChannelRoomPage`, `ChatSettingsPage`→`ChannelSettingsPage` 등 페이지·route 심볼 일괄(파일명·export·내부 import 동반). URL 리터럴(paths.ts)은 불변.
   - `CreateRoomPage.tsx`를 home/pages → channels/pages 이동(같은 깊이). `create` 라우트를 `ChannelRoutes` 안에 합침(상대 `<Route path="create">` + `:channelId/...`).
   - home `index.ts`/`routes`/`pages`에서 CreateRoom 제거. PrivateRoutes: `channels/create`(home) + `channels/*`(chats) 두 줄 → channels 하나로 통합 lazy import.
   - `chats/apis/invite-api`를 import하는 auth/LoginPage 경로를 `channels/apis`로 갱신(파일은 deferred, 경로만).
   - **순수 이동 커밋.**
4. **`places` → `place` 개명.**
   - `git mv features/places features/place`; PrivateRoutes의 `PlaceRoutes` import 경로 갱신.
   - **순수 이동 커밋.**
5. **`subscription` 분리.**
   - `features/subscription/{pages,hooks,routes,index.ts}` 신설.
   - `SubscriptionPage.tsx`·`SubscriptionPlansPage.tsx`(pages) + `useSubscriptionIap.ts`(hook) 이동. mypage `routes`/`pages`/`hooks` 배럴에서 제거, `SubscriptionRoutes`를 subscription/routes로 이전.
   - PrivateRoutes: `SubscriptionRoutes`를 `features/subscription`에서 lazy import.
   - **순수 이동 커밋.** (EmailVerifyDialog 위반은 §6 flag로 남김.)
6. **(부수) 깨진 `../shared/*` import 수리.** 타깃이 `ui/`·`stores/`·`utils/`에 실존하는 것만 repoint(`SettingsDialog`·`ServiceUnavailableOverlay`는 필요 시 `ui/components` 배럴 추가). socket-결합 깨진 import는 제외.
7. **(부수) dead code 삭제(승인 후).** §6 후보. **삭제 커밋(분리).**
8. **디바이스 토큰 등록 재작성(로직, 사용자 지정).**
   - 죽은 [hooks/useDeviceTokenRegistration.ts](../src/app/hooks/useDeviceTokenRegistration.ts) 제거. 신 훅을 `bridge/`에 신설(native push + `appBridge` 사용처라 bridge 레이어가 적합).
   - 패턴: `isAuthenticated`(`useSessionAuth`) + 앱 환경 게이트 → `appBridge.fetchFcmToken()`으로 토큰 수신 → `useRegisterDeviceToken({ deviceToken, platform, installId, application })` 에 body로 전달(`deviceId`는 web-core 훅이 내부 주입, 중복 제거는 `identityCore`가 담당 → 기존 localStorage `chatic-device-token` dedup 제거).
   - 제거 심볼 정리: `useWebCoreStore`→`useSessionAuth`, `libs/web-core/src` 딥 import→`@chatic/web-core`.
   - `GlobalBridgeListener`(app.tsx:67 이미 마운트)에서 호출 → 현재 미마운트로 동작 안 하던 등록을 실제 활성화.
   - **영어 주석 + 유닛 테스트(disciplined)**: `appBridge.fetchFcmToken`·`useRegisterDeviceToken` 모킹, 토큰 수신→body 전달/게이트(미인증·비앱환경 skip) 검증. **로직 커밋(분리).**

## 6. dead code 후보 (승인 후 삭제) · flag

| 대상 | importer | 판단 |
|---|---|---|
| `features/explore/**` | PrivateRoutes·UnifiedLayout만 | **제거**(§5-2, 규격 외 라우트) |
| `hooks/useSocketAuth.ts` | 0 | **삭제 완료**(playbook §C, SocketAuthBinder 자동) |
| ~~`utils/consts.ts`~~ | — | **삭제 취소** — MyPage·DebugPage·onboarding이 사용(`utils/index.ts` 배럴 경유). 살아있음 |
| `hooks/index.ts`의 `./useForegroundResync` 라인 | — | **라인 삭제 완료**(파일 이미 없음) |
| `hooks/useDeviceTokenRegistration.ts` | 0 | **삭제 후 재작성**(§5-8) — web-core `useRegisterDeviceToken` 기반 신 훅으로 교체 + `GlobalBridgeListener` 마운트. 단순 삭제 아님 |

**flag(이번 패스 비강제):** `SubscriptionPlansPage → home/components/EmailVerifyDialog` feature 위반. 해소하려면 `EmailVerifyDialog`를 `ui/components`로 승격해야 하나, 기존 위반이고 churn이라 옵션으로 남김.

## 7. 리스크와 미지수

- **재배치는 depth-preserving** — `features/<f>/pages` 깊이가 보존돼 `../shared`/`../../../utils` 등 상대 import의 정합성이 유지된다(이동만으로 새 에러 없음). 단 **CreateRoom·Subscription 이동 후 그 파일 내부의 `../hooks`·`../components` 형제 참조**는 새 feature 기준으로 재확인 필요(useSubscriptionIap 동반 이동으로 충족).
- **Chat*→Channel* 전면 개명** — route export(PrivateRoutes만 외부 참조)와 페이지 심볼(feature 내부 import 다수). 내부 참조 일괄 갱신, tsc로 누락 검출. paths.ts 리터럴 URL은 불변(심볼명만 변경).
- **`useDeviceTokenRegistration` 삭제 행위 영향**(§6) — 확인 전 보류해도 구조 목표에 지장 없음.

## 8. 검증 방법

- **타입(주지표):** 각 단계 후 repo 루트 tsc 측정 — **에러 수 증가 없음**(재배치) + 부수 단계서 `../shared` `TS2307` 감소. 총계는 잔여 socket-로직 에러로 0 아님(정상).
- **`@chatic/socket` import 파일 수 불변** 확인(이 패스는 socket 미접촉).
- **라우팅 스모크:** 이동 후 `routes/paths.test.ts` 통과. 모든 `<Feature>Routes` 배럴 export가 PrivateRoutes에서 resolve되는지 tsc로 보증.
- **유닛 테스트(disciplined):** 재배치·개명·삭제 단계는 로직 변경 없음 → 기존 jest 그린 유지(`npx jest --config apps/web/jest.config.js`; 특히 `paths.test`·`usePreferenceStore.test`·`copyMessageToClipboard.test`가 이동 후 통과). **유일한 로직 변경인 디바이스 토큰 등록 신 훅(§5-8)에는 신규 유닛 테스트 작성**(토큰 수신→register body 전달, 미인증/비앱환경 skip).
- **런타임 검증:** 잔여 socket-로직 에러로 그린 빌드가 안 되므로 preview 검증은 마이그레이션 완료 후로 미룸(playbook §1 게이트).
- 코드 주석 영어, 문서·커밋 한국어(disciplined).

## 9. 구현 결과 (2026-06-25)

- **tsc: 256 → 217** (−39). 재배치는 depth-preserving이라 무회귀, `../shared/{components,layouts}`→`ui/` repoint 21파일로 구조 에러 대량 해소. 잔여는 socket-로직(shared/types·waitForVerified·removed-symbol) — 범위 외.
- **`@chatic/socket` import 파일 수 14 불변**(이 패스 socket 미접촉, 확인됨).
- **jest: 7 suites / 52 tests pass** — 신규 `useDeviceTokenRegistration.test`(3) + 이동된 `paths`·`copyMessageToClipboard`(channels로 이동)·`usePreferenceStore`·`AppReadyGate`·`appBridge` 통과.
  - ⚠️ `usePlaceUnreadCounts.test`는 **pre-existing 실패**(소스의 `import ... from 'libs/shared/src'`·`@chatic/socket` 딥 import를 jest가 해석 못 함). 이 패스에서 미수정 파일이며 socket 마이그레이션이 소유.
- feature 디렉터리 = paths.ts top-level 그룹과 1:1 정렬: `account auth channels home join mypage notifications onboarding place subscription`.
- 남은 flag(feature→feature, 비강제): `home/CreateChannelDialog`→`channels/useCreateChannel`, `home/SubscriptionSelectDialog`→`subscription/useSubscriptionIap`, `SubscriptionPlansPage`→`home/EmailVerifyDialog`. 모두 `// FIXME(feature-boundary)` 주석 표기.
- **커밋은 사용자 요청 시 분리 커밋으로 진행**(이동/삭제/로직). 현재는 작업 트리에만 반영.
