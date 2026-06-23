# ClientSocket 클라이언트 사용 가이드 (Sync 운용)

Date: 2026-06-23

## 0. 이 문서의 범위

`@lemoncloud/chatic-sockets-lib`(client SDK)를 **클라이언트에서 실제로 어떻게 쓰는가**에 집중한다. 내부 메커니즘·plan 코드 분석은 [clientsocket-sync-guide.md](clientsocket-sync-guide.md)를 참고. 이 문서는 "무엇을 import하고, 언제 어떤 메서드를 부르는가"를 다룬다.

- plan/gateway/runtime은 모두 **`@lemoncloud/chatic-sockets-lib`** 가 export한다(서버용 `chatic-sockets-api`와 다름).
- 동기화에는 두 층위가 있다 — **자동(Scheduler/Plan)** 과 **수동(gateway `.sync`/`.get`)**. 이름이 둘 다 'sync'라 헷갈리므로 §2에서 구분한다.

---

## 1. import 표면

전부 named export다. default는 `createClientSocketV2`.

```ts
import createClientSocketV2, {
    // 런타임 조립
    createDeviceRuntime,
    SocketRuntime,
    DomainSyncScheduler,
    // 이미 구현된 plan 클래스
    DeviceSyncPlan,
    ChannelSyncPlan,
    ChatSyncPlan,
    ProfileSyncPlan,
    PlaceSyncPlan,
    // gateway 팩토리
    createChatGateway,
    createChannelGateway,
    createProfileGateway,
    createPlaceGateway,
    createDeviceGateway,
} from '@lemoncloud/chatic-sockets-lib';

import type {
    ChatSyncPlanOptions,
    ChannelSyncPlanOptions,
    DeviceSyncPlanOptions,
    SyncTargetDescriptor,
    DomainSyncPlan,
    DomainSyncContext,
    SyncBackoffOptions,
    SyncFailurePolicy,
    ClientSocketOptions,
    ClientSocketV2,
} from '@lemoncloud/chatic-sockets-lib';
```

> 버전 주의: 응답 View 등 일부 타입은 패치 버전 간 달라질 수 있다. 사용 전 `node_modules/@lemoncloud/chatic-sockets-lib/dist/client-socket-v2/index.d.ts`의 실제 export를 확인.

---

## 2. 핵심 개념 — "자동 동기화" vs "수동 sync"

`sync`라는 단어가 두 곳에 쓰인다. 반드시 구분한다.

| 구분                       | 수동?   | 정체                                                         | 트리거         |
| -------------------------- | ------- | ------------------------------------------------------------ | -------------- |
| **Scheduler / SyncPlan**   | ❌ 자동 | `startSync` 한 번이면 이후 polling·push·재연결을 알아서 유지 | 연결/주기/push |
| **gateway `.sync` 메서드** | ✅ 수동 | `since` 커서 기반 delta 조회 / 통지 RPC                      | 앱이 직접 호출 |

- **자동으로 계속 유지** → `startSync` + plan.
- **원할 때 한 번 따라잡기** → gateway `.get`/`.feed`, delta가 필요하면 `.sync`.

문서에 "자동동기화"라는 고유 명칭은 없지만(grep 결과 없음), 개념은 `SyncScheduler` 기반으로 명확히 존재한다("연결 유지 중 scheduler가 자동으로 필요한 sync 호출을 수행").

---

## 3. `startSync`의 의미

```ts
runtime.startSync({ type: 'channel', id: 'CH001', intervalMs: 3000 });
```

"이 `type + id` 대상을 **자동 동기화 watch 목록에 등록**" 하라는 등록 행위다. 데이터를 직접 리턴하지 않는다(`void`).

내부 동작 (`DomainSyncScheduler.start`):

1. `type`을 지원하는 plan을 찾는다(`channel` → `ChannelSyncPlan`).
2. `type+id`를 key로 등록(예: `channel:CH001`).
3. 연결돼 있으면 즉시 1회 실행, 연결 전이면 연결되는 순간 자동 시작.
4. 이후 자동: 주기 polling + 서버 push 반응 + 재연결 catch-up.

- 등록 안 된 `type`으로 호출하면 throw: `404 NOT FOUND - sync plan[xxx]`.
- 중복 `startSync`는 재시작이 아니라 merge(타깃 1개 유지). React mount/unmount에서 안전.
- 갱신 데이터는 `startSync`가 아니라 **plan 콜백**(`onUpdate`/`onApply`)으로 들어온다.

---

## 4. plan 등록 방법

plan은 **runtime 생성 시 1회** 등록한다. 인스턴스에 콜백을 붙여 넣는다.

