# ADR-0027: RN-WebView 하이브리드 부팅 1차 최적화 (네이티브 pre-webview 구간 단축)

> 상태: Accepted · 결정일: 2026-07-23

## 맥락 (Context)

`apps/mobile`은 네이티브 셸이 단일 WebView를 호스팅하는 하이브리드 구조다. 부팅은 완전 직렬이라
네이티브 pre-webview 지연이 WebView URL 로드 시작(`load-start`)을 통째로 뒤로 민다.

선행 계측(`boot-performance-instrumentation`, commit `1c32ac84`, develop 반영 완료)의 실측
(v0.19.2, 콜드 8건)에서 네이티브 pre-webview 구간이 부팅의 **53%(평균 580ms)**를 차지했고
콜드 변동폭이 컸다(326→882ms). JS 엔트리 기준 세부 병목:

- `app-mount → main-screen`: 251ms — NavigationContainer + 네비게이터 2겹 마운트
- `main-screen → load-start`: 206ms — WebView 인스턴스 생성 + injection 스크립트 준비

**제약과 근거(코드 조사):**

- 진입점 `main.tsx` → `App.tsx`가 `./services` 배럴 import → `provider.ts:174` 싱글톤이
  registerComponent 전에 동기 생성. 생성자에서 MMKV·SQLite open·9개 DataSource·캐시/업로드/IAP/
  아이콘/SMS/OAuth/Crashlytics를 전부 동기 인스턴스화(`provider.ts:81-164`).
- `App.tsx:56` `SafeAreaProvider`에 `initialWindowMetrics` 없음 → insets 비동기 측정 왕복까지
  자식 렌더 지연.
- `RootNavigator`(native stack, 1스크린=`MainNavigator`) + `MainNavigator`(native stack,
  1스크린=`MainScreen`) → 네이티브 컨테이너 2겹 중복.
- `AppWebView.tsx:58,72-76` `getUniqueIdSync()`·`getApplicationName()`·`getDeviceId()` 등
  동기 DeviceInfo 브릿지 호출이 injection 스크립트(WebView 생성 전 필요) 임계경로에서 렌더마다 반복.
- 이미 양호: WebView source URL은 `Config.VITE_WEBVIEW_BASE_URL` 정적, `initTables()` void,
  IAP/deeplink init이 useEffect 비동기, 핸들러 등록이 이벤트 버퍼링이라 로드를 막지 않음.

**진행 이력 정정:** 동일 계획이 이전 브랜치 `claude/boot-performance-optimization-d90642`에서
4.1~4.3까지 구현됐으나 develop에 머지되지 않았고 로컬·원격 어디에도 남아있지 않음(유실). 따라서 이
브랜치(`develop` 기준)에서 **네 단계 모두 새로 구현**한다. 이번 세션은 **실기기 콜드부팅
BootMetrics 전후 측정이 가용**하므로, "단계별 독립 커밋 → 실기기 3회+ 중앙값 측정 → 효과 없으면 그
단계만 리버트" 규율을 온전히 적용한다.

## 결정 (Decision)

네이티브 pre-webview 구간을 저리스크→고리스크 순 4단계로 단축한다. 각 단계는 독립 커밋 + 전후
BootMetrics 비교. `disciplined-implementation` 규율(영어 주석·검증 체크리스트·유닛 테스트) 준수.

**4.1 `SafeAreaProvider` `initialWindowMetrics` 주입 (저리스크·고효과)**
`react-native-safe-area-context`의 `initialWindowMetrics`를 주입해 insets 비동기 측정 왕복을
제거, 네비게이터·MainScreen을 첫 프레임에 렌더. `app-mount → main-screen` 직격.

**4.2 DeviceInfo 동기 호출 모듈 레벨 캐싱 (저리스크·중효과)**
`getUniqueIdSync()`·`getApplicationName()`·`getDeviceId()`·`getVersion()`·`getBuildNumber()`를
모듈 레벨 1회 상수로 승격(이미 version/build/userAgent는 그렇게 함, `AppWebView.tsx:28-32`).
injection 스크립트 prop 계산에서 동기 브릿지 왕복 제거. injection 값 동일성 유닛 테스트로 보장.

**4.3 네비게이터 스택 병합 (중리스크·고효과)**
`RootNavigator`가 `MainScreen`을 직접 호스팅하는 **단일 native stack**으로 병합, `MainNavigator`
삭제. 계약 보존:

- `RootStackParamList`을 평탄화(`{ Main: undefined }`), `MainStackParamList` 중첩 제거,
  `navigationRef` 타입 갱신.
- 딥링크 native route state를 단일 레벨로 평탄화. 현재 `deeplinkUtils.ts:409`의
  `{ routes: [{ name: 'Main', state: { routes: [{ name: 'Main' }] } }] }` → `{ routes: [{ name: 'Main' }] }`.
- **Debug/Modal native 라우트는 네비게이터에 미등록된 죽은 경로**(`useDeepLinkNavigation.ts:81-82`
  주석, `ModalScreen`/Debug 스크린 미등록 확인) → 중첩 분기 제거.
