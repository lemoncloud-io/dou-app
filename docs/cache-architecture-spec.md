# Frontend Cache Architecture Spec

> **담당**: @aiden
> **작성일**: 2025-05-26
> **목적**: 프론트엔드 캐시 시스템 전체 구조 및 인터페이스 인수인계

---

## 1. 개요

앱의 데이터 레이어는 **Hot + Cold 2-tier 캐시** 구조를 사용합니다.
목표는 **앱이 빠르게 작동**하는 것이며, 서버(DDB) 응답을 기다리지 않고 로컬 캐시에서 즉시 UI를 렌더링합니다.

```
서버 (DDB + Redis)
        |
    WebSocket / REST
        |
   RemoteDataSource ──── domainEventBus ──── Repository
        |                                        |
        |                              ┌─────────┴─────────┐
        |                              │   LocalDataSource  │
        |                              └─────────┬─────────┘
        |                              ┌─────────┴─────────┐
        |                              │ DynamicCacheStorage │
        |                              │  (Orchestrator)     │
        |                              ├──────────┬─────────┤
        |                              │  Hot     │  Cold   │
        |                              │ IndexedDB│ NativeDB│
        |                              └──────────┴─────────┘
```

| 계층                | 역할                                | 용량             | 속도                   |
| ------------------- | ----------------------------------- | ---------------- | ---------------------- |
| **Hot (IndexedDB)** | 브라우저 저장소. 빠른 읽기. 휘발성  | 제한적 (수십 MB) | 빠름                   |
| **Cold (NativeDB)** | 네이티브 앱 SQLite (WebBridge 경유) | 큼 (수백 MB)     | 느림 (브릿지 오버헤드) |

---

## 2. 핵심 파일 맵

```
libs/data/src/data/
├── events/
│   ├── eventBus.ts              # EventBusEngine (pub/sub)
│   ├── socket.ts                # SocketEventMap (WebSocket 원시 이벤트)
│   ├── domain.ts                # DomainEventMap (도메인 이벤트)
│   └── common.ts                # ListResult, Synced 등 공통 타입
│
├── remote/
│   ├── clients.ts               # IWebSocketClient 인터페이스
│   ├── data-sources/            # 도메인별 RemoteDataSource
│   └── sockets/
│       ├── handlers/            # WebSocket 메시지 핸들러 (chat, user, channel...)
│       └── SocketRequestManager.ts  # ref 기반 요청-응답 매칭
│
├── local/
│   ├── storages/
│   │   ├── IndexedDBAdapter.ts      # Hot 캐시 어댑터
│   │   ├── NativeDBAdapter.ts       # Cold 캐시 어댑터 (WebBridge)
│   │   ├── DynamicCacheStorage.ts   # Hot+Cold 오케스트레이터
│   │   └── dynamicCacheTypes.ts     # EvictionStrategy, CapacityPolicy 인터페이스
│   ├── databases/
│   │   ├── IndexedDBDatabase.ts     # IndexedDB 초기화/트랜잭션
│   │   └── types.ts                 # IndexedDbRow, CacheSchema
│   ├── data-sources/            # 도메인별 LocalDataSource
│   └── queries/                 # 쿼리 실행기 (ChatQueryExecutor 등)
│
├── repositories/                # 도메인별 Repository (Remote + Local 통합)
│   └── types.ts                 # BaseRepository, CachePolicy, 인터페이스
│
├── domain/                      # 도메인 모델 변환 (toDomainChat, toDomainUser...)
└── sync/                        # SyncScheduler, SyncPlan (백그라운드 동기화)

apps/web/src/app/shared/data/
├── DataProvider.tsx             # React Context 조립 (EventBus → DataSource → Repository)
├── cacheStorageStrategies.ts    # Hot/Cold 전략 선택 (브라우저/앱/테스트)
└── hooks/                       # useRepositories() 등
```

---

## 3. 캐시 타입 & 데이터 모델

### 3-1. 등록된 캐시 타입

```typescript
type CacheType = 'channel' | 'chat' | 'user' | 'join' | 'site' | 'invitecloud';
```

### 3-2. 타입별 캐시 모델

