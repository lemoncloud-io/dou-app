# Hot/Cold 2-Tier Cache Strategy 명세서

`db-adapter-refactoring.md`에서 완성한 어댑터 아키텍처 위에 **Hot/Cold 2-Tier 캐시 전략**을 추가하는 구현 명세입니다.

---

## 1. 개요

| 환경            | 현재                  | 목표                                   |
| --------------- | --------------------- | -------------------------------------- |
| **웹 브라우저** | IndexedDB 단독        | IndexedDB 단독 (변경 없음)             |
| **앱 WebView**  | NativeDB(SQLite) 단독 | Hot(IndexedDB) + Cold(NativeDB) 2-Tier |

앱 WebView 환경에서 NativeDB(SQLite)는 브릿지 통신 오버헤드로 읽기 지연이 발생합니다. IndexedDB를 **파생 캐시(Hot)**로 앞단에 배치하여 읽기 성능을 개선하고, NativeDB(SQLite)는 **영구 저장소(Cold, Source of Truth)**로 유지합니다.

### 핵심 원칙

1. **Cold = Source of Truth** — 모든 쓰기는 Cold 먼저
2. **Hot = 파생 캐시** — 유실 시 Cold에서 복구, Hot 실패는 비치명적
3. **전략 객체로 조립** — `localFactory.ts`는 런타임 판별만, 저장소 조합은 `CacheStorageStrategy`가 담당
4. **인터페이스 투명성** — `DynamicCacheStorage`는 `CacheStorage<TType>`을 그대로 구현
5. **삭제는 stale 방지 우선** — delete/clear는 Cold 성공 후 Hot 무효화를 best-effort await

---

## 2. 아키텍처

### 2.1 설계 의도

상위 계층(DataSource/Repository)은 **`CacheStorage<TType>` 인터페이스만 의존**합니다. 실제 DB(IndexedDB, SQLite)에 직접 접근하지 않고, 어댑터가 각 DB를 감싸서 동일한 인터페이스를 제공합니다.

`DynamicCacheStorage`도 DB를 직접 사용하지 않습니다. 두 개의 `CacheStorage` 어댑터를 내부에 조합하여 Hot/Cold 전략을 실행할 뿐입니다. 어떤 조합을 쓸지는 전략 객체(`CacheStorageStrategy`)가 환경에 따라 결정하므로, **상위 계층 코드 변경 없이 저장소 전략을 교체**할 수 있습니다.

```mermaid
flowchart TD
    subgraph Upper ["상위 계층 (변경 없음)"]
        DS["DataSource / Repository"]
    end

    DS -->|"CacheStorage&#60;TType&#62; 인터페이스만 의존"| IF{localFactory.ts}

    subgraph Strategy ["CacheStorageStrategy (환경별 선택)"]
        IF -->|Browser| S1["IndexedDbOnlyStrategy"]
        IF -->|App WebView| S2["HotColdStrategy"]
    end

    subgraph Adapters ["어댑터 계층 (DB 직접 접근 차단)"]
        S1 --> IDB_ONLY["IndexedDBAdapter"]
        S2 --> DCS["DynamicCacheStorage"]
        DCS -->|"hot: CacheStorage"| IDB["IndexedDBAdapter"]
        DCS -->|"cold: CacheStorage"| NDB["NativeDBAdapter"]
    end

    subgraph DB ["실제 DB (어댑터 내부)"]
        IDB_ONLY -.-> WEB_IDB["IndexedDB"]
        IDB -.-> APP_IDB["IndexedDB"]
        NDB -.->|"bridge 통신"| SQLITE["SQLite (App)"]
    end
```

핵심: 점선(DB 접근)은 어댑터 내부에서만 발생합니다. 상위 계층 → 어댑터 → DB, 이 경계를 `CacheStorage` 인터페이스가 보장합니다.

### 2.2 인터페이스 설계

#### 기반 타입 (`@chatic/app-messages`)

```typescript
/** 캐시 가능한 도메인 타입 */
export type CacheType = 'channel' | 'chat' | 'user' | 'join' | 'site' | 'invitecloud';

/** CacheType → 모델 매핑 (예: 'chat' → CacheChatView) */
export type CacheModelOf<TType extends CacheType> = CacheModelMap[TType];

/** CacheType → 쿼리 옵션 매핑 (예: 'chat' → ChatQueryOptions) */
export type CacheQueryOf<TType extends CacheType> = CacheQueryMap[TType];
```

#### 컨텍스트 (`@chatic/data`)

```typescript
/** Repository/Storage가 현재 cid/uid를 읽는 계약 */
export interface DataContextProvider {
    getContext(): DataContext;
    setContext(context: DataContext): void;
}

export interface DataContext {
    cid?: string; // Cloud ID
    sid?: string; // Place ID
    uid?: string; // User ID
}
```

#### 저장소 인터페이스 (`@chatic/data`)

```typescript
/** 모든 저장소 구현체가 만족해야 하는 공통 인터페이스 */
export interface CacheStorage<TType extends CacheType> {
    save(id: string, item: CacheModelOf<TType>): Promise<CacheModelOf<TType>>;
    saveAll(items: CacheModelOf<TType>[]): Promise<CacheModelOf<TType>[]>;
    load(id: string): Promise<CacheModelOf<TType> | null>;
    loadAll(options?: CacheQueryOf<TType>): Promise<CacheModelOf<TType>[]>;
    delete(id: string): Promise<void>;
    deleteAll(ids: string[]): Promise<void>;
    clearAll(): Promise<void>;
}

/** 저장소 생성 팩토리 타입 */
export type CacheStorageFactory = <TType extends CacheType>(
    type: TType,
    contextProvider: DataContextProvider
) => CacheStorage<TType>;
```

