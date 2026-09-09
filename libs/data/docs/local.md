# local — 저장 · 조회 · stream 발행

> 상태: Live · 최종 갱신: 2026-09-09 · 개요는 [architecture.md](./architecture.md) · 정본 코드: [local/data-sources/types.ts](../src/local/data-sources/types.ts) · [local/ports/cacheStorage.ts](../src/local/ports/cacheStorage.ts)

local 레이어는 앱이 읽는 로컬 데이터의 **저장 · 조회 · stream 발행**을 담당한다.

local은 remote를 직접 호출하지 않는다. repository가 적재한 remote 결과를 UI read-model로
재방출하는 계층이다. 즉 "동기화 로직"이 아니라 "동기화 결과를 안전하게 저장하고 stream으로 내보내는
계층"이다.

## 구성

```text
local/
  data-sources/   도메인별 LocalDataSource 9종 + stream 엔진 BaseLocalDataSource
  ports/          외부 구현을 받는 포트 — cacheStorage · indexeddb · metrics · policy · search
  stableHash.ts   scope key 해시
```

**저장 엔진은 이 lib에 없다.** `CacheStorage` 구현체(`IndexedDBAdapter` · `NativeDBAdapter` ·
`BaseDbAdapter`)와 복합 조회(`ChatQueryExecutor` · `IndexedDBDatabase`)는 모두 `@chatic/db`에 있다.
`ports/`는 그 구현을 받는 인터페이스만 선언한다.

그리고 **도메인별로 어느 어댑터를 쓸지 고르는 책임도 이 lib에 없다.** `@chatic/app-runtime`의
`resolveCacheBackend`가 환경·타입 핀·네이티브 capability를 한 곳에서 판정한다 —
[cache-storage-routing.md](../../app-runtime/docs/data/cache-storage-routing.md) 참고.

## 역할

- 로컬 snapshot 조회 / stream 발행
- partial merge / normalize
- scope(`cid` / `sid` / `uid`) 분리
- repository가 적재한 remote 결과를 UI read-model로 재방출

## 공통 계약

```ts
interface ILocalDataSource<TItem, TListQuery, TListResult> {
    cacheRead(id, contextOverride?): Promise<TItem | null>;
    cacheReadList(query, contextOverride?): Promise<TListResult | null>;

    observeItem(id, callback, contextOverride?): Unsubscribe;
    observeList(query, callback, contextOverride?): Unsubscribe;

    cacheWrite(item, contextOverride?): Promise<void>;
    cacheWriteMany(items, contextOverride?): Promise<void>;
    cacheDelete(id, contextOverride?): Promise<void>;
    cacheDeleteMany(ids, contextOverride?): Promise<void>;
    cacheClear(contextOverride?): Promise<void>;
}
```

모든 메서드가 `contextOverride`를 받는다 — repository가 캡처한 요청 시점 scope를 호출 단위로
덮어쓰기 위해서다.

## 도메인 목록

`channel`, `chat`, `cloud`, `invite`, `join`, `place`, `profile`, `user`, `syncMeta` — 9종.

팩토리: [data-sources/index.ts](../src/local/data-sources/index.ts) —
`createLocalDataSources(contextProvider, storages)`.

## stream 모델

핵심은 `BaseLocalDataSource`다. UI는 항상 `observe*`만 보고, repository가 local을 건드리면
**영향받은 observer만** 다시 계산된다.

- **item observer / list observer 분리** — `observeItemQuery(id, …)`, `observeListQuery(key, …)`로 등록. 구독 즉시 1회 발행하고 unsubscribe 함수를 반환한다.
- **list observer key는 query 기반** — `createListObserverKey(parts, …)`가 scope key + query parts를 합친 키를 만든다. query가 다르면 observer도 다르다.
- **영향 범위 기반 재발행** — mutation 후 전체 재발행이 아니다.
    - `scheduleItemReemit(ids)` — 해당 id observer만
    - `scheduleListReemit(prefixes)` — 키가 prefix로 시작하는 list observer만
    - `scheduleFullReemit()` — 전체 (scope 전환·clear 등)
- **debounce flush** — 재발행은 50ms 타이머로 모았다가 한 번에 flush한다(중복 notify 제거 포함).

## 스코프와 캐시 슬롯

