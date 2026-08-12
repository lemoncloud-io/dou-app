# repositories (`libs/data/src/data/repositories-v2`)

repository V2는 remote data source와 local data source V2를 묶어 앱에 노출하는 **data facade**다.

핵심 목표는 하나다.

- 읽기는 항상 local
- remote는 side-effect command
- hook은 stream만 본다

> **V1은 제거됐다.** `src/data/repositories`는 이제 V2가 의존하는 공유 계약(`DataContext` / `DataContextProvider` / `DataContextHolder`)만 보관하는 디렉토리다. 모든 도메인 repository는 `repositories-v2`에 있다.

## 구성

도메인 repository: `channel`, `chat`, `cloud`, `join`, `place`, `profile`, `user`, `syncMeta`.

- 팩토리: [index.ts](../../src/data/repositories-v2/index.ts) — `createRepositoriesV2({ remoteDataSources, localDataSources, context })`가 `DataRepositoriesV2`를 만든다.
- 공통 기반: [types.ts](../../src/data/repositories-v2/types.ts) — `BaseRepositoryV2`.

## 3가지 계약

UI 레이어가 보는 것은 두 가지뿐이다.

1. **읽기 스트림** — `observeList` / `observeItem` 구독.
2. **쓰기 명령** — `sendChat`, `createPlace`, `updateProfile` 등 사용자 의도 반영.

세 번째 `refresh*` / `cache*`는 UI 계약이 아니라 sync 경로다.

| API 그룹                                     | 호출 주체                  | 예시                                             |
| -------------------------------------------- | -------------------------- | ------------------------------------------------ |
| `observe*`                                   | UI hook                    | `observeList(query, cb)`                         |
| write command                                | UI action                  | `sendChat()`, `createPlace()`, `updateProfile()` |
| `refresh*` / `syncChannels` / `syncProfiles` | 외부 sync orchestrator     | `refreshList()`, `syncChannels(since)`           |
| `cache*`                                     | sync orchestrator / 테스트 | `cacheWrite(item)`, `cacheClear()`               |

UI가 `refresh*`를 직접 호출하면 sync 타이밍과 충돌할 수 있다. 필요하면 user event 경로로만 제한적으로 호출한다.

## BaseRepositoryV2가 주는 것

`BaseRepositoryV2`는 event bus나 cachePolicy를 쓰지 않는다(그건 제거된 V1 base). 대신 V2가 공통으로 필요한 것만 제공한다.

- `getRequestContext()` — 호출 시점의 `cid`/`sid`/`uid` 스냅샷을 캡처한다. **요청 시점과 응답 시점의 context가 다를 수 있으므로, remote 응답을 적재하기 전 context를 캡처해야 한다.**
- `getNormalizedContext()` — `cid`는 없으면 `'default'`로 정규화.
- `assertRequiredString` — 필수 식별자 검증.
- `dispose()` — 팩토리가 모든 repository를 여기로 정리한다. 현재 base 레벨에서 놓을 자원은 없고, 자원을 잡는 서브클래스를 위한 자리다.

> `runInBackground` / `runInBackgroundSerial`은 **삭제됐다**(2026-08-11). 정의만 있고 호출처가 하나도 없는데 실패를 생 `console.error`로 삼켜서, 쓰기 시작하는 순간 에러가 로그 버퍼(→ 리포트 breadcrumb) 밖으로 새는 구조였다. background 실행이 다시 필요해지면 실패를 `logger.error`로 남기는 형태로 새로 만든다.

## context와 scope

`DataContext`는 `cid`(연결된 cloud) · `sid`(선택된 place) · `uid`(현재 사용자)다. repository는 context를 직접 보관하지 않고 `DataContextProvider`를 통해 매 호출마다 최신 값을 읽는다(`DataContextHolder`). 따라서 cloud/place 전환이 있어도 repository를 재생성할 필요가 없고, `withContext(snapshot)`으로 특정 context에 고정된 사본을 만들 수도 있다.

## 더 읽기

- [domains.md](./domains.md) — 도메인별 repository 메서드와 sync 결과 해석.
- [../local/README.md](../local/README.md) — repository가 적재한 결과를 저장·재방출하는 계층.