> 정의 위치: `libs/app-messages/src/types/model/cache.ts`

| CacheType     | 캐시 모델          | 주요 필드                                                   | 비고                   |
| ------------- | ------------------ | ----------------------------------------------------------- | ---------------------- |
| `channel`     | `CacheChannelView` | id, name, sid, isNotificationEnabled                        | 채팅방 목록            |
| `chat`        | `CacheChatView`    | id, channelId, chatNo, content, tempId, isPending, isFailed | 채팅 메시지            |
| `user`        | `CacheUserView`    | id, name, nick, profileImage                                | 사용자 프로필          |
| `join`        | `CacheJoinView`    | id, channelId, userId, readNo                               | 채팅방 참여/읽음       |
| `site`        | `CacheSiteView`    | id, name                                                    | 워크스페이스(플레이스) |
| `invitecloud` | `CacheCloudView`   | id, name, backend, wss                                      | 초대된 클라우드 정보   |

### 3-3. 캐시 키 구조

```
형식: "{type}:{cid}:{uid}:{id}"
예시: "chat:cloud-123:user-456:msg-789"
```

- `type`: 캐시 타입 (위 6개 중 하나)
- `cid`: Cloud ID (데이터 파티셔닝 기준)
- `uid`: User ID (사용자별 격리)
- `id`: 엔티티 고유 ID

### 3-4. IndexedDB 인덱스

| 인덱스                  | 구성                                    | 용도               |
| ----------------------- | --------------------------------------- | ------------------ |
| `TYPE_CID_UID_INDEX`    | `[type, cid, uid]`                      | 타입별 범위 조회   |
| `CHAT_PAGINATION_INDEX` | `[type, cid, uid, channel_id, chat_no]` | 채팅 cursor 페이징 |

---

## 4. Read/Write 정책

### 4-1. Read 정책 (타입별)

> 정의 위치: `apps/web/src/app/shared/data/cacheStorageStrategies.ts`

| CacheType     | load (단건)    | loadAll (목록) | 이유                        |
| ------------- | -------------- | -------------- | --------------------------- |
| `chat`        | hot-first      | hot-first      | 빈번한 읽기, 빠른 응답 우선 |
| `channel`     | hot-first      | hot-first      | 채널 목록 빠른 렌더         |
| `user`        | hot-first      | hot-first      | 프로필 빠른 표시            |
| `site`        | hot-first      | hot-first      | 워크스페이스 목록           |
| `invitecloud` | hot-first      | hot-first      | 초대 클라우드 정보          |
| **`join`**    | **cold-first** | **cold-first** | readNo 일관성 중요          |

**hot-first 흐름:**

```
1. Hot(IndexedDB) 조회
2. Hit → 즉시 반환
3. Miss → Cold(NativeDB) 조회 → 반환 + Hot에 fire-and-forget 동기화
```

**cold-first 흐름:**

```
1. Cold(NativeDB) 직접 조회 → 반환
2. (join은 readNo 갱신이 빈번하여 Hot이 stale할 가능성 높음)
```

### 4-2. Write 정책

모든 타입 공통으로 **Cold-first**:

```
1. Cold(NativeDB) 저장 (await — source of truth)
2. Hot(IndexedDB) 동기화 (fire-and-forget)
3. Eviction hook 실행 (Hot 용량 관리)
```

### 4-3. Repository Cache 정책

> 정의 위치: `libs/data/src/data/repositories/types.ts`

```typescript
type RepositoryCachePolicy =
    | 'cache-first' // 로컬 Hit → 즉시 반환 + 백그라운드 서버 갱신
    | 'network-only' // 캐시 무시, 서버 직접 요청
    | 'cache-only' // 서버 요청 없이 로컬만
    | 'cache-and-network'; // cache-first와 동일 (alias)
```

**기본 동작 (cache-first):**

```
1. LocalDataSource.fetchList() 시도
2. 로컬에 유효한 데이터 있음 → 즉시 반환
3. 백그라운드에서 서버 요청 → 응답으로 로컬 캐시 갱신
4. Stream 구독자에게 갱신된 데이터 자동 전달
```

---

## 5. 페이징: cursor + limit

### 5-1. 채팅 페이징 (cursor 기반)

