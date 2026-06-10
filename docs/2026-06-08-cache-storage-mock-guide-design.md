# Cache Storage Layer - Quick Reference

> **작성일**: 2026-06-08
> **범위**: CacheStorage 인터페이스 중심의 캐시 관리 레이어
> **관련 문서**:
>
> - `docs/cache-architecture-spec.md` - 전체 캐시 아키텍처 개요
> - `docs/specs/cache/hot-cold-cache-strategy.md` - Hot/Cold 2-Tier 전략 상세 명세

---

## 1. 개요

dou-app의 **캐시 저장소(CacheStorage) 레이어** 아키텍처와 인터페이스를 빠르게 파악하기 위한 레퍼런스 문서입니다. mock 환경 구성에 필요한 인터페이스 계약과 주입 지점도 함께 정리합니다.

**다루는 범위**:

- CacheStorage 인터페이스와 구현체들
- DynamicCacheStorage (Hot/Cold 오케스트레이터)
- 정책 인터페이스 (PolicyResolver, EvictionStrategy, CapacityPolicy)
- 도메인 타입(6종) 모델/쿼리 매핑
- DataContextProvider (스코프 주입)
- Mock 가능 지점

**다루지 않는 범위**:

- LocalDataSource, Repository, EventBus, WebSocket 레이어
- React hooks, UI 바인딩
- 원격 데이터 동기화 플로우

---

## 2. 캐시 저장소 아키텍처 개요

### 2.1 Hot/Cold 2-Tier 구조

```
┌─────────────────────────────────────────┐
│         CacheStorage<TType>             │  ← 상위 계층이 의존하는 유일한 인터페이스
│         (공통 계약)                      │
└────────────────┬────────────────────────┘
                 │
    ┌────────────┼────────────────────┐
    │            │                    │
    ▼            ▼                    ▼
┌────────┐  ┌──────────────────┐  ┌─────────┐
│IndexedDB│  │DynamicCacheStorage│  │NativeDB │
│Adapter  │  │ (Hot/Cold 조합)   │  │Adapter  │
│(단독)   │  │                  │  │(단독)    │
└────────┘  └───────┬──────────┘  └─────────┘
                    │
            ┌───────┴───────┐
            │               │
            ▼               ▼
       ┌────────┐     ┌─────────┐
       │  Hot   │     │  Cold   │
       │IndexedDB│    │NativeDB │
       │Adapter │     │Adapter  │
       └────────┘     └─────────┘
```

### 2.2 환경별 전략 선택

| 환경                | 전략 클래스                         | 구성                             |
| ------------------- | ----------------------------------- | -------------------------------- |
| **웹 브라우저**     | `IndexedDbOnlyCacheStorageStrategy` | IndexedDBAdapter 단독            |
| **앱 WebView**      | `HotColdCacheStorageStrategy`       | DynamicCacheStorage (Hot + Cold) |
| **Fallback/테스트** | `NativeDbOnlyCacheStorageStrategy`  | NativeDBAdapter 단독             |

### 2.3 읽기/쓰기 흐름

**쓰기 (Write)** - 모든 타입 공통:

```
save(id, item)
  1. Cold.save(id, item)  → await (Source of Truth)
  2. Hot.save(id, item)   → fire-and-forget (비치명적)
  3. eviction hook chain  → background
```

**읽기 (Read)** - PolicyResolver에 의해 결정:

| 정책           | load(id)                                         | loadAll(options)                                    |
| -------------- | ------------------------------------------------ | --------------------------------------------------- |
| **hot-first**  | Hot 조회 → miss시 Cold fallback → Hot에 backfill | Hot 조회 → 빈 배열시 Cold fallback → Hot에 backfill |
| **cold-first** | Cold 직접 조회                                   | Cold 조회 → Hot에 backfill                          |

**특수 케이스**: `loadAll()`에서 `options.cursorNo != null`이면 PolicyResolver 무시하고 **강제 cold-first** (페이지네이션 일관성 보장)

**삭제 (Delete)**:

```
delete(id)
  1. Cold.delete(id)  → await
  2. Hot.delete(id)   → best-effort await (실패시 에러 리포트만)
```

---

## 3. 핵심 인터페이스 명세

### 3.1 CacheStorage<TType>

모든 저장소 구현체가 만족해야 하는 공통 인터페이스입니다.

**파일**: `libs/data/src/data/local/storages/types.ts`

