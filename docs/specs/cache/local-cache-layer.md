# Repository Local Cache Integration Spec

## 1. 목적

- `Repository` 계층에 `LocalDataSource`를 주입하여 서버 응답/domain event 기반으로 로컬 캐시를 갱신한다.
- `LocalDataSource`는 `libs/data/src/data/local/storages`에 존재하는 로컬 스토리지 전략과 연결하여 로컬 캐시 연동을 수행한다.
- `Remote` 파트와 마찬가지로 `Local` 파트 또한 `DataProvider`를 통해 최종적으로 주입하는 방식으로 진행되기 때문에 DI 패턴을 도입한다.
- `cid`, `sid`, `uid` context에 따라 캐싱 저장 스코프가 달라지므로, 이를 고려하여 설계한다.
- `libs/data/src/data/local/storages`는 현재 `cid`, `sid`, `uid`와 같은 context를 고려한 저장 방식이 보완되어있지 않기 때문에, 필요시 이를 개선한다.

## 2. 현재 구조

- Provider: apps/web/src/app/shared/data/DataProvider.tsx
- Repository factory: apps/web/src/app/shared/data/repositoryFactory.ts
- Socket factory: apps/web/src/app/shared/data/socketFactory.ts
- Repository 구현: libs/data/src/data/repositories
- RemoteDataSource: libs/data/src/data/remote/data-sources
- LocalDataSource 구현 폴더: libs/data/src/data/local/data-sources
- LocalStorage : libs/data/src/data/local/storages

## 3. 핵심 제약

- context는 `cid`, `sid`, `uid`를 사용한다.
    - `cid`: cloudId
    - `sid`: placeId
    - `uid`: userId
- `sid`는 web 환경에서 `cloudCore.getSelectedPlaceId()`를 통해 주입된다.

## 4. 목표 아키텍처

- RemoteDataSource: 서버 요청 송신
- Repository: 로컬과 리모트 데이터를 중재하고 처리
- DomainEventBus: 내부 event listen
- LocalDataSource: 캐시 read/write
- Storage: 실제 DB와 연동되는 드라이버 역할 수행

예상 흐름:

1. UI가 Repository 메서드 호출
2. Repository가 RemoteDataSource로 socket 요청
3. SocketRequestManager가 ref 응답 대기
4. RemoteDataSource가 socket response를 domain event로 변환
5. Repository가 domain event를 내부 listen
6. Repository가 LocalDataSource 캐시 갱신
7. Repository 메서드는 필요한 경우 local cache 값을 반환하거나 remote response를 반환

## 5. 구현 범위

### 5.1 LocalDataSource 주입

`repositoryFactory.ts`에서 domain별 LocalDataSource를 생성 또는 주입한다.

대상 Repository:

- ChannelRepository
- ChatRepository
- JoinRepository
- SiteRepository
- UserRepository
- InviteCloudRepository

### 5.2 Repository 내부 listen

Repository 생성자에서 `domainEventBus`를 받아 내부적으로만 구독한다.

예시 정책:

- `channel:*` event 수신 시 channel cache update
- `chat:*` event 수신 시 message cache append/update
- `join:*` event 수신 시 join cache update
- `user:*` event 수신 시 user/profile cache update

외부 interface에는 `listen`, `onDomainEvent`, `domainEventBus`를 추가하지 않는다.

### 5.3 Context 기반 캐시 파티셔닝

LocalDataSource 접근 시 `context.getContext()`로 최신 값을 읽는다.

- cloud 단위 캐시: `cid`
- user 단위 캐시: `uid`

### 5.4 캐싱 모델 데이터별 정책

캐싱 모델 데이터 별 context 정책을 고려하여 scope를 설계한다.

- `channel`: cid, uid
- `chat`: cid, uid
- `inviteCloud`: cid, uid
- `join`: cid, uid
- `place`: cid, uid
- `user`: cid, uid

해당 scope와 더불어 기본적으로 각 모델들은 각 고유 아이디가 존재한다.
고유아이디와 scope에 도입된 id를 조합하여 캐싱 데이터를 관리하도록 한다. 조합된 (cid, uid, id)는 고유하다.

### 5.5 LocalDataSource 개발 시 고려사항

서버 payload 스펙과 동일한 결과를 나타내도록 `LocalDataSource` 내에서 가공을 수행해야한다.
예를 들어, 채팅 조회는 `cursorNo`, `limit`을 기준으로 정렬 방향과 cursor 포함 여부를 서버 스펙에 맞춰 처리해야 한다.
단순히 `cursorNo - limit` 범위를 계산하지 말고, 서버의 cursor 의미와 동일한 결과가 반환되도록 LocalDataSource에서 처리한다.

### 5.6 모델 타입

Remote 데이터의 경우 순수 도메인 모델을 바탕으로 처리하지만, Local 데이터의 경우 `Cache` 접두사가 붙은 모델을 바탕으로 처리한다.
Repository 레이어에서는 순수한 도메인 모델을 바탕으로 처리할 수 있어야한다.

### 5.7 기타 및 추가 고려사항

- `remote`와 `local` 데이터를 적절하게 불러오는 전략은 6번 캐싱 운용 정책을 따른다.
- `AuthRepository`는 remote-only로 두고 local 주입 대상에서 제외한다.
- `InviteCloudRepository`의 경우 네트워크 요청 기능이 없다. 해당 데이터는 로컬 캐싱으로만 처리(crud)된다.

## 6. 캐싱 운용 정책

### 6.1 기본 읽기 정책

Repository read API는 `cache-first + background refresh`를 기본 정책으로 한다.

