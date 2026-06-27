# 도메인별 동기화 시나리오

> 각 도메인의 서버 소켓 계약과 `libs/data` repository/local 해석. 개요·도메인별 방식 표·운영 규칙은 [README.md](README.md), 인터페이스/게이트웨이 표는 [interface-reference.md](interface-reference.md) 참조.

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

`join`은 v0.3.4부터 1급 sync 도메인이다. 단일 join(채널 참여/읽음 상태) 스냅샷은 신규 `JoinGateway`(`join.get` / `join.update`)와 `JoinSyncPlan`이 소유하고, 읽음 처리(`chat.read`)·채널 참여(`channel.join`)는 보조 command로 남는다.

### 서버 소켓 계약 (v2 기준)

```ts
await client.request('join.get', { id });                 // JoinGetRequestBody — composite join id
await client.request('join.update', { id, nick?, notify?, role? }); // JoinUpdateRequestBody
```

응답은 `JoinView` 다.

```ts
interface JoinView {
    id?: string;
    channelId?: string;
    ownerId?: string;
    stereo?: string;
    chatNo?: number;
    joined?: boolean;
    updatedAt?: number; // JoinSyncPlan 적용 기준값
}
```

### 1급 게이트웨이 vs 보조 command

| 동작           | 액션           | 소유 게이트웨이                     | 비고                        |
| -------------- | -------------- | ----------------------------------- | --------------------------- |
| 단일 join 조회 | `join.get`     | `JoinGateway` (`createJoinGateway`) | `JoinSyncPlan` polling 기준 |
| join 메타 수정 | `join.update`  | `JoinGateway`                       | nick / notify / role        |
| 읽음 처리      | `chat.read`    | `ChatGateway` (보조)                | read cursor 전진            |
| 채널 참여      | `channel.join` | `ChannelGateway` (보조)             | 참여 요청                   |

`libs/data`의 `JoinDomainGateway` / `JoinRemoteDataSource`는 위 4개를 다중 게이트웨이로 묶어 참조한다. (단건 get/update는 `JoinGateway`, read/join은 chat/channel 게이트웨이)

### JoinSyncPlan 동기화 흐름

`JoinSyncPlan`은 single-join polling plan이다.

1. `run()`에서 `join.get({ id })`로 최신 `JoinView`를 읽는다.
2. 응답 `updatedAt`이 로컬 snapshot보다 최신이면 `onUpdate(target, view, previous)` 호출 → `JoinRepositoryV2.cacheWrite(toDomainJoin(view, scope))`.
3. 대상이 사라지면 `onRemove(target, previous)` → `JoinRepositoryV2.cacheDelete(target.id)`.
4. `join.sync` push가 오면 `onTrigger()`에서 즉시 `join.get` 재조회한다.
5. reconnect 후 `onConnected()`로 snapshot 기준 catch-up 한다.

### 읽음 처리 흐름

읽음 처리는 여전히 `chat.read` command가 주도한다.

```ts
await chat.read({ channelId: 'CH001', chatNo: latestChatNo });
```

의미:

1. 서버의 내 `$join.chatNo`가 전진한다.
2. `JoinRepositoryV2`는 optimistic 하게 read cursor를 먼저 갱신한다.
3. 이후 `join.get`(`JoinSyncPlan`) 또는 `channel.sync` 반영으로 join 스냅샷과 unreadCount 가 확정된다.

즉 unread 감소는 `chat.read` 단일 호출 결과라기보다, `join`(`JoinSyncPlan`)과 `channel` 스냅샷이 다시 만나는 과정에서 확정된다.

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

`ProfileRepositoryV2.syncProfiles(since)`가 이 결과를 해석해 local cache에 upsert / remove한다. `app-runtime/sync`의 `ProfileSyncPlan`이 호출 타이밍을 결정한다.

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

## 관련 문서

- [README.md](README.md) — 동기화 개요·도메인별 방식 표·운영 규칙
- [interface-reference.md](interface-reference.md) — `ClientSocketV2`/runtime 인터페이스, gateway 메서드 표
- [../repositories/README.md](../repositories/README.md) — repository V2의 도메인별 해석
- [../local/README.md](../local/README.md) — local cache 저장/재방출