```typescript
interface CacheStorage<TType extends CacheType> {
    save(id: string, item: CacheModelOf<TType>): Promise<CacheModelOf<TType>>;
    saveAll(items: CacheModelOf<TType>[]): Promise<CacheModelOf<TType>[]>;
    load(id: string): Promise<CacheModelOf<TType> | null>;
    loadAll(options?: CacheQueryOf<TType>): Promise<CacheModelOf<TType>[]>;
    delete(id: string): Promise<void>;
    deleteAll(ids: string[]): Promise<void>;
    clearAll(): Promise<void>;
    clearByChannelId(channelId: string): Promise<void>;
}
```

**계약**:

- `save`: 단일 아이템 저장. 저장된 아이템을 반환
- `saveAll`: 배치 저장. 저장된 아이템 배열 반환
- `load`: ID로 단일 조회. 없으면 `null`
- `loadAll`: 쿼리 옵션으로 목록 조회. 없으면 빈 배열 `[]`
- `delete` / `deleteAll`: 단일/배치 삭제
- `clearAll`: 해당 타입의 전체 데이터 삭제 (현재 스코프 범위)
- `clearByChannelId`: 특정 채널에 속한 데이터만 삭제

### 3.2 DynamicCacheStorage<TType>

Hot/Cold 두 개의 CacheStorage를 조합하는 오케스트레이터입니다. 자체도 `CacheStorage<TType>`을 구현하므로 상위 계층에서 투명하게 사용됩니다.

**파일**: `libs/data/src/data/local/storages/DynamicCacheStorage.ts`

```typescript
class DynamicCacheStorage<TType extends CacheType> implements CacheStorage<TType> {
    constructor(
        hot: CacheStorage<TType>, // 빠른 읽기용 (IndexedDB)
        cold: CacheStorage<TType>, // Source of Truth (NativeDB/SQLite)
        options?: DynamicCacheStorageOptions<TType>
    );
}
```

**내부 메커니즘**:

| 기능                | 설명                                                                           |
| ------------------- | ------------------------------------------------------------------------------ |
| **Read routing**    | PolicyResolver 결과에 따라 hot-first 또는 cold-first 라우팅                    |
| **Write-through**   | Cold await → Hot fire-and-forget                                               |
| **Stampede guard**  | 동일 `loadAll` 쿼리의 중복 동시 요청을 in-flight Promise로 합침 (timeout: 5초) |
| **Error isolation** | Hot 실패는 비치명적 처리, CacheErrorReporter로 보고만                          |
| **Eviction hook**   | Hot 쓰기 후 EvictionStrategy.onAfterWrite() 체인 호출                          |

### 3.3 DynamicCacheStorageOptions<TType>

DynamicCacheStorage 생성 시 주입하는 옵션입니다.

**파일**: `libs/data/src/data/local/storages/dynamicCacheTypes.ts`

```typescript
interface DynamicCacheStorageOptions<TType extends CacheType> {
    type?: TType; // 도메인 타입 (에러 리포트에 포함)
    readPolicy?: CacheReadPolicy; // load() 기본 정책 ('hot-first' | 'cold-first')
    loadAllPolicy?: CacheReadPolicy; // loadAll() 기본 정책
    policyResolver?: PolicyResolver; // 타입별 정책 결정 (주입시 readPolicy/loadAllPolicy 무시)
    evictionStrategy?: EvictionStrategy; // Hot 용량 관리 3-hook (미주입 = no-op)
    capacityPolicy?: CapacityPolicy; // 타입별 용량 제한 (미주입 = 무한)
    reporter?: CacheErrorReporter; // 에러 리포터 (미주입 = console.warn)
    warmupChunkSize?: number; // warm-up chunk 크기 (향후 확장용)
}
```

### 3.4 BaseDbAdapter<TType>

IndexedDBAdapter와 NativeDBAdapter의 공통 기반 추상 클래스입니다.

**파일**: `libs/data/src/data/local/storages/types.ts`

```typescript
abstract class BaseDbAdapter<TType extends CacheType> implements CacheStorage<TType> {
    constructor(
        protected readonly type: TType,
        protected readonly contextProvider: DataContextProvider
    )

    // 도메인 타입 정책에 따른 스코프(cid, uid) 결정
    protected getScope(): { cid: string; uid: string }
}
```

`getScope()`는 내부적으로 `resolveScopedContext()`를 호출하여 타입별 스코프를 결정합니다:

