# Cache

Cache 문서는 모바일 앱의 local persistence 구조를 설명한다. 기존 `docs/specs/cache/*` 문서는 제거 대상이 아니며 상세/레거시 참고 문서로 유지한다.

## 저장소 구분

| 저장소        | 위치                      | 용도                                                   |
| ------------- | ------------------------- | ------------------------------------------------------ |
| SQLite        | `src/app/database/sqlite` | structured records, cache tables, upload task state    |
| MMKV          | `src/app/database/mmkv`   | small key-value state, preferences, lightweight queues |
| Data source   | `src/app/data/cache`      | table/domain-specific SQL access                       |
| Cache service | `src/app/services/cache`  | WebView-facing CRUD/search API                         |

## 구조

```mermaid
flowchart TD
    Web["Web App"] --> Handler["Cache WebView Handler"]
    Handler --> CacheService["CacheCrudService / CacheSearchService"]
    CacheService --> DataSource["data/cache/*DataSource"]
    DataSource --> SQLite["SqliteDatabase"]
    OtherService["Other Services"] --> MMKV["MmkvStorage"]
    OtherService --> SQLite
```

## Data Source

| 파일                       | 도메인                  |
| -------------------------- | ----------------------- |
| `ChatDataSource.ts`        | chat records            |
| `ChannelDataSource.ts`     | channel records         |
| `JoinDataSource.ts`        | channel-user membership |
| `SiteDataSource.ts`        | site/place records      |
| `UserDataSource.ts`        | user profile records    |
| `ProfileDataSource.ts`     | site display profiles   |
| `MetaDataSource.ts`        | sync cursors (meta)     |
| `InviteCloudDataSource.ts` | invite cloud records    |
| `TestRecordDataSource.ts`  | debug/test records      |

## Cache CRUD 시나리오

```mermaid
sequenceDiagram
    participant Web as Web App
    participant Handler as useCrudCacheHandler
    participant Service as CacheCrudService
    participant DS as Domain DataSource
    participant DB as SQLite

    Web->>Handler: FetchCache / SaveCache
    Handler->>Service: execute operation
    Service->>DS: domain-specific read/write
    DS->>DB: SQL query
    DB-->>DS: rows/result
    DS-->>Service: mapped domain data
    Service-->>Handler: result
    Handler-->>Web: bridge response
```

## 소유권 규칙

- SQL schema/table 이름은 `database/sqlite`가 소유한다.
- domain row mapping은 `data/cache`가 소유한다.
- WebView contract는 `services/cache`와 handler가 소유한다.
- upload recovery state는 upload repository가 소유한다. 일반 cache service에 섞지 않는다.
- MMKV는 작은 값과 queue에 사용하고 structured list/query storage로 확장하지 않는다.

## 변경 체크리스트

- schema, data source, service가 같은 domain naming을 쓰는가?
- cid/uid scope가 필요한 데이터에서 누락되지 않았는가?
- WebView cache handler가 SQL detail을 알지 않도록 유지되는가?
- `docs/specs/cache/*`와 충돌하는 정책 변경이면 해당 spec도 함께 갱신할 것인가?