1. `LocalDataSource`에서 현재 context scope 기준 cache를 먼저 조회한다.
2. local cache가 있으면 Repository는 local result를 즉시 반환할 수 있다.
3. cache가 없거나 명시적인 refresh가 필요한 요청이면 `RemoteDataSource` 요청을 수행한다.
4. remote 응답은 domain event를 통해 Repository 내부 listener로 전달된다.
5. Repository는 domain event를 수신한 뒤 `LocalDataSource`에 upsert한다.
6. 이후 같은 Repository read API는 갱신된 local cache를 반환한다.

Local cache는 stale 또는 partial result일 수 있으므로, local cache miss가 서버 데이터 없음으로 해석되면 안 된다.

### 6.2 네트워크 요청 타이밍

- local hit: local result를 먼저 반환할 수 있다.
- local miss: remote 요청을 수행하고, 응답을 local cache에 upsert한 뒤 결과를 반환한다.
- 사용자 명시 refresh: remote 요청을 수행한다.
- 최초 진입, loadMore 등 도메인별로 remote 동기화가 필요한 요청은 각 Repository 정책에 따른다.
- domain event 수신: 별도 read 요청이 없어도 local cache를 upsert한다.

### 6.3 TTL 정책

초기 구현에서는 TTL을 적용하지 않는다.
TTL을 도입하려면 scope별 cache metadata가 필요하므로 후속 작업으로 분리한다.

후속 TTL 작업에서 고려할 항목:

- scope별 cache metadata schema
- `lastSyncedAt` 저장 위치
- 도메인별 TTL 기본값
- TTL 만료 판정 helper
- chat처럼 TTL보다 cursor/page completeness가 우선인 도메인 예외 처리

### 6.4 Fallback 정책

- local hit + remote fail: local result를 fallback으로 유지한다.
- local miss + remote fail: Repository는 error를 반환한다.
- remote fail은 local cache를 삭제하거나 무효화하지 않는다.

### 6.5 Offline 정책

초기 구현은 full offline-first가 아니라 read fallback 중심으로 한다.

- read 요청은 local cache fallback을 허용한다.
- write offline queue는 이번 범위에 포함하지 않는다.
- remote write 실패 시 기존 pending/failed 처리 정책을 따른다.
- `chat` 전송처럼 이미 pending 메시지 개념이 있는 도메인은 기존 정책과 충돌하지 않도록 유지한다.

### 6.6 Chat 캐싱 정책

채팅 데이터는 무한히 증가할 수 있으므로 cursor/page completeness를 우선한다.

- 채팅방 최초 진입 시 remote `feed` 요청은 항상 수행한다.
- local cached messages는 초기 표시용으로 사용할 수 있다.
- `loadMore`는 `cursorNo`, `limit` 기준 remote 요청을 수행한다.
- remote `feed` 응답은 local cache에 upsert한다.
- local "전체 조회"는 전체 DB 조회가 아니라 `cid`, `uid` scope 내 해당 채널에 대한 cached messages 조회를 의미한다.

## 7. 파일별 작업 가이드

- `apps/web/src/app/shared/data/repositoryFactory.ts`
    - LocalDataSource 생성/주입 책임 추가
    - Repository 생성자 인자 확장

- `libs/data/src/data/repositories/*Repository.ts`
    - LocalDataSource 의존성 추가
    - domain event listen 추가
    - remote response 이후 cache update 정책 추가
    - LocalDataSource가 Repository에 순수 도메인 모델을 반환한다.
    - 해당 레이어에서는 데이터를 가공(fillter,sort,...)하지않는다. 이는 `LocalDataSource`에서 처리 후 넘겨줘야한다.

- `libs/data/src/data/repositories/types.ts`
    - BaseRepository protected helper 추가 가능
    - 외부 노출 타입은 최소화

- `libs/data/src/local/data-sources/*`
    - 기존 hook 기반 LocalDataSource의 로직을 참고하여 `libs/data/src/data/local/*`에 구현될 LocalDataSource에 이식할수 있는지 확인
    - 신규 LocalDataSource는 hooks 기반이 아닌 순수 typescript 기반이 되어야한다.

- `libs/data/src/data/local/storages/*`
    - context별 캐싱 저장 정책에 따라 scope 분리 정책 도입
    - `DataProvider` 에서 데이터를 주입할 수 있도록 인터페이스 보강 및 DI 전략 도입

## 8. 완료 조건

- Repository 생성 시 Remote + Local + Context + DomainEventBus가 모두 주입된다.
- domain event listen은 Repository 내부에서만 동작한다.
- `libs/data/src/data/local/storages/*`를 DataProvider에서 주입하도록 설계한다.
- 신규 캐싱 정책에 맞춰 `storages`내 캐싱 테이블들이 개선된다.
- `LocalDataSource` 내부 기능들이 Repository 요청 페이로드에 맞춰 대응된다.
- 단위 테스트가 추가된다.

## 9. 추가 조건 및 요구사항

- 반드시 작업 범위는 `apps/web/src/app/shared/data` 및 `libs/data/src`만 고려한다.
- `CacheStorage`의 팩터리는 `apps/web/src/app/shared/data`에서 구성되어야한다.
- 스토리지 진입 인터페이스는 `CacheStorage`이며, 위에서 언급한 `factory`는 주입 결정정책만 판단한다.
- CacheStorage의 scope을 결정할 `Context`는 `RepositoryContext`로 부터 `LocalDataSource`로 이어지며, 주입받는다.
- `RepositoryOptions`에 캐싱 네트워크 동시사용, 오직 네트워크만 사용, 무조건 캐싱 사용과 같은 여러 정책들을 파라미터로 제공한다.
