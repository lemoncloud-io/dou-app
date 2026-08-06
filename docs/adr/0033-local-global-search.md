# ADR-0033: 로컬 캐시 기반 전역 검색 (플레이스·채널·클라우드·메시지 + 메시지 점프)

> 상태: Accepted · 결정일: 2026-07-29 · 갱신: 2026-08-06(플레이스 전환 확정, 컨텍스트 조회 추가)

## 맥락 (Context)

apps/web에 검색 기능이 없다. 헤더의 검색 버튼은 배선만 되어 있고
`HomePage.handleSearch`가 "준비 중" 토스트를 띄우는 플레이스홀더 상태다(ADR-0013 참조).

요구사항:

- **Local 기반 서치** — 네트워크 검색 API 없이 로컬 캐시(IndexedDB)를 스캔한다.
- **키워드에 따른 실시간 데이터 방출** — 입력이 바뀔 때마다 결과가 갱신된다.
- **최근검색어 CRUD** — 저장·표시·개별 삭제·전체 삭제.
- **전역적인 플레이스·채널 검색** — 클릭 시 해당 플레이스/채널로 이동.
- **채팅 메시지 검색 + 점프** — 클릭 시 플레이스 → 채널 → 해당 메시지로 커서 이동.

### 조사에서 확인된 제약

1. **"모든 클라우드 통합"과 "로컬 기반"은 부분적으로만 양립한다.**
   sync 계층은 활성 클라우드만 동기화하고(`SyncManager.isCidActive`,
   `dropForeignFrame`), 소켓도 활성 클라우드 wss 하나에만 붙는다. 방문한 적
   없는 클라우드의 콘텐츠는 로컬에 존재하지 않으며, 과거 방문 클라우드의
   데이터는 stale 상태로 잔존한다. → **로컬 DB에 있는 것만 검색되고, 없는
   데이터는 검색 불가를 수용한다** (사용자 결정).
2. **현재 읽기 경로는 활성 cid 파티션만 조회한다.** IndexedDB 키는
   `${type}:${cid}:${uid}:${id}`, 조회는 전역 `DataContextHolder`의 활성
   cid 고정(`TYPE_CID_UID_INDEX`). repo의 `ctxOverride`는 옵저버 키에만
   작용하고 스토리지 파티션 선택까지 내려가지 않는다. 다만 인덱스가
   `['type','cid','uid']` 복합 인덱스이므로 **type만 고정한 IDBKeyRange
   스캔으로 크로스 파티션 읽기를 추가하는 것은 소규모 읽기 전용 확장**이다.
3. **네이티브 쪽 전역 검색 경로는 이미 존재한다(웹측 호출자만 부재).**
   브리지 메시지 `SearchGlobalCacheData { keyword, cid?, uid? }` →
   `useSearchCacheHandler` → `CacheSearchService.search` → SQLite `LIKE`
   질의가 엔드투엔드로 구현되어 있다. **cid 생략 시 전체 클라우드
   파티션을 검색**하며, 매칭 규칙은 채널/사이트(플레이스) `name LIKE
%kw%`, 채팅 `content LIKE %kw%`이다. 반면 일반 CRUD 경로인
   `NativeDBAdapter.loadAll`은 활성 cid를 명시해 질의하므로 크로스
   파티션 읽기에 쓸 수 없다.
4. **서버 `chat.feed`는 과거 방향 커서만 지원한다** (`cursorNo` 상한,
   anchored 양방향 페치 없음). 임의 chatNo 점프는 "타깃이 보일 때까지
   과거 페이지 반복 로드" 방식만 가능하다.
5. **desktop-web에 재사용 가능한 자산이 있다**: `features/search`의
   `useMessageSearch`(로컬 캐시 스캔, 디바운스 300ms, 최소 2글자)와
   `useMessageJumpStore` + `MessageList`의 점프 구현(뒤로 페이징
   `MAX_JUMP_PAGES` 예산, `data-chat-no` 스크롤 + 하이라이트).

## 결정 (Decision)

### 포함 범위

1. **전용 검색 페이지** — apps/web에 `/search` 라우트 신설(UnifiedLayout
   하위). 헤더 `AppHeader onSearch`에서 진입. 모달이 아닌 풀 페이지.
2. **검색 대상 = 로컬 DB 전체 파티션** (웹 IndexedDB·네이티브 SQLite 동일):
    - 플레이스, 채널, 채팅 메시지 — 클라우드 불문, 로컬에 캐시된 것 전부.
    - 클라우드 이름 — relay 카탈로그(`useCloudSessionCatalog`) + 초대
      클라우드 캐시(`useInvitedClouds`).
    - 로컬에 없는 데이터(미방문 클라우드 콘텐츠, 캐시 밖 과거 메시지)는
      검색되지 않음을 명시적으로 수용한다.