- **invitecloud**: 항상 `{ cid: 'global', uid: 'global' }` (cloud/사용자 구분 없음)
- **나머지 5종**: `contextProvider.getContext()`에서 `cid`, `uid` 사용 (없으면 `'default'`)

---

## 4. 정책 인터페이스

### 4.1 PolicyResolver

타입별 읽기 정책을 결정합니다.

**파일**: `libs/data/src/data/local/storages/dynamicCacheTypes.ts`

```typescript
type CacheReadPolicy = 'hot-first' | 'cold-first';

interface PolicyResolver {
    resolveReadPolicy(type: CacheType): CacheReadPolicy;
    resolveLoadAllPolicy(type: CacheType): CacheReadPolicy;
}
```

**앱 환경의 실제 정책** (`AppPolicyResolver` in `cacheStorageStrategies.ts`):

| CacheType   | load()         | loadAll()      | 이유                          |
| ----------- | -------------- | -------------- | ----------------------------- |
| channel     | hot-first      | hot-first      | 빠른 채널 목록 렌더           |
| chat        | hot-first      | hot-first      | 빈번한 읽기, 성능 우선        |
| user        | hot-first      | hot-first      | 빠른 프로필 표시              |
| site        | hot-first      | hot-first      | 워크스페이스 목록             |
| invitecloud | hot-first      | hot-first      | 초대 정보                     |
| **join**    | **cold-first** | **cold-first** | readNo 변경 빈번, 정합성 우선 |

**기본값** (`DefaultPolicyResolver`): 모든 타입 `cold-first` (dev/test 환경 fallback)

### 4.2 EvictionStrategy

Hot(IndexedDB) 용량 보호를 위한 3-hook 인터페이스입니다.

```typescript
interface EvictionStrategy {
    // DCS 생성 직후 1회 호출 (startup TTL sweep 등)
    onStartup(hot: CacheStorage<any>): Promise<void>;

    // Hot.save 완료 후 호출 (per-type cap 검사)
    onAfterWrite<T extends CacheType>(type: T, items: CacheModelOf<T>[], hot: CacheStorage<T>): Promise<void>;

    // Hot 에러가 QuotaExceededError일 때 호출 (비상 cleanup)
    onQuotaExceeded(type: CacheType, hot: CacheStorage<any>): Promise<void>;
}
```

**기본값** (`DefaultEvictionStrategy`): 3-hook 모두 no-op

### 4.3 CapacityPolicy

EvictionStrategy 내부에서 사용하는 타입별 용량 제한 인터페이스입니다.

```typescript
interface CapacityPolicy {
    // 해당 type의 최대 항목 수. null이면 cap 없음
    getLimit(type: CacheType, groupKey?: string): number | null;

    // item을 그룹 키로 매핑. undefined면 전체 LRU
    getGroupKey<T extends CacheType>(type: T, item: CacheModelOf<T>): string | undefined;
}
```

**기본값** (`DefaultCapacityPolicy`): `getLimit()` = `null` (무한), `getGroupKey()` = `undefined`

### 4.4 CacheErrorReporter

Hot/Cold/Eviction/Stampede 4-tier 에러를 단일 인터페이스로 통합합니다.

```typescript
type CacheErrorTier = 'hot' | 'cold' | 'eviction' | 'stampede';

type CacheErrorOperation =
    | 'load'
    | 'loadAll'
    | 'save'
    | 'saveAll'
    | 'delete'
    | 'deleteAll'
    | 'clearAll'
    | 'clearByChannelId'
    | 'eviction'
    | 'stampede-timeout';

interface CacheErrorContext {
    tier: CacheErrorTier;
    operation: CacheErrorOperation;
    type?: CacheType;
}

type CacheErrorReporter = (error: unknown, context: CacheErrorContext) => void;
```

**에러 처리 원칙**:

| Tier     | 처리                       | 설명                              |
| -------- | -------------------------- | --------------------------------- |
| hot      | 리포트만, 비치명적         | Hot 실패해도 Cold에서 복구 가능   |
| cold     | 리포트 + 전파              | Source of Truth 실패는 치명적     |
| eviction | 리포트만, save는 성공      | 용량 관리 실패가 쓰기를 막지 않음 |
| stampede | StampedeTimeoutError throw | 5초 초과시 timeout 에러           |

---

## 5. 도메인 타입 레퍼런스

### 5.1 CacheType (6종)

**파일**: `libs/app-messages/src/types/model/cache.ts`

```typescript
type CacheType = 'channel' | 'chat' | 'user' | 'join' | 'site' | 'invitecloud';
```

