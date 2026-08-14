# 로컬 캐시 DB 및 어댑터 아키텍처 리팩토링 상세 명세서 (통합본)

본 문서는 `@libs/data` 내의 로컬 캐시 저장소 아키텍처를 고도화하여 타입 안정성을 확보하고, 쿼리 로직을 분리하는 확장성 높은 구조로 재설계한 구현 계획 및 실제 반영 내역을 통합하여 기술합니다.

---

## 1. 아키텍처 핵심 설계 원칙

1. **타입 안전성 극대화 및 `any` 타입 완벽 제거**
    - `@chatic/app-messages`의 캐시 관련 타입을 활용하여 도메인 타입(`CacheType`)에 알맞은 모델 및 쿼리 옵션이 컴파일 타임에 완벽히 추론되도록 `CacheModelOf<TType>` 및 `CacheQueryOf<TType>` 제네릭 구조를 신설했습니다.
2. **클래스 기반 설계 및 다형성 보장**
    - 기존의 절차적 팩터리 함수 조합 대신 `BaseDbAdapter<TType>` 추상 클래스를 상속하는 `IndexedDBAdapter`와 `NativeDBAdapter` 제네릭 클래스로 개편하여 어댑터 계층의 일관성과 대칭성을 확보했습니다.
3. **전략 패턴(Strategy Pattern) 기반 채팅 쿼리 실행기 격리**
    - IndexedDB 어댑터 내부에 엉켜 있던 채팅 도메인의 커서 기반 페이징(`cursorNo`, `limit`) 및 역순 조회 로직을 `ChatQueryExecutor`로 온전히 분리·격리했습니다.
    - 이를 통해 어댑터 본체는 순수 CRUD 역할만 수행하며, 복잡한 비즈니스 쿼리는 실행기 인터페이스(`IndexedDbQueryExecutor`) 구현체를 통해 외부에서 유연하게 위임 및 주입(Dependency Injection)받도록 설계했습니다.
4. **저수준 데이터베이스 엔진 물리 격리**
    - 로컬 DB 커넥션 및 물리 테이블 세팅 로직을 `@libs/data/src/data/local/databases` 패키지로 물리 격리하여 비즈니스 코드와 결합도를 낮췄습니다.
5. **동적 환경(Web vs. Native) 분기 및 조립 격리**
    - 소비자가 로컬 DB 생성 과정을 몰라도 되도록 설계하고, 모든 환경 분기 및 스토리지 인스턴스 조립 책임을 팩토리 한 곳으로 이관 및 단일화했습니다. (이후 그 팩토리는 `libs/app-runtime/src/data/factories/localFactory.ts`로 옮겨졌고, 환경 분기 자체는 `cacheStorageRouting.ts`의 `resolveCacheBackend`가 소유합니다 — [cache-storage-routing.md](../../../libs/app-runtime/docs/data/cache-storage-routing.md).)

---

## 2. 계층 간 협력 및 의존성 주입 구조 (Mermaid)

### 2.1 런타임 의존성 주입 & 인스턴스 조립 흐름

애플리케이션 시작 시 모바일 웹뷰 환경 여부(`window.ReactNativeWebView`)를 감지하여 알맞은 어댑터 인스턴스를 동적으로 생성하고 주입하는 런타임 흐름입니다.

```mermaid
flowchart TD
    classDef webLayer fill:#1e293b,stroke:#3b82f6,stroke-width:2px,color:#f8fafc;
    classDef coreLayer fill:#0f172a,stroke:#10b981,stroke-width:2px,color:#f8fafc;
    classDef extLayer fill:#180f2a,stroke:#8b5cf6,stroke-width:2px,color:#f8fafc;
    classDef dataStore fill:#2d1a15,stroke:#f97316,stroke-width:2px,color:#f8fafc;

    subgraph UI_App_Layer ["1. Application Layer (libs/app-runtime)"]
        A["DataManager"] -->|"1. 호스팅 & 실행"| B["createLocalDataSources"]
        B -->|"2. 조립 요청"| C["localFactory.ts (getCacheStorage)"]
        C -->|"3. 저장소 결정 (resolveCacheBackend)"| D{native / web?}
    end

    subgraph Logic_Adapter_Layer ["2. Storage Core & Adapters (libs/data)"]
        D -->|Yes (App WebView)| E["NativeDBAdapter"]
        D -->|No (Web Browser)| F["IndexedDBAdapter"]

        C -.->|4. Chat 도메인일 시 DI 주입| G["ChatQueryExecutor"]
        F -->|전략 위임 (Strategy)| G
    end

    subgraph Data_Store_Layer ["3. Database Engine & Native Bridge"]
        H[("IndexedDB Database\n(sharedDatabase 싱글톤)")]
        I["webBridge\n(window.ReactNativeWebView)"]

        F -->|"5. 저수준 쿼리 수행 (IIndexedDB)"| H
        E -->|"5. SQLite 쿼리 브릿지 통신"| I
    end

    class A,B,C,D webLayer;
    class E,F,G coreLayer;
    class H,I dataStore;
```

### 2.2 클래스 및 인터페이스 구조도

인터페이스와 추상 클래스를 기반으로 하는 구조적 일관성과 다형성 구조입니다.

