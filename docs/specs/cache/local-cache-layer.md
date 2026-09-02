# Repository Local Cache Integration Specification

> 상태: **부분 유효** (최종 확인 2026-08-12) — V1 리포지토리 시절 작성된 명세다.
>
> - **여전히 유효**: §3.1 캐시 파티셔닝 규칙(`(cid, uid, 고유ID)` 유니크 키, 읽기는 활성 `cid`에
>   갇힘, 행의 `uid`는 소유자이지 주인이 아님). 이 리포에서 이 규칙을 서술하는 유일한 문서다.
> - **더 이상 사실이 아님**: `DomainEventBus` 기반 캐시 갱신(§2.1–2.2)과 `RepositoryOptions`(§3.2).
>   V2(`BaseRepositoryV2`)는 이벤트 버스를 쓰지 않고 `refresh*`/`cacheWrite*` 명시적 호출로만
>   로컬에 반영한다([libs/data/docs/README.md](../../../libs/data/docs/README.md)).
> - 저장소 선택(어느 물리 DB로 가는가)은 이 문서 범위 밖이다 →
>   [cache-storage-routing.md](../../../libs/app-runtime/docs/data/cache-storage-routing.md).

## 1. 목적 (Purpose)

Repository 계층에 `LocalDataSource`를 주입하여, 원격 서버 응답 및 도메인 이벤트(Domain Event)를 기반으로 로컬 캐시를 갱신하고 관리합니다. UI 계층과 데이터 소스 간의 결합도를 낮추기 위해 `DataProvider`를 통한 의존성 주입(DI) 패턴을 도입하며, 사용자 및 클라우드 환경(`cid`, `sid`, `uid`)에 따른 데이터 파티셔닝을 완벽하게 지원하는 것을 목표로 합니다.

## 2. 계층별 책임 및 데이터 흐름 (Architecture & Data Flow)

### 2.1 계층별 책임

- **Repository (중재자)**: Local/Remote 간의 캐싱 정책을 결정하며, 순수 도메인 모델(Domain Model)만 UI 계층에 반환합니다.
- **SocketDataSource**: 소켓/HTTP 요청 송신 및 원격 응답을 도메인 이벤트로 변환합니다.
- **LocalDataSource**: 캐시 읽기/쓰기(CRUD)를 수행하며, 서버 스펙과 동일한 조건(페이징, 정렬)으로 데이터를 가공합니다. React Hooks가 아닌 순수 TypeScript로 구현됩니다.
- **Storage (CacheStorage)**: 실제 로컬 DB(MMKV, SQLite 등)와 연동되는 드라이버로, Context 스코프 기반의 저장소를 운용합니다.
- **DomainEventBus**: Repository 내부에서 원격 응답의 부수 효과(Side-effect)로 캐시를 갱신하기 위한 이벤트 파이프라인입니다.

### 2.2 표준 데이터 흐름 (Read)

1. UI가 Repository의 Read API 호출 (파라미터로 `RepositoryOptions` 전달)
2. **Local Hit**: `LocalDataSource`에서 스코프 기반 캐시 조회 후 즉시 반환 (옵션에 따라 동작)
3. **Remote Fetch**: 캐시가 없거나 갱신이 필요하면 `SocketDataSource`로 데이터 요청
4. **Event Receive**: 원격 응답이 `DomainEventBus`를 통해 Repository로 전달
5. **Cache Upsert**: Repository가 이벤트를 내부적으로 수신(listen)하여 `LocalDataSource`에 갱신
6. 갱신된 최신 데이터 반환

## 3. 핵심 제약 및 동작 정책 (Constraints & Policies)

### 3.1 Context 기반 파티셔닝 (Scope)