### 5.2 모델 매핑 (CacheModelMap)

| CacheType   | 모델 타입          | 주요 필드                                                   |
| ----------- | ------------------ | ----------------------------------------------------------- |
| channel     | `CacheChannelView` | `cid`, `sid`, `isNotificationEnabled` + ChannelView 필드    |
| chat        | `CacheChatView`    | `cid`, `tempId?`, `isPending?`, `isFailed?` + ChatView 필드 |
| user        | `CacheUserView`    | `cid` + UserView 필드                                       |
| join        | `CacheJoinView`    | `cid` + JoinView 필드                                       |
| site        | `CacheSiteView`    | `cid`, `order?` + MySiteView 필드                           |
| invitecloud | `CacheCloudView`   | `id`, `name?`, `backend?`, `wss?`, `cid` + CloudView 필드   |

모든 모델은 `CacheViewBase`를 확장하며 선택적 `__cacheMeta` 필드를 포함합니다:

```typescript
type CacheTtlMeta = {
    lastSyncedAt: number;
    expiresAt: number;
};

type CacheViewBase = {
    __cacheMeta?: CacheTtlMeta;
};
```

### 5.3 쿼리 매핑 (CacheQueryMap)

| CacheType   | 쿼리 타입                 | 주요 필터                                                |
| ----------- | ------------------------- | -------------------------------------------------------- |
| channel     | `ChannelQueryOptions`     | `sid?`, `keyword?`                                       |
| chat        | `ChatQueryOptions`        | `channelId?`, `sort?`, `keyword?`, `limit?`, `cursorNo?` |
| user        | `UserQueryOptions`        | (base만: `cid?`, `uid?`)                                 |
| join        | `JoinQueryOptions`        | `channelId?`, `userId?`                                  |
| site        | `SiteQueryOptions`        | `keyword?`                                               |
| invitecloud | `InviteCloudQueryOptions` | (base만: `cid?`, `uid?`)                                 |

### 5.4 TTL 정책

**파일**: `libs/data/src/data/local/storages/utils.ts`

| CacheType   | TTL               |
| ----------- | ----------------- |
| channel     | 30분              |
| chat        | 만료 없음 (100년) |
| invitecloud | 만료 없음 (100년) |
| join        | 30분              |
| site        | 30분              |
| user        | 30분              |

---

## 6. DataContextProvider

캐시 데이터의 스코프(어떤 cloud, 어떤 사용자의 데이터인지)를 결정하는 주입 인터페이스입니다.

**파일**: `libs/data/src/data/repositories/types.ts`

```typescript
interface DataContext {
    cid?: string; // 현재 연결된 Cloud ID
    sid?: string; // 현재 선택된 Place ID
    uid?: string; // 현재 사용자 ID
}

interface DataContextProvider {
    getContext(): DataContext;
    setContext(context: DataContext): void;
}

class DataContextHolder implements DataContextProvider {
    constructor(private context: DataContext) {}
    getContext(): DataContext {
        return this.context;
    }
    setContext(context: DataContext): void {
        this.context = context;
    }
}
```

**스코프 결정 로직** (`resolveScopedContext()`):

- `invitecloud` 타입: `{ cid: 'global', uid: 'global' }` 고정
- 나머지 타입: `contextProvider.getContext()`의 `cid`, `uid` 사용 (fallback: `'default'`)

---

## 7. Mock 대상 요약

캐시 읽기/쓰기 동작을 검증할 때 mock해야 하는 지점입니다.

### 7.1 CacheStorage (Hot / Cold)

DynamicCacheStorage의 생성자에 주입되는 `hot`과 `cold` 파라미터가 mock 대상입니다.

**mock 계약**: `CacheStorage<TType>` 인터페이스의 8개 메서드를 구현

```
CacheStorage mock 필요 메서드:
  save(id, item) → Promise<item>
  saveAll(items) → Promise<items>
  load(id) → Promise<item | null>
  loadAll(options?) → Promise<items[]>
  delete(id) → Promise<void>
  deleteAll(ids) → Promise<void>
  clearAll() → Promise<void>
  clearByChannelId(channelId) → Promise<void>
```

기존 테스트에서 사용하는 mock 팩토리 패턴 참고:

```typescript
// libs/data/src/data/local/storages/DynamicCacheStorage.test.ts 에서 발췌
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
```

### 7.2 DataContextProvider

```typescript
const mockContextProvider: DataContextProvider = {
    getContext: () => ({ cid: 'test-cloud', uid: 'test-user', sid: 'test-place' }),
    setContext: () => {},
};
```

