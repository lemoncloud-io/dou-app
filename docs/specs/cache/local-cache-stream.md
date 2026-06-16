# 로컬 캐시 CRUD 통합 및 Stream 동기화 아키텍처 명세서

## 1. 개요 및 목적 (Overview & Purpose)

Repository 계층에 `LocalDataSource`를 주입하여, 원격 서버 응답 및 도메인 이벤트를 기반으로 로컬 캐시를 갱신하고 관리합니다. 캐싱 데이터가 업데이트되면 메모리 상에서 동작하는 전용 Stream이 즉시 업데이트된 데이터를 방출(Emit)하여 UI 계층과 실시간으로 동기화하는 것을 핵심 목적으로 합니다. 또한, 공통적으로 사용되는 캐시 조작 기능(CRUD)은 단일 인터페이스로 통합하여 데이터 소스 관리의 일관성을 확보합니다.

## 2. 작업 범위 (Work Scope)

작업 범위는 다음 경로로 한정되며, 명시되지 않은 외부 디렉터리 접근은 최대한 지양합니다.

- `libs/data/.../local/*`
- `libs/data/.../repositories/*`
- `apps/web/...shared/data/*`

## 3. 계층별 책임 및 아키텍처 (Architecture & Responsibilities)

- **Repository**: Local/Remote 간의 캐싱 정책을 결정하며, 순수 도메인 모델(Domain Model)만 UI 계층에 반환합니다. 단일 모델 또는 리스트 모델(`DomainListResult`)을 반환하며, UI가 데이터를 구독할 수 있는 파이프라인을 제공합니다.
- **LocalDataSource**: 통합된 공통 캐시 읽기/쓰기(CRUD) 인터페이스를 구현하며, 서버 스펙과 동일한 조건(페이징, 정렬 등)으로 데이터를 가공합니다.
- **Stream (내부 구독 매니저)**: `LocalDataSource` 내부에서 동작하며, 로컬 캐시에 변경 사항이 발생할 때마다 해당 데이터를 구독 중인 대상을 식별하여 최신 상태를 방출하는 발행-구독(Pub/Sub) 역할을 수행합니다.
- **CacheStorage**: 실제 로컬 DB(MMKV, SQLite 등)와 연동되는 물리적 저장소 드라이버입니다.

## 4. 핵심 제약 및 동작 정책 (Constraints & Policies)

- **Context 기반 파티셔닝**: 모든 캐싱 데이터는 단일 ID가 아닌 `(cid, uid, 고유ID)`의 복합 키 조합으로 식별 및 격리되어야 합니다.
- **공통 CRUD 인터페이스 통합**: 기존에 분산되어 있던 유사한 조작 함수들은 단일화된 공통 인터페이스(조회, 단건/다건 저장, 단건/다건 삭제, 전체 초기화)로 통합하여 상속 기반으로 구현해야 합니다.
- **Stream 방출 무결성 강제**: 데이터 상태를 변경하는 모든 로컬 캐시 조작(Upsert, Delete 등)이 성공적으로 완료된 직후에는, 반드시 메모리 상의 Stream을 통해 변경된 최신 상태를 방출(Emit)해야 합니다.
- **예외 및 장애 대응 (Fallback)**: Remote 요청 실패 시 에러를 반환하되, 기존에 저장된 로컬 캐시 데이터는 절대 삭제하거나 무효화하지 않고 Fallback 데이터로 유지해야 합니다.

## 5. DomainListResult (모델 리스트) 명세

Repository가 모델 리스트 타입을 반환하거나 Stream으로 방출할 때 사용하는 표준 래퍼(Wrapper) 구조입니다. 단순 배열을 래핑하며, 동기화 및 데이터 무결성에 필요한 부가 정보를 포함합니다.

## 6. UI 계층 연동 파이프라인 (UI Integration Flow)

UI 계층은 목적에 따라 두 가지 방식으로 Repository 및 로컬 캐시와 상호작용합니다.

- **단발성 요청 및 응답 (One-off Request)**: 최초 진입 시 데이터 로딩이나 일회성 조회가 필요한 경우, UI가 Repository의 조회 기능을 호출하여 설정된 캐시 정책에 따라 응답을 받습니다.
- **Stream 구독 기반 즉각적 갱신 (Reactive Subscription)**: UI가 리스트 또는 단일 형태의 데이터 Stream을 구독합니다. 이후 원격 서버 응답이나 내부 CRUD 로직에 의해 로컬 캐시가 업데이트되면, 메모리 상의 Stream이 최신 데이터를 방출하여 UI가 즉각적으로 화면을 갱신(예: 낙관적 업데이트)할 수 있도록 구동됩니다.
