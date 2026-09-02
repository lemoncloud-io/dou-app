# @chatic/data

`@chatic/data`는 remote data source · local data source · repository를 조립해 앱이 사용할 **headless data layer**를 제공한다.

핵심 원칙은 하나다.

- **읽기는 항상 local stream** — UI는 `observe*` 만 구독한다.
- **remote는 side-effect command** — write/refresh는 명시적 메서드 호출이다.
- **UI는 네트워크를 직접 호출하지 않는다.**

socket 연결의 생애주기(연결/재인증/sync 타이밍)는 이 라이브러리가 소유하지 않는다. 외부 sync orchestrator(`libs/app-runtime`)가 repository의 `refresh*` / `cacheWrite*`를 호출하면, repository가 그 결과를 local cache에 반영하고 stream으로 재방출한다.

> 상세 문서는 [`docs/`](./docs/README.md) 트리를 참조한다. 이 README는 전체 그림과 진입점만 다룬다.

---

## 1. 디렉토리 구조

핵심 로직은 `libs/data/src/data` 아래 레이어별로 분리되어 있다.

```text
libs/data/src/
├── data/
│   ├── domain/            # 도메인 모델 + 매퍼 (서버 view → local read-model)
│   ├── local/             # 로컬 인프라 (storages 어댑터, databases, data-sources-v2)
│   ├── remote/            # 원격 통신 (gateways, data-sources, sockets 최소 계약)
│   ├── repositories-v2/   # data facade (현행 repository)
│   ├── repositories/      # 공유 계약만 보관 (DataContext / DataContextProvider)
│   └── events/            # 도메인 이벤트 타입 + EventBus (V2 미사용, 아래 주의 참조)
└── index.ts               # Public API 진입점
```

> **V1은 제거됐다.** 도메인 repository / local data source는 모두 `repositories-v2` · `local/data-sources-v2`에 있다. `repositories/`는 이제 `DataContext` 계약만 re-export하고, `events/`의 EventBus는 V2 경로에서 쓰지 않는다.

---

## 2. 레이어 의존성

repository가 local·remote 인프라를 지휘한다. V2 계약에서 repository는 socket event를 직접 구독하지 않는다 — 외부 sync orchestrator가 repository 메서드를 호출한다.

```mermaid
flowchart TD
    classDef repository fill:#e6f7ff,stroke:#91d5ff,stroke-width:2px,color:#003a8c;
    classDef local fill:#f6ffed,stroke:#b7eb8f,stroke-width:2px,color:#135200;
    classDef remote fill:#fff7e6,stroke:#ffd591,stroke-width:2px,color:#873800;
    classDef domain fill:#f9f0ff,stroke:#d3adf7,stroke-width:2px,color:#22075e;
    classDef ext fill:#ffffff,stroke:#d9d9d9,stroke-width:2px,color:#595959,stroke-dasharray: 5 5;

    UI["UI Layer (React Hooks)"]:::ext
    Sync["Sync Orchestrator<br/>(libs/app-runtime)"]:::ext

    Repo["RepositoryV2<br/><i>data facade</i>"]:::repository
    Local["LocalDataSourceV2 + CacheStorage<br/><i>snapshot 저장 · stream 발행</i>"]:::local
    Remote["SocketDataSource + Gateways<br/><i>outbound gateway thin wrapper</i>"]:::remote
    Domain["Domain<br/><i>models · mappers</i>"]:::domain

    UI -->|"observe* (읽기 stream)"| Repo
    UI -->|"write command"| Repo
    Sync -.->|"refresh* / cacheWrite*"| Repo

    Repo -->|"local write/read + observe"| Local
    Repo -->|"outbound command"| Remote

    Repo & Local & Remote -->|"map entities"| Domain
```

---

## 3. 핵심 클래스 / 인터페이스

```mermaid
classDiagram
    class DataContextProvider {
        <<interface>>
        +getContext() DataContext
        +setContext(context) void
    }

    class BaseRepositoryV2 {
        <<abstract>>
        #getRequestContext() DataContext
        #getNormalizedContext(context) DataContext
        #assertRequiredString(value, field) string
        +dispose() void
    }

    class IChatRepositoryV2 {
        <<interface>>
        +observeList(query, cb) Unsubscribe
        +observeItem(id, cb) Unsubscribe
        +refreshList(query) Promise
        +sendChat(payload) Promise
        +cacheClearByChannelId(channelId) Promise
    }
    class ChatRepositoryV2

    BaseRepositoryV2 <|-- ChatRepositoryV2
    IChatRepositoryV2 <|.. ChatRepositoryV2
    DataContextProvider <.. BaseRepositoryV2

    class ILocalDataSourceV2 {
        <<interface>>
        +cacheRead(id, override) Promise
        +cacheReadList(query, override) Promise
        +observeItem(id, cb, override) Unsubscribe
        +observeList(query, cb, override) Unsubscribe
        +cacheWrite(item, override) Promise
        +cacheDelete(id, override) Promise
        +cacheClear(override) Promise
    }

    class BaseLocalDataSourceV2 {
        <<abstract>>
        #getScopeKey(override) string
        #createListObserverKey(parts, override) string
        #scheduleItemReemit(ids) void
        #scheduleListReemit(prefixes) void
        #scheduleFullReemit() void
    }
    class ChatLocalDataSourceV2

    BaseLocalDataSourceV2 <|-- ChatLocalDataSourceV2
    ILocalDataSourceV2 <|.. ChatLocalDataSourceV2

    class CacheStorage {
        <<interface>>
        +save(id, item) Promise
        +load(id) Promise
        +loadAll(options) Promise
        +delete(id) Promise
        +clearAll() Promise
        +clearByChannelId(channelId) Promise
    }
    class BaseDbAdapter {
        <<abstract>>
        #getScope() Scope
    }
    class IndexedDBAdapter
    class NativeDBAdapter

    CacheStorage <|.. BaseDbAdapter
    BaseDbAdapter <|-- IndexedDBAdapter
    BaseDbAdapter <|-- NativeDBAdapter
```