```ts
const runtime = createDeviceRuntime({
    client,
    // DeviceSyncPlan은 자동 포함. 나머지는 여기에 인스턴스로.
    extraSyncPlans: [
        new ChannelSyncPlan({ onUpdate: (t, v) => channelStore.upsert(t.id!, v) }),
        new ChatSyncPlan({ onApply: (t, applied) => chatStore.appendMany(t.id!, applied) }),
    ],
});
```

device 자동동작이 필요 없으면 `SocketRuntime`을 직접 만들고 `syncPlans`에 전부 나열한다.

매칭 규칙: scheduler는 `startSync(target)`이 오면 등록된 plan 중 `supports(target)`가 true인 첫 번째를 고른다 → **`type`당 plan 1개**. plan 인스턴스 하나가 같은 type의 여러 id 타깃을 동시에 처리한다(채널별 snapshot은 scheduler가 `type+id` key로 관리).

등록은 2단계로 이해한다:

1. **앱 시작 시 1회** — `extraSyncPlans`에 plan 인스턴스 등록 (= 이 type 처리 능력 등록).
2. **화면별 N회** — `startSync({ type, id })`로 watch 대상 on (= 그 능력으로 이 대상 동기화 시작).

---

## 5. plan 동작 타이밍 (도메인별)

등록된 plan은 scheduler가 잡는 **4개 시점**에서 자동 호출된다.

| 시점                              | 호출 훅                          |
| --------------------------------- | -------------------------------- |
| 연결/재연결 (state→connected)     | `onConnected()` → 이어서 `run()` |
| 주기 도래 (interval)              | `run()`                          |
| `<domain>.sync` push 수신         | `onTrigger()`                    |
| 연결 끊김 / 자동 stop             | (stop 시) `onStopped()`          |
| 앱이 `updateLocalSnapshot()` 호출 | `updateLocalState()`             |

주기 간격 = `target.intervalMs ?? plan.getIntervalMs() ?? 5000` → 실패 시 backoff, 변화 없으면 idle backoff로 감속, ±10% jitter.

### 도메인별 각 시점 동작

| 시점        | Device                                                    | Channel (Profile·Place 동일)              | Chat                                                    |
| ----------- | --------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------- |
| onConnected | snapshot 비움                                             | snapshot 비움                             | `channel.get`+`chat.feed`로 catch-up                    |
| run (주기)  | `device.sync` hint → `device.read` → tick 비교 → onUpdate | `channel.get` → updatedAt 비교 → onUpdate | **no-op**                                               |
| 기본 주기   | 2000ms (idle→30s)                                         | 2000ms (idle→60s)                         | (run 비어 polling 없음)                                 |
| onTrigger   | `device.sync` 수신 → run                                  | `channel.sync` 수신 → run                 | `chat.sync` 수신 → chatNo 연속이면 append, gap이면 feed |
| 실패 정책   | 자동 stop 안 함(항상 retry)                               | 403/404 2회 → 자동 stop → onRemove        | (no-op, 실패 경로 없음)                                 |

핵심:

- **Channel/Device/Profile/Place = 자동 polling 도메인**(연결+주기+push 모두 동작).
- **Chat = event-driven**(연결 catch-up + push append만, 주기 polling 없음). 연결 유지 중 단발 push 유실 시 다음 메시지/재연결 전까지 자동 보정 안 됨.

---

## 6. 타이밍 변경 옵션 (plan 코드 수정 불필요)

| 바꾸고 싶은 것          | 어디서                                             | 비고                                 |
| ----------------------- | -------------------------------------------------- | ------------------------------------ |
| 특정 대상만 주기 다르게 | `startSync({ intervalMs })`                        | 최우선. 변경은 다음 tick 반영        |
| 도메인 기본 주기        | plan 생성자 `intervalMs`                           | Chat은 무의미(run no-op)             |
| 변화 없을 때 감속/끄기  | plan/runtime `idleBackoff`                         | `factor: 1`이면 감속 끔(일정 주기)   |
| 실패 시 재시도 주기     | runtime `syncBackoff`                              | 기본 ×2, 최대 30s                    |
| 언제 자동 중지          | `failurePolicy`(plan/scheduler)                    | `stopAfter`, `classify`, `decide`    |
| 재연결 시 full vs delta | `resetSnapshotOnConnected`                         | 기본 true(비우고 full)               |
| jitter/타이머 엔진      | `DomainSyncScheduler` 직접 주입                    | `SocketRuntime`은 jitterRatio 미노출 |
| Chat catch-up 한도      | `ChatSyncPlanOptions.cap`(50) / `maxMessages`(500) |                                      |

수동 제어: `stopSync`/`startSync`(일시정지·재개), `updateLocalSnapshot`(기준선 갱신). **즉시 강제 1회 실행 공개 API는 없음** — 필요하면 gateway 직접 콜 또는 stop+start.

---

