# 클라이언트 동기화 가이드 (개요)

`libs/data`가 기대하는 서버 소켓 스펙과, 현재 앱이 사용하는 클라이언트 동기화 방식의 경계를 정리한 문서다.

이 문서(개요)는 두 가지를 함께 다룬다.

1. `@lemoncloud/chatic-sockets-lib` / `frontend-client-socket` 문서가 정의하는 transport + runtime 계약
2. `libs/data` repository / local layer가 그 위에서 `channel`, `chat`, `join`, `user` 동기화를 어떻게 해석하는지

도메인별 상세 시나리오와 인터페이스 표는 별도 파일로 분리되어 있다:

- [domains.md](domains.md) — Device / Channel / Chat / Join / Place / Profile 동기화 시나리오
- [interface-reference.md](interface-reference.md) — `ClientSocketV2` / runtime 인터페이스, gateway 메서드 req/res 표

---

## 문서 범위

### 이 문서가 사실로 다루는 범위

- 서버 action 계약
    - `system.ping`
    - `device.read`
    - `device.save`
    - `device.sync`
    - `channel.mine`
    - `channel.sync`
    - `channel.unreads`
    - `chat.feed`
    - `chat.read`
    - `place.create` / `place.get` / `place.update` / `place.delete`
    - `cloud.create` / `cloud.get` / `cloud.update` / `cloud.delete`
    - `profile.get` / `profile.get-mine` / `profile.set` / `profile.sync`
    - `join.get` / `join.update`
- 서버→클라이언트 sync 트리거 (`domain.sync` push, `chat.sync` / `join.sync` 포함)
- 현재 앱에서 소비 중인 `ClientSocketV2` 표면 (요청 제한 포함)
- `libs/data` repository V2 / local V2 가 담당하는 동기화 해석

### 이 문서가 직접 보장하지 않는 범위

- `frontend-client-socket` 문서에 있는 장기 확장 초안 전체
- 아직 앱에서 일반화되지 않은 `ChannelSyncPlan`, `ChatSyncPlan`
- `libs/data` 내부 구현이 아닌 transport 세부 구현

즉, `device` runtime은 주로 sockets-lib 책임이고, `channel` / `chat` / `join` / `user`의 로컬 반영은 `libs/data` 책임이다.

### 모델 / payload / response 정렬 원칙

현재 코드베이스에는 도메인 전용 모델, payload, response 타입 정의가 이미 존재한다.

하지만 아래를 원칙으로 한다.

1. 기존 타입 이름이나 필드 구조를 억지로 보존하는 것을 목표로 하지 않는다.
2. 서버 스펙과 실제 동기화 흐름을 더 명확하게 표현할 수 있다면, 도메인 전용 모델을 새로 정의하거나 변경할 수 있다.
3. remote request payload, remote response, local domain model은 같은 형태여야 한다고 가정하지 않는다.
4. 필요하면 아래 세 층을 분리한다.
    - 서버 요청 payload
    - 서버 응답 view
    - local cache / UI read-model
5. 따라서 기존 `*Input`, `*View`, `Domain*` 정의와 정확히 맞추는 것보다, 현재 책임과 데이터 흐름을 올바르게 드러내는 쪽을 우선한다.

예시:

- `ProfileView` 는 서버 응답 타입으로 유지
- local cache에는 `DomainProfile` 을 별도로 둘 수 있음
- optimistic update용 patch payload는 또 다른 내부 타입으로 둘 수 있음

즉 "이미 있으니 그대로 맞춘다"가 아니라, "지금 필요한 책임 경계에 맞게 다시 정의할 수 있다"가 문서 기준이다.

---

## 아키텍처 개요

동기화는 **transport**와 **application sync** 두 계층이 역할을 나눈다.

- transport는 연결이 살아있는지를 책임진다.
- application sync는 무엇을 읽고, 어떤 응답을 local cache에 반영할지를 책임진다.

```txt
UI / React Hook
  └─ Repository / Gateway
      └─ ClientSocketV2
          ├─ SocketTransport
          ├─ KeepAliveLoop           ← 기본 활성화 예정 (Phase A)
          ├─ AutoReconnectController ← 기본 활성화 예정 (Phase A)
          ├─ ConnectionRotationController
          └─ DeviceSyncRuntime
```

중요한 경계:

- `device` scheduler/runtime은 sockets-lib 쪽 책임이다.
- `channel` / `chat` / `join` 동기화 해석은 앱 레벨과 `libs/data` repository 책임이다.
- `libs/data` local layer는 sync 주체가 아니라 sync 결과 저장소다.

### 서버→클라이언트 sync 트리거

클라이언트 pull(polling) 외에 서버가 먼저 클라이언트에 sync 신호를 보내는 경로가 있다.

```ts
// 서버가 보내는 push 메시지 (응답이 아니라 단방향 신호)
{ type: 'domain.sync', data: { ... } }
```