```typescript
/** IndexedDBAdapter/NativeDBAdapter의 공통 기반 추상 클래스 */
export abstract class BaseDbAdapter<TType extends CacheType> implements CacheStorage<TType> {
    constructor(
        protected readonly type: TType,
        protected readonly contextProvider: DataContextProvider
    ) {}

    /** 도메인 타입 정책에 따른 스코프(cid, uid) 결정 */
    protected getScope(): { cid: string; uid: string };

    abstract save(id, item): Promise<CacheModelOf<TType>>;
    abstract saveAll(items): Promise<CacheModelOf<TType>[]>;
    abstract load(id): Promise<CacheModelOf<TType> | null>;
    abstract loadAll(options?): Promise<CacheModelOf<TType>[]>;
    abstract delete(id): Promise<void>;
    abstract deleteAll(ids): Promise<void>;
    abstract clearAll(): Promise<void>;
}
```

#### 클래스 관계

```mermaid
classDiagram
    class CacheStorage~TType~ {
        <<interface>>
        +save(id, item) Promise
        +saveAll(items) Promise
        +load(id) Promise
        +loadAll(options?) Promise
        +delete(id) Promise
        +deleteAll(ids) Promise
        +clearAll() Promise
    }

    class BaseDbAdapter~TType~ {
        <<abstract>>
        #type: TType
        #contextProvider: DataContextProvider
        #getScope() cid, uid
    }

    class IndexedDBAdapter~TType~ {
        DB를 직접 감싸는 어댑터
    }

    class NativeDBAdapter~TType~ {
        Bridge를 통해 SQLite 접근
    }

    class DynamicCacheStorage~TType~ {
        DB 직접 접근 없음
        어댑터 두 개를 조합
        -hot: CacheStorage
        -cold: CacheStorage
        -options: DynamicCacheStorageOptions
    }

    CacheStorage~TType~ <|.. BaseDbAdapter~TType~
    BaseDbAdapter~TType~ <|-- IndexedDBAdapter~TType~
    BaseDbAdapter~TType~ <|-- NativeDBAdapter~TType~
    CacheStorage~TType~ <|.. DynamicCacheStorage~TType~
    DynamicCacheStorage~TType~ o-- CacheStorage~TType~ : hot
    DynamicCacheStorage~TType~ o-- CacheStorage~TType~ : cold
```

> `DynamicCacheStorage`는 `CacheStorage`를 구현하면서 동시에 두 개의 `CacheStorage`를 내부에 조합(composition)합니다. 자체적으로 DB에 접근하지 않으며, 모든 실제 I/O는 주입받은 어댑터에 위임합니다.

#### DynamicCacheStorage 옵션 (신규)

```typescript
export type CacheReadPolicy = 'hot-first' | 'cold-first';

export type DynamicCacheOperation = 'save' | 'saveAll' | 'load' | 'loadAll' | 'delete' | 'deleteAll' | 'clearAll';

export interface DynamicCacheStorageOptions<TType extends CacheType> {
    type?: TType;
    readPolicy?: CacheReadPolicy; // load()용, 기본 'hot-first'
    loadAllPolicy?: CacheReadPolicy; // loadAll()용, 기본 'cold-first'
    warmupChunkSize?: number;
    onHotError?: (error: unknown, context: { type?: TType; operation: DynamicCacheOperation }) => void;
}
```

#### 전략 패턴 (신규)

```typescript
/** 환경별 저장소 조합을 캡슐화하는 전략 인터페이스 */
export interface CacheStorageStrategy {
    create<TType extends CacheType>(type: TType, contextProvider: DataContextProvider): CacheStorage<TType>;
}
```

### 2.3 Strategy 구현체

| Strategy                            | 환경            | 조합                                                              |
| ----------------------------------- | --------------- | ----------------------------------------------------------------- |
| `IndexedDbOnlyCacheStorageStrategy` | 웹 브라우저     | `IndexedDBAdapter`                                                |
| `NativeDbOnlyCacheStorageStrategy`  | fallback/테스트 | `NativeDBAdapter`                                                 |
| `HotColdCacheStorageStrategy`       | 앱 WebView      | `DynamicCacheStorage(hot=IndexedDBAdapter, cold=NativeDBAdapter)` |

---

## 3. 데이터 흐름

### 3.1 Read — `load(id)` (hot-first)

```mermaid
sequenceDiagram
    participant Caller
    participant DC as DynamicCacheStorage
    participant Hot as Hot (IndexedDB)
    participant Cold as Cold (NativeDB)

    Caller->>DC: load(id)
    DC->>Hot: Hot.load(id)
    alt Hot hit
        Hot-->>DC: item
        DC-->>Caller: return item
    else Hot miss
        Hot-->>DC: null
        DC->>Cold: Cold.load(id)
        alt Cold hit
            Cold-->>DC: item
            DC--)Hot: Hot.save(id, item) [background]
            DC-->>Caller: return item
        else Cold miss
            Cold-->>DC: null
            DC-->>Caller: return null
        end
    else Hot 에러
        Hot-->>DC: ❌ Error
        Note over DC: reporter 기록
        DC->>Cold: Cold.load(id) [fallback]
        Cold-->>DC: item | null
        DC-->>Caller: return item | null
    end
```

### 3.2 Read — `loadAll(options?)`

```mermaid
sequenceDiagram
    participant Caller
    participant DC as DynamicCacheStorage
    participant Hot as Hot (IndexedDB)
    participant Cold as Cold (NativeDB)

    Caller->>DC: loadAll(options)

    alt loadAllPolicy = 'hot-first'
        DC->>Hot: Hot.loadAll(options)
        alt Hot 결과 > 0
            Hot-->>DC: [items]
            DC-->>Caller: return [items]
        else Hot 빈 배열 or 에러
            Hot-->>DC: [] or ❌
            DC->>Cold: Cold.loadAll(options)
            Cold-->>DC: [items]
            DC--)Hot: Hot.saveAll(items) [warm-up background]
            DC-->>Caller: return [items]
        end
    else loadAllPolicy = 'cold-first'
        DC->>Cold: Cold.loadAll(options)
        Cold-->>DC: [items]
        DC--)Hot: Hot.saveAll(items) [warm-up background]
        DC-->>Caller: return [items]
    end
```