## 7. sync 이벤트 종류 (gateway 메서드 기준)

### A. 클라이언트 → 서버 : `.sync` gateway 메서드 (수동 delta 요청)

| gateway 메서드             | action               | 요청                         | 응답                      |
| -------------------------- | -------------------- | ---------------------------- | ------------------------- |
| `channelGateway.sync`      | `channel.sync`       | `{ since? }`                 | `ChannelSyncView`         |
| `channelGateway.syncUsers` | `channel.sync-users` | `{ channelId, since? }`      | `ChannelUsersSyncView`    |
| `profileGateway.sync`      | `profile.sync`       | `{ since? }`                 | `SiteProfileSyncView`     |
| `deviceGateway.sync`       | `device.sync`        | `{ id?, tick?, viewing... }` | **void**(fire-and-forget) |

`ChannelSyncView` = `{ list: ChannelView[](변경분), ids: string[](활성 채널 전체-삭제감지), syncedAt }`.

### B. 서버 → 클라이언트 : `.sync` push (재동기화 트리거, plan이 받음)

| push 이벤트    | data                           | plan            | 동작                                 |
| -------------- | ------------------------------ | --------------- | ------------------------------------ |
| `chat.sync`    | **ChatView**(본문 fat payload) | ChatSyncPlan    | chatNo 연속이면 append, gap이면 feed |
| `channel.sync` | `{ id? }` nudge                | ChannelSyncPlan | `channel.get` 재조회                 |
| `device.sync`  | `{ id? }` nudge                | DeviceSyncPlan  | `device.read` 재조회                 |
| `profile.sync` | `{ id? }` nudge                | ProfileSyncPlan | `profile.get` 재조회                 |
| `place.sync`   | `{ id? }` nudge                | PlaceSyncPlan   | `place.get` 재조회                   |

차이: `chat.sync`만 데이터를 담은 push(받으면 바로 append), 나머지는 "다시 읽어라" nudge.

---

## 8. 수동 콜 / A 호출의 동작 규칙

1. **gateway 콜은 scheduler와 독립**이다. 아무 때나 `.get`/`.feed`/`.send`/`.sync`를 직접 불러도 plan은 영향받지 않는다.
2. **A(`.sync` 등) 호출은 plan `onTrigger`로 전파되지 않는다.** 응답 type이 `<domain>.sync:ok`라 scheduler의 trigger 필터(`.endsWith('.sync')`)를 통과하지 못한다. `onTrigger`는 오직 **서버가 보낸 bare `<domain>.sync` push(B)** 에서만 발화.
3. A 호출 시 **응답 delta는 호출부 Promise로만 온다.** plan snapshot은 갱신되지 않고, plan 콜백(`onUpdate` 등)도 자동으로 불리지 않는다.
4. `channel.sync`(목록 delta)와 `ChannelSyncPlan`(단일 채널 유지)은 **granularity가 다르다** — 자동 연결되지 않는다.
5. 수동 콜이 plan이 watch 중인 모델의 최신본을 가져왔고 plan 기준선도 맞추고 싶으면, 콜 후 `updateLocalSnapshot(target, snapshot)`을 직접 호출한다(중복 onUpdate/불필요한 catch-up 방지).

### A delta 반영 표준 패턴 (since 커서 루프)

```ts
const delta = await channelGateway.sync<ChannelSyncView>({ since: lastSyncedAt });
for (const ch of delta.list) channelStore.upsert(ch.id!, ch); // 변경분 머지
channelStore.retainOnly(delta.ids); // ids에 없으면 삭제
lastSyncedAt = delta.syncedAt; // 다음 since 기준선 저장
```

첫 호출은 `since` 생략/0 → 전체, 이후는 직전 `syncedAt` → 변경분만. `profile.sync`도 동일(`profiles[uid] === null`이면 cache 제거).

---

## 9. 클라이언트 사용 표준 패턴 (4단계)

### 1) 부팅 1회 — client + runtime + plan 등록

```ts
import createClientSocketV2, {
    createDeviceRuntime,
    ChannelSyncPlan,
    ChatSyncPlan,
    createChatGateway,
    createChannelGateway,
} from '@lemoncloud/chatic-sockets-lib';
import type { ChannelView, ChatView } from '@lemoncloud/chatic-socials-api';

const client = createClientSocketV2({
    url: 'wss://example.com/dev?v2',
    device: { id: 'device-web-001', name: 'Chrome', platform: 'web' },
});

const runtime = createDeviceRuntime({
    client,
    extraSyncPlans: [
        new ChannelSyncPlan({
            onUpdate: (t, v: ChannelView) => channelStore.upsert(t.id!, v),
            onRemove: t => channelStore.markGone(t.id!),
        }),
        new ChatSyncPlan({
            onApply: (t, applied) => chatStore.appendMany(t.id!, applied), // chatNo dedupe
        }),
    ],
});

await runtime.start();

export const socket = {
    client,
    runtime,
    chat: createChatGateway(client),
    channel: createChannelGateway(client),
};
```

