# 라이브러리 내부 메커니즘 (ClientSocket Sync)

Date: 2026-06-23

## 0. 이 문서의 범위

이 문서는 `@lemoncloud/chatic-sockets-lib`(소스 리포: `chatic-sockets-api`)의 **v2 클라이언트 동기화 계층**을 코드 기준으로 분석한 레퍼런스다.

- 본문에 등장하는 `src/...` 경로는 **라이브러리 소스 리포(`chatic-sockets-api`)** 기준이다. 이 리포(`chatic-front`)의 경로가 아니다.
- 동기화 시점·orchestration 정책(소유 경계)은 [README.md](README.md)(Sync Domain Spec)가 소유한다. 이 문서는 그 아래에서 도는 **라이브러리 계층의 실제 동작**을 설명한다.
- 앱이 이 라이브러리를 어떻게 소비하는지(register / 수동 콜 / prime)는 [usage.md](usage.md), 게이트웨이 req/res 표는 [gateway-reference.md](gateway-reference.md) 참조.

---

## 1. 아키텍처 — transport와 sync의 분리

라이브러리는 **연결 유지(transport)** 와 **동기화 정책(sync)** 을 엄격히 분리한다.

```txt
UI / Hook
 └ Domain Gateway (chat/channel/device …)   ← 문자열 대신 메서드 호출
   └ ClientSocketV2                          ← mid 기반 request/response, 연결 lifecycle
     ├ SocketTransport / PendingRequestStore / MessageRouter
     ├ KeepAliveLoop      ← system.ping (연결 생존)
     ├ AutoReconnect / ConnectionRotation
     └ SyncScheduler      ← "지금 무엇을 다시 읽을지"
        └ DomainSyncPlan registry (Device / Channel / Chat / Profile / Place / Join …)
```

핵심 경계(코드 확인):

- **`ClientSocketV2`** 는 `domain.action` 요청 → `domain.action:ok|:error` 응답을 `mid`로 매칭만 한다. 도메인 정책을 모른다 (`src/client-socket-v2/types.ts`).
- **`DomainSyncScheduler`** (`src/client-socket-v2/sync-scheduler.ts`)는 `client.onState`로 연결 상태를, `client.onMessage`로 `*.sync` push를 구독한다. **연결 전에는 안 돌고, `connected` 시 자동 시작, `closing/closed` 시 모든 타이머 중지**가 코드에 그대로 있다 (생성자 73-83행, `handleConnected` 169-179행).
- 동기화 전략 차이는 전부 **`DomainSyncPlan`** 구현체에 흡수된다.
- **`SocketRuntime`** (`src/client-socket-v2/socket-runtime.ts`)이 keepAlive + reconnect + rotation + scheduler를 하나의 `timerScheduler`로 묶고, `createDeviceRuntime`이 그 위에 device 기본 동작(연결 시 자동 `device.save`)을 얹는다.

---

## 2. plan은 딱 두 부류다

plan을 읽어보면 구조가 **두 패밀리**로 갈린다. 이것이 동기화 설계의 핵심이다.

| plan        | 버전 축     | `run` (polling)  | 갱신 트리거                | 인증실패(403/404)          | id 필요               |
| ----------- | ----------- | ---------------- | -------------------------- | -------------------------- | --------------------- |
| **Device**  | `tick`      | ✅ `device.read` | `run` 재호출               | **계속 retry** (자기 장치) | ❌ (없으면 현재 연결) |
| **Channel** | `updatedAt` | ✅ `channel.get` | `run` 재호출               | **2회 후 자동 stop**       | ✅                    |
| **Profile** | `updatedAt` | ✅ `profile.get` | `run` 재호출               | 2회 후 자동 stop           | ✅                    |
| **Place**   | `updatedAt` | ✅ `place.get`   | `run` 재호출               | 2회 후 자동 stop           | ✅                    |
| **Join**    | `updatedAt` | ✅ `join.get`    | `run` 재호출 / `join.sync` | 2회 후 자동 stop           | ✅                    |
| **Chat**    | `chatNo`    | ❌ **no-op**     | `onTrigger`로 직접 append  | (해당 없음)                | ✅                    |

→ **Channel/Profile/Place/Join은 거의 동일한 polling+`updatedAt` 템플릿**이고(Join은 v0.3.4 신규), Device는 거기에 `tick`/hint/never-stop 변형, Chat만 완전히 다른 event-driven이다.

### 2-A. Device — tick 비교 기반 pull

단일 `tick` 정수가 버전 축. scheduler가 `intervalMs` 주기로 `run` → `device.read` → tick mismatch면 갱신, **낮은 tick은 무시**(out-of-order 방지). 서버 `device.sync` trigger 수신 시 후속 `device.read`.