> 정의 위치: `libs/data/src/data/local/queries/ChatQueryExecutor.ts`

```typescript
interface ChatQueryOptions {
    channelId?: string;
    sort?: 'asc' | 'desc';
    limit?: number; // 기본 20
    cursorNo?: number; // 마지막으로 받은 chatNo (cursor 위치)
}
```

**동작 원리:**

```
초기 로드 (cursorNo = undefined):
  → IDBKeyRange: [chat, cid, uid, channelId, 0] ~ [chat, cid, uid, channelId, Infinity)
  → direction: 'prev' (최신순)
  → limit: 20
  → 결과: 최신 20개 메시지

다음 페이지 (cursorNo = 450):
  → IDBKeyRange: [chat, cid, uid, channelId, 0] ~ [chat, cid, uid, channelId, 450) [exclusive]
  → direction: 'prev'
  → limit: 20
  → 결과: chatNo 450 이전의 20개 메시지
```

### 5-2. Stampede Guard

동일한 페이징 쿼리가 동시에 N번 호출되는 것을 방지:

```typescript
// DynamicCacheStorage.ts
const STAMPEDE_TIMEOUT_MS = 5000;

// 동일 queryKey → 같은 Promise 공유
// 5초 초과 시 StampedeTimeoutError → 강제 reject
```

### 5-3. 서버 응답 페이징 형태

```typescript
interface ListResult<T> {
    list: T[];
    total?: number;
    limit?: number;
    page?: number;
}
```

---

## 6. 핵심 인터페이스

### 6-1. CacheStorage (저장소 어댑터)

> 정의 위치: `libs/data/src/data/local/storages/`

```typescript
interface CacheStorage<TType extends CacheType> {
    save(item: CacheModelOf<TType>): Promise<void>;
    saveAll(items: CacheModelOf<TType>[]): Promise<void>;
    load(id: string): Promise<CacheModelOf<TType> | null>;
    loadAll(options?: QueryOptions): Promise<CacheModelOf<TType>[]>;
    delete(id: string): Promise<void>;
    deleteAll(ids: string[]): Promise<void>;
    clearAll(): Promise<void>;
}
```

구현체:

- `IndexedDBAdapter<TType>` — Hot
- `NativeDBAdapter<TType>` — Cold

### 6-2. DynamicCacheStorage (오케스트레이터)

```typescript
// Hot + Cold를 조합하여 사용
class DynamicCacheStorage<TType extends CacheType> {
    constructor(options: {
        type: TType;
        hot: CacheStorage<TType>;
        cold: CacheStorage<TType>;
        policyResolver: PolicyResolver; // Read 정책 결정
        evictionStrategy: EvictionStrategy; // Hot 용량 관리
        capacityPolicy: CapacityPolicy; // 타입별 제한
        reporter?: ErrorReporter;
    });
}
```

### 6-3. EvictionStrategy (캐시 퇴거)

```typescript
interface EvictionStrategy {
    /** 앱 시작 시 TTL 만료 항목 정리 */
    onStartup(hot: CacheStorage<any>): Promise<void>;

    /** Hot 저장 후 용량 초과 체크 */
    onAfterWrite<T extends CacheType>(type: T, items: CacheModelOf<T>[], hot: CacheStorage<T>): Promise<void>;

    /** IndexedDB QuotaExceededError 발생 시 긴급 정리 */
    onQuotaExceeded(type: CacheType, hot: CacheStorage<any>): Promise<void>;
}
```

### 6-4. CapacityPolicy (용량 제한)

```typescript
interface CapacityPolicy {
    /** 타입별 최대 항목 수. null = 무제한 */
    getLimit(type: CacheType, groupKey?: string): number | null;

    /** 그룹 키 매핑 (예: chat은 channelId별로 그룹) */
    getGroupKey<T extends CacheType>(type: T, item: CacheModelOf<T>): string | undefined;
}
```

### 6-5. LocalDataSource (CRUD + Stream)