- **불변 유지:** web-route `OnNavigate` 경로, `navigationRef.reset()` 호출 규약,
  `useDeepLinkNavigation`의 콜드/웜 캡처 흐름. `deeplinkUtils.test.ts` 갱신.

**4.4 provider 비필수 초기화 lazy 전환 (중고리스크·고효과, 마지막·서비스별 점진)**
WebView URL 로드에 불필요한 계층을 lazy getter로 전환(최초 접근 시 생성). `InteractionManager`
지연 대신 lazy getter를 써서 "처음 쓸 때 준비 안 됨" 리스크를 구조적으로 차단.

- **Eager 유지(부팅/웹뷰 임계경로):** `logService`·`consoleLogger`·`keyValueStorage(MMKV)`·
  `bootMetricsService`(기반·저비용), `deeplinkService`·`deeplinkManager`·`notificationService`
  (콜드스타트가 첫 렌더에 `getInitialUrl`/`getInitialNotification` 호출), **`firebaseCrashlyticsService`
  (부팅 구간 크래시 관측성 우선 — 성능보다 관측성 채택)**.
- **Lazy 전환:** `sqliteDatabase` + 9개 DataSource + `cacheCrudService`·`cacheSearchService`·
  `testRecordService`·`uploadService`(최중량), `subscriptionIapService`·`dynamicAppIconService`·
  `smsService`·`oauthService`·`clipboardService`·`permissionService`·`preferenceService`·
  `deviceService`.

**포함/제외(범위):**

- 포함: 위 4단계(네이티브 pre-webview 구간).
- 제외: 웹 측 번들·런타임 최적화(2차), 서비스워커 캐싱(3차), 배포/CDN 정책, 네이티브 앱 프로세스~JS
  엔트리 미계측 구간.

## 대안 (Alternatives)

- **WebView 프리워밍 풀** — 기각. RN은 컴포넌트 마운트 시 인스턴스를 생성하므로 풀링 효과 대비 복잡도가
  높다. source가 정적이고 단일 웹뷰라 4.1~4.3으로 충분.
- **`InteractionManager` 기반 provider 초기화 지연** — 기각. 지연된 서비스를 첫 렌더 직후 동기 기대하는
  경로가 있으면 "준비 안 됨"으로 깨진다. lazy getter의 "접근 시 생성" 보장이 구조적으로 더 안전.
- **이전 브랜치 `d90642` 리베이스/체리픽** — 불가. 로컬·원격 모두 유실. 새로 구현.
- **Crashlytics도 lazy 전환**(문서 원안) — 기각. 부팅 구간 크래시 리포팅 공백이 생김. 관측성 우선.

## 결과 (Consequences)

**얻는 것**

- 목표: 콜드부팅 `load-start` 중앙값 **−150ms 이상** 단축(BootMetrics 전후 비교로 판정).
    - **실측(콜드 4회 중앙값): `load-start` 438 → 156.5ms, −281.5ms 로 목표 초과 달성.** 최대 기여는
      4.1+4.3(`app-mount→main-screen` 220ms→≈0), 다음 4.4(`provider-ready` 54→4.5ms). 4.2는 측정상 무효.
      상세는 boot-optimization.md 측정 결과.
- 네이티브 컨테이너 1레이어 제거로 마운트 비용·구조 단순화.
- 단계별 독립 커밋 → 효과 없거나 회귀 시 해당 단계만 리버트.

**감수하는 트레이드오프·리스크**

- **4.3 스택 병합:** 라우트 이름·`navigationRef` 계약에 의존하는 코드가 깨질 수 있음 → 병합 전 참조
  전수 확인 완료(navigationRef 사용처, deeplink native route state, Modal/Debug 미등록 확인).
  회귀 스모크(딥링크 진입, 백버튼, 포그라운드 복귀) 필수.
- **4.4 SQLite lazy:** 웹이 첫 캐시 메시지를 보낼 때 SQLite open이 최초 접근에서 동기 발생 → 그 경로가
  느려질 수 있음. **실기기 측정으로 트레이드오프 확인**하고, 유의미하면 해당 서비스만 eager 복귀.
- **계측 오차:** 콜드/웜 상태에 따라 변동이 커 단계별 3회 이상 측정 후 중앙값 비교.

**검증 방법**

- 각 단계: 타입체크 + 관련 유닛 테스트 + 실기기 콜드부팅 3회 BootMetrics 전후 비교(부팅 성능 기록 화면).
- 회귀: 딥링크 진입, 백버튼, 포그라운드 복귀, lazy 전환된 캐시/업로드 등 첫 사용 동작 확인.
- 판정: `load-start` 중앙값 −150ms 이상이면 목표 달성.
- 알려진 사전 실패(변경 무관 베이스라인): 워크트리 typecheck의 stale
  `@lemoncloud/chatic-sockets-api` + 누락 nx-svg 타이핑(6건), `useDeepLinkNavigation.test.ts`의
  native-stack ESM transform 미설정.