- **Context 속성**: `cid`(cloudId), `sid`(placeId), `uid`(userId). (`sid`는 Web 환경의 `cloudCore`에서 주입)
- **유니크 키 (Unique Key)**: 모든 캐싱 데이터는 단일 ID가 아닌 **`(cid, uid, 고유ID)`**의 조합으로 식별 및 격리되어야 합니다.
- **읽기는 활성 컨텍스트에 갇힙니다**: Repository/LocalDataSource의 조회는 호출 시점의 활성 `cid` 파티션만 봅니다. 다른 클라우드의 행을 읽어야 하는 경우(전역 검색과 그 결과 행의 컨텍스트)는 이 계층이 아니라 **읽기 전용 별도 경로**를 씁니다 → [[global-cache-search]](./global-cache-search.md). `cacheRead`/`cacheReadList`의 컨텍스트 오버라이드는 cid 오버라이드가 아니므로 이 용도로 쓸 수 없습니다.
- **행의 `uid`는 캐시 소유자입니다**: 행 주인이 아닙니다. 예를 들어 채널의 다른 멤버 join 행도 내 `uid` 파티션에 저장되므로(읽음 확인용), 내 것만 골라야 할 때는 `join.userId`로 한 번 더 걸러야 합니다.

### 3.2 캐싱 운용 옵션 (`RepositoryOptions`) — **미구현**

당시 계획했던 정책 옵션이며, 구현되지 않았다. `RepositoryOptions` 타입도 `cache-first` /
`network-only` / `cache-only` 문자열도 현재 코드에 없다. V2는 대신 용도별 메서드로 나뉜다 —
`cacheRead*`(로컬만), `refresh*`(원격 후 로컬 반영), `observe*`(로컬 스트림 구독).

- ~~`cache-first` (기본값): 로컬 캐시 우선 반환 + 백그라운드 원격 동기화~~
- ~~`network-only`: 캐시를 무시하고 항상 원격 서버에 요청~~
- ~~`cache-only`: 원격 요청 없이 로컬 캐시만 조회~~

### 3.3 예외 및 장애 대응 (Fallback)

- **오프라인 / 원격 실패**: Remote 요청 실패 시 에러를 반환하되, 기존 로컬 캐시는 **절대 삭제/무효화하지 않고 Fallback으로 유지**합니다.
- 이번 스코프에서는 오프라인 Write Queue(쓰기 대기열)는 구현하지 않습니다.

### 3.4 도메인별 특수 정책

| 도메인          | 정책 및 특징                                                            |
| :-------------- | :---------------------------------------------------------------------- |
| **Chat**        | 무한 스크롤 데이터이므로 **Cursor/Page Completeness**가 최우선.         |
| **Auth**        | **Remote-only**. 보안 및 만료 이슈로 인해 로컬 캐시 주입 대상에서 제외. |
| **InviteCloud** | **Local-only**. 네트워크 요청 기능 없이 로컬 캐싱(CRUD)으로만 처리됨.   |

### 3.5 데이터 모델 매핑 (Model Mapping)

- 로컬 스토리지는 `Cache*` 접두사가 붙은 캐시 모델을 사용합니다.
- Repository의 인터페이스는 반드시 **순수 도메인 모델**을 반환해야 합니다.
- `LocalDataSource` 내부 또는 전용 매퍼(Mapper)를 통해 `CacheModel <-> DomainModel` 변환이 이루어져야 합니다.

## 4. 파일별 구현 가이드 (Implementation Guide)

- **`apps/web/.../repositoryFactory.ts` & `DataProvider`**
    - `CacheStorage` 인스턴스 생성 및 `LocalDataSource` 주입 책임.
    - Repository 인스턴스 생성 시 Remote, Local, Context, DomainEventBus 일괄 주입.
- **`libs/data/.../repositories/*Repository.ts`**
    - `LocalDataSource` 의존성 추가.
    - 생성자에서 `domainEventBus`를 **내부적으로만 구독 (외부 노출 금지)**. (`channel:*` -> 채널 캐시 갱신 등)
    - `RepositoryOptions` 파라미터 적용 로직 구현.
- **`libs/data/.../local/data-sources/*`**
    - 서버 스펙을 확장한 도메인 모델 결과가 (cursor 가공, limit, 정렬)가 나오도록 로직 구현.
- **`libs/data/.../local/storages/*`**
    - `DataContext` 주입을 통한 Context(cid, uid) 격리 테이블/네임스페이스 로직 개선.

## 5. 완료 조건 (Definition of Done)