3. **단일 검색 계약, 어댑터별 이중 구현 (동작 동일성 필수)** — 스토리지
   계층에 전역 검색 계약(예: `searchGlobalCache(keyword, { cid?, uid })`
   — 도메인별 결과 반환)을 정의하고, 웹/네이티브 두 어댑터가 **동일한
   기대 로직**으로 구현한다. 기존 repo `observeList`/`cacheReadList`
   경로는 건드리지 않는다.
    - **네이티브(WebView)**: 기존 `SearchGlobalCacheData` 브리지 메시지를
      그대로 사용한다(cid 생략 = 전체 클라우드, SQLite `LIKE`). 신규
      네이티브 작업은 원칙적으로 불필요.
    - **웹(IndexedDB)**: `IIndexedDB`/`IndexedDBAdapter`에 type 고정 +
      cid 범위 스캔(읽기 전용) API를 신설하고, 그 위에 네이티브와 동일한
      매칭 시맨틱을 구현한다 — 채널/플레이스는 이름, 채팅은 본문(content)
      에 대한 대소문자 무시 부분일치, cid 생략 시 전체 파티션, uid 필터.
    - **동일성 보장**: 두 구현이 같은 입력에 같은 결과 형태를 내도록 공유
      계약 테스트(동일 픽스처를 양 어댑터에 적용)를 작성해 회귀를 막는다.
    - 결과 row의 `cid`를 결과 모델에 실어 클라우드 전환 재료로 쓴다.
    - **컨텍스트 조회도 이 소스가 담당한다** (2026-08-06 추가). 검색 결과
      행에 소속 플레이스·채널 이름, 안읽음 수, 마지막 메시지를 표시하려면
      결과 행 밖의 캐시 행이 필요한데, 리포지토리로는 읽을 수 없다 —
      `cacheRead`는 컨텍스트 오버라이드를 무시하고 `cacheReadList`의
      오버라이드는 sid 필터용이어서, 기존 오버라이드는 cid 오버라이드가
      아니다(`ChannelLocalDataSourceV2.ts:39,53`). 그래서 검색 소스에
      `resolveContext`를 함께 두고, cid는 항상 명시 인자로 받는다. 공유
      `DataContextHolder`를 임시 변경하는 방식은 과거 cross-cloud 오염
      사고(`storages/utils.ts:64-70`)를 근거로 금지한다. 결과적으로
      **검색 결과 렌더링은 리포지토리·sync 훅을 일절 쓰지 않는다** — 홈의
      행 컴포넌트를 재사용하면 활성 클라우드 파티션을 조회해 빈 값이 나오고
      엉뚱한 클라우드 소켓에 sync 타깃을 등록한다.
4. **실시간 방출** — 키워드 입력 디바운스(300ms, 최소 2글자) 시 재스캔.
   활성 클라우드의 플레이스/채널은 `observeList` 구독으로 라이브 갱신을
   병합한다. RxJS 등 새 스트림 장치는 도입하지 않는다(리포 정석 패턴 유지).
5. **최근검색어** — `usePreferenceStore` 패턴(zustand + localStorage +
   네이티브 브리지 `savePreference` 동기화, `preferenceKeys`에 키 추가).
   검색 제출 시 저장, 중복 제거 LRU 최대 10개, 개별 삭제·전체 삭제 지원.
6. **결과 클릭 내비게이션**:
    - 활성 클라우드·활성 플레이스 결과 → `navigate(ROUTES...)` 직행.
    - 그 외 → `usePushNavigate` 패턴 재사용:
      `waitUntilVerified` → `switchCloud(cid)` → **새 클라우드 소켓 재검증
      대기** → `switchSite(sid)` → 이동.
    - **플레이스(sid) 전환은 선택이 아니라 필수다** (2026-08-06 확정).
      초기 구현은 "대상 페이지가 URL id로 로드되므로 cid 전환만으로 충분"
      하다고 좁혔지만, 플레이스 결과의 목적지가 홈이고 홈은 URL이 아니라
      세션의 `selectedSiteId`로 그려진다(`HomePage.tsx:65,184`). 채널
      진입 후 뒤로 나왔을 때 소속 플레이스의 홈에 있어야 한다는 요구도
      같은 결론이다. 전환 수단은 app-runtime이 공개하는
      `useSiteSwitch`(소켓 `auth.switch`)이며, web-core의 토큰 리프레시
      경로(`switchSiteSession`)는 쓰지 않는다.
7. **메시지 검색 + 점프** (이번 범위에 전부 포함):
    - desktop-web `useMessageJumpStore` + `MessageList` 점프 로직을
      apps/web으로 이식.
    - `/channels/:id/room?chatNo=` 쿼리 파라미터 신설, room 페이지에서
      파싱해 점프 스토어로 전달.
    - `useChats`에 과거 방향 반복 로드 협조(`loadMore` 예산 루프),
      `useChatScroll`에 `data-chat-no` 스크롤 + 하이라이트 추가.
    - **폴백**: 페이지 예산(`MAX_JUMP_PAGES` 상당) 내 타깃 미도달 시 채널
      최신 위치로 이동하고 안내 토스트를 띄운다.