scope는 `cid`(cloud) · `sid`(place) · `uid`(user)다. observer 격리는 이 튜플의 `stableHash`로
한다(`getScopeKey`). `cid`/`uid`는 없으면 `'default'`로, `sid`는 그대로 둔다.

물리 저장은 `CacheStorage<TType>` 슬롯 단위다. 슬롯 키 9종: `channel`, `chat`, `user`, `join`,
`site`, `invitecloud`, `profile`, `meta`, `invite`.

도메인 → 물리 슬롯 매핑에 주의할 점이 셋 있다(같은 엔티티라 슬롯을 재사용).

| 도메인     | 슬롯          |
| ---------- | ------------- |
| `place`    | `site`        |
| `cloud`    | `invitecloud` |
| `syncMeta` | `meta`        |

`BaseDbAdapter`(`@chatic/db`)는 type별 정책으로 저장 scope(`cid`/`uid`)를 결정한다
(`resolveScopedContext`).

## chat cursor와 local

local의 역할은 cursor를 계산하는 게 아니라, repository가 준 query로 snapshot을 반환하는 것이다.

`ChatLocalDataSource` 기준:

- `cacheReadList({ channelId, cursorNo?, limit? })` / `observeList(...)`
- `cacheClearByChannelId(channelId)`

주의:

- 최신 페이지와 이전 페이지는 query가 달라 observer key도 다르다.
- `chat.feed` 응답 merge 정책은 repository 책임이다(local은 저장·재방출).
- `cursorNo`는 이전 페이지 조회용 구분자이지 최신 sync 기준값이 아니다.

## cache clear

무엇을 언제 지우는가(스코프 의미, chat 삭제의 비가역성, 퇴장·재입장 시 purge 트리거)는 repository
계층의 정책이고 정본은
[repositories.md의 cache clear 원칙](./repositories.md#cache-clear-원칙)이다. 여기서는 storage가
그 요청을 **어떻게 수행하는지**만 적는다.

### 채널 한정 삭제의 세 경로

`clearByChannelId`는 어댑터마다 다른 방식으로 같은 일을 한다
([ADR-0067](../../../docs/adr/0067-rejoin-hides-prior-messages.md)).

| 어댑터                 | 방식                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `IndexedDBAdapter`     | 채널 인덱스 범위 cursor                                                                                            |
| `NativeDBAdapter`      | 브릿지 메시지 `ClearCacheDataByChannel` → `DELETE … WHERE cid=? AND uid=? AND channel_id=?` (왕복 1회, 페이로드 0) |
| `BaseDbAdapter` (폴백) | `loadAll({ channelId })` → `deleteAll(ids)`                                                                        |

새 메시지를 기존 `ClearCacheData`에 `channelId` 필드를 얹는 방식으로 하지 않은 이유: 웹이 앱보다
먼저 배포되므로 **구버전 앱은 모르는 필드를 무시하고 해당 스코프의 테이블 전체를 지운다.** 새
타입이면 같은 상황이 `NOT_FOUND`가 되고, 어댑터가 그걸 1회 학습해
(`resetNativeClearByChannelSupport`가 테스트 seam) 폴백으로 내려간다. `FetchManyCacheData`·
`FetchLastChatsData`와 같은 관용구지만 폴백의 성격은 다르다 — 읽기는 못 하면 빈손으로 돌아가면
되지만, 삭제는 폴백이 실제로 같은 일을 마쳐야 한다.

폴백 읽기는 `channelId`를 쿼리로 선언한 도메인(chat·join)에서 그 채널로 좁혀 나간다. 그래서 방
하나를 비우는 데 테이블 전체가 브릿지를 건너오지 않는다. `NOT_FOUND`가 아닌 실패(타임아웃 등)는
학습하지 않고 그대로 던진다.

## 구현 / 테스트 시 주의

- context는 인스턴스 생성 시점이 아니라 **호출 시점** 기준으로 읽혀야 한다(`contextOverride`로 repository가 캡처한 scope 주입).
- 요청 시점 context와 응답 시점 context가 달라질 수 있다 → scope 캡처는 repository에서.
- `sid` fallback 오류는 cross-place 오염으로 이어진다.
- `chat.feed`는 overwrite보다 merge가 중요하다.
