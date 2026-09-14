# repositories-v2 — data facade

> 상태: Live · 최종 갱신: 2026-09-09 · 개요는 [lib README](../../README.md) · 정본 코드: [repositories-v2/index.ts](../../src/repositories-v2/index.ts) · [repositories-v2/types.ts](../../src/repositories-v2/types.ts)

repository는 remote data source와 local data source를 묶어 앱에 노출하는 **data facade**다.
서버에서 온 변경분을 로컬 read-model로 해석하는 계층이기도 하다.

핵심 목표는 하나다.

- 읽기는 항상 local
- remote는 side-effect command
- hook은 stream만 본다

## 3가지 계약

UI 레이어가 보는 것은 두 가지뿐이다.

1. **읽기 스트림** — `observeList` / `observeItem` 구독
2. **쓰기 명령** — `sendChat`, `createPlace`, `updateProfile` 등 사용자 의도 반영

세 번째 `refresh*` / `cache*`는 UI 계약이 아니라 sync 경로다.

| API 그룹                                     | 호출 주체                  | 예시                                             |
| -------------------------------------------- | -------------------------- | ------------------------------------------------ |
| `observe*`                                   | UI hook                    | `observeList(query, cb)`                         |
| write command                                | UI action                  | `sendChat()`, `createPlace()`, `updateProfile()` |
| `refresh*` / `syncChannels` / `syncProfiles` | 외부 sync orchestrator     | `refreshList()`, `syncChannels(since)`           |
| `cache*`                                     | sync orchestrator / 테스트 | `cacheWrite(item)`, `cacheClear()`               |

UI가 `refresh*`를 직접 호출하면 sync 타이밍과 충돌할 수 있다. 필요하면 user event 경로로만
제한적으로 호출한다.

## `BaseRepositoryV2`가 주는 것

`BaseRepositoryV2`는 event bus나 cachePolicy를 쓰지 않는다. 공통으로 필요한 것만 제공한다.

- `getRequestContext()` — 호출 시점의 `cid`/`sid`/`uid` 스냅샷을 캡처한다. **요청 시점과 응답 시점의 context가 다를 수 있으므로, remote 응답을 적재하기 전 context를 캡처해야 한다.**
- `getNormalizedContext()` — `cid`는 없으면 `'default'`로 정규화.
- `assertRequiredString` — 필수 식별자 검증.
- `dispose()` — 팩토리가 모든 repository를 여기로 정리한다. 현재 base 레벨에서 놓을 자원은 없고, 자원을 잡는 서브클래스를 위한 자리다.

## context와 scope

`DataContext`는 `cid`(연결된 cloud) · `sid`(선택된 place) · `uid`(현재 사용자)다. repository는
context를 직접 보관하지 않고 `DataContextProvider`를 통해 매 호출마다 최신 값을 읽는다
(`DataContextHolder`). 따라서 cloud/place 전환이 있어도 repository를 재생성할 필요가 없고,
`withContext(snapshot)`으로 특정 context에 고정된 사본을 만들 수도 있다.

## 핵심 계약

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

`CacheStorage`만 이 lib의 것이다 — `ports/`가 선언하는 인터페이스다. 그 아래 세 어댑터는
`@chatic/db` 소유이고, 어느 도메인이 어느 어댑터를 받는지는 `libs/app-runtime`이 정한다.

## repository 배선

`repositories-v2/index.ts`의 `createRepositoriesV2`가 조립 지점 하나다. local이 없는 것과 socket이 없는
것이 섞여 있다.

| repository     | socket | local                     | http           |
| -------------- | ------ | ------------------------- | -------------- |
| `auth`         | ✓      | —                         | `auth`         |
| `channel`      | ✓      | `channel` + `chat`        | —              |
| `chat`         | ✓      | `chat`                    | —              |
| `cloud`        | ✓      | `cloud`                   | `cloud`        |
| `device`       | ✓      | —                         | `user`         |
| `invite`       | ✓      | `invite`                  | —              |
| `join`         | ✓      | `join`                    | —              |
| `place`        | ✓      | `place`                   | —              |
| `profile`      | ✓      | `profile`                 | —              |
| `report`       | —      | —                         | `report`       |
| `subscription` | —      | —                         | `subscription` |
| `user`         | ✓      | `user` + `join` + `place` | `user`         |
| `syncMeta`     | —      | `syncMeta`                | —              |

- `auth`·`device`는 캐시할 것이 없는 remote-only 표면이다 (세션 신원 명령, 조회 신호).
- `report`·`subscription`은 remote-only이자 HTTP-only다 — 소켓 data source조차 없다.
- `channel`이 `chat` 로컬까지 받는 이유는 퇴장 시 채널 행만이 아니라 그 방의 메시지까지 비워야 하기 때문이다 (ADR-0067).
- `user`가 `join`·`place` 로컬을 받는 이유는 초대 후보 조립이 세 캐시를 함께 읽기 때문이다.

## HTTP 주입은 선택적이다

`createRepositoriesV2`의 `httpDataSources`가 선택 인자다(`httpDataSources?`). 미주입 상태에서 해당
메서드를 부르면 명시 에러를 던진다. ADR-0036 트랙 문서는 "4단계 완료 후 필수로 승격"을 예고했지만
승격은 일어나지 않았다. 지금 상태는 선택적이다.

## 도메인 13종