### 2-B. Chat — append-only 이벤트 기반 (polling 없음)

`src/client-socket-v2/plans/chat-sync-plan.ts`. `run`은 **no-op**이고 전적으로 이벤트로 동작한다:

| 경로                           | 동작                                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `onTrigger` (`chat.sync` push) | `chatNo === lastNo+1` 이면 payload **직접 append**(서버 재조회 0회). gap이면 그 구간만 `chat.feed`로 메움 |
| `onConnected` (재연결)         | `channel.get`으로 최신 `chatNo` 확인 → `lastNo`~`chatNo` 구간 catch-up                                    |
| 중복/역순                      | `chatNo <= lastNo` 무시 → **idempotent**                                                                  |
| 큰 gap                         | 최신 `cap`(기본 50)개만 채우고 나머지는 앱 lazy-load. 보존은 `maxMessages`(기본 500)                      |

**서버 전제(중요):** 서버 `chat.sync` push의 `data`는 **본문이 포함된 `ChatView`**(fat payload)여야 한다 — `src/lib/chat/types.ts`의 `ChatSyncType` 주석 "nudge 아님". thin nudge로 보내면 라이브 append된 메시지의 `content`가 비게 된다. 이 발행은 메시지 저장 서비스의 책임이며 클라이언트가 보장할 수 없으므로 통합 테스트로 못박아야 한다.

---

## 3. 코드를 읽어야만 보이는 동작들 (함정 모음)

1. **Device만 `device.sync` hint를 선제 송신한다.** `run`마다 `device.read` 전에 마지막 tick을 담은 `device.sync`를 `send()`로 먼저 보낸다(`sendSyncHint` 기본 true). Channel/Chat은 hint를 안 보낸다.

2. **Device는 절대 자동 중지되지 않지만, Channel/Profile/Place는 된다.** Device는 `failurePolicy = { decide: () => 'retry' }`. 나머지는 scheduler 기본 정책을 타서 **403/404가 `gone`으로 분류되고 `stopAfter`(기본 2)회 누적되면 타깃이 자동 stop + `onRemove` 호출**된다. → 앱은 채널/프로필 watch의 `onRemove`를 "권한 상실/삭제됨" 처리로 반드시 연결해야 한다.

3. **idle backoff — polling은 가만 두면 점점 느려진다.** `run`이 snapshot을 안 바꾸면 idle로 간주, 주기를 ×2씩 늘려 최대 60s(device 30s)까지. `*.sync` nudge나 실패가 오면 즉시 리셋. → "channel 폴링이 2s로 시작했는데 점점 느려진다"는 버그가 아니라 의도된 동작. 변화가 생기면 즉시 빨라진다.

4. **`*.sync` push는 같은 도메인 전 타깃에 브로드캐스트된다.** scheduler의 `handleTrigger`는 `type`이 `.sync`로 끝나고 `<domain>.`으로 시작하면 그 도메인의 **모든 등록 타깃**의 `onTrigger`를 호출한다. 채널 필터링은 각 plan이 `data.channelId/id !== target.id`로 직접 한다.

5. **Chat은 자기 자신을 직렬화한다.** scheduler는 `onTrigger`를 직렬화하지 않으므로, ChatSyncPlan이 채널별 promise chain으로 read-modify-write race를 막는다. polling plan들은 scheduler의 `inFlight` 가드로 충분.

6. **Chat 큰 gap 처리 시 snapshot은 "최신 window"만, `lastNo`는 `total`로 점프한다.** cap(50)을 넘는 gap이면 최신 cap개만 받고 `lastNo=total`로 세팅. 그 사이 구간은 snapshot에 없고 앱 lazy-load 영역. **즉 `snapshot.messages`는 신뢰 가능한 전체 이력이 아니며**, 앱은 `onApply`로 받은 메시지를 `chatNo` 키로 자체 store에 누적·중복제거해야 한다(snapshot은 `maxMessages` 500으로 잘림).

7. **`start` 중복 등록은 재시작이 아니라 merge다.** 이미 있는 key면 target 필드만 병합하고 끝. React mount/unmount에서 안심하고 호출 가능. 단 `intervalMs`를 바꾸려고 재호출해도 즉시 재스케줄되진 않는다(다음 tick부터 반영).

---

## 4. 클라이언트 동기화 지침