1. DataProvider를 통한 DI 파이프라인(Storage -> LocalDataSource -> Repository)이 완벽히 구성됨.
2. Repository 내부의 이벤트 구독(Listen) 및 캐시 Upsert가 정상 동작함.
3. `LocalDataSource`가 서버 응답 스펙과 동일하게 데이터를 가공하여 순수 도메인 모델로 Repository에 반환함.
4. 신규 캐시 정책 및 Context 격리 정책을 검증하는 단위 테스트 통과.

## 6. 작업범위

작업 범위는 반드시 준수하고 최대한 외부 디렉터리를 접근하지 않도록 한다.

1. libs/data/.../local/\*
2. libs/data/.../repositories/\*
3. apps/web/...shared/data/\*
4.

## 7. 후속 작업 (백로그)

본 스코프에서 제외했던 고도화 항목이다. **2026-08-12 확인 기준으로 실제 착수된 것은 TTL 메타데이터
뿐이다** — `lastSyncedAt`/`expiresAt`와 조회 시 만료 GC가 `libs/data/.../storages/utils.ts`에 있다.
Stale-While-Revalidate, Optimistic Rollback, `hasGap()`/`checkContinuity()`,
`fetchWithCachePolicy`는 코드에 존재하지 않는다.

- **정규화 고도화 (Normalization & Type Safety)**
    - **Mapper 분리**: 순수 도메인 모델(`DomainModel`)과 로컬 캐시 모델(`CacheModel`) 간의 양방향 변환을 담당하는 Mapper 로직을 명시적인 클래스나 함수형 모듈로 완전히 분리합니다.
    - **도메인 모델 강화**: Repository 레이어에서 사용되는 도메인 모델을 활용하여 로컬과 리모트 데이터가 중재될 수 있도록 합니다

- **누락된 기능 추가 및 스펙 일치화 (Feature Parity)**
    - 현재 하위 계층인 `CacheStorage` 인터페이스에는 설계되어 있으나, 상위의 `LocalDataSource` 계층에는 아직 노출/구현되지 않은 확장 기능(예: 다중 ID 기반 벌크 삭제, 조건부 부분 업데이트, 캐시 삭제 등)을 파악하여 모두 구현합니다. 이를 통해 스토리지와 데이터 소스 간의 기능적 불일치(Gap)를 해소합니다.
    - 커서 기반 페이징 처리 시, 로컬에 저장된 데이터 사이의 누락 구간 유무를 판별하는 `hasGap()` 또는 `checkContinuity()` 로직을 포함합니다.

- **TTL 메타데이터 및 GC 도입 (Time-To-Live & Garbage Collection)**
    - 모든 캐시 레코드에 `lastSyncedAt`(마지막 서버 동기화 시간) 및 `expiresAt`(만료 예정 시간) 메타데이터 필드를 추가합니다.
    - 도메인 특성에 맞춰 유동적인 TTL을 부여합니다.(예: 채널 정보는 7일, 현재 접속 상태는 5분)

- **Repository 캐싱 정책 고도화 (Advanced Caching Strategy)**
    - **Stale-While-Revalidate**: 오래된 캐시(Stale)를 먼저 UI에 빠르게 보여주고, 백그라운드에서 조용히 원격(Remote) 데이터를 가져와 교체하는 정책 추가.
    - **Optimistic Updates & Rollback**: 쓰기(Write) 요청 시 서버 응답을 기다리지 않고 로컬 캐시를 먼저 업데이트하여 UI 반응성을 극대화하고, 네트워크 실패 시 이전 상태로 안전하게 되돌리는(Rollback) 기능 구현.
    - BaseRepository의 추상 기능을 사용하여 실제 SocketDataSource와 LocalDataSource를 조합합니다.
    - Caching Flow Abstract: fetchWithCachePolicy<T>와 같은 공통 흐름 제어 메서드를 구현합니다.
    - Background Runner: 캐시 반환 후 백그라운드에서 원격 동기화를 수행하는 공통 유틸리티를 제공합니다.

- **Native DB 스코프 정책 추가**
    - Native DB 캐시 데이터에 uid를 스코프 정책에 추가하여 관리합니다.