### 3.3 Write — `save(id, item)` / `saveAll(items)`

```mermaid
sequenceDiagram
    participant Caller
    participant DC as DynamicCacheStorage
    participant Cold as Cold (NativeDB)
    participant Hot as Hot (IndexedDB)

    Caller->>DC: save(id, item)
    DC->>Cold: 1. Cold.save(id, item)
    alt Cold 성공
        Cold-->>DC: ✓
        DC--)Hot: 2. Hot.save(id, item) [background fire-and-forget]
        DC-->>Caller: return item
    else Cold 실패
        Cold-->>DC: ❌ Error
        Note over DC: Hot 미호출
        DC-->>Caller: ❌ 에러 전파
    end
```

### 3.4 Delete — `delete(id)` / `deleteAll(ids)` / `clearAll()`

```mermaid
sequenceDiagram
    participant Caller
    participant DC as DynamicCacheStorage
    participant Cold as Cold (NativeDB)
    participant Hot as Hot (IndexedDB)

    Caller->>DC: delete(id)
    DC->>Cold: 1. Cold.delete(id)
    alt Cold 성공
        Cold-->>DC: ✓
        DC->>Hot: 2. Hot.delete(id) [await best-effort]
        alt Hot 성공
            Hot-->>DC: ✓
        else Hot 실패
            Hot-->>DC: ❌
            Note over DC: reporter 기록, 삼킴
        end
        DC-->>Caller: return void
    else Cold 실패
        Cold-->>DC: ❌ Error
        Note over DC: Hot 미호출
        DC-->>Caller: ❌ 에러 전파
    end
```

> 삭제는 Hot에 stale 데이터가 남지 않도록, save(background fire-and-forget)와 달리 Hot 무효화를 **await**합니다.

### 3.5 타입별 Read Policy

```typescript
const defaultReadPolicies: Record<CacheType, CacheReadPolicy> = {
    chat: 'hot-first',
    channel: 'hot-first',
    invitecloud: 'hot-first',
    join: 'hot-first',
    site: 'hot-first',
    user: 'hot-first',
};

const defaultLoadAllPolicies: Record<CacheType, CacheReadPolicy> = {
    chat: 'hot-first', // append-only + ChatQueryExecutor로 Hot에서 동일 쿼리 가능
    channel: 'cold-first',
    invitecloud: 'cold-first',
    join: 'cold-first',
    site: 'cold-first',
    user: 'cold-first',
};
```

| 데이터 성격                            | `readPolicy` | `loadAllPolicy` | 근거             |
| -------------------------------------- | ------------ | --------------- | ---------------- |
| append 중심, 단건 조회 빈번 (chat)     | `hot-first`  | `hot-first`     | bridge 비용 절감 |
| 변경/삭제 잦음                         | `cold-first` | `cold-first`    | Cold 정합성 우선 |
| 단건은 Hot 가능, 목록 쿼리 불일치 우려 | `hot-first`  | `cold-first`    | 혼합             |

### 3.6 Cache Miss → Network Fetch (상위 계층 연계)

`DynamicCacheStorage`는 **캐시 계층만 담당**합니다. Hot/Cold 양쪽 모두 miss(null/빈 배열)이면 그대로 null/빈 배열을 반환할 뿐, 네트워크 요청을 수행하지 않습니다.

네트워크 fetch는 **Repository 계층**에서 `fetchWithCachePolicy()` 패턴으로 처리합니다.

```mermaid
sequenceDiagram
    participant UI as UI (Page)
    participant Repo as Repository
    participant LDS as LocalDataSource
    participant DC as DynamicCacheStorage
    participant Hot as Hot (IndexedDB)
    participant Cold as Cold (NativeDB)
    participant RDS as RemoteDataSource
    participant Server as Cloud Backend

    UI->>Repo: fetchChat({ channelId }, cachePolicy: 'cache-first')
    Repo->>LDS: fetchLocal()
    LDS->>DC: loadAll(options)

    DC->>Hot: Hot.loadAll(options)
    Hot-->>DC: [] (miss)
    DC->>Cold: Cold.loadAll(options)
    Cold-->>DC: [] (miss)
    DC-->>LDS: return []
    LDS-->>Repo: return { list: [], source: 'local' }

    Note over Repo: isLocalValid → list.length === 0 → false
    Note over Repo: Cache 전체 miss → Network fallback

    Repo->>RDS: fetchRemote(options)
    RDS->>Server: WebSocket chat:mine 요청
    Server-->>RDS: [msg1..msg50]
    RDS-->>Repo: return [msg1..msg50]

    Note over Repo: 네트워크 결과를 캐시에 저장 (saveAll)
    Repo->>DC: saveAll([msg1..msg50])
    DC->>Cold: Cold.saveAll()
    Cold-->>DC: ✓
    DC--)Hot: Hot.saveAll() [background]
    Repo-->>UI: return [msg1..msg50]
```

#### Repository의 캐시 정책 결정 흐름

Repository는 `fetchWithCachePolicy`(범용)와 `fetchChat`(Chat 전용) 두 가지 패턴으로 캐시 정책을 결정합니다. 핵심 분기는 동일합니다:

```typescript
// BaseRepository.fetchWithCachePolicy (libs/data/src/data/repositories/types.ts)
protected async fetchWithCachePolicy<T>({
    options, fetchLocal, fetchRemote, fallback, isLocalValid, backgroundLabel,
}): Promise<T> {
    const policy = this.resolveCachePolicy(options);

    // 1. network-only → 캐시 스킵, 바로 네트워크
    if (policy === 'network-only') {
        return fetchRemote(options);
    }

    // 2. 로컬 캐시 조회 (DynamicCacheStorage → Hot/Cold)
    const local = await fetchLocal();

    // 3. cache-only → 네트워크 절대 안 탐
    if (policy === 'cache-only') {
        return local ?? fallback();
    }

    // 4. cache-first: 캐시 유효하면 즉시 반환 + 백그라운드 리프레시
    if (local && (isLocalValid ? isLocalValid(local) : true)) {
        this.runInBackground(() => fetchRemote({ ...options, cachePolicy: 'network-only' }));
        return local;
    }

    // 5. ★ 캐시 전체 miss → 네트워크 fetch (foreground await)
    return fetchRemote(options);
}
```

#### `fetchRemote` = `fetchFromRemoteAndCache` — 네트워크 fetch + DB 저장을 한 곳에서

위 분기에서 호출되는 `fetchRemote`는 실제로 각 Repository의 `fetchFromRemoteAndCache` 메서드입니다. 이 메서드가 **네트워크에서 가져오기 + 캐시에 저장**을 한 번에 처리합니다.

```typescript
// ChatRepository.fetchFromRemoteAndCache (libs/data/src/data/repositories/ChatRepository.ts)
private async fetchFromRemoteAndCache(
    payload: ChatFeedPayload,
    options?: RepositoryRequestOptions
): Promise<DomainListResult<DomainChat>> {
    // 1. 네트워크 요청 (WebSocket chat:mine)
    const remote = await this.requestRemote<ChatFeedResult>(
        ref => this.chatRemoteDataSource.fetchChat(payload, ref),
        options
    );

    const domainList = (remote.list || []).map(item => toDomainChat(item, requestScope));

    // 2. ★ 가져온 데이터를 로컬 캐시에 저장
    //    cross-cloud 오염 방지: 요청 시점 cid와 현재 cid가 같을 때만 저장
    const currentCid = this.getRepositoryContext().cid;
    if (currentCid === requestContext.cid) {
        await this.chatLocalDataSource.upsertMany(domainList, requestContext);
        // └─ 내부: CacheStorage.saveAll() 호출
        //    └─ DynamicCacheStorage: Cold.saveAll() → Hot.saveAll() [background]
    }

    return createDomainListResult(domainList, { source: 'remote', ... });
}
```

#### 네트워크 데이터 → DB 저장 경로 상세

```mermaid
sequenceDiagram
    participant Repo as ChatRepository
    participant RDS as ChatRemoteDataSource
    participant Server as Cloud Backend
    participant LDS as ChatLocalDataSource
    participant DC as DynamicCacheStorage
    participant Cold as Cold (NativeDB)
    participant Hot as Hot (IndexedDB)

    Note over Repo: fetchFromRemoteAndCache()

    Repo->>RDS: chatRemoteDataSource.fetchChat(payload)
    RDS->>Server: WebSocket chat:mine
    Server-->>RDS: ChatFeedResult { list: [...] }
    RDS-->>Repo: return ChatFeedResult

    Note over Repo: toDomainChat()으로 도메인 모델 변환

    Repo->>Repo: cross-cloud 검사 (requestContext.cid === currentCid?)

    alt 같은 cloud (저장 진행)
        Repo->>LDS: upsertMany(domainList, context)
        LDS->>DC: saveAll(items)
        DC->>Cold: 1. Cold.saveAll(items)
        Cold-->>DC: ✓
        DC--)Hot: 2. Hot.saveAll(items) [fire-and-forget]
        LDS-->>Repo: ✓
    else 다른 cloud (저장 스킵)
        Note over Repo: cross-cloud 오염 방지 → 캐시 저장 생략
    end

    Repo-->>Repo: return DomainListResult { source: 'remote' }
```

> **핵심**: `DynamicCacheStorage`는 네트워크를 전혀 모릅니다. Repository가 네트워크에서 가져온 데이터를 `LocalDataSource.upsertMany()`로 넘기면, LocalDataSource가 `CacheStorage.saveAll()`을 호출하고, 이 시점에 DynamicCacheStorage의 Cold→Hot 저장 흐름을 탑니다.

#### 실시간 이벤트 수신 시에도 같은 경로

WebSocket으로 `chat:create`/`chat:update` 이벤트가 들어올 때도 동일한 저장 경로를 사용합니다:

```typescript
// ChatRepository.initializeInternalListeners()
this.onDomainEvent('chat:create', detail => {
    this.runInBackground(
        () => this.chatLocalDataSource.upsert(detail.data, this.getRepositoryContext()),
        //    └─ CacheStorage.save() → Cold.save() → Hot.save() [background]
        'chat:create'
    );
});
```

#### 계층별 책임 정리

| 계층                    | 읽기 시 역할                         | 쓰기 시 역할                                                               | 네트워크 접근                |
| ----------------------- | ------------------------------------ | -------------------------------------------------------------------------- | ---------------------------- |
| **DynamicCacheStorage** | Hot→Cold fallback, null/[] 반환      | Cold 먼저 → Hot background                                                 | ❌ 없음                      |
| **LocalDataSource**     | CacheStorage 결과 → 도메인 모델 변환 | upsert/upsertMany → CacheStorage.save/saveAll 위임                         | ❌ 없음                      |
| **Repository**          | `isLocalValid` 검사, 캐시 정책 분기  | `fetchFromRemoteAndCache`에서 네트워크 fetch + LocalDataSource에 저장 위임 | ✅ 판단 + 위임               |
| **RemoteDataSource**    | —                                    | —                                                                          | ✅ 실제 I/O (WebSocket/HTTP) |

> `DynamicCacheStorage`는 "Hot/Cold 사이의 fallback"만 책임지고, "캐시 전체 miss → 네트워크"는 Repository가 결정합니다. 네트워크에서 가져온 데이터의 DB 저장은 Repository → LocalDataSource → CacheStorage(DynamicCacheStorage) 경로로 흘러갑니다. 이 분리 덕분에 캐시 전략을 변경해도 네트워크 로직에 영향이 없습니다.