이 신호는 re-read 힌트다. `libs/data` repository는 이를 직접 수신하지 않는다. 앱 레벨 sync orchestrator가 이 신호를 받아 해당 도메인 repository의 `refresh*` 또는 `cacheWrite*` 메서드를 호출하는 구조다.

현재 기준 구현 원칙:

- `domain.sync` push는 앱 orchestration이 해석한다.
- repository는 push payload를 직접 구독하지 않고, orchestration이 계산한 fetch/write 결과만 반영한다.
- `model.create` / `model.update` / `model.delete` 기반 dispatcher 경로는 V2 계약에서 제거됐다.

> `ClientSocketV2`의 클라이언트 측 요청 제한(in-flight / pending / timeout / client-side 429)은 [../network-layer.md](../network-layer.md#clientsocketv2-요청-제한)가 정본이다. sync 루프 요청도 같은 in-flight 슬롯을 공유하므로 429를 서버 응답과 구분해 처리한다.

### 도메인별 동기화 방식

| 도메인    | 방식                                          | 기준값           | 현재 책임 경계                                        |
| --------- | --------------------------------------------- | ---------------- | ----------------------------------------------------- |
| `device`  | polling + `device.sync` trigger               | `tick`           | sockets-lib runtime                                   |
| `channel` | `channel.sync({ since })` 중심 full/diff sync | `syncedAt`       | 앱 orchestration + `ChannelRepositoryV2`              |
| `chat`    | `channel.sync` 감지 후 `chat.feed`            | `chatNo`         | 앱 orchestration + `ChatRepositoryV2`                 |
| `join`    | `join.get` polling + `join.sync` trigger      | `updatedAt`      | `JoinSyncPlan` + `JoinRepositoryV2`                   |
| `user`    | `channel.list-user` / `syncUsers`             | 도메인별 payload | `UserRepositoryV2`                                    |
| `place`   | `place.get` / scope 전환 시 refresh           | `id`             | 앱 orchestration + `PlaceRepositoryV2`                |
| `profile` | `profile.sync({ since })` delta sync          | `since` (cursor) | 앱 orchestration + `ProfileRepositoryV2.syncProfiles` |
| `cloud`   | on-demand (`cloud.get`)                       | `id`             | `CloudRemoteDataSource`                               |

> `KeepAliveLoop`와 application sync loop는 별도 책임이다.
> ping 성공이 곧 모델 최신 상태를 뜻하지는 않는다.

도메인별 서버 계약·`libs/data` 해석·코드 예시는 [domains.md](domains.md) 참조.

---

## 운영 규칙

| 규칙                                   | 설명                                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `tick`은 서버 전용 값                  | `device.save` 입력의 `tick`은 서버가 무시한다.                                                               |
| `device.sync`는 weak trigger           | 응답이 없을 수 있으므로 기본적으로 `send()` 성격으로 다룬다.                                                 |
| `channel.sync since` 저장 필요         | 응답의 `syncedAt`을 다음 `since`로 저장해야 diff가 정확하다.                                                 |
| `channel.sync.ids`는 stale remove 기준 | 목록 반영만 하고 stale remove 를 생략하면 local cache가 오래 남을 수 있다.                                   |
| 최신 chat sync 기준은 `chatNo`         | latest sync 판단과 pagination cursor 를 섞지 않는다.                                                         |
| pagination cursor 는 `cursorNo`        | `cursorNo`는 이전 페이지 조회용이다.                                                                         |
| local layer는 sync 주체가 아님         | repository / orchestration 이 remote 결과를 해석하고 local 은 저장/재방출만 한다.                            |
| context 캡처 필요                      | remote 응답 적재 전 요청 시점 context 와 현재 context 가 같은지 확인해야 한다.                               |
| 서버→클라이언트 push는 re-read 힌트    | `domain.sync` push를 받으면 해당 도메인 refresh를 즉시 실행한다. pull loop와 독립적이다.                     |
| 429는 클라이언트 측 reject             | in-flight 32 / pending 512 초과 시 서버 무관하게 클라이언트가 reject한다. 서버 429와 구분해서 처리해야 한다. |
| `meta.ts` 는 서버 타임스탬프           | 모든 `:ok` 응답에 포함된 서버 측 처리 시각이다. 현재 `syncedAt`과 별도로 존재한다.                           |
| SPA unmount                            | `runtime.stop()` 후 `client.destroy()` 호출로 listener leak 을 막는다.                                       |

---

## 관련 문서

- [domains.md](domains.md) · [interface-reference.md](interface-reference.md)
- [../network-layer.md](../network-layer.md) — gateway↔repository 분리, `ClientSocketV2` 요청 제한 정본
- [../repositories/README.md](../repositories/README.md) · [../local/README.md](../local/README.md)
