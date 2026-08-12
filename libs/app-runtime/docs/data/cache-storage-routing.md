# 캐시 저장소 라우팅 (Cache Storage Routing)

> 상태: Live · 최종 갱신: 2026-08-12 · 관련 ADR: [ADR-0051](../../../../docs/adr/0051-cache-storage-routing-simplification.md)

## 목적

"이 캐시 타입은 어떤 저장소에 저장되는가"라는 질문에 **한 곳에서** 답한다.

역사적으로 이 답은 Hot(IndexedDB)+Cold(NativeDB) 2-tier 전략 계층이 담당했지만, 네이티브가
Cold-only로 전환된 뒤 실질 결정은 "타입별로 웹 저장소(IndexedDB)냐 네이티브 저장소(SQLite)냐"
하나로 줄었다. 이제 그 결정은 선언적 라우팅 함수 하나(`resolveCacheBackend`)가 내리고, 죽은
2-tier 기계는 제거됐으며, 조립부는 `remoteFactory` 결의 상태 없는 함수다.

## 설계 원칙

- **라우팅 결정은 단일 지점.** 새 캐시 타입을 추가하거나 저장 위치를 바꿀 때 수정하는 곳은
  라우팅 모듈 하나여야 한다. 팩토리·어댑터·앱 코드에 라우팅 분기를 추가하지 않는다.
- **핀과 게이트는 사유와 함께 선언한다.** 특정 타입을 예외 처리(예: profile 웹 고정)할 때는
  테이블 항목에 이유(버그 우회, 스큐 방어)를 주석으로 남긴다. 사유가 사라지면 항목도 지운다.
- **팩토리는 상태가 없다.** 데이터 레이어 팩토리 3형제(local/remote/repository)는 모두
  "받아서 조립해 반환"만 한다. 모듈 레벨 뮤터블 상태는 물리 공유 자원(공유 IndexedDB 연결)과
  런타임 싱글톤(runtime.ts)에만 허용한다.
- **앱 정책은 조립 시점에 주입한다.** chat 상한 같은 앱별 정책은 부팅 순서에 의존하는 세터가
  아니라 데이터 런타임 조립 옵션(`CacheAssemblyOptions`)으로 전달한다.
- **웹 선배포 스큐는 보수적으로 판정한다.** 네이티브가 지원을 보고하지 않은 타입은 웹
  저장소로 보낸다 — 이른 판정은 틀린 게 아니라 보수적일 뿐이어야 한다([nativeCacheSupport](../../src/data/nativeCacheSupport.ts) 참고).

## 시나리오

1. **네이티브 WebView, 일반 타입(chat 등).** `resolveCacheBackend('chat')` → 환경=native,
   핀 없음, chat은 프로즌 레거시 지원 집합에 포함 → `'native'`. NativeDBAdapter(SQLite)가
   저장을 담당한다. WebView IndexedDB가 OS에 의해 비워져도 데이터가 살아남는다.
2. **네이티브 WebView, profile.** `WEB_PINNED_CACHE_TYPES`에 profile이 웹 고정으로 선언되어
   있음 → `'web'`. 네이티브 Cold writer가 profile 소유자 uid를 스코프 uid로 덮어쓰는 버그를
   우회한다. IndexedDB가 비워지면 서버 재페치로 복구된다(표시용 파생 데이터라 유실이 아님).
3. **네이티브 WebView, 앱보다 새로운 타입.** 웹이 앱보다 먼저 배포되므로 웹만 아는 타입이
   생긴다. 레거시 집합에 없고 핸드셰이크 보고에도 없음 → `'web'`. 구형 앱의 `default:` 암이
   `null`+`success:true`로 답해 "영원히 빈 캐시"가 되는 함정을 피한다. 이후 앱 업데이트가
   해당 타입을 보고하면 `'native'`로 복귀한다.
4. **일반 브라우저(apps/web, admin-v2, desktop-web).** 네이티브 브리지 없음 → 모든 타입
   `'web'`. chat은 조립 옵션 `maxChatsPerChannel`이 주입된 경우에만 채널당 상한이
   걸린다(미주입=무제한).
5. **부팅 마이그레이션(invitecloud).** 과거 2-tier 빌드가 hot IndexedDB에 남긴 초대 클라우드를
   Cold로 회수하는 [invitedCloudColdSync](../../src/data/invitedCloudColdSync.ts)는 라우팅을 우회하는 전용 hot 리더
   (`createHotInviteCloudStorage`)를 계속 사용한다.

## 다이어그램

```mermaid
flowchart TD
    Q["getCacheStorage(type)"] --> R{resolveCacheBackend}
    R -->|"브라우저 환경\n(ReactNativeWebView 없음)"| W[web]
    R -->|"웹 핀 테이블 WEB_PINNED_CACHE_TYPES\n(profile: cold uid 버그 우회)"| W
    R -->|"네이티브 미지원 타입\n(레거시 집합 ∉ ∧ 핸드셰이크 보고 ∉)\n또는 스키마 버전 미달"| W
    R -->|그 외| N[native]
    W --> IDB["IndexedDBAdapter\n(공유 IndexedDBDatabase,\nchat이면 maxChatsPerChannel 적용)"]
    N --> SQL["NativeDBAdapter\n(bridge → 네이티브 SQLite)"]
```