```typescript
// CRUD
interface ICrudLocalDataSource<TModel> {
    getById(id: string, ctx?): Promise<TModel | null>;
    upsert(item: Partial<TModel>, ctx?): Promise<void>;
    upsertMany(items: Array<Partial<TModel>>, ctx?): Promise<void>;
    remove(id: string, ctx?): Promise<void>;
    removeMany(ids: string[], ctx?): Promise<void>;
    clearAll(ctx?): Promise<void>;
}

// 목록 조회
interface IListLocalDataSource<TModel, TQuery, TResult> {
    fetchList(query: TQuery, ctx?): Promise<TResult | null>;
}

// 실시간 구독 (UI 바인딩)
interface IStreamLocalDataSource<TModel, TListQuery, TListResult> {
    subscribeItem(id: string, callback: (item: TModel | null) => void, ctx?): () => void;
    subscribeList(query: TListQuery, callback: (result: TListResult | null) => void, ctx?): () => void;
}
```

### 6-6. ILocalCacheMutationRepository

```typescript
interface ILocalCacheMutationRepository<TModel> {
    cacheCreate(item: Partial<TModel>): Promise<void>;
    cacheUpdate(id: string, patch: Partial<TModel>): Promise<void>;
    cacheDelete(id: string): Promise<void>;
    cacheBulkCreate(items: Array<Partial<TModel>>): Promise<void>;
    cacheBulkUpdate(items: Array<LocalCacheBulkPatch<TModel>>): Promise<void>;
}
```

---

## 7. 데이터 동기화

### 7-1. 이벤트 기반 동기화

```
WebSocket 수신
    → SocketHandler (userHandler, chatHandler...)
    → socketEventBus.emit('chat:create', SocketEventDetail)
    → RemoteDataSource 리스너
    → domainEventBus.emit('chat:create', DomainPayload)
    → Repository 내부 리스너
    → LocalDataSource.upsert() → 캐시 갱신
    → debouncedEmitAllStreams() → UI 자동 갱신 (200ms debounce)
```

### 7-2. 요청-응답 매칭 (SocketRequestManager)

```typescript
// BaseRepository.requestRemote() 패턴
const result = await requestRemote<ChatView>(
    ref => remoteDataSource.sendChat(payload, ref), // ref 부여하여 전송
    options
);
// → SocketRequestManager가 ref 일치하는 도메인 이벤트를 Promise로 resolve
```

### 7-3. Optimistic Update (낙관적 갱신)

채팅 전송 시:

```
1. 임시 ID로 로컬 캐시에 즉시 저장 (isPending: true)
2. UI 즉시 반영
3. 서버 응답 수신 → 실제 ID로 교체 (isPending: false)
4. 실패 시 → isFailed: true 표시 (재시도 UI 제공)
```

### 7-4. SyncScheduler (백그라운드 동기화)

```typescript
enum SyncPriority {
    LOW = 0, // 백그라운드 작업
    MEDIUM = 1, // 주기적 동기화
    HIGH = 2, // UI 차단 작업
    CRITICAL = 3, // 사용자 액션 (메시지 전송 등)
}

interface SyncPlan {
    id?: string;
    priority?: SyncPriority;
    intervalMs?: number; // 주기적 실행 간격
    shouldSync?: () => boolean; // 네트워크/배터리 체크
    maxRetries?: number;
    retryDelayMs?: number;
}
```

---

## 8. 데이터 컨텍스트 & 스코핑

모든 캐시 연산은 `{cid, uid}` 기준으로 파티셔닝됩니다.

```typescript
interface DataContext {
    cid?: string; // Cloud ID (현재 접속 중인 클라우드)
    sid?: string; // Site/Place ID (현재 선택한 플레이스)
    uid?: string; // User ID (현재 로그인 사용자)
}
```

- 컨텍스트는 **절대 캐시하지 않음** — 항상 `contextProvider.getContext()` 호출
- 이유: 클라우드 전환 시 cid가 바뀌는데, 캐시된 cid로 잘못된 파티션에 접근하는 것을 방지

---

## 9. 스토리지 전략 분기

> 정의 위치: `apps/web/src/app/shared/data/cacheStorageStrategies.ts`