### 2) 화면 진입/이탈 — watch on/off

```ts
function openChannel(channelId: string) {
    socket.runtime.startSync({ type: 'channel', id: channelId, intervalMs: 3000 });
    socket.runtime.startSync({ type: 'chat', id: channelId });
    void primeChannel(channelId); // chat은 run이 no-op이므로 진입 초기 로딩은 직접
}

function closeChannel(channelId: string) {
    socket.runtime.stopSync({ type: 'chat', id: channelId });
    socket.runtime.stopSync({ type: 'channel', id: channelId });
}

async function primeChannel(channelId: string) {
    const ch = await socket.channel.get<ChannelView>({ id: channelId });
    const page = await socket.chat.feed<{ list?: ChatView[] }>({ channelId, limit: 50 });
    chatStore.appendMany(channelId, (page.list ?? []).slice().reverse());
    socket.runtime.updateLocalSnapshot(
        { type: 'chat', id: channelId },
        { id: channelId, lastNo: ch.chatNo ?? 0, minNo: 0, messages: [] }
    );
}
```

### 3) 읽기 — 콜백 → store → UI 구독

갱신 데이터는 `request` 리턴이 아니라 plan 콜백(`onUpdate`/`onApply`)으로 store에 들어온다. UI는 store만 구독한다.

### 4) 쓰기 — gateway 호출, 반영은 push로 통일

```ts
async function send(channelId: string, content: string) {
    await socket.chat.send({ channelId, content });
    // 내 화면도 서버 chat.sync push → onApply로 append (본인·타인 경로 일원화).
    // 즉시 표시가 필요하면 tempId 낙관적 렌더 후 chatNo 도착 시 교체.
}
```

### React 훅 예시

```ts
function useChannelRoom(channelId: string) {
    useEffect(() => {
        openChannel(channelId);
        return () => closeChannel(channelId); // unmount = watch 해제
    }, [channelId]);
    return chatStore.useSelector(s => s.byChannel[channelId] ?? []);
}
```

---

## 9-A. 이 리포(app-runtime) 통합 — `AppSyncRuntime`

`libs/app-runtime`는 위 lib을 직접 노출하지 않고 `AppSyncRuntime`(`src/socket/sync/`)으로 감싼다. UI/앱은 `getAppSyncRuntime()`의 register\* 메서드만 쓴다.

- **plan 등록**: `src/socket/sync/plans.ts`의 `createSyncPlans()`가 5종 plan을 만들고 각 콜백을 **data 레이어 repository**에 연결한다.
    - `device` → (캐시 미연결, 기본 동작)
    - `channel` → `onUpdate`/`onRemove` → `channel.cacheWrite` / `cacheDelete`
    - `place` → `place.cacheWrite` / `cacheDelete`
    - `profile` → `profile.cacheWrite` / `cacheDelete`
    - `chat` → `onApply` → `chat.cacheWriteMany(applied.map(toDomainChat))` (chatNo 기준 idempotent 머지, `onRemove` 없음 — 이력 보존)
- **watch on/off**: `registerDevice` / `registerChannel` / `registerChat` / `registerPlace` / `registerProfile`. 모두 ref-count되며 dispose 함수를 반환한다(중복 register 안전, 마지막 dispose 시 `stopSync`).

```ts
import { getAppSyncRuntime } from '@chatic/app-runtime';

const sync = getAppSyncRuntime();
const off = sync.registerChat('CH001'); // 채널 진입
// ...
off(); // 채널 이탈 (ref-count 0이면 stopSync)
```

- 갱신 데이터는 콜백 → repository cache → `observeList`/`observeItem` 스트림으로 UI에 흐른다(UI는 네트워크 콜 직접 안 함, [README.md](README.md) 원칙).
- client 재생성(재로그인/재연결) 시 `AppSyncRuntime`이 등록된 target을 새 runtime에 자동 replay한다.

---

## 10. 4규칙 요약

1. **부팅 1회**: `createClientSocketV2` → `createDeviceRuntime({ extraSyncPlans: [콜백 붙인 plan] })` → `runtime.start()`.
2. **화면별**: `startSync`/`stopSync`로 watch on/off (chat은 진입 시 `prime` 1회 추가).
3. **읽기**: plan 콜백 → store → UI 구독 (request 리턴값 아님).
4. **쓰기**: gateway 호출, 화면 반영은 push가 담당.

플랜 코드 자체를 고칠 필요는 없다 — 타이밍/전략은 plan 생성 옵션 + `startSync` 인자 + runtime 옵션으로 조정한다.