---

## 4. Chat 동기화 흐름

### 4.1 전체 아키텍처

```mermaid
flowchart TD
    WS["WebSocket"] -->|"chat:create/feed"| DEB["DomainEventBus"]
    DEB --> CR["ChatRepository"]
    CR -->|"upsert"| LDS["ChatLocalDataSource"]
    LDS --> DC{"DynamicCacheStorage\nreadPolicy: hot-first\nloadAllPolicy: hot-first"}
    DC -->|"write: Cold 먼저"| COLD["Cold: NativeDB"]
    DC -->|"write: Hot 반영"| HOT["Hot: IndexedDB"]
    DC -->|"read: Hot 먼저"| HOT
    DC -.->|"Hot miss → fallback"| COLD
    UI["ChatRoomPage"] -->|"loadMore"| CR
    CR -->|"stream notify"| UI
```

### 4.2 실시간 메시지 수신

```mermaid
sequenceDiagram
    participant WS as WebSocket
    participant CR as ChatRepository
    participant DC as DynamicCacheStorage
    participant Cold as Cold (NativeDB)
    participant Hot as Hot (IndexedDB)
    participant UI as ChatRoomPage

    WS->>CR: chat:create (새 메시지)
    CR->>DC: save(id, chat)
    DC->>Cold: 1. Cold.save()
    Cold-->>DC: ✓
    DC--)Hot: 2. Hot.save() [background]
    DC-->>CR: return chat
    CR-->>UI: cache stream → re-render
```

### 4.3 채팅방 진입 — Hot 비어있음 (최초)

```mermaid
sequenceDiagram
    participant UI as ChatRoomPage
    participant CR as ChatRepository
    participant DC as DynamicCacheStorage
    participant Hot as Hot (IndexedDB)
    participant Cold as Cold (NativeDB)

    UI->>CR: fetchChat({ channelId, limit: 50 })
    CR->>DC: loadAll(options)
    Note over DC: loadAllPolicy = hot-first
    DC->>Hot: 1. Hot.loadAll(options)
    Hot-->>DC: [] (빈 배열 — miss)
    DC->>Cold: 2. Cold.loadAll(options)
    Cold-->>DC: [msg1..msg50]
    DC--)Hot: 3. Hot.saveAll() [warm-up background]
    DC-->>CR: return [msg1..msg50]
    CR-->>UI: 렌더링

    Note over UI: 다음 진입 시 → Hot hit, bridge 왕복 없음
```

### 4.4 채팅방 진입 — Hot에 데이터 있음 (재방문)

```mermaid
sequenceDiagram
    participant UI as ChatRoomPage
    participant CR as ChatRepository
    participant DC as DynamicCacheStorage
    participant Hot as Hot (IndexedDB)
    participant Cold as Cold (NativeDB)

    UI->>CR: fetchChat({ channelId, limit: 50 })
    CR->>DC: loadAll(options)
    Note over DC: loadAllPolicy = hot-first
    DC->>Hot: 1. Hot.loadAll(options)
    Hot-->>DC: [msg1..msg50] (hit ✓)
    Note over Cold: Cold 호출 없음 — bridge 왕복 절약
    DC-->>CR: return [msg1..msg50]
    CR-->>UI: 즉시 렌더링
```

### 4.5 Gap 동기화

```mermaid
sequenceDiagram
    participant GCS as GlobalChatSync
    participant CSS as ChatSyncScheduler
    participant CR as ChatRepository
    participant DC as DynamicCacheStorage
    participant Cold as Cold (NativeDB)
    participant Hot as Hot (IndexedDB)
    participant Server as Cloud Backend

    GCS->>CSS: enqueue({ channelId, serverChatNo: 500 })
    CSS->>DC: loadAll() → localMax = 300
    Note over CSS: gap = 500 - 300 = 200

    CSS->>CR: fetchChat(network-only, limit: 200)
    CR->>Server: WebSocket 요청
    Server-->>CR: [msg301..msg500]
    CR->>DC: saveAll([msg301..msg500])
    DC->>Cold: 1. Cold.saveAll()
    Cold-->>DC: ✓
    DC--)Hot: 2. Hot.saveAll() [warm-up background]
```

---

## 5. 에러 처리

| 시나리오                    | 동작                | 근거                   |
| --------------------------- | ------------------- | ---------------------- |
| Hot read/write/delete 에러  | reporter 기록, 삼킴 | Hot은 파생 캐시        |
| Cold read/write/delete 에러 | **상위 전파**       | Cold = Source of Truth |

### Stale 데이터

- 삭제 경로: Cold 성공 후 Hot 무효화를 await하여 race 최소화
- Hot 무효화 실패 시: stale 잔존 가능 → reporter 기록
- stale 민감 타입: `readPolicy: 'cold-first'`로 Hot 우회

---

## 6. `localFactory.ts` 변경

```typescript
export const isNativeApp = (): boolean => {
    return typeof window !== 'undefined' && !!(window as any).ReactNativeWebView;
};

const selectStrategy = (): CacheStorageStrategy =>
    isNativeApp() ? new HotColdCacheStorageStrategy(webBridge) : new IndexedDbOnlyCacheStorageStrategy();

export const getCacheStorage = <TType extends CacheType>(
    type: TType,
    contextProvider: DataContextProvider
): CacheStorage<TType> => selectStrategy().create(type, contextProvider);
```

---

## 7. 검증 전략

### 7.1 검증 대상과 범위

`DynamicCacheStorage`는 DB에 직접 접근하지 않고 두 개의 `CacheStorage` 어댑터를 조합하는 **순수 오케스트레이션 로직**입니다. 검증해야 할 것은 "Hot/Cold 간 호출 순서, fallback 분기, 에러 전파/삼킴이 명세대로 동작하는가"입니다.