| 환경                    | 전략                                | Hot       | Cold              |
| ----------------------- | ----------------------------------- | --------- | ----------------- |
| **모바일 앱 (WebView)** | `HotColdCacheStorageStrategy`       | IndexedDB | NativeDB (SQLite) |
| **브라우저**            | `IndexedDbOnlyCacheStorageStrategy` | IndexedDB | (없음)            |
| **테스트/폴백**         | `NativeDbOnlyCacheStorageStrategy`  | (없음)    | NativeDB          |

---

## 10. TTL & 메타데이터

```typescript
interface CacheTtlMeta {
    lastSyncedAt: number; // 마지막 서버 동기화 시각
    expiresAt: number; // 만료 시각
}

// 모든 캐시 모델에 선택적 메타데이터 포함
interface CacheViewBase {
    __cacheMeta?: CacheTtlMeta;
}
```

- TTL 만료 항목은 `EvictionStrategy.onStartup()`에서 정리
- 현재 기본 구현은 no-op (DefaultEvictionStrategy)

---

## 11. 현재 상태 & 개선 포인트

### 구현 완료

- [x] Hot/Cold 2-tier 오케스트레이션 (`DynamicCacheStorage`)
- [x] IndexedDB 어댑터 (cursor 페이징 포함)
- [x] NativeDB 어댑터 (WebBridge 경유)
- [x] 이벤트 기반 실시간 동기화
- [x] Stampede guard
- [x] Optimistic update (chat)
- [x] Stream 구독 (subscribeItem/subscribeList)
- [x] cache-first 정책 + 백그라운드 갱신

### 인터페이스 정의됨, 구현 필요

- [ ] `EvictionStrategy` — 현재 DefaultEvictionStrategy (no-op)
    - TTL 기반 만료 정리
    - 타입별 최대 항목 수 제한
    - QuotaExceededError 시 긴급 정리 로직
- [ ] `CapacityPolicy` — 현재 DefaultCapacityPolicy (무제한)
    - 타입별/그룹별 용량 제한 정의 필요
    - chat: channelId별 최대 N건
    - user: 전체 최대 N건

### 개선 필요

- [ ] TTL 정책 구체화 (타입별 만료 시간)
- [ ] Hot 캐시 용량 모니터링 (IndexedDB 사용량 추적)
- [ ] Cold → Hot 워밍업 전략 (앱 시작 시 자주 쓰는 데이터 프리로드)
- [ ] 캐시 무효화 전략 고도화 (서버 push 기반 invalidation)
- [ ] Mock 환경 구성 (테스트 AI 연동용 in-memory CacheStorage 구현체)

---

## 12. Mock 환경 구성 가이드

테스트/AI 자동화를 위한 mock CacheStorage 구현 방향:

```typescript
// CacheStorage 인터페이스만 구현하면 DynamicCacheStorage에 주입 가능
class InMemoryCacheStorage<TType extends CacheType> implements CacheStorage<TType> {
    private store = new Map<string, CacheModelOf<TType>>();

    async save(item) {
        this.store.set(item.id, item);
    }
    async load(id) {
        return this.store.get(id) ?? null;
    }
    async loadAll(options?) {
        return [...this.store.values()];
    }
    async delete(id) {
        this.store.delete(id);
    }
    async clearAll() {
        this.store.clear();
    }
    // ...
}

// 테스트에서 사용:
const mockStorage = new DynamicCacheStorage({
    type: 'chat',
    hot: new InMemoryCacheStorage(),
    cold: new InMemoryCacheStorage(),
    policyResolver: new DefaultPolicyResolver(),
    evictionStrategy: new DefaultEvictionStrategy(),
    capacityPolicy: new DefaultCapacityPolicy(),
});
```

---

## 13. 참고: DataProvider 조립 순서

> `apps/web/src/app/shared/data/DataProvider.tsx`

```
1. EventBus 생성 (socketEventBus, domainEventBus)
2. SocketRequestManager 생성 (domainEventBus 구독)
3. DataContextHolder 생성 (cid/uid/sid 동적 관리)
4. RemoteDataSource 팩토리 (WebSocket 기반)
5. LocalDataSource 팩토리 (CacheStorage 전략 선택)
6. Repository 팩토리 (Remote + Local + RequestManager 조합)
7. React Context로 하위 컴포넌트에 제공
```