### 제외 범위

- 서버측 검색 API(크로스 클라우드 서버 검색, anchored-feed 확장) — 추진하지 않음.
- 클라우드별 독립 데이터 스택(멀티 컨텍스트 동시 sync) — 대공사, 하지 않음.
- 전체 히스토리 메시지 검색 — 로컬 캐시에 있는 범위만.

## 대안 (Alternatives)

- **서버측 크로스 클라우드 검색 API** — 완전한 통합 검색이 가능하지만
  "Local 기반" 전제를 버리고 백엔드 일정에 종속된다. 기각.
- **클라우드별 독립 데이터 스택 신설** — 단일 `DataContextHolder`
  아키텍처를 뒤집는 대공사. 검색 하나를 위한 비용으로 과함. 기각.
- **활성 클라우드로 범위 한정** — 가장 단순하지만 "전역 검색" 요구에
  미달. 크로스 파티션 읽기가 소규모 확장으로 가능함이 확인되어 기각.
- **검색 다이얼로그(모달) UI** — desktop-web 방식. apps/web은 전용
  페이지로 결정(사용자 선택). 기각.
- **서버 anchored-feed 확장으로 양방향 점프** — 백엔드 일정 종속.
  뒤로 페이징 + 폴백으로 충분(메시지 검색 자체가 최근 캐시 스캔이라
  타깃이 먼 과거일 확률이 낮음). 기각.
- **`useLocalStorage` 훅으로 최근검색어 저장** — 가볍지만 네이티브 브리지
  동기화가 없어 WebView 캐시 삭제 시 유실. `usePreferenceStore` 패턴 채택.

## 결과 (Consequences)

**얻는 것**

- 네트워크·백엔드 의존 없는 즉답형 검색. 오프라인에서도 동작.
- 과거 방문한 모든 클라우드의 플레이스/채널/메시지가 한 화면에서 검색됨.
- desktop-web 자산 재사용으로 메시지 검색·점프 구현 비용 절감, 두 앱의
  검색 동작 수렴.
- 크로스 파티션 읽기가 읽기 전용 신설 경로라 기존 캐시/sync 동작에 무영향.

**감수하는 트레이드오프**

- **검색 결과의 신선도 미보장** — 비활성 클라우드 데이터는 떠난 시점의
  스냅샷. 이름 변경·삭제된 채널이 결과에 나올 수 있고, 클릭 후 전환 시점에
  실체가 없을 수 있다(진입 실패 처리 필요).
- **메시지 검색은 캐시된 최근 범위만** — 전체 히스토리 검색이 아니며,
  UI에서 이 한계를 사용자에게 오해 없이 전달해야 한다.
- **점프는 과거 방향 페이징 예산에 종속** — 예산 초과 시 폴백(최신 이동 +
  토스트)으로 완화하지만 항상 타깃에 도달하지는 못한다.
- **이중 구현 유지 비용** — 검색 시맨틱(대상 필드, 부분일치 규칙, 스캔
  상한)이 웹 IndexedDB 구현과 네이티브 SQLite 구현 양쪽에 존재한다.
  공유 계약 테스트로 동일성을 강제하지만, 시맨틱 변경 시 항상 두 곳을
  함께 고쳐야 한다.
- chat 파티션 전체 스캔은 데이터가 쌓이면 비용이 커질 수 있어 스캔 상한
  (채널당·전체 개수 제한, desktop-web 방식)을 유지해야 하며, 이 상한도
  양 어댑터에 동일하게 적용해야 한다.

## 참조

- 진입점: `apps/web/src/app/features/home/pages/HomePage.tsx` (`handleSearch` 플레이스홀더)
- 레퍼런스 구현: `apps/desktop-web/src/app/features/search/*`,
  `apps/desktop-web/src/app/shared/stores/useMessageJumpStore.ts`
- 스토리지: `libs/data/src/data/local/databases/IndexedDBDatabase.ts`
  (`TYPE_CID_UID_INDEX`), `libs/data/src/data/local/storages/IndexedDBAdapter.ts`,
  `NativeDBAdapter.ts`
- 네이티브 전역 검색 기존 경로: `libs/app-messages/src/types/model/cache.ts`
  (`SearchGlobalCacheDataPayload`),
  `apps/mobile/src/app/webview/hooks/useSearchCacheHandler.ts`,
  `apps/mobile/src/app/services/cache/CacheSearchService.ts`,
  `apps/mobile/src/app/data/cache/ChannelDataSource.ts` (cid 옵셔널
  `fetchAll` + `LIKE` 매칭, Chat/Site 동형)
- 크로스 클라우드 이동 패턴: `apps/web/src/app/bridge/navigation/usePushNavigate.ts`
- 최근검색어 저장 패턴: `apps/web/src/app/stores/usePreferenceStore.ts`