### 7.3 정책 객체

| 인터페이스         | mock 방법                                                 | 기본 구현 (fallback)                     |
| ------------------ | --------------------------------------------------------- | ---------------------------------------- |
| PolicyResolver     | `resolveReadPolicy()`, `resolveLoadAllPolicy()` 구현      | `DefaultPolicyResolver` (all cold-first) |
| EvictionStrategy   | `onStartup()`, `onAfterWrite()`, `onQuotaExceeded()` 구현 | `DefaultEvictionStrategy` (all no-op)    |
| CapacityPolicy     | `getLimit()`, `getGroupKey()` 구현                        | `DefaultCapacityPolicy` (unlimited)      |
| CacheErrorReporter | `(error, context) => void` 함수                           | `console.warn`                           |

### 7.4 mock 조합 예시

```
DynamicCacheStorage 테스트 시:
  1. Hot mock (CacheStorage)  ← in-memory Map 기반
  2. Cold mock (CacheStorage) ← in-memory Map 기반
  3. DataContextProvider mock ← 고정 cid/uid/sid
  4. PolicyResolver           ← DefaultPolicyResolver 또는 커스텀
  5. EvictionStrategy          ← DefaultEvictionStrategy (no-op)
  6. CacheErrorReporter        ← jest.fn() 또는 console.log
```

---

## 8. 기존 테스트 코드 참조

캐시 저장소 레이어의 기존 테스트 파일들입니다. mock 패턴과 검증 방법의 참고 자료입니다.

| 파일                                                            | 대상                | 주요 검증 내용                                            |
| --------------------------------------------------------------- | ------------------- | --------------------------------------------------------- |
| `libs/data/src/data/local/storages/DynamicCacheStorage.test.ts` | DynamicCacheStorage | Hot/Cold 라우팅, stampede guard, 에러 격리, eviction hook |
| `libs/data/src/data/local/storages/IndexedDBAdapter.test.ts`    | IndexedDBAdapter    | IndexedDB CRUD, 스코프 키 생성, TTL 메타                  |
| `libs/data/src/data/local/storages/NativeDBAdapter.test.ts`     | NativeDBAdapter     | WebBridge CRUD, 스코프 결정                               |
| `libs/data/src/data/local/storages/CacheStorage.test.ts`        | createCacheStorages | 6종 타입별 팩토리 생성 검증                               |

---

## 9. Stampede Guard 상세

동일한 `loadAll` 쿼리가 동시에 여러 번 호출될 때 중복 DB 조회를 방지하는 메커니즘입니다.

**파일**: `libs/data/src/data/local/storages/DynamicCacheStorage.ts` (lines 157-187)

```
queryKey = "{type}:loadAll:{stableHash(options)}"

1. 동일 queryKey의 in-flight Promise가 있으면 → 재사용
2. 없으면 → 새 Promise 생성, inFlight Map에 등록
3. Promise settled 후 → inFlight에서 제거
4. 5초 초과시 → StampedeTimeoutError throw + inFlight에서 제거
```

**stableHash**: 객체의 키를 정렬 후 JSON 직렬화하여 순서 무관 동치성을 보장합니다.

**파일**: `libs/data/src/data/local/storages/stableHash.ts`

---

## 10. CacheStorageStrategy 인터페이스

환경별 저장소 조합을 캡슐화하는 전략 패턴입니다.

**파일**: `apps/web/src/app/shared/data/cacheStorageStrategies.ts`

```typescript
interface CacheStorageStrategy {
    create<TType extends CacheType>(type: TType, contextProvider: DataContextProvider): CacheStorage<TType>;
}
```

| 구현체                              | 환경            | 생성하는 저장소                                     |
| ----------------------------------- | --------------- | --------------------------------------------------- |
| `IndexedDbOnlyCacheStorageStrategy` | 웹 브라우저     | `IndexedDBAdapter` 단독                             |
| `NativeDbOnlyCacheStorageStrategy`  | Fallback/테스트 | `NativeDBAdapter` 단독                              |
| `HotColdCacheStorageStrategy`       | 앱 WebView      | `DynamicCacheStorage(Hot=IndexedDB, Cold=NativeDB)` |

mock 환경을 구성할 때, **새 CacheStorageStrategy 구현체를 만들어 in-memory mock 저장소를 반환**하는 방식으로 전체 캐시 레이어를 교체할 수 있습니다.
