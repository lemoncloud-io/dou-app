# Sync 사용 패턴 (app-runtime)

> 앱/UI가 동기화를 **어떻게 사용하는가**를 다룬다. 무엇을 register하고, 언제 수동 gateway 콜을 쓰고, chat을 어떻게 prime하는가.
>
> - 소유 경계·SyncManager 책임 → [README.md](README.md)
> - 라이브러리 내부 동작(plan 패밀리·트리거 시점·함정) → [library-internals.md](library-internals.md)
> - 게이트웨이 요청/응답 타입 표 → [gateway-reference.md](gateway-reference.md)

---

## 1. 두 개념 — 자동 유지(register) vs 수동 콜(gateway)

`sync`라는 단어가 두 곳에 쓰인다. 반드시 구분한다.

| 구분                       | 수동?   | 정체                                                        | 트리거         |
| -------------------------- | ------- | ----------------------------------------------------------- | -------------- |
| **register / SyncPlan**    | ❌ 자동 | `register` 한 번이면 이후 polling·push·재연결을 알아서 유지 | 연결/주기/push |
| **gateway `.sync` 메서드** | ✅ 수동 | `since` 커서 기반 delta 조회 / 통지 RPC                     | 앱이 직접 호출 |

- **자동으로 계속 유지** → `register*` (ref-count + plan; 시작/정지는 내부 private).
- **원할 때 한 번 따라잡기(목록 발견·델타)** → gateway `.get`/`.feed`/`.sync` 직접 콜.
- 둘은 granularity가 달라 **자동 연결되지 않는다**. `updateLocalSnapshot`/repository cache로만 만난다(§4).

### 모듈 사용 의도 5원칙 (라이브러리 스펙 요약)

1. **동기화의 1급 단위는 `type+id` sync target 등록**이다. register 한 번이면 scheduler가 연결 동안 poll + push + reconnect catch-up을 자동 유지한다.
2. **plan은 도메인 전략**이다. 부팅 시 1회 등록(`type`당 1개), 콜백(`onUpdate`/`onApply`/`onRemove`)으로 결과를 repository에 반영한다.
3. **gateway `.sync(since)` 수동 콜은 scheduler와 독립한 "보완 catch-up"**이다. 목록 발견·델타에 쓰며 plan onTrigger로 전파되지 않는다(응답이 `:ok`라 push 필터를 통과 못 함).
4. **`updateLocalSnapshot`이 등록 sync와 수동 콜을 잇는 다리**다. 수동/초기 로딩 후 plan 기준선(`tick`/`updatedAt`/`lastNo`)을 맞춰 중복 catch-up을 막는다.
5. **register=focused, gateway=manual**.

> plan이 어떤 시점(연결/주기/push/stop)에 자동 호출되는지, 도메인별 동작 차이는 [library-internals.md](library-internals.md) 참조.

---

## 2. app-runtime 통합 — `SyncManager`

`libs/app-runtime`는 라이브러리를 직접 노출하지 않고 `SyncManager`(`src/socket/sync/`)로 감싼다. UI/앱은 `getSyncManager()`(또는 `useSyncTarget` 계열 훅)의 `register*` 메서드만 쓴다. (`getSocketRuntime`은 **export하지 않는다** — 매니저는 `getSyncManager()`로 접근.)

```ts
import { getSyncManager } from '@chatic/app-runtime';

const sync = getSyncManager();
const off = sync.registerChat('CH001'); // 채널 진입
// ...
off(); // 채널 이탈 (ref-count 0이면 내부 stopTarget)
```

- `register*`는 모두 **ref-count + dispose 반환**(중복 register 안전, 마지막 dispose 시 내부 `stopTarget`).
- client 재생성(재로그인/재연결) 시 `SyncManager`가 등록 target을 새 runtime에 자동 replay한다.
- 갱신 데이터는 콜백 → repository cache → `observeList`/`observeItem` 스트림으로 UI에 흐른다. **UI는 네트워크 콜을 직접 하지 않는다**([README.md](README.md) 원칙).

### plan 주입 — 부팅 1회

[`plans.ts`](../../../src/socket/sync/plans.ts)의 `createSyncPlans()`가 앱 도메인 plan을 1회 생성하고 콜백을 **data 레이어 repository**에 연결한다(`extraSyncPlans`로 주입). **`device` plan은 여기서 만들지 않는다** — `createDeviceRuntime`가 자체 주입한다:

| plan    | 콜백 → repository                                                                 |
| ------- | --------------------------------------------------------------------------------- |
| device  | (createDeviceRuntime가 주입, 캐시 미연결·연결 유지용)                             |
| channel | `onUpdate`/`onRemove` → `channel.cacheWrite`/`cacheDelete`                        |
| place   | → `place.cacheWrite`/`cacheDelete`                                                |
| profile | → `profile.cacheWrite`/`cacheDelete`                                              |
| chat    | `onApply` → `chat.cacheWriteMany`(chatNo idempotent, `onRemove` 없음 — 이력 보존) |
| join    | `onUpdate`/`onRemove` → `join.cacheWrite`/`cacheDelete` (v0.3.4 `JoinSyncPlan`)   |

> 등록은 2단계다: ① **앱 시작 시 1회** plan 인스턴스 등록(= 이 type 처리 능력 등록), ② **화면별 N회** `register*`로 watch 대상 on(= 그 능력으로 이 대상 동기화 시작).

---

## 3. 도메인별 "무엇을 register / 무엇을 수동 콜"

| 도메인           | register (자동 유지)                                                              | 수동 gateway 콜 (보완)                                                                                 |
| ---------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **chat**         | 열린 방 1개 (`registerChat`) — focused                                            | 초기 prime(§3.1), `loadMore`(과거 페이지)                                                              |
| **channel**      | (a) 열린 방 메타 (`registerChannel`) (b) **목록의 보이는 채널 전부**(per-channel) | `channel.sync(since)` 목록 발견·델타 — 재접속/sid 변경 시                                              |
| **place**        | **목록의 보이는 place 전부**(per-place, `registerPlace`) — channel과 동일 모델    | `place.refreshList`(=`user.my-site`, full) 목록 발견 — **place엔 `.sync(since)` 델타 게이트웨이 없음** |
| **profile/join** | (예정) 화면 lifecycle                                                             | —                                                                                                      |
| **device**       | 현재 연결                                                                         | —                                                                                                      |

핵심: **register(다중 채널/place 구독 포함)가 동기화의 원칙**이고, **목록 "발견"·삭제 동기화는 gateway 수동 콜**이 담당한다.

### 3.1 chat 초기 로딩 (prime)

chat은 `run`이 no-op이라 **세션 중 방 진입 시 register만으로는 아무것도 안 불러온다**. 앱이 초기 prime + `updateLocalSnapshot`을 한다.

- chat 캐시는 **영구 보존 + `chatNo` 정렬** → 재진입 시 캐시가 즉시 표시되고, **캐시의 max chatNo가 곧 동기화 커서**다(별도 meta 커서 불필요).
- prime 규칙:
    - 캐시 비어있음 → 첫 페이지 fetch(`chat.feed`).
    - `channel.get`의 서버 최신 chatNo > 캐시 max → 그 구간만 catch-up.
    - 최신 → fetch 생략.
- **어느 경우든 `updateLocalSnapshot({ lastNo: 캐시 max chatNo })`로 plan 기준선을 세운다.**

> ✅ prime 소유 (2026-06-29): prime은 `useChatSync` 훅이 소유한다 — 캐시 max chatNo로 `updateLocalSnapshot`을 호출하고, 캐시가 비었을 때만 첫 페이지를 fetch한다. `SyncManager`는 도메인 무지한 `updateLocalSnapshot` pass-through만 제공한다. 분업 상세는 [chat-sync.md](chat-sync.md).

---

## 4. `updateLocalSnapshot` — 기준선 다리 (필수)

수동 gateway 콜이나 초기 로딩으로 최신 모델을 받았으면, **반드시 `updateLocalSnapshot(target, snapshot)`으로 plan 기준선을 맞춘다**. 안 그러면 다음 `onConnected`/`run`이 `0` 기준으로 중복 catch-up한다.

- device → `{ tick }`, channel/place/profile/join → `{ updatedAt }` 류, chat → `{ lastNo, minNo, messages }`.

### 수동 콜 동작 규칙