---

## 4. 데이터 흐름

### 4.1 읽기 (local-first stream)

```mermaid
sequenceDiagram
    autonumber
    actor UI as React Hook
    participant Repo as ChatRepositoryV2
    participant LDS as ChatLocalDataSourceV2
    participant DB as CacheStorage

    UI->>Repo: observeList(query, cb)
    Repo->>LDS: observeList(query, cb)
    LDS->>DB: scope 파티션 조회 (cid/sid/uid)
    DB-->>LDS: snapshot
    LDS-->>UI: 즉시 1회 발행 (구독 시작)
    Note over LDS,UI: 이후 local이 바뀌면 영향받은 observer만 재발행
```

### 4.2 쓰기 (optimistic command)

```mermaid
sequenceDiagram
    autonumber
    actor UI as React Hook
    participant Repo as ChatRepositoryV2
    participant LDS as ChatLocalDataSourceV2
    participant RDS as ChatSocketDataSource

    UI->>Repo: sendChat(payload)
    Note over Repo,LDS: optimistic pending message 생성
    Repo->>LDS: cacheWrite(pendingChat)
    LDS-->>UI: observe* stream 재발행 (Pending 표시)

    Repo->>RDS: send() (gateway 호출)
    RDS-->>Repo: 서버 확정 chat
    Repo->>LDS: cacheWrite(confirmed) / 실패 시 isFailed 마킹
    LDS-->>UI: stream 재발행 (Pending → Confirmed)
```

### 4.3 서버 변경분 반영 (sync orchestrator)

```mermaid
sequenceDiagram
    autonumber
    participant Sync as Sync Orchestrator (app-runtime)
    participant Repo as ChannelRepositoryV2
    participant LDS as ChannelLocalDataSourceV2
    participant UI as React Hook

    Sync->>Repo: syncChannels(since)
    Note over Repo: channel.sync 결과 해석
    Repo->>LDS: cacheWriteMany(list) / cacheDelete(stale ids)
    LDS-->>UI: 구독 중인 observe* stream 재발행
```

> 서버→클라이언트 push 신호(`domain.sync` 등) 자체는 repository가 구독하지 않는다. orchestrator가 신호를 해석해 위 `refresh*` / `sync*` 경로로 변환한다.

---

## 5. 핵심 메커니즘

### 5.1 DataContext & dynamic scoping

repository 인스턴스는 한 번 생성되면 유지된다. cloud(`cid`)·계정(`uid`)·place(`sid`)가 바뀌어도 재생성하지 않는다.

- `DataContextProvider`(`DataContextHolder`)를 통해 repository는 매 호출마다 **최신 context**를 읽는다.
- repository는 remote 응답 적재 전 `getRequestContext()`로 요청 시점 scope를 **캡처**한다. cloud 전환 중 늦게 온 응답이 현재 scope를 오염시키지 않도록 격리한다.
- local 캐시 저장은 scope 파티션을 타며, observer는 `cid`/`sid`/`uid` 튜플 해시로 격리된다.

### 5.2 stream 재발행 (BaseLocalDataSourceV2)

UI는 항상 `observe*`만 본다. mutation 후 전체 재발행이 아니라 영향 범위만 다시 계산한다 — item id별(`scheduleItemReemit`), list prefix별(`scheduleListReemit`), 전체(`scheduleFullReemit`). 재발행은 50ms로 debounce된다.

### 5.3 events / EventBus (V2 미사용)

`events/`의 `DomainEventMap` · `EventBusEngine`은 제거된 V1 `BaseRepository`가 쓰던 경로다. **V2는 EventBus 기반 자동 반영을 쓰지 않는다.** V2의 local 반영은 repository의 명시적 메서드(`cacheWrite*` / `cacheDelete*`) 호출로만 이뤄진다.

---

## 6. Public API

진입점은 [`src/index.ts`](./src/index.ts)다. domain · local(data-sources-v2 / storages / databases) · remote(gateways / sockets / data-sources) · repositories(계약) · repositories-v2를 re-export한다.

---

## 7. 더 읽기

| 문서                                                | 내용                                                   |
| --------------------------------------------------- | ------------------------------------------------------ |
| [docs/README.md](./docs/README.md)                  | 전체 개요 · 데이터 흐름 · domain·events                |
| [docs/remote/](./docs/remote/README.md)             | gateway 매핑 · DataSource 호출 · 요청 제한             |
| [docs/repositories/](./docs/repositories/README.md) | V2 facade 계약 · 도메인별 메서드 · sync 해석           |
| [docs/local/](./docs/local/README.md)               | stream 모델 · scope · storages/databases · chat cursor |
