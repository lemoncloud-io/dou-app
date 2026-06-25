# 도메인별 동기화 & SyncPlan 관리

Date: 2026-06-25
Status: **As-Built (현재 구현 기준)**

> `@lemoncloud/chatic-sockets-lib`의 SyncPlan을 도메인별로 정리하고, `libs/app-runtime`가 이를 `SyncManager` + `createSyncPlans()`로 어떻게 소비하는지 정의한다. 소유 경계·진입점은 [README.md](README.md), 라이브러리 내부 메커니즘은 [clientsocket-sync-guide.md](clientsocket-sync-guide.md) 참조.

---

## 0. 모듈 사용 의도 5원칙 (라이브러리 스펙 요약)

1. **동기화의 1급 단위는 `type+id` sync target 등록**이다. `startSync(target)` 한 번이면 scheduler가 연결 동안 **poll + push + reconnect catch-up**을 자동 유지한다.
2. **SyncPlan은 도메인 전략**이다. 부팅 1회 등록(`type`당 1개)하고, 콜백(`onUpdate`/`onApply`/`onRemove`)으로 결과를 repository에 반영한다.
3. **gateway `.sync(since)` 수동 콜은 scheduler와 독립한 "보완 catch-up"**이다. 목록 발견·델타에 쓰며 앱이 직접 호출한다. plan `onTrigger`로 전파되지 않는다(응답이 `:ok`라 push 필터를 못 통과).
4. **`updateLocalSnapshot`이 등록 sync와 수동 콜을 잇는 다리**다. 수동/초기 로딩 후 plan 기준선(`tick`/`updatedAt`/`lastNo`)을 맞춰 중복 catch-up을 막는다.
5. **register=focused, gateway=manual**. 자동 유지가 필요한 대상은 register, "지금 한 번 따라잡기"는 gateway 콜.

---

## 1. SyncPlan 패밀리 — 도메인은 세 부류

| plan                                 | 버전 축     | `run`(폴링)   | push 트리거                             | reconnect(`onConnected`)                   | id                     | 자동 stop                      |
| ------------------------------------ | ----------- | ------------- | --------------------------------------- | ------------------------------------------ | ---------------------- | ------------------------------ |
| **Device**                           | `tick`      | `device.read` | `device.sync`→read                      | snapshot reset + read                      | 선택(없으면 현재 연결) | ❌ 항상 retry                  |
| **Channel / Place / Profile / Join** | `updatedAt` | `X.get`       | `X.sync`→get                            | snapshot reset + get                       | 필수                   | 403/404 ×2 → stop + `onRemove` |
| **Chat**                             | `chatNo`    | **no-op**     | `chat.sync`→append, gap이면 `chat.feed` | `lastNo`~`channel.chatNo` catch-up(cap 50) | 필수                   | (실패 경로 없음)               |

- **polling 패밀리(Channel/Place/Profile/Join)** 는 `X.get` + `updatedAt` 비교 템플릿이 동일하다 — 새 polling 도메인은 이 틀을 복제.
- **Device** 는 거기에 `tick`/hint/never-stop 변형. `createDeviceRuntime`이 소유(별도 register 불필요).
- **Chat** 만 event-driven(폴링 없음). 초기 로딩은 앱 책임(`primeChatTarget`, §3).

---

## 2. SyncPlan 관리방식 (app-runtime)

### 2.1 plan 주입 — 부팅 1회

[`plans.ts`](../../src/socket/sync/plans.ts)의 `createSyncPlans()`가 plan을 1회 생성하고 콜백을 **data repository**에 연결한다(현재 구현):

| plan    | 타입 파라미터 | 콜백 → repository                                                                                           |
| ------- | ------------- | ----------------------------------------------------------------------------------------------------------- |
| channel | `ChannelView` | `onUpdate`→`channel.cacheWrite(toDomainChannel)`, `onRemove`→`channel.cacheDelete`                          |
| place   | `MySiteView`  | `onUpdate`→`place.cacheWrite(toDomainPlace)`, `onRemove`→`place.cacheDelete`                                |
| profile | `ProfileView` | `onUpdate`→`profile.cacheWrite(toDomainProfile)`, `onRemove`→`profile.cacheDelete`                          |
| chat    | (기본)        | `onApply`→`chat.cacheWriteMany(applied.map(toDomainChat))` (chatNo idempotent, `onRemove` 없음 — 이력 보존) |
| join    | (기본)        | `onUpdate`→`join.cacheWrite(toDomainJoin)`, `onRemove`→`join.cacheDelete`                                   |