```mermaid
classDiagram
    class CacheStorage~TType~ {
        <<interface>>
        +save(id: string, item: CacheModelOf) Promise~CacheModelOf~
        +saveAll(items: CacheModelOf[]) Promise~CacheModelOf[]~
        +load(id: string) Promise~CacheModelOf|null~
        +loadAll(options?: CacheQueryOf) Promise~CacheModelOf[]~
        +delete(id: string) Promise~void~
        +deleteAll(ids: string[]) Promise~void~
        +clearAll() Promise~void~
    }

    class BaseDbAdapter~TType~ {
        <<abstract>>
        #type: TType
        #contextProvider: DataContextProvider
        #getScope() { cid, uid }
    }

    class IndexedDBAdapter~TType~ {
        -db: IIndexedDB
        -executor: IndexedDbQueryExecutor~TType~
        +save()
        +saveAll()
        +load()
        +loadAll()
    }

    class NativeDBAdapter~TType~ {
        -bridge: IWebBridgeClient
        +save()
        +saveAll()
        +load()
        +loadAll()
    }

    class IIndexedDB {
        <<interface>>
        +save(item: IndexedDbRow) Promise~void~
        +saveAll(items: IndexedDbRow[]) Promise~void~
        +load(key: string) Promise~IndexedDbRow|undefined~
        +loadAll(indexName, key) Promise~IndexedDbRow[]~
        +loadWithCursor(options) Promise~IndexedDbRow[]~
    }

    class IndexedDbQueryExecutor~TType~ {
        <<interface>>
        +execute(db: IIndexedDB, scope, options?: CacheQueryOf) Promise~IndexedDbRow[]~
    }

    class ChatQueryExecutor {
        +execute(db, scope, options) Promise~IndexedDbRow[]~
    }

    class IndexedDBDatabase {
        -dbPromise: Promise~IDBDatabase~
        +openDB()
    }

    CacheStorage~TType~ <|.. BaseDbAdapter~TType~ : Implements
    BaseDbAdapter~TType~ <|-- IndexedDBAdapter~TType~ : Inherits
    BaseDbAdapter~TType~ <|-- NativeDBAdapter~TType~ : Inherits

    IndexedDBAdapter~TType~ --> IIndexedDB : Uses (Dependency Injection)
    IIndexedDB <|.. IndexedDBDatabase : Implements

    IndexedDBAdapter~TType~ --> IndexedDbQueryExecutor~TType~ : Delegates (Strategy Pattern)
    IndexedDbQueryExecutor~TType~ <|.. ChatQueryExecutor : Implements (Specific to 'chat')
```

---

## 3. 핵심 변경 상세 내역 (파일별 역할)

### 1) Core Cache Types & Base Class

- **[cache.ts](../../../libs/app-messages/src/types/model/cache.ts)**
    - `CacheModelOf<TType>` 및 `CacheQueryOf<TType>` 제네릭 매핑 타입을 선언하여 도메인별 추론 안정성을 확보했습니다.
- **[types.ts](../../../libs/data/src/data/local/storages/types.ts)**
    - 공통 기반이 되는 추상 클래스 `BaseDbAdapter<TType>`를 선언하여 `getScope()` 정규화 규칙을 통합했습니다.
    - 도메인 단위로 일치된 `CacheStorage<TType>` 인터페이스 및 `CacheSchema<TType>` 저장 구조 형식을 재정의했습니다.

### 2) Database Engine & Strategies

- **[IndexedDbQueryExecutor.ts & ChatQueryExecutor.ts](../../../libs/data/src/data/local/databases)**
    - IndexedDB 조회 전략 규격인 `IndexedDbQueryExecutor<TType>` 인터페이스를 정의하고, 채팅 최적화 페이징을 처리하는 `ChatQueryExecutor`를 구현하여 도메인 쿼리를 완전히 분리했습니다.
- **[IndexedDBDatabase.ts & types.ts](../../../libs/data/src/data/local/databases)**
    - 저수준 IndexedDB 드라이버 커넥션 및 물리 CRUD(`save`, `loadWithCursor` 등) 처리를 수행하는 엔진 계층 모듈입니다. 제네릭 타이핑을 적용하여 `any`를 완전히 걷어냈습니다.

### 3) Storage Adapters

- **[IndexedDBAdapter.ts](../../../libs/data/src/data/local/storages/IndexedDBAdapter.ts)**
    - `IndexedDBAdapter<TType>` 제네릭 클래스로 고도화하고, 생성자에서 저수준 `db` 엔진 및 복잡한 페이징을 대리해 줄 `executor`를 외부에서 주입(DI)받도록 개선했습니다.
    - 레거시 팩터리 함수 `createIndexedDBAdapter`를 지우고 direct class instantiation 구조로 완전히 이전했습니다.
- **[NativeDBAdapter.ts](../../../libs/data/src/data/local/storages/NativeDBAdapter.ts)**
    - `NativeDBAdapter<TType>` 클래스로 리팩토링하고, TypeScript `Extract<UnionPayload, { type: TType }>` 구조를 적용하여 Native WebView Bridge 데이터 송수신의 안전성을 확보했습니다.

---

## 4. 검증 및 테스트 (Verification & Test Strategy)

- **Pure Class Unit Testing**:
    - `createIndexedDBAdapter`와 같은 임시 팩터리 래퍼들이 코드 베이스에서 안전하게 제거되었으므로, 단위 테스트 파일들(`indexedDBAdapter.test.ts` 등)은 실제 `IndexedDBDatabase` 및 `IndexedDBAdapter` 클래스를 생성자 인자 조합을 통해 직접 조립하여 테스트를 수행합니다.
- **클린업 처리 검증**:
    - 요구사항 명세에 따라 더 이상 사용하지 않는 만료 데이터 GC 필터링 테스트와 `replaceAll` 관련 테스트 케이스들은 어댑터의 순수성을 보장하기 위해 완전히 정화 및 제거되었습니다.
