# 클라이언트 동기화 가이드

`libs/data`가 기대하는 서버 소켓 스펙과, 현재 앱이 사용하는 클라이언트 동기화 방식의 경계를 정리한 문서다.

이 문서는 두 가지를 함께 다룬다.

1. `@lemoncloud/chatic-sockets-lib` / `frontend-client-socket` 문서가 정의하는 transport + runtime 계약
2. `libs/data` repository / local layer가 그 위에서 `channel`, `chat`, `join`, `user` 동기화를 어떻게 해석하는지

## 목차

- [문서 범위](#문서-범위)
- [아키텍처 개요](#아키텍처-개요)
- [Device 동기화](#device-동기화)
- [Channel 동기화](#channel-동기화)
- [Chat 동기화](#chat-동기화)
- [Join / Read 동기화](#join--read-동기화)
- [Profile 동기화](#profile-동기화)
- [인터페이스 참조](#인터페이스-참조)
- [운영 규칙](#운영-규칙)

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
- 서버→클라이언트 sync 트리거 (`domain.sync` push)
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

이 신호는 re-read 힌트다. `libs/data` repository는 이를 직접 수신하지 않는다. `SocketDispatcher` 또는 앱 레벨 sync orchestrator가 이 신호를 받아 해당 도메인 repository의 refresh 메서드를 호출하는 구조다.

현재 구현된 server-push 이벤트:

- `chat:create` → `ChannelRepositoryV2`에서 unread 스냅샷 즉시 반영
- `join:update` → `ChannelRepositoryV2` / `JoinRepositoryV2`에서 즉시 반영
- 그 외 `model.create` / `model.update` / `model.delete` → `SocketDispatcher` → `DomainEventBus`

### `ClientSocketV2` 요청 제한

`ClientSocketV2`는 동시 요청 수를 클라이언트 측에서 제어한다.

| 항목                  | 기본값 | 설명                                                |
| --------------------- | ------ | --------------------------------------------------- |
| `maxInflightRequests` | 32     | 동시 in-flight 허용 수                              |
| `maxPendingRequests`  | 512    | in-flight 포화 시 대기 가능한 최대 요청 수          |
| request timeout       | 30s    | 서버 응답 없을 때 클라이언트 측 timeout             |
| 429 (client-side)     | —      | pending 512 초과 시 클라이언트가 reject (서버 무관) |

`channel.sync`, `chat.feed` 등 sync 루프 요청이 다른 도메인 요청과 in-flight 슬롯을 공유한다. 429는 서버 응답이 아니라 클라이언트 내부 reject이므로, repository에서 에러 처리 시 구분이 필요하다.

### 도메인별 동기화 방식

| 도메인    | 방식                                          | 기준값           | 현재 책임 경계                                        |
| --------- | --------------------------------------------- | ---------------- | ----------------------------------------------------- |
| `device`  | polling + `device.sync` trigger               | `tick`           | sockets-lib runtime                                   |
| `channel` | `channel.sync({ since })` 중심 full/diff sync | `syncedAt`       | 앱 orchestration + `ChannelRepositoryV2`              |
| `chat`    | `channel.sync` 감지 후 `chat.feed`            | `chatNo`         | 앱 orchestration + `ChatRepositoryV2`                 |
| `join`    | `chat.read` 결과 반영                         | `chatNo`         | `JoinRepositoryV2`                                    |
| `user`    | `channel.list-user` / `syncUsers`             | 도메인별 payload | `UserRepositoryV2`                                    |
| `place`   | `place.get` / scope 전환 시 refresh           | `id`             | 앱 orchestration + `PlaceRepositoryV2`                |
| `profile` | `profile.sync({ since })` delta sync          | `since` (cursor) | 앱 orchestration + `ProfileRepositoryV2.syncProfiles` |
| `cloud`   | on-demand (`cloud.get`)                       | `id`             | `CloudRemoteDataSource`                               |

> `KeepAliveLoop`와 application sync loop는 별도 책임이다.
> ping 성공이 곧 모델 최신 상태를 뜻하지는 않는다.

---

## Device 동기화

`device`는 현재 서버/클라이언트 스펙이 가장 명확한 도메인이다.

다만 중요한 점은, 이 섹션의 핵심 구현 책임이 `libs/data` 내부가 아니라 `@lemoncloud/chatic-sockets-lib` runtime에 있다는 것이다. `libs/data`는 `device.read` / `device.save` / `device.sync` action을 소비할 수는 있지만, `DeviceSyncPlan` 자체를 소유하지는 않는다.

### 기본 사용

```ts
import createClientSocketV2, { createDeviceRuntime } from '@lemoncloud/chatic-sockets-lib';

const client = createClientSocketV2({
    url: 'wss://example.com/dev',
    device: { id: 'device-web-001', name: 'Chrome', platform: 'web' },
});

const runtime = createDeviceRuntime({
    client,
    keepAliveOptions: { intervalMs: 30_000 },
    reconnectOptions: { minDelayMs: 500, maxDelayMs: 30_000 },
    rotationOptions: {
        maxLifetimeMs: 1000 * 60 * 110,
        refreshBeforeMs: 1000 * 60 * 10,
    },
    devicePlanOptions: {
        intervalMs: 2000,
        onUpdate: (target, view, previous) => {
            console.log('device 갱신', view);
        },
    },
});

await runtime.start();
runtime.startCurrentDeviceSync(2000);
runtime.startDeviceSync('device-A', 1000);
```

### Device runtime이 기대하는 서버 계약

1. `device.save`의 응답은 최신 `DeviceView`를 준다.
2. `device.read`는 현재 연결 기준 조회와 명시적 id 조회를 모두 지원한다.
3. `device.sync`는 응답이 없을 수 있는 weak trigger 로 본다.
4. `tick`은 서버 관리 값이며, `device.save` 입력의 `tick`은 무시된다.

### 내부 동작

`DeviceSyncPlan.run()` 기준으로 보면 매 주기 흐름은 아래와 같다.

1. 필요 시 `device.sync { id?, tick? }` 를 `send()`로 서버에 보낸다.
2. `device.read { id? }` 로 최신 상태를 읽는다.
3. 응답 `tick`과 로컬 snapshot `tick`을 비교한다.
4. 같으면 스킵, 더 낮으면 무시, 더 최신이면 snapshot 갱신 + `onUpdate` 호출

### 로컬 snapshot 직접 갱신

```ts
runtime.updateLocalSnapshot(
    { type: 'device', id: 'device-web-001' },
    { tick: view.tick, lastAppliedTick: view.tick, view }
);
```

### sync 중단

```ts
runtime.stopSync({ type: 'device', id: 'device-A' });
runtime.stopAllSync();

await runtime.stop();
client.destroy();
```

### 연결 상태와 runtime 관계

| 이벤트           | runtime 동작                          |
| ---------------- | ------------------------------------- |
| connect 성공     | 등록 target 기준 full read            |
| closing / closed | timer 중지, target 등록은 유지        |
| 재연결 성공      | snapshot baseline 재설정 후 full read |
| `stopSync`       | polling + trigger 후속 처리 중단      |

---

## Channel 동기화

`channel`은 서버 스펙과 `libs/data` 구현이 가장 직접적으로 만나는 도메인이다.

### 서버 계약

#### canonical full / diff sync

```ts
// 최초 full sync
const initial = await channel.sync<ChannelSyncView>({ since: 0 });

// 이후 diff sync
const sync = await channel.sync<ChannelSyncView>({ since: lastSyncedAt });
```

`channel.sync` 응답은 아래를 포함해야 한다.

```ts
{
    list: [
        {
            id: 'CH001',
            chatNo: 123,
            unreadCount: 59,
            $join: { chatNo: 64 }
        }
    ],
    ids: ['CH001', 'CH002'],
    syncedAt: 1779952182553
}
```

의미:

- `list`: 마지막 `since` 이후 변경된 채널 스냅샷
- `ids`: 현재 내가 속한 전체 채널 id
- `syncedAt`: 다음 `since` 입력으로 저장할 값

정책:

- `since: 0` 은 canonical full sync 로 본다.
- `since > 0` 은 마지막 sync 이후 변경분 조회로 본다.
- 따라서 서버가 전체 스냅샷을 보장한다면, 최초 로드와 증분 로드를 같은 `channel.sync` 계약으로 통일할 수 있다.

#### 보조 초기 조회 경로

```ts
const result = await channel.mine<ListResult<ChannelView>>({ limit: 50 });
```

`channel.mine` 은 여전히 보조 초기 조회 경로로 쓸 수 있지만, sync 중심 구조에서는 canonical source 로 두지 않는다.

### `libs/data`에서의 해석

`ChannelRepositoryV2`는 아래를 수행한다.

1. `channel.sync({ since: 0 })` -> full sync 기준 초기 목록 반영 가능
2. `channel.sync({ since })` -> 변경분 local write
3. `channel.sync.ids` -> stale local remove
4. 필요 시 `channel.mine` -> 보조 초기 목록 refresh
5. `chat:create`, `join:update` domain event -> unread 관련 채널 스냅샷 즉시 반영

즉, `channel.sync`는 단순 조회가 아니라 local cache 정리 기준까지 포함한 계약이다.

### 증분 sync 기본 흐름

```ts
let lastSyncedAt = 0;

async function syncChannels() {
    const sync = await channel.sync<ChannelSyncView>({ since: lastSyncedAt });
    applyChannelDiff(sync.list ?? []);
    removeStaleChannels(sync.ids ?? []);
    lastSyncedAt = sync.syncedAt ?? lastSyncedAt;
}
```

### 읽지 않은 메시지 요약

```ts
const unreads = await channel.unreads<UnreadsSummaryView>();
```

이 호출은 badge / summary 성격이다. 채널 목록 자체의 source of truth 를 대체하지 않는다.

---

## Chat 동기화

`chat`은 `channel.sync`와 `chat.feed`를 조합해서 읽는 pull 전략이다.

중요한 규칙은 하나다.

- 최신 메시지 감지는 `channel.chatNo` 기준으로 한다.
- pagination 은 `chat.feed.cursorNo` 기준으로 한다.
- 둘은 같은 책임이 아니다.

### 최신 메시지 감지

`channel.sync` 응답의 `chatNo` 와 내 로컬 최신 메시지 번호를 비교한다.

```ts
const serverChatNo = ch.chatNo ?? 0;
const localLatestChatNo = getLocalLatestChatNo(ch.id);

if (serverChatNo > localLatestChatNo) {
    await refreshLatestChats(ch.id, localLatestChatNo);
}
```

여기서 비교값은 pagination cursor가 아니라, "내가 현재 캐시에 반영한 최신 chatNo" 다.

### `chat.feed`의 책임

```ts
interface ChatFeedResponse {
    list: ChatView[];
    cursorNo: number;
    readNo: number;
}
```

- `list`: 현재 요청 범위의 메시지 목록
- `cursorNo`: 더 이전 페이지를 읽기 위한 cursor
- `readNo`: 내 read cursor

즉 `cursorNo`는 older pagination 용이다. latest sync 기준값으로 그대로 쓰지 않는다.

### 최신 catch-up 예시

구현 방식은 앱 정책에 따라 다를 수 있지만, 핵심은 `channel.sync.chatNo`를 먼저 보고 그 다음 `chat.feed`를 호출하는 것이다.

```ts
async function syncChats() {
    const sync = await channel.sync<ChannelSyncView>({ since: lastSyncedAt });

    for (const ch of sync.list ?? []) {
        const serverChatNo = ch.chatNo ?? 0;
        const localLatestChatNo = getLocalLatestChatNo(ch.id);

        if (serverChatNo > localLatestChatNo) {
            const feed = await chat.feed<ChatFeedResponse>({
                channelId: ch.id,
                limit: 50,
            });
            appendMessages(ch.id, feed.list);
        }
    }

    lastSyncedAt = sync.syncedAt ?? lastSyncedAt;
}
```

### 이전 메시지 페이지네이션

```ts
const latest = await chat.feed<ChatFeedResponse>({
    channelId: 'CH001',
    limit: 50,
});

const older = await chat.feed<ChatFeedResponse>({
    channelId: 'CH001',
    cursorNo: latest.cursorNo,
    limit: 50,
});
```

### `libs/data`에서의 해석

`ChatRepositoryV2`와 `ChatLocalDataSourceV2`는 아래 전제를 가진다.

1. `chat.feed` 응답은 local cache에 merge 된다.
2. UI 렌더는 remote 응답 배열이 아니라 local stream 을 본다.
3. list query key 는 `channelId + cursorNo + limit` 로 구분된다.
4. `channel.delete` 시 해당 channel 메시지 cache 를 clear 한다.

---

## Join / Read 동기화

읽음 상태는 `chat.read`의 응답과 `join` local snapshot 으로 관리한다.

```ts
await chat.read({ channelId: 'CH001', chatNo: latestChatNo });
```

의미:

1. 서버의 내 `$join.chatNo`가 전진한다.
2. `JoinRepositoryV2`는 optimistic 하게 read cursor를 먼저 갱신한다.
3. 이후 `channel.sync` 또는 `join:update` 반영으로 unreadCount 가 다시 계산된다.

즉 unread 감소는 `chat.read` 단일 호출 결과라기보다, `join`과 `channel` 스냅샷이 다시 만나는 과정에서 확정된다.

---

## Place 동기화

`place`는 사용자가 소속되거나 생성한 공간(workspace) 단위의 신규 도메인이다.

서버 소켓 계약:

```ts
await client.request('place.create', body); // PlaceCreateInput
await client.request('place.get', { id }); // PlaceGetInput
await client.request('place.update', { id, ...body }); // PlaceUpdateInput
await client.request('place.delete', { id }); // PlaceDeleteInput
```

### 구현 상태

- remote: `PlaceRemoteDataSource` — `PlaceGateway` 기반 신규
- repository: `PlaceRepositoryV2` — local-first V2 패턴
- local: `PlaceLocalDataSourceV2`

### 동기화 방식

`place`는 채널처럼 주기적 delta sync 구조가 아니라, 필요 시 `place.get` 기반 단건 refresh 방식이다.

- scope(cid) 전환 시 현재 cloud의 place 목록을 refresh한다.
- `PlaceSyncPlan`이 app-runtime에서 scope 전환 타이밍을 제어한다.
- UserGateway의 `makeSite` / `updateSite` 는 deprecated이므로 신규 코드에서는 PlaceGateway를 사용해야 한다.

---

## Profile 동기화

`profile`은 사이트별 사용자 프로필의 V2 local-first 도메인이다.

서버 소켓 계약 (v2 기준):

```ts
await client.request('profile.get', { id });          // ProfileGetInput — id = `${siteId}:${userId}`
await client.request('profile.get-mine', null);       // ProfileGetMineInput
await client.request('profile.set', { ...body });     // ProfileSetInput
await client.request('profile.sync', { since? });     // ProfileSyncInput — delta 동기화
```

### 구현 상태

- remote: `ProfileRemoteDataSource` — 신규 `ProfileGateway` 기반
- repository: `ProfileRepositoryV2` — `syncProfiles(since)` 포함
- local: `ProfileLocalDataSourceV2`

이전 `UserGateway.getSiteProfile` / `setSiteProfile` 및 `ChannelGateway.syncProfile` 은 deprecated이며, 신규 `ProfileGateway`로 이전됐다.

### profile.sync 흐름

`profile.sync`는 `since` cursor 기반 delta sync를 지원한다.

```ts
const result = await profile.sync<SiteProfileSyncView>({ since: lastSyncedAt });
// result.profiles: { [uid]: ProfileView | null }  — null은 삭제됨을 의미
// result.syncedAt: 다음 since 값으로 저장
```

`ProfileRepositoryV2.syncProfiles(since)`가 이 결과를 해석해 local cache에 upsert / remove한다. `app-runtime/sync`의 `ProfileSyncPlan`이 호출 타이밍과 `since` 저장을 관리한다.

### 캐시 키

```ts
// profile id = `${siteId}:${userId}`
profile:${sid}:${uid}
```

### 동기화 정책

1. full sync: `since: 0` → 전체 프로필 목록 수신
2. diff sync: `since: N` → 마지막 sync 이후 변경 프로필만 수신
3. `profiles[uid] === null` → 해당 프로필 local cache에서 삭제
4. scope(sid) 전환 시 `since` 리셋 후 full sync 수행

---

## 인터페이스 참조

이 섹션은 현재 앱 소비 코드와 `libs/data`가 기대하는 최소 표면만 적는다.

### ClientSocketV2

```ts
interface ClientSocketV2 {
    readonly state: ClientSocketState;

    connect(): Promise<void>;
    disconnect(code?: number, reason?: string): Promise<void>;
    destroy(): void;

    request<TInput, TResult>(type: string, data?: TInput, options?: { timeoutMs?: number }): Promise<TResult>;
    send<TInput>(message: SocketMessage<TInput>): void;
    send<TInput>(type: string, data?: TInput): void;

    onState(listener: (event: ClientSocketStateEvent) => void): () => void;
    onError(listener: (event: ClientSocketErrorEvent) => void): () => void;
    onMessage(listener: (event: ClientSocketMessageEvent) => void): () => void;
    onType<T = unknown>(type: string, listener: (message: SocketMessage<T>) => void): () => void;
}
```

### Device runtime

```ts
interface DeviceSocketRuntime {
    start(): Promise<void>;
    stop(): Promise<void>;

    startSync(target: SyncTargetDescriptor): void;
    stopSync(target: SyncTargetDescriptor): void;
    stopAllSync(): void;
    listSyncTargets(): SyncTargetDescriptor[];
    updateLocalSnapshot(target: SyncTargetDescriptor, snapshot: unknown): void;

    startCurrentDeviceSync(intervalMs?: number): void;
    startDeviceSync(id: string, intervalMs?: number): void;
}
```

### SyncTargetDescriptor

```ts
interface SyncTargetDescriptor {
    type: string;
    id?: string;
    intervalMs?: number;
    meta?: Record<string, unknown>;
}
```

### 관련 gateway 메서드

| 메서드              | 입력                               | 응답                      |
| ------------------- | ---------------------------------- | ------------------------- |
| `device.save`       | `DeviceBody`                       | `DeviceView`              |
| `device.read`       | `{ id?: string } \| null`          | `DeviceView`              |
| `channel.mine`      | `{ page?, limit? }`                | `ListResult<ChannelView>` |
| `channel.sync`      | `{ since? }`                       | `ChannelSyncView`         |
| `channel.unreads`   | `{}`                               | `UnreadsSummaryView`      |
| `chat.feed`         | `{ channelId, cursorNo?, limit? }` | `ChatFeedResponse`        |
| `chat.read`         | `{ channelId, chatNo }`            | `JoinView`                |
| `channel.syncUsers` | `{ channelId, since? }`            | `ChannelUsersSyncView`    |
| `place.create`      | `PlaceCreateInput`                 | `MySiteView`              |
| `place.get`         | `PlaceGetInput`                    | `MySiteView`              |
| `place.update`      | `PlaceUpdateInput`                 | `MySiteView`              |
| `place.delete`      | `PlaceDeleteInput`                 | `MySiteView`              |
| `cloud.create`      | `CloudCreateInput`                 | `CloudView`               |
| `cloud.get`         | `CloudGetInput`                    | `CloudView`               |
| `cloud.update`      | `CloudUpdateInput`                 | `CloudView`               |
| `cloud.delete`      | `CloudDeleteInput`                 | `CloudView`               |
| `profile.get`       | `ProfileGetInput`                  | `ProfileView`             |
| `profile.get-mine`  | `ProfileGetMineInput \| null`      | `ProfileView`             |
| `profile.set`       | `ProfileSetInput`                  | `ProfileView`             |
| `profile.sync`      | `ProfileSyncInput \| null`         | `SiteProfileSyncView`     |

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
