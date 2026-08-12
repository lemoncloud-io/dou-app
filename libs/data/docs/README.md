# libs/data

`libs/data`는 remote data source · local data source · repository를 조립해 앱이 사용할 **headless data layer**를 제공한다.

핵심 원칙은 하나다.

- **읽기는 항상 local stream** — UI는 `observe*` 만 구독한다.
- **remote는 side-effect command** — write/refresh는 명시적 메서드 호출이다.
- **UI는 네트워크를 직접 호출하지 않는다.**

socket 연결의 생애주기(연결/재인증/sync 타이밍)는 `libs/data`가 소유하지 않는다. `libs/data`는 외부 sync orchestrator가 호출한 `refresh*` / `cacheWrite*`의 결과를 local cache에 반영하고 stream으로 재방출할 뿐이다.

## 데이터 흐름

```txt
UI Hook
  observe*  ──────────────┐ (읽기: local stream 구독)
  write command ──────┐   │
                      ▼   │
  RepositoryV2  ──────────┤  remote 호출 + local cache 갱신
    ├─ RemoteDataSource ──┘  gateway thin wrapper (outbound)
    └─ LocalDataSourceV2 ◄── snapshot 저장 + observer 재발행
            │
       CacheStorage (IndexedDB / Native)
```

외부 sync orchestrator는 같은 RepositoryV2의 `refresh*` / `cacheWrite*`를 호출해 서버 변경분을 밀어넣는다. repository 입장에서 그 호출이 UI에서 왔는지 orchestrator에서 왔는지는 구분하지 않는다.

## 디렉토리 가이드

| 폴더                                      | 코드 위치                  | 개요                                                                               |
| ----------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------- |
| [remote/](./remote/README.md)             | `src/data/remote`          | gateway thin wrapper. outbound 호출만 담당하고 socket lifecycle은 모른다.          |
| [repositories/](./repositories/README.md) | `src/data/repositories-v2` | data facade. `observe*` / `refresh*` / write command 계약을 앱에 노출한다.         |
| [local/](./local/README.md)               | `src/data/local`           | snapshot 저장 · stream 발행 · scope 분리. sync 결과 저장소이지 sync 주체가 아니다. |

## domain · events

별도 폴더 없이 여기서 정리한다. 둘 다 위 3개 레이어가 공유하는 작은 계약이다.

### domain (`src/data/domain`)

local cache / UI read-model이 쓰는 도메인 모델과 매퍼.

- `models.ts` — `DomainChannel`, `DomainChat`, `DomainJoin`, `DomainUser`, `DomainPlace`, `DomainCloud`, `DomainProfile` 등. 대부분 `@chatic/app-messages`의 `Cache*View` 형태를 그대로 alias 하거나, repository 전용 입력 타입(`DomainChannelListPayload`, `DomainJoinListPayload`)을 더한다.
- `mappers.ts` — 서버 응답 view를 domain model로 정규화한다(`toEpochMs` 등 안전 변환 포함). 입력 계약은 `ApiInput<TView, TDomain>` = "API view + 이미 적재된 domain 전용 필드(선택)"다.

원칙: **서버 요청 payload · 서버 응답 view · local domain model은 같은 형태라고 가정하지 않는다.** 책임 경계가 다르면 별도 타입으로 둔다.

### events (`src/data/events`)

타입 안전한 도메인 이벤트 계약.

- `domain.ts` — `DomainEventMap`(`chat:create`, `join:update`, `channel:delete` …)과 `DomainPayload<T>` 래퍼.
- `eventBus.ts` — `IEventBus` / `EventBusEngine` 구현.

주의: 이 이벤트 버스는 V1 `BaseRepository`(`src/data/repositories/types.ts`)가 `domainEventBus`로 구독하던 경로다. **V2 `BaseRepositoryV2`는 event bus를 사용하지 않는다.** V2의 local 반영은 repository의 명시적 메서드 호출(`cacheWrite*` / `cacheDelete*`)로만 이뤄지며, `model.create`/`update`/`delete` 기반 자동 dispatcher 경로는 V2 계약에서 제외됐다.

## 문서 규칙

- 각 폴더의 `README.md`가 그 레이어의 개요다. 아키텍처 상세·도메인별 시나리오는 같은 레벨의 별도 문서로 둔다.
- 같은 사실은 한 곳(정본)에만 쓰고 나머지는 링크한다.
- **이 문서들은 `libs/data` 코드가 실제로 다루는 것만 기술한다.** 서버 소켓 spec, sync plan, transport runtime은 외부 모듈(`@lemoncloud/chatic-sockets-lib`, `libs/app-runtime`) 책임이며 여기서 다루지 않는다 — 다만 `libs/data`의 계약이 어디서 호출되는지(경계)는 필요한 만큼 가리킨다.
