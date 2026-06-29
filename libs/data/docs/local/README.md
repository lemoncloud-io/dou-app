# local (`libs/data/src/data/local`)

local 레이어는 앱이 읽는 로컬 데이터의 **저장 · 조회 · stream 발행**을 담당한다.

local은 remote를 직접 호출하지 않는다. repository가 적재한 remote 결과를 UI read-model로 재방출하는 계층이다. 즉 "동기화 로직"이 아니라 "동기화 결과를 안전하게 저장하고 stream으로 내보내는 계층"이다.

> **V1은 제거됐다.** 현재 local data source는 `data-sources-v2`만 존재한다.

## 구성

```txt
local/
  data-sources-v2/   도메인별 LocalDataSourceV2 + BaseLocalDataSourceV2(stream)
  databases/         storage 위 복합 조회 (현재 chat query executor)
  storages/          CacheStorage 어댑터 (IndexedDB / Native / DynamicCache)
```

- **`storages/`** — `CacheStorage<TType>` 어댑터. `IndexedDBAdapter`(hot), `NativeDBAdapter`, 그리고 hot/cold 계층화·eviction을 다루는 `DynamicCacheStorage`. scope(`cid`/`uid`)는 `BaseDbAdapter`가 결정한다.
- **`databases/`** — storage 위의 복합 조회 계층. 현재는 cursor 기반 역순 페이징을 처리하는 `ChatQueryExecutor`와 `IndexedDBDatabase`.
- **`data-sources-v2/`** — 도메인별 local data source. 공통 계약 `ILocalDataSourceV2`와 stream 엔진 `BaseLocalDataSourceV2`를 따른다.

## 역할

- 로컬 snapshot 조회 / stream 발행
- partial merge / normalize
- scope(`cid` / `sid` / `uid`) 분리
- repository가 적재한 remote 결과를 UI read-model로 재방출

## 공통 계약

정본: [data-sources-v2/types.ts](/Users/raine/Project/lemon/chatic-front/libs/data/src/data/local/data-sources-v2/types.ts).

```ts
interface ILocalDataSourceV2<TItem, TListQuery, TListResult> {
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

모든 메서드가 `contextOverride`를 받는다 — repository가 캡처한 요청 시점 scope를 호출 단위로 덮어쓰기 위해서다.

## 도메인 목록

`channel`, `chat`, `cloud`, `join`, `place`, `profile`, `user`, `syncMeta`.

팩토리: [data-sources-v2/index.ts](/Users/raine/Project/lemon/chatic-front/libs/data/src/data/local/data-sources-v2/index.ts) — `createLocalDataSourcesV2(contextProvider, storages)`.

## 더 읽기

- [architecture.md](./architecture.md) — stream 모델, scope·캐시 슬롯, storages/databases 계층, chat cursor, cache clear.