#### 검증 수단 3가지

| 수단               | 대상                                         | 담당            | 실행 시점      |
| ------------------ | -------------------------------------------- | --------------- | -------------- |
| **1. 단위 테스트** | DynamicCacheStorage 오케스트레이션 로직      | 개발자          | PR 머지 전, CI |
| **2. 런타임 로깅** | 실제 앱에서 Hot/Cold fallback·에러 발생 빈도 | onHotError 콜백 | 배포 후 상시   |
| **3. 수동 QA**     | 앱 WebView에서 체감 성능·정합성              | QA              | 릴리즈 전      |

각 수단의 구체적인 내용을 아래에 서술합니다.

---

### 7.2 단위 테스트 (Jest)

#### 목적

Hot/Cold 호출 순서, fallback 분기, 에러 삼킴/전파, background save 발생 여부를 **자동화된 테스트로 확인**합니다. 이 프로젝트는 Jest 기반이며, 기존 어댑터 테스트(`IndexedDBAdapter.test.ts`, `NativeDBAdapter.test.ts`)와 동일한 패턴을 따릅니다.

#### 파일 위치

```
libs/data/src/data/local/storages/DynamicCacheStorage.test.ts
```

#### 테스트 인프라

**MockCacheStorage**: `jest.fn()`으로 `CacheStorage<TType>` 인터페이스의 각 메서드를 mock합니다. 실제 DB 없이 호출 여부·순서·인자를 검증합니다.

```typescript
const createMockStorage = () => ({
    save: jest.fn().mockImplementation((_id, item) => Promise.resolve(item)),
    saveAll: jest.fn().mockImplementation(items => Promise.resolve(items)),
    load: jest.fn().mockResolvedValue(null),
    loadAll: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue(undefined),
    deleteAll: jest.fn().mockResolvedValue(undefined),
    clearAll: jest.fn().mockResolvedValue(undefined),
    clearByChannelId: jest.fn().mockResolvedValue(undefined),
});
```

**onHotError spy**: Hot 에러 삼킴 검증용.

```typescript
const hotErrors: { error: unknown; operation: string }[] = [];
const onHotError = jest.fn((error, context) => hotErrors.push({ error, operation: context.operation }));
```

**flushMicrotasks**: fire-and-forget Promise가 settled 되기를 기다리는 유틸.

```typescript
const flushMicrotasks = () => new Promise(resolve => setTimeout(resolve, 0));
```

#### 시나리오 목록

아래 시나리오를 각각 하나의 `it()` 블록으로 작성합니다.

##### Read (R1–R8)

| ID  | 시나리오                            | 검증 포인트                                                          |
| --- | ----------------------------------- | -------------------------------------------------------------------- |
| R1  | `load()` Hot hit                    | 반환값 정확, Cold.load 미호출                                        |
| R2  | `load()` Hot miss → Cold hit        | 반환값 정확, background Hot.save 발생 (flushMicrotasks 후 확인)      |
| R3  | `load()` 양쪽 miss                  | null 반환, Hot·Cold 각 1회 호출                                      |
| R4  | `load()` Hot 에러 → Cold fallback   | 반환값 정확, onHotError 1회 호출 + operation='load', 상위 throw 없음 |
| R5  | `loadAll()` cold-first              | Cold만 조회, Hot.loadAll 미호출, background Hot.saveAll warm-up 발생 |
| R6  | `loadAll()` hot-first — Hot hit     | Hot 결과 반환, Cold.loadAll 미호출                                   |
| R7  | `loadAll()` hot-first — Hot 빈 배열 | Cold fallback 결과 반환, background Hot.saveAll warm-up 발생         |
| R8  | `loadAll()` hot-first — Hot 에러    | Cold fallback 결과 반환, onHotError 1회 호출 + operation='loadAll'   |

##### Write (W1–W3)

| ID  | 시나리오           | 검증 포인트                                                   |
| --- | ------------------ | ------------------------------------------------------------- |
| W1  | `save()` 정상      | Cold.save 호출 → 반환값 정확, background Hot.save 발생        |
| W2  | `save()` Cold 에러 | 에러 상위 전파, Hot.save 미호출                               |
| W3  | `save()` Hot 에러  | 반환값 정상 (Cold 성공), onHotError 1회 호출, 상위 throw 없음 |

##### Delete (D1–D4)

| ID  | 시나리오             | 검증 포인트                                            |
| --- | -------------------- | ------------------------------------------------------ |
| D1  | `delete()` 정상      | Cold.delete 1회 + Hot.delete 1회 (await best-effort)   |
| D2  | `delete()` Cold 에러 | 에러 상위 전파, Hot.delete 미호출                      |
| D3  | `delete()` Hot 에러  | 정상 resolve, onHotError 1회 호출 + operation='delete' |
| D4  | `clearAll()` 정상    | Cold.clearAll + Hot.clearAll 각 1회                    |

##### 통합 흐름 (I1–I5)

| ID  | 시나리오                        | 검증 포인트                                                    |
| --- | ------------------------------- | -------------------------------------------------------------- |
| I1  | save → load                     | save 후 Hot에 데이터 존재 → load 시 Cold 미조회 (Hot hit)      |
| I2  | save → delete → load            | 삭제 후 양쪽 모두 데이터 없음 → null 반환                      |
| I3  | saveAll → loadAll (hot-first)   | 연속 쓰기 후 Hot hit, Cold.loadAll 미호출                      |
| I4  | 최초 loadAll → warm-up → 재조회 | 1차: Cold fallback, 2차: Hot hit (Cold.loadAll 추가 호출 없음) |
| I5  | Hot 전면 장애                   | 모든 CRUD가 Cold만으로 정상 동작, onHotError 매 조작마다 호출  |

