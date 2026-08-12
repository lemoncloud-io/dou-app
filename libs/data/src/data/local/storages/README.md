# Local Storage Adapters (`libs/data/src/data/local/storages`)

`CacheStorage` 인터페이스를 기준으로 웹(IndexedDB) / 네이티브(WebView bridge) 어댑터를 제공합니다.

**어느 어댑터를 쓸지는 이 계층이 정하지 않습니다.** 도메인별 저장소 선택은 `@chatic/app-runtime`의
`resolveCacheBackend`가 소유합니다 —
[cache-storage-routing.md](../../../../../app-runtime/docs/data/cache-storage-routing.md) 참고.
여기는 "고른 뒤 실제로 읽고 쓰는" 어댑터만 둡니다.

## 현재 scope 정책

- 현재는 **`(cid, uid)` 복합 scope**를 사용합니다.
- 각 CRUD 호출 시점에 `DataContextProvider.getContext()`를 읽어 scope를 결정합니다.
- 같은 adapter 인스턴스라도 context가 변경되면 즉시 다른 scope를 바라봅니다.
- 캐시 레코드에는 `lastSyncedAt`, `expiresAt` TTL 메타데이터가 함께 저장되며, 조회 시 만료 데이터는 반환 전에 GC됩니다.

## 주요 구성

- `types.ts`
    - 공통 인터페이스: `CacheStorage<TType>` — `save` / `saveAll` / `load` / `loadAll` / `delete` / `deleteAll` / `clearAll` / `clearByChannelId`
    - 저장 스키마: `CacheSchema<T>`
    - 어댑터 공통 기반: `BaseDbAdapter`(scope 결정)
- `IndexedDBAdapter.ts`
    - 웹 구현체
    - 키 포맷: `${type}:${cid}:${uid}:${id}`
    - 인덱스: `type_cid_uid`
    - `chat` 타입은 `ChatQueryExecutor`와 채널당 상한(`maxChatsPerChannel`, 미지정=무제한)을 옵션으로 받습니다
- `NativeDBAdapter.ts`
    - WebView bridge 구현체 — 모든 연산을 `bridge.request`로 네이티브에 위임합니다
- `stableHash.ts`
    - sorted-key JSON 직렬화. v2 local data source의 stream key 생성에 쓰입니다
- `index.ts`
    - 도메인별 storage 묶음 생성: `createCacheStorages(contextProvider, storageFactory)`

## 사용 예시

```ts
import { createCacheStorages, type CacheStorageFactory, IndexedDBAdapter, IndexedDBDatabase } from '@chatic/data';

// 실제 앱에서는 이 팩토리를 직접 쓰지 않고 @chatic/app-runtime의 getCacheStorage가 주입합니다.
const db = new IndexedDBDatabase();
const storageFactory: CacheStorageFactory = (type, provider) => new IndexedDBAdapter(db, type, provider);

const storages = createCacheStorages(contextProvider, storageFactory);
await storages.chat.save(chat.id, chat);
```

## 주의 사항

- `CacheStorage`는 호출 시점 context를 읽도록 구현되어야 합니다.
    - 같은 adapter 인스턴스라도 `cid/uid` 변경 후에는 새 scope로 동작해야 합니다.
- `saveAll`은 `id`가 없는 아이템을 무시합니다.