1. **gateway 콜은 scheduler와 독립**이다. 아무 때나 `.get`/`.feed`/`.send`/`.sync`를 직접 불러도 plan은 영향받지 않는다.
2. **`.sync` 등 수동 콜은 plan `onTrigger`로 전파되지 않는다** — 응답 type이 `:ok`라 trigger 필터(`.endsWith('.sync')`)를 통과 못 한다. `onTrigger`는 오직 서버가 보낸 bare `<domain>.sync` push에서만 발화.
3. 수동 콜 응답 delta는 **호출부 Promise로만** 온다. plan snapshot/콜백은 자동으로 갱신되지 않는다.
4. 수동 콜이 plan watch 모델의 최신본을 가져왔고 기준선도 맞추고 싶으면, 콜 후 `updateLocalSnapshot`을 직접 호출한다(중복 onUpdate/불필요한 catch-up 방지).

#### `.sync` delta 반영 표준 패턴 (since 커서 루프)

```ts
const delta = await channelGateway.sync<ChannelSyncView>({ since: lastSyncedAt });
for (const ch of delta.list) channelStore.upsert(ch.id!, ch); // 변경분 머지
channelStore.retainOnly(delta.ids); // ids에 없으면 삭제
lastSyncedAt = delta.syncedAt; // 다음 since 기준선 저장
```

첫 호출은 `since` 생략/0 → 전체, 이후는 직전 `syncedAt` → 변경분만. `profile.sync`도 동일(`profiles[uid] === null`이면 cache 제거).

---

## 5. 타이밍 변경 옵션 (plan 코드 수정 불필요)

| 바꾸고 싶은 것          | 어디서                                             | 비고                               |
| ----------------------- | -------------------------------------------------- | ---------------------------------- |
| 특정 대상만 주기 다르게 | register target의 `intervalMs`                     | 최우선. 변경은 다음 tick 반영      |
| 도메인 기본 주기        | plan 생성자 `intervalMs`                           | Chat은 무의미(run no-op)           |
| 변화 없을 때 감속/끄기  | plan/runtime `idleBackoff`                         | `factor: 1`이면 감속 끔(일정 주기) |
| 실패 시 재시도 주기     | runtime `syncBackoff`                              | 기본 ×2, 최대 30s                  |
| 언제 자동 중지          | `failurePolicy`(plan/scheduler)                    | `stopAfter`, `classify`, `decide`  |
| 재연결 시 full vs delta | `resetSnapshotOnConnected`                         | 기본 true(비우고 full)             |
| Chat catch-up 한도      | `ChatSyncPlanOptions.cap`(50) / `maxMessages`(500) |                                    |

수동 제어: `register`/dispose(등록·해제), `updateLocalSnapshot`(기준선 갱신). start/stop은 ref-count 내부 동작이라 공개 API가 아니며, **즉시 강제 1회 실행 공개 API도 없음** — 필요하면 gateway 직접 콜 또는 dispose 후 재register.

---

## 6. 정렬 결정 (consolidation)

모듈 의도에 비춘 최종 방향:

1. **channel: per-channel register + 수동 `channel.sync`** — 목록은 register로 실시간 유지, 발견/델타는 재접속·sid 변경 시 `refreshListSince(cursor)` 수동 호출.
2. **place: per-place register + `place.refreshList` 발견** — place엔 list-delta 게이트웨이가 없어 목록 발견은 `place.refreshList`(full), 각 place 메타는 `registerPlace`로 실시간 유지.
3. **chat prime → 캐시 max chatNo 기반 + `updateLocalSnapshot`** — 무조건 refetch 제거, 캐시가 곧 커서. 소유는 `useChatSync` 훅([chat-sync.md](chat-sync.md)).
4. **`updateLocalSnapshot` 경로를 `SyncManager` 계층에 추가** — 수동/초기 로딩 후 기준선 정렬.
5. **profile/join/device plan·register 보존** — 곧 사용. (channel·chat·place는 활성 소비자.)

---

## 7. 4규칙 요약

1. **부팅 1회**: `SocketManager`가 client를, `SyncManager`가 `createDeviceRuntime({ extraSyncPlans })`를 만들고 `runtime.start()`. (조립 책임은 [README.md](README.md))
2. **화면별**: `register*`로 watch on/off (chat은 진입 시 `prime` 1회 추가).
3. **읽기**: plan 콜백 → repository cache → UI 구독 (request 리턴값 아님).
4. **쓰기**: gateway 호출, 화면 반영은 push가 담당.

플랜 코드 자체를 고칠 필요는 없다 — 타이밍/전략은 plan 생성 옵션 + `register`/`startSync` 인자 + runtime 옵션으로 조정한다.