```mermaid
flowchart LR
    subgraph 앱 부팅
        A["apps/web main.tsx\nconfigureDataRuntime(repoOpts, cache?)"] --> P["runtime.ts\npending 등록 (생성 전 1회)"]
        B["apps/desktop-web main.tsx\nsetChatCacheLimit(1000)\n(deprecated 심 → 같은 pending)"] --> P
    end
    P --> DM["DataManager(ctx, repoOpts, cacheOpts)"]
    DM --> LF["createLocalDataSources\n({ contextProvider, cache })"]
    LF --> GS["getCacheStorage(type, provider, cache)\n→ resolveCacheBackend"]
```

## 상세 구현

**[cacheStorageRouting.ts](../../src/data/cacheStorageRouting.ts)** — 라우팅 결정의 단일 지점.

- `resolveCacheBackend(type) → 'web' | 'native'`: ① 브라우저 환경이면 `'web'`
  ② `WEB_PINNED_CACHE_TYPES`(profile — 사유 주석 포함)면 `'web'`
  ③ `isNativeCacheTypeUsable(type)` 부정이면 `'web'` ④ 그 외 `'native'`.
- `isNativeApp()`(환경 축)도 여기 산다. 순수 판정 모듈 — I/O·어댑터 생성 없음.

**[localFactory.ts](../../src/data/factories/localFactory.ts)** — 상태 없는 조립.

- `getCacheStorage(type, contextProvider, cache?)`: 라우팅 결과를 어댑터로 실체화만 한다 —
  `'web'`이면 IndexedDBAdapter(chat이면 `cache?.maxChatsPerChannel` 동반), `'native'`면
  NativeDBAdapter. chat 상한은 무조건 동반해도 안전하다: 어댑터가 chat 외 타입에서 무시하고,
  네이티브 WebView의 chat은 레거시 집합 보장으로 항상 `'native'`라 웹 경로를 타지 않는다.
- 공유 `IndexedDBDatabase`가 **유일한 모듈 상태**(물리 공유 자원)다.
- `createHotInviteCloudStorage()`: 부팅 마이그레이션 전용 hot 리더(시나리오 5).
- `getGlobalCacheSearchSource()`: 환경 직결 — 네이티브면 `NativeGlobalSearchSource`(SQLite가
  source of truth), 아니면 `IndexedDbGlobalSearchSource`(ADR-0033: 기대 동작 동일).
- `createLocalDataSources({ contextProvider, cacheStorageFactory?, cache? })`: `cache`를 기본
  팩토리 클로저에 바인딩해 storage 묶음을 조립한다.

**[runtime.ts](../../src/data/runtime.ts)** — 앱 정책의 pre-boot 등록.

- `configureDataRuntime(repositoryOptions, cacheOptions?)`: 런타임 싱글톤 생성 전 1회 등록.
  늦은 호출은 경고 후 무시(레포지토리·스토리지는 DataManager 생성자에서 1회 조립되므로).
- `setChatCacheLimit(n)`: **deprecated 심** — 같은 pending 등록에 위임. 유일한 호출처가
  수정 금지인 `apps/desktop-web/src/main.tsx:16`이라 유지하며, desktop-web이
  `configureDataRuntime`으로 이전하면 제거한다.
- `getDataRuntime()`이 pending 등록을 `DataManager(ctx, repoOpts, cacheOpts)`로 전달한다.

**[nativeCacheSupport.ts](../../src/data/nativeCacheSupport.ts)** — 핸드셰이크 게이트(별도 트랙에서 랜딩).

- 네이티브가 `OnWebAppReady` 응답으로 보고한 `supportedCacheTypes`·`cacheSchemaVersion`
  스냅샷과 프로즌 레거시 집합으로 `isNativeCacheTypeUsable`을 판정한다. 상세는
  [README.md의 배포 스큐 절](README.md#저장소-선택과-webapp-배포-스큐) 참고.

**삭제된 것들** — `HotColdCacheStorageStrategy`·`AppPolicyResolver`·read-policy 표
(`cacheStorageStrategies.ts` 전체)와 `@chatic/data`의 `DynamicCacheStorage`·
`defaultPolicies`·`dynamicCacheTypes`(eviction/capacity/stampede 포함). 복원이 필요하면 git
이력(ADR-0051 삭제 커밋)에서 찾는다. `stableHash`는 라이브 데이터 소스가 써서 남았다.

## 검증 방법

- [localFactory.test.ts](../../src/data/factories/localFactory.test.ts) — 라우팅 계약: 개별 케이스 5종 + **전 타입 × 양 환경
  매트릭스 테스트**(라우팅 변화가 부수효과로 스며들 수 없게 고정) + chat 상한 주입 2종.
- [runtime.test.ts](../../src/data/runtime.test.ts) — 옵션 주입 경로: `configureDataRuntime` 정식 경로와
  `setChatCacheLimit` 심이 동일하게 DataManager에 도달하는지, 늦은 등록이 무시되는지.
- [nativeCacheSupport.test.ts](../../src/data/nativeCacheSupport.test.ts) — 게이트 판정(레거시 집합 동결, 보고 누적, 스키마 버전).
- 실행: `libs/app-runtime`에서 `../../node_modules/.bin/jest`. libs/data 스위트와 typecheck도
  함께 확인(`libs/data`에서 동일 명령).