1. **클라이언트는 `tick`/`chatNo`/`updatedAt`의 소유자가 아니다.** "내가 아는 서버 버전"으로 비교만. 더 낮은 값은 적용 금지.
2. **`<domain>.sync` 송신은 `send()`로** — 응답이 생략될 수 있으므로 `request()` 금지.
3. **상태 갱신은 plan의 `onApply`/`onUpdate` 콜백에만 반영.** scheduler가 snapshot 변화 여부로 idle을 판단하므로, UI는 plan이 주는 델타만 머지하고 `chatNo`/`updatedAt`로 중복 제거.
4. **재연결 후 자동 catch-up을 신뢰**하되, **연결이 끊기지 않은 채 단발 push 유실 + 후속 메시지 없음**은 자동 보정 안 됨. 채팅에서 이 코너가 신경 쓰이면 저빈도 watchdog(주기적 `channel.get`으로 `chatNo`만 비교 → mismatch면 catch-up)을 옵션으로 둔다.
5. **에러 분기는 `errorCode`(숫자) 우선, 없으면 `:error` suffix 폴백.** scheduler는 `403/404`를 `gone`으로 분류해 폴링 plan을 자동 중지한다 — 앱은 `onRemove`를 "권한 없음/삭제됨" UI로 대응.
6. **중복 `startSync`는 no-op/merge.** 같은 대상에 job 1개만 유지 — 화면 mount/unmount에서 안심하고 호출.
7. **Chat은 `run`이 no-op이므로 화면 진입 초기 로딩은 앱이 명시적으로 한다** (`channel.get` + `chat.feed` 1페이지 → `updateLocalSnapshot`으로 baseline 주입).

---

## 5. 사용 예제 (chat · channel)

export 표면(`src/client-socket-v2/index.ts`) 기준 — `createClientSocketV2`(default), `createDeviceRuntime`, `ChannelSyncPlan`, `ChatSyncPlan`, gateway 팩토리들이 모두 공개돼 있다.

### 5-A. 통합 런타임 부팅 (device + channel + chat)

```ts
import createClientSocketV2, {
    createDeviceRuntime,
    ChannelSyncPlan,
    ChatSyncPlan,
    createChatGateway,
    createChannelGateway,
} from '@lemoncloud/chatic-sockets-lib';
import type { ChannelView, ChatView } from '@lemoncloud/chatic-socials-api';

// 1) transport
const client = createClientSocketV2({
    url: 'wss://example.com/dev?v2',
    device: { id: 'device-web-001', name: 'Chrome', platform: 'web' },
    requestTimeoutMs: 10_000,
});

// 2) 앱 store (zustand/redux 등). chatNo·updatedAt 기준 정합성만 책임진다.
const chatStore = createChatStore(); // 아래 5-C
const channelStore = createChannelStore();

// 3) runtime = transport + keepAlive + reconnect + rotation + scheduler(+plans)
const runtime = createDeviceRuntime({
    client,
    keepAliveOptions: { intervalMs: 30_000, timeoutMs: 5_000 },
    reconnectOptions: { minDelayMs: 500, maxDelayMs: 10_000 },
    extraSyncPlans: [
        new ChannelSyncPlan({
            // updatedAt이 바뀐 채널 메타만 들어온다 (이름/멤버/chatNo 등)
            onUpdate: (target, view: ChannelView) => channelStore.upsert(target.id!, view),
            // 403/404 2회 → 자동 stop. 권한 상실/삭제 처리.
            onRemove: target => channelStore.markGone(target.id!),
        }),
        new ChatSyncPlan({
            cap: 50, // 재연결 catch-up 1회 최대 50건, 그 아래는 lazy-load
            maxMessages: 500, // snapshot window 상한 (앱은 자체 full 이력 보관)
            // applied = 오름차순 델타, snapshot.lastNo = 최신 chatNo
            onApply: (target, applied, snapshot) => {
                chatStore.appendMany(target.id!, applied); // chatNo로 중복 제거
                chatStore.setLastNo(target.id!, snapshot.lastNo);
            },
            onRemove: target => chatStore.detach(target.id!),
        }),
    ],
});

await runtime.start(); // connect + 자동 device.save + scheduler 가동

// 게이트웨이는 "쓰기/조회"용 (sync와 별개)
const chat = createChatGateway(client);
const channel = createChannelGateway(client);
```

### 5-B. 채널 화면 진입/이탈 — sync 타깃 생명주기

