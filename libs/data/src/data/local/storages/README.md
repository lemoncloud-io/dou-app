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
- 캐시 레코드에는 `lastSyncedAt`, `expiresAt` TTL 메타데이터가 `__cacheMeta`로 함께 저장됩니다.
    - **다만 어떤 어댑터도 조회 시 만료를 판정하거나 GC하지 않습니다.** `expiresAt`을 읽는 곳은
      `SyncMetaLocalDataSourceV2`뿐이고, 그마저 저장된 `expiresAt`이 아니라 `lastSyncedAt`으로 현재
      TTL 정책을 다시 계산합니다. 즉 지금 `expiresAt`은 기록만 되고 아무 동작도 하지 않습니다 —
      TTL에 의존하는 동작을 새로 만들려면 판정 지점을 먼저 만들어야 합니다.

## 읽기 비용 (네이티브)

네이티브 어댑터는 호출 한 번이 브릿지 왕복 한 번입니다. 그래서 "몇 번 부르는지"가 곧 성능입니다.

- **다건 조회는 `loadMany(ids)`를 쓰세요.** `load`를 id마다 부르면 왕복이 N회가 됩니다 —
  병합 쓰기(`cacheWriteMany`)가 정확히 그 모양이었고, 채팅 50건 저장이 51 왕복이었습니다.
  `loadMany`는 `FetchManyCacheData` 한 번으로 접고, 이 메시지를 모르는 구버전 앱에서는 id별 조회로
  자동 폴백합니다(`NativeDBAdapter.loadMany`).
- **`loadMany`는 결과의 길이도 순서도 보장하지 않습니다.** 없는 id는 빠집니다. 반드시 id로 다시
  색인하세요(`BaseLocalDataSourceV2.indexById`). `existing[index]`로 짝을 맞추면 캐시에 없는 항목
  하나 때문에 그 뒤 전부가 남의 기존 행과 병합됩니다.
- 읽기(`load`/`loadMany`/`loadAll`)는 **같은 페이로드가 동시에 여러 번 요청되면 왕복 한 번으로
  합쳐집니다**(`NativeDBAdapter`의 in-flight 중복 제거). 캐시가 아니라 "비행 중인 동안"만 유효한
  공유이며, 쓰기에는 적용되지 않습니다.

## 주요 구성

- `types.ts`
    - 공통 인터페이스: `CacheStorage<TType>` — `save` / `saveAll` / `load` / `loadMany` / `loadAll` / `delete` / `deleteAll` / `clearAll` / `clearByChannelId`
    - 저장 스키마: `CacheSchema<T>`
    - 어댑터 공통 기반: `BaseDbAdapter`(scope 결정)
- `IndexedDBAdapter.ts`
    - 웹 구현체
    - 키 포맷: `${type}:${cid}:${uid}:${id}`
    - 인덱스: `type_cid_uid`
    - `chat` 타입은 `ChatQueryExecutor`와 채널당 상한(`maxChatsPerChannel`, 미지정=무제한)을 옵션으로 받습니다
- `NativeDBAdapter.ts`
    - WebView bridge 구현체 — 모든 연산을 `bridge.request`로 네이티브에 위임합니다
    - 읽기 in-flight 중복 제거 + `loadMany` 배치 조회(구버전 앱 폴백 포함)를 소유합니다
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
- `clearByChannelId`의 기본 구현은 테이블 전체를 읽습니다. 네이티브에 채널 필터가 있는 삭제
  메시지가 없어서인데, 현재 프로덕션 호출자가 없으므로 그대로 두고 있습니다. 실사용 경로에 붙이기
  전에 `ClearCacheData`에 channelId 필터를 추가하세요.