도메인별 메서드 카탈로그는 [domains.md](./domains.md)로 갈랐다 — 13종 132줄이라
공통 규칙 사이에 끼면 양쪽 다 읽기 어려웠다.

## 채팅 커서

채팅은 cursor 기반이라 두 책임을 분리한다.

- **최신 메시지 감지**는 `channel`의 `chatNo` 기준 — channel sync가 준 `chatNo`와 local max `chatNo`를 비교한다.
- **이전 페이지 pagination**은 `chat.feed`의 `cursorNo` 기준.

둘은 같은 값이 아니다. `cursorNo`는 older page 조회용 query 구분자이지 latest sync 기준값이 아니다.

## cache clear 원칙

- `cacheClear()`는 현재 repository scope 기준 clear다(전체 clear 아님).
- `ChatRepositoryV2`는 `cacheClearByChannelId(channelId)`를 추가로 제공한다.
- 로그아웃 · cloud 전환 · 테스트 초기화에서 clear 범위를 명확히 결정해야 한다.
- **chat 삭제는 되돌릴 수 없다.** 다른 도메인은 잘못 지워도 서버가 다시 채워 주지만, 메시지 피드는 `join.joinedNo`로 창이 잡혀 있어 그 이전은 서버도 주지 않는다. 그래서 chat 삭제는 추론이 아니라 명시 신호에만 건다 → 아래.

storage가 그 요청을 어떻게 수행하는지는
[local.md의 채널 한정 삭제](../local/README.md#채널-한정-삭제의-세-경로)에 있다.

## 퇴장과 재입장

재입장은 처음 들어온 것과 같아야 한다. 서버는 재입장 시 join 커서를 리셋하고 피드를
`chatNo > joinedNo`로 창을 잡지만, **클라이언트는 서버 응답이 아니라 로컬 chat 캐시를 렌더한다.**
퇴장해도 그 방의 메시지 행은 캐시에 남으므로(chat sync plan에는 `onRemove`가 없다 — 이력은
lazy-load/오프라인을 위해 유지된다) 두 장치가 함께 필요하다. 결정 근거는
[ADR-0067](../../../../docs/adr/0067-rejoin-hides-prior-messages.md).

**① 표시 게이트 — `isInJoinWindow(chat, joinedNo)`** (`src/domain/joinWindow.ts`)

서버와 같은 규칙(`chatNo > joinedNo`)을 캐시를 읽는 자리에 건다. 예외 둘이 의미를 갖는다:

- `joinedNo`가 없으면 아무것도 숨기지 않는다. 서버가 이 필드를 싣기 전에 쓰인 행이 있고, 없는 값을 대신 추측하면 멀쩡한 이력이 사라진다.
- `chatNo`가 falsy면 통과시킨다. 낙관적 전송 행은 서버 번호를 받기 전까지 `chatNo: 0`이라, 이 예외가 없으면 **방금 보낸 메시지가 사라진다.**

소비자는 apps/web의 방 피드·홈 프리뷰·전역 검색 셋이다. 이 게이트는 ②의 중복이 아니라 ②가 닿지
못하는 것(이미 캐시를 쌓아 둔 기존 설치, 강퇴, 타 기기 퇴장)을 덮는 소급 방어선이다.

방 피드에서는 **렌더 직전이 아니라 `useChats`가 캐시를 받는 자리**에 건다. 표시용 목록에만 걸면
같은 훅이 내보내는 `rawChats`(리액션 폴딩·스레드 구성·"1번 행이 로드됐나")가 다른 경계를 갖게
되고, 그러면 캐시에 남은 퇴장 전 1번 행 때문에 **중간에 재입장한 사람에게만 "대화의 시작" 블록이
뜬다** — 처음 초대받은 사람은 못 보는 것을. 페이징 커서도 같은 이유로 참여 이전 `chatNo`를 잡으면
안 된다.

**② purge — 명시 신호에만**

| 신호              | 위치                                      |
| ----------------- | ----------------------------------------- |
| 본인 나가기 성공  | `ChannelRepositoryV2.leaveChannel`          |
| 내 join 행의 제거 | join sync plan의 `onRemove` (app-runtime) |

`ChannelSyncPlan.onRemove`와 `syncChannels`의 stale prune에는 **붙이지 않는다.** 추론 기반 정리의
오판 한 번이 복구 불가능한 이력 손실이 되기 때문이다.

purge는 낙관적으로 하지 않고 서버 확인 뒤에 하며, 실패해도 나가기 자체는 성공으로 끝난다 — 이미
일어난 퇴장을 실패로 보고하는 쪽이 더 큰 거짓말이고, 남은 행은 ①이 가린다.

## 구현 / 테스트 시 주의

- remote 응답 적재 전 요청 시점 context를 캡처한다(`getRequestContext`). cloud 전환 중 늦게 도착한 응답이 현재 scope를 오염시키면 안 된다.
- `sid` fallback 오류는 cross-place 오염으로 이어진다.
- `chat.feed`는 overwrite보다 merge가 중요하다.
- hook이 remote 반환 리스트를 직접 렌더하는 경로가 남으면 이 lib의 목표를 어긴다.
- HTTP 주입(`httpDataSources`)은 선택적이다. 미주입 상태에서 HTTP 메서드를 부르면 명시 에러를 던진다.

## 더 읽기

- [socket sync usage](../../../app-runtime/docs/socket/sync/usage.md) — join 행 제거가 purge 신호가 되는 경로(app-runtime 소관).