```ts
// 채널 진입: 메타(channel) + 메시지(chat) 두 타깃을 함께 켠다
function enterChannel(channelId: string) {
    runtime.startSync({ type: 'channel', id: channelId, intervalMs: 3_000 });
    runtime.startSync({ type: 'chat', id: channelId });
    void primeChannel(channelId); // 최초 화면은 직접 채운다 (chat.run은 no-op)
}

// 채널 이탈: 두 타깃 모두 끈다 (timer 중지 + snapshot 폐기 + onRemove)
function leaveChannel(channelId: string) {
    runtime.stopSync({ type: 'chat', id: channelId });
    runtime.stopSync({ type: 'channel', id: channelId });
}

// 최초 진입 시 과거 메시지 1페이지 + 최신 chatNo로 baseline을 잡는다.
async function primeChannel(channelId: string) {
    const view = await channel.get<ChannelView>({ id: channelId });
    const page = await chat.feed<{ list?: ChatView[] }>({ channelId, limit: 50 });
    chatStore.appendMany(channelId, (page.list ?? []).slice().reverse());
    chatStore.setLastNo(channelId, view.chatNo ?? 0);
    // scheduler에 "내가 아는 최신 chatNo"를 알려 catch-up 기준선을 맞춘다
    runtime.updateLocalSnapshot(
        { type: 'chat', id: channelId },
        { id: channelId, lastNo: view.chatNo ?? 0, minNo: 0, messages: [] }
    );
}
```

### 5-C. 메시지 전송과 store (idempotent 머지)

```ts
// 전송: gateway.send만 호출. 본인/타인 화면 반영은 서버의 chat.sync push로 통일한다.
async function sendMessage(channelId: string, content: string) {
    // 서버가 audience(본인 포함)에 chat.sync(fat payload)를 push → onApply에서 자동 반영.
    await chat.send<ChatView>({ channelId, content });
    // ※ 낙관적 표시가 필요하면 tempId로 먼저 그리고, chatNo 도착 시 교체.
}

// store: 동기화 정합성의 마지막 방어선은 "chatNo로 중복 제거"다.
function createChatStore() {
    const byChannel = new Map<string, Map<number, ChatView>>();
    const lastNo = new Map<string, number>();
    return {
        appendMany(channelId: string, msgs: ChatView[]) {
            const m = byChannel.get(channelId) ?? new Map<number, ChatView>();
            for (const c of msgs) if (typeof c.chatNo === 'number') m.set(c.chatNo, c); // idempotent
            byChannel.set(channelId, m);
            render(
                channelId,
                [...m.values()].sort((a, b) => a.chatNo! - b.chatNo!)
            );
        },
        setLastNo: (channelId: string, no: number) => lastNo.set(channelId, no),
        detach: (channelId: string) => {
            byChannel.delete(channelId);
            lastNo.delete(channelId);
        },
    };
}
```

### 5-D. React 훅으로 감싼 형태

```ts
function useChannelMessages(channelId: string) {
    useEffect(() => {
        enterChannel(channelId);
        return () => leaveChannel(channelId); // unmount = 타깃 해제
    }, [channelId]);
    return useChatStore(s => s.messages[channelId] ?? []);
}
```

**핵심 규칙 요약**: ① 쓰기는 gateway, 반영은 sync push로 일원화 → 본인/타인 경로 통일 ② 화면 진입 시 `startSync` + 명시적 `prime`(chat plan.run은 no-op), 이탈 시 `stopSync` ③ store는 `chatNo`/`updatedAt` 키로 idempotent 머지 ④ `onRemove`를 권한상실 UI에 연결.

---

## 6. 종합 평가 / 개선 여지

- 추상화 경계가 깔끔하다. scheduler는 도메인 무지(domain-agnostic)이고 모든 차이가 plan에 격리돼 있어, 신규 polling 도메인은 `ChannelSyncPlan`을 복붙해 `.get`/`updatedAt`만 바꾸면 된다.
- **개선 여지 1**: 폴링 plan 4종(channel/profile/place + 향후)이 거의 동일 코드 중복 → 공통 `createVersionedPlan({ domain, request, versionOf })` 팩토리로 줄일 여지가 크다.
- **개선 여지 2**: Chat은 polling이 없어, "연결은 살아있는데 단발 push 유실 + 후속 메시지 없음"이면 다음 메시지/재연결 전까지 영구 누락. 필요 시 저빈도 chat watchdog 옵션 검토.
- **서버 계약 의존**: chat 라이브 append는 서버가 `chat.sync`에 본문 포함 fat payload를 채널 audience로 push한다는 전제에 100% 의존한다. 통합 테스트로 고정 필요.

---

## 7. 관련 문서

- [README.md](README.md) — sync 도메인 스펙(소유 경계, SyncManager)
- [usage.md](usage.md) — 앱 사용 패턴(register / 수동 콜 / prime)
- [gateway-reference.md](gateway-reference.md) — 게이트웨이 요청/응답 레퍼런스
