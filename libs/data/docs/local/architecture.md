# local 아키텍처

> 개요는 [README.md](./README.md). 정본: [data-sources-v2/types.ts](/Users/raine/Project/lemon/chatic-front/libs/data/src/data/local/data-sources-v2/types.ts), [storages/index.ts](/Users/raine/Project/lemon/chatic-front/libs/data/src/data/local/storages/index.ts).

## stream 모델

핵심은 `BaseLocalDataSourceV2`다. UI는 항상 `observe*`만 보고, repository가 local을 건드리면 **영향받은 observer만** 다시 계산된다.

- **item observer / list observer 분리** — `observeItemQuery(id, …)`, `observeListQuery(key, …)`로 등록. 구독 즉시 1회 발행하고, unsubscribe 함수를 반환한다.
- **list observer key는 query 기반** — `createListObserverKey(parts, …)`가 scope key + query parts를 합친 키를 만든다. query가 다르면 observer도 다르다.
- **영향 범위 기반 재발행** — mutation 후 전체 재발행이 아니라:
    - `scheduleItemReemit(ids)` — 해당 id observer만
    - `scheduleListReemit(prefixes)` — 키가 prefix로 시작하는 list observer만
    - `scheduleFullReemit()` — 전체 (scope 전환·clear 등)
- **debounce flush** — 재발행은 50ms 타이머로 모았다가 한 번에 flush한다(중복 notify 제거 포함).

## 스코프와 캐시 슬롯

scope는 `cid`(cloud) · `sid`(place) · `uid`(user)다. observer 격리는 이 튜플의 `stableHash`로 한다(`getScopeKey`). `cid`/`uid`는 없으면 `'default'`로, `sid`는 그대로 둔다.

물리 저장은 `CacheStorage<TType>` 슬롯 단위다. 슬롯 키: `channel`, `chat`, `invitecloud`, `join`, `profile`, `site`, `user`, `meta`.

도메인 → 물리 슬롯 매핑에 주의할 점이 둘 있다(같은 엔티티라 슬롯을 재사용):

- `place`(Place 도메인) → `site` 슬롯
- `cloud`(Cloud 도메인) → `invitecloud` 슬롯
- `syncMeta` → `meta` 슬롯

`BaseDbAdapter`는 type별 정책으로 저장 scope(`cid`/`uid`)를 결정한다(`resolveScopedContext`).

## storages 계층

`CacheStorage<TType>` 인터페이스: `save` / `saveAll` / `load` / `loadAll` / `delete` / `deleteAll` / `clearAll` / `clearByChannelId`.

- `IndexedDBAdapter` — hot tier(웹).
- `NativeDBAdapter` — native bridge.
- `DynamicCacheStorage`(DCS) — hot/cold 2계층 + eviction. `dynamicCacheTypes.ts`가 정책 훅을 정의한다:
    - `PolicyResolver` — type별 read / loadAll 정책(`hot-first` / `cold-first`).
    - `EvictionStrategy` — `onStartup`(TTL sweep) / `onAfterWrite`(per-type cap) / `onQuotaExceeded`(비상 cleanup).
    - `CapacityPolicy` — type별 최대 항목 수와 group key.
    - `CacheErrorReporter` — tier(`hot`/`cold`/`eviction`/`stampede`)·operation별 에러 보고.

## databases 계층

storage 위의 복합 조회. 현재 `chat` 전용.

- `ChatQueryExecutor` — `(type, cid, uid, channel_id, chat_no)` 복합 인덱스로 cursor 기반 역순 페이징을 한다. `cursorNo`가 있으면 그 값을 exclusive upper bound로 잡아 이전 페이지를 읽는다.
- `IndexedDBDatabase` — 인덱스 정의(`CHAT_PAGINATION_INDEX`, `TYPE_CID_UID_INDEX`)와 저수준 cursor 조회.

## chat cursor와 local

local의 역할은 cursor를 계산하는 게 아니라, repository가 준 query로 snapshot을 반환하는 것이다.

`ChatLocalDataSourceV2` 기준:

- `cacheReadList({ channelId, cursorNo?, limit? })` / `observeList(...)`
- `cacheClearByChannelId(channelId)`

주의:

- 최신 페이지와 이전 페이지는 query가 달라 observer key도 다르다.
- `chat.feed` 응답 merge 정책은 repository 책임이다(local은 저장·재방출).
- `cursorNo`는 이전 페이지 조회용 구분자이지 최신 sync 기준값이 아니다.

## cache clear 원칙

- `cacheClear()`는 전체가 아니라 현재 storage scope 기준 clear다.
- `chat`은 `cacheClearByChannelId(channelId)`를 별도 지원한다.
- 로그아웃 · cloud 전환 · 테스트 초기화에서 clear 범위를 명확히 정한다.

## 구현 / 테스트 시 주의

- context는 인스턴스 생성 시점이 아니라 **호출 시점** 기준으로 읽혀야 한다(`contextOverride`로 repository가 캡처한 scope 주입).
- 요청 시점 context와 응답 시점 context가 달라질 수 있다 → scope 캡처는 repository에서.
- `sid` fallback 오류는 cross-place 오염으로 이어진다.
- `chat.feed`는 overwrite보다 merge가 중요하다.