#### 테스트 코드 예시

아래는 핵심 시나리오의 테스트 코드 형태입니다. 전체 시나리오는 동일한 패턴으로 확장합니다.

```typescript
import { DynamicCacheStorage } from './DynamicCacheStorage';
import type { CacheStorage } from './types';

const flushMicrotasks = () => new Promise(resolve => setTimeout(resolve, 0));

const createMockStorage = (): jest.Mocked<CacheStorage<'chat'>> => ({
    save: jest.fn().mockImplementation((_id, item) => Promise.resolve(item)),
    saveAll: jest.fn().mockImplementation(items => Promise.resolve(items)),
    load: jest.fn().mockResolvedValue(null),
    loadAll: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue(undefined),
    deleteAll: jest.fn().mockResolvedValue(undefined),
    clearAll: jest.fn().mockResolvedValue(undefined),
    clearByChannelId: jest.fn().mockResolvedValue(undefined),
});

const item = (id: string) => ({ id, channelId: 'ch-1', text: `msg-${id}` }) as any;

describe('DynamicCacheStorage', () => {
    let mockHot: jest.Mocked<CacheStorage<'chat'>>;
    let mockCold: jest.Mocked<CacheStorage<'chat'>>;
    let onHotError: jest.Mock;

    beforeEach(() => {
        mockHot = createMockStorage();
        mockCold = createMockStorage();
        onHotError = jest.fn();
    });

    const createDCS = (overrides = {}) =>
        new DynamicCacheStorage(mockHot, mockCold, {
            type: 'chat',
            readPolicy: 'hot-first',
            loadAllPolicy: 'hot-first',
            onHotError,
            ...overrides,
        });

    // ── R1: load() Hot hit ──
    it('load — Hot hit이면 Cold를 조회하지 않는다', async () => {
        mockHot.load.mockResolvedValueOnce(item('1'));
        const dcs = createDCS();

        const result = await dcs.load('1');

        expect(result).toMatchObject(item('1'));
        expect(mockCold.load).not.toHaveBeenCalled();
    });

    // ── R2: load() Hot miss → Cold hit → background Hot.save ──
    it('load — Hot miss 시 Cold fallback 후 background로 Hot에 저장한다', async () => {
        mockHot.load.mockResolvedValueOnce(null);
        mockCold.load.mockResolvedValueOnce(item('1'));
        const dcs = createDCS();

        const result = await dcs.load('1');
        await flushMicrotasks();

        expect(result).toMatchObject(item('1'));
        expect(mockHot.save).toHaveBeenCalledWith('1', item('1'));
    });

    // ── R4: load() Hot 에러 → Cold fallback, onHotError 호출 ──
    it('load — Hot 에러 시 Cold fallback + onHotError 호출, 상위에 throw하지 않는다', async () => {
        mockHot.load.mockRejectedValueOnce(new Error('IDB crash'));
        mockCold.load.mockResolvedValueOnce(item('1'));
        const dcs = createDCS();

        const result = await dcs.load('1');

        expect(result).toMatchObject(item('1'));
        expect(onHotError).toHaveBeenCalledTimes(1);
        expect(onHotError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ operation: 'load' }));
    });

    // ── W2: save() Cold 에러 → 상위 전파, Hot 미호출 ──
    it('save — Cold 에러는 상위에 그대로 전파하고 Hot은 호출하지 않는다', async () => {
        mockCold.save.mockRejectedValueOnce(new Error('SQLite write fail'));
        const dcs = createDCS();

        await expect(dcs.save('1', item('1'))).rejects.toThrow('SQLite write fail');
        expect(mockHot.save).not.toHaveBeenCalled();
    });

    // ── D1: delete() 정상 — Cold 먼저, Hot await best-effort ──
    it('delete — Cold 삭제 후 Hot 삭제를 await한다', async () => {
        const dcs = createDCS();

        await dcs.delete('1');

        expect(mockCold.delete).toHaveBeenCalledWith('1');
        expect(mockHot.delete).toHaveBeenCalledWith('1');
    });

    // ── I4: 최초 loadAll → warm-up → 재진입 Hot hit ──
    it('loadAll — 최초 Cold fallback 후 warm-up, 재조회 시 Hot hit', async () => {
        // 1차: Hot 빈 배열, Cold에 데이터 있음
        mockHot.loadAll.mockResolvedValueOnce([]);
        mockCold.loadAll.mockResolvedValueOnce([item('1'), item('2')]);
        // warm-up 후 2차 Hot 조회 시 데이터 반환되도록 설정
        mockHot.loadAll.mockResolvedValueOnce([item('1'), item('2')]);
        const dcs = createDCS();

        const first = await dcs.loadAll();
        await flushMicrotasks();
        const second = await dcs.loadAll();

        expect(first).toHaveLength(2);
        expect(second).toHaveLength(2);
        // Cold.loadAll은 1차에서 1번만 호출됨
        expect(mockCold.loadAll).toHaveBeenCalledTimes(1);
    });

    // ── I5: Hot 전면 장애 — 모든 CRUD가 Cold만으로 동작 ──
    it('Hot 전면 장애 시 모든 CRUD가 Cold만으로 정상 동작한다', async () => {
        mockHot.save.mockRejectedValue(new Error('IDB dead'));
        mockHot.load.mockRejectedValue(new Error('IDB dead'));
        mockHot.loadAll.mockRejectedValue(new Error('IDB dead'));
        mockHot.delete.mockRejectedValue(new Error('IDB dead'));
        mockCold.load.mockResolvedValue(item('1'));
        mockCold.loadAll.mockResolvedValue([item('1')]);
        const dcs = createDCS();

        const saved = await dcs.save('1', item('1'));
        await flushMicrotasks();
        const loaded = await dcs.load('1');
        const list = await dcs.loadAll();
        await dcs.delete('1');

        expect(saved).toMatchObject(item('1'));
        expect(loaded).toMatchObject(item('1'));
        expect(list).toHaveLength(1);
        expect(onHotError).toHaveBeenCalled();
    });
});
```