- **device plan은 만들지 않는다** — `createDeviceRuntime`이 자체 `DeviceSyncPlan`을 주입하고 device save를 소유. 그래서 위 plan들은 `extraSyncPlans`로 전달된다.
- 도메인 mapper(`toDomain*`)는 공유 `DataContext`(cid/sid/uid)를 직접 읽는다(`getDataManager().getContext()`).
- **place는 `PlaceSyncPlan<MySiteView>`로 파라미터화** — onUpdate view가 `toDomainPlace` 입력(`MySiteView`)과 맞도록(기본 `SyncableView`는 id/updatedAt만).

→ 갱신 데이터는 콜백 → repository cache → `observeList`/`observeItem` 스트림으로 UI에 흐른다. **UI는 네트워크 콜을 직접 하지 않는다.**

### 2.2 target 등록 — 화면별 N회 (register-centric)

[`useSyncTarget`](../../src/socket/sync/hooks/useSyncTarget.ts) 훅(또는 `getSyncManager().register*`)으로 `type+id` 타깃을 동적으로 켠다.

- ref-count + dispose 반환(중복 register 안전, 마지막 dispose 시 `stopSync`).
- client 재생성(재로그인/재연결) 시 등록 target을 새 runtime에 자동 replay.
- 훅: `useChatSync` / `useChannelSync` / `usePlaceSync` / `useProfileSync` / `useJoinSync`.
- `useJoinSync`는 channelId만 받아 내 join(`userId===uid`)을 캐시에서 resolve → `registerJoin`. 캐시 cold면 `refreshList`로 warm, 실패 시 `${channelId}@${uid}` 합성 폴백.

### 2.3 `updateLocalSnapshot` — 기준선 다리

수동 gateway 콜이나 초기 로딩으로 최신 모델을 받았으면, `updateLocalSnapshot(target, snapshot)`으로 plan 기준선을 맞춘다(안 그러면 다음 `onConnected`/`run`이 `0` 기준 중복 catch-up).

- device → `{ tick }`, channel/place/profile/join → `{ updatedAt }` 류, chat → `{ lastNo, minNo, messages }`.
- 현재 적용: `SyncManager.primeChatTarget`이 chat target register 시 캐시 max chatNo로 이 호출을 수행(§3).

---

## 3. chat 초기 로딩 (prime)

chat은 `run`이 no-op이라 세션 중 register만으로는 아무것도 안 불러온다 → `SyncManager`가 prime을 대행한다.

- chat 캐시는 **영구 보존 + `chatNo` 정렬** → 재진입 시 캐시가 즉시 표시되고, **캐시의 max chatNo가 곧 동기화 커서**(별도 meta 커서 불필요).
- prime 규칙(`primeChatTarget`):
    - `updateLocalSnapshot({ lastNo: 캐시 max chatNo })`로 plan 기준선 세팅.
    - 캐시 비어있음(`lastNo===0`) → 첫 페이지 fetch(`chat.refreshList`).
    - 캐시가 있으면 fetch 생략 — 더 깊은 gap은 다음 (재)연결 `ChatSyncPlan.onConnected`가 메움.

---

## 4. 동기화 트리거 시점 (도메인 공통)

scheduler가 plan을 자동 호출하는 시점 — 앱이 직접 부르지 않는다:

| 시점                 | 훅                  | Device                | Channel/Place/Profile/Join | Chat                       |
| -------------------- | ------------------- | --------------------- | -------------------------- | -------------------------- |
| 연결/재연결          | `onConnected`→`run` | snapshot reset + read | snapshot reset + `X.get`   | `lastNo`~`chatNo` catch-up |
| 주기                 | `run`               | `device.read`         | `X.get` (updatedAt 비교)   | no-op                      |
| `<domain>.sync` push | `onTrigger`         | read                  | `X.get` 재조회             | append / gap feed          |
| stop                 | `onStopped`         | —                     | —                          | —                          |
| 앱 snapshot 주입     | `updateLocalState`  | —                     | —                          | —                          |

- 폴링 주기 = `target.intervalMs ?? plan 기본 ?? 5000`, 변화 없으면 **idle backoff**로 감속(최대 60s).
- reconnect full-read는 plan이 자동(앱이 따로 하지 않음).

---

## 5. 목록 발견 vs register granularity

register(`type+id`)는 단일 모델을 실시간 유지하고, 목록 "발견/삭제"는 gateway 수동 콜이 담당한다. 둘은 granularity가 달라 자동 연결되지 않으며(라이브러리 명시), `updateLocalSnapshot`/repository cache로만 만난다.

- **channel**: per-channel register로 보이는 채널을 실시간 유지. 발견·델타 = `channel.sync(since)`(=`refreshListSince(cursor)`) 수동 콜 — 재접속/sid 변경 시.
- **place**: per-place register. place 도메인엔 list-delta 게이트웨이가 없어 목록 발견 = `place.refreshList`(full, `user.my-site`).
- **profile/join**: 화면 lifecycle에 맞춰 register(`useProfileSync`/`useJoinSync`).
- **device**: 현재 연결(`createDeviceRuntime` 소유).
  </content>