#### 실행 방법

```bash
npx nx test data --testPathPattern='DynamicCacheStorage'
```

---

### 7.3 런타임 로깅 (배포 후 모니터링)

#### 목적

단위 테스트는 로직 정확성을 보장하지만, **실제 앱 환경에서 Hot이 얼마나 자주 실패하는지, fallback이 얼마나 발생하는지**는 런타임에서만 알 수 있습니다.

#### 수단

`HotColdCacheStorageStrategy`가 `DynamicCacheStorage` 생성 시 주입하는 `onHotError` 콜백이 이 역할을 합니다.

```typescript
// cacheStorageStrategies.ts — 현재 구현
onHotError: (error, context) => {
    console.warn('[DynamicCacheStorage] Hot error:', context.operation, error);
};
```

#### 확인 항목

| 항목                     | 정상 기대치                  | 이상 징후                                   |
| ------------------------ | ---------------------------- | ------------------------------------------- |
| Hot error 빈도           | 0 또는 극소                  | 반복 발생 → IndexedDB quota/corruption 의심 |
| error가 발생한 operation | —                            | 특정 operation에 집중 시 해당 경로 점검     |
| 앱 시작 직후 Hot miss율  | 첫 진입 시 100% (warm-up 전) | 재방문에도 계속 miss → warm-up 실패 의심    |

#### 향후 확장

`console.warn` → 서버 로그 수집(Sentry 등)으로 전환하면 배포 후 Hot 장애를 대시보드에서 모니터링할 수 있습니다. 현재 단계에서는 `console.warn`으로 개발 중 디버깅에 활용합니다.

---

### 7.4 수동 QA (앱 WebView)

#### 목적

단위 테스트와 로깅이 커버하지 못하는 **실제 체감 성능과 정합성**을 확인합니다. 특히 브릿지 통신 지연, WebView 메모리 제약 등 실환경 요인을 검증합니다.

#### 체크리스트

| #   | 시나리오                      | 조작                                     | 확인 항목                                            |
| --- | ----------------------------- | ---------------------------------------- | ---------------------------------------------------- |
| Q1  | 앱 최초 실행 (Hot 비어있음)   | 채팅방 진입                              | 채팅 목록 정상 렌더링 (Cold → Hot warm-up)           |
| Q2  | 앱 재실행 (Hot에 데이터 있음) | 같은 채팅방 재진입                       | 이전 대비 로딩 체감 개선 (Hot hit, 브릿지 왕복 없음) |
| Q3  | 채팅방에서 메시지 송수신      | 메시지 전송 후 앱 종료 → 재실행          | 보낸 메시지가 그대로 존재 (Cold에 저장됨)            |
| Q4  | Place 전환                    | Place A → Place B → Place A              | 각 Place의 채널/채팅이 정확히 표시 (scope isolation) |
| Q5  | Cloud 전환                    | Cloud 변경                               | 이전 Cloud의 데이터가 섞이지 않음                    |
| Q6  | 오프라인 → 온라인             | 비행기 모드 전환                         | 캐시된 데이터 즉시 표시, 온라인 복구 후 동기화       |
| Q7  | IndexedDB 수동 삭제           | DevTools에서 IndexedDB 삭제 후 앱 재실행 | Cold에서 복구되어 정상 동작 (Hot = 파생 캐시 원칙)   |

#### 성능 비교 측정

| 측정 항목                    | 방법                                               | before (NativeDB 단독) | after (Hot/Cold 2-Tier) |
| ---------------------------- | -------------------------------------------------- | ---------------------- | ----------------------- |
| 채팅방 진입 → 첫 메시지 렌더 | DevTools Performance 또는 `performance.now()` 로그 | (측정값 기입)          | (측정값 기입)           |
| 채널 목록 로드               | 같은 방법                                          | (측정값 기입)          | (측정값 기입)           |

> 성능 측정값은 QA 진행 시 기입합니다. 유의미한 개선이 없을 경우 `readPolicy`/`loadAllPolicy` 조정을 검토합니다.

---

### 7.5 검증 범위 밖 (이 명세에서 다루지 않는 것)

| 항목                                              | 이유                                                            |
| ------------------------------------------------- | --------------------------------------------------------------- |
| IndexedDBAdapter / NativeDBAdapter 단위 동작      | 각 어댑터의 자체 테스트 영역 (`db-adapter-refactoring.md` 소관) |
| 실제 IndexedDB / SQLite I/O 성능 벤치마크         | 별도 성능 테스트 계획 필요                                      |
| WebSocket → Repository → DynamicCacheStorage 연쇄 | end-to-end 통합 테스트 영역                                     |
| 브라우저 환경 (IndexedDbOnlyStrategy)             | DynamicCacheStorage 미사용, 기존 동작 그대로                    |

---

## 8. 파일 변경 목록

| 유형 | 파일                                                       | 내용                                  |
| ---- | ---------------------------------------------------------- | ------------------------------------- |
| 신규 | `libs/data/src/data/local/storages/DynamicCacheStorage.ts` | DynamicCacheStorage 구현              |
| 신규 | `apps/web/src/app/shared/data/cacheStorageStrategies.ts`   | Strategy 구현체                       |
| 수정 | `libs/data/src/data/local/storages/index.ts`               | export 추가                           |
| 수정 | `apps/web/src/app/shared/data/localFactory.ts`             | `isNativeApp()` 실제 감지 + 전략 선택 |

---

## 9. 향후 확장

- **Hot TTL 검증**: Hot 조회 시 TTL 만료 → Cold fallback
- **앱 시작 시 전체 warm-up**: Cold → Hot pre-load
- **Hot schema versioning**: 앱 버전 변경 시 Hot clear + re-warm
