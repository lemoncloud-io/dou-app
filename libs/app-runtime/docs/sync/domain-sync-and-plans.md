# 도메인별 동기화 & 플랜 관리

Date: 2026-06-24

> `@lemoncloud/chatic-sockets-lib`(소스 리포 `chatic-sockets-api`)의 동기화 모듈 **사용 의도**를 도메인별로 분석하고, `libs/app-runtime`가 이를 어떻게 소비하는지(`SyncManager` + `createSyncPlans`) 정의한다. 라이브러리 내부 메커니즘은 [clientsocket-sync-guide.md](clientsocket-sync-guide.md), 소유 경계는 [README.md](README.md) 참조.

---

## 0. 모듈 사용 의도 5원칙 (라이브러리 스펙 요약)

라이브러리 문서(`frontend-client-socket/`)가 일관되게 말하는 의도:

1. **동기화의 1급 단위는 `type+id` sync target 등록**이다. `startSync(target)` 한 번이면 scheduler가 연결 동안 **poll + push + reconnect catch-up**을 자동 유지한다. "무엇을 동기화할지"는 register로 표현한다.
2. **plan은 도메인 전략**이다. 부팅 시 1회 등록(`type`당 1개)하고, 콜백(`onUpdate`/`onApply`/`onRemove`)으로 결과를 store/repository에 반영한다.
3. **gateway `.sync(since)` 수동 콜은 scheduler와 독립한 "보완 catch-up"**이다. 목록 발견·델타에 쓰며 앱이 직접 호출한다. plan onTrigger로 전파되지 않는다(응답이 `:ok`라 push 필터를 통과 못 함).
4. **`updateLocalSnapshot`이 등록 sync와 수동 콜을 잇는 다리**다. 수동/초기 로딩 후 plan 기준선(`tick`/`updatedAt`/`lastNo`)을 맞춰 중복 catch-up을 막는다.
5. **register=focused, gateway=manual**. 자동 유지가 필요한 대상은 register, "지금 한 번 따라잡기"는 gateway 콜.

---

## 1. plan 패밀리 — 도메인은 딱 세 부류

| plan                                 | 버전 축     | `run`(폴링)   | push 트리거                             | reconnect(`onConnected`)                   | id                     | 자동 stop                      |
| ------------------------------------ | ----------- | ------------- | --------------------------------------- | ------------------------------------------ | ---------------------- | ------------------------------ |
| **Device**                           | `tick`      | `device.read` | `device.sync`→read                      | snapshot reset + read                      | 선택(없으면 현재 연결) | ❌ 항상 retry                  |
| **Channel / Place / Profile / Join** | `updatedAt` | `X.get`       | `X.sync`→get                            | snapshot reset + get                       | 필수                   | 403/404 ×2 → stop + `onRemove` |
| **Chat**                             | `chatNo`    | **no-op**     | `chat.sync`→append, gap이면 `chat.feed` | `lastNo`~`channel.chatNo` catch-up(cap 50) | 필수                   | (실패 경로 없음)               |

- **polling 패밀리(Channel/Place/Profile/Join)** 는 `X.get` + `updatedAt` 비교 템플릿이 동일하다 — 새 polling 도메인은 이 틀을 복제.
- **Device** 는 거기에 `tick`/hint/never-stop 변형.
- **Chat** 만 event-driven(폴링 없음). 초기 로딩은 앱 책임(§3).

---

## 2. 플랜 관리방식 (app-runtime)

### 2.1 plan 주입 — 부팅 1회

[`plans.ts`](../../src/socket/sync/plans.ts) `createSyncPlans()`가 모든 plan을 1회 생성하고, 콜백을 **data 레이어 repository**에 연결한다:

| plan    | 콜백 → repository                                                                 |
| ------- | --------------------------------------------------------------------------------- |
| device  | (캐시 미연결, 연결 유지용)                                                        |
| channel | `onUpdate`/`onRemove` → `channel.cacheWrite`/`cacheDelete`                        |
| place   | → `place.cacheWrite`/`cacheDelete`                                                |
| profile | → `profile.cacheWrite`/`cacheDelete`                                              |
| chat    | `onApply` → `chat.cacheWriteMany`(chatNo idempotent, `onRemove` 없음 — 이력 보존) |
| join    | `onUpdate`/`onRemove` → `join.cacheWrite`/`cacheDelete`                           |

→ 갱신 데이터는 콜백 → repository cache → `observeList`/`observeItem` 스트림으로 UI에 흐른다. **UI는 네트워크 콜을 직접 하지 않는다**(README 원칙).

### 2.2 target 등록 — 화면별 N회 (register-centric)

[`SyncManager`](../../src/socket/sync/)의 `register*`(또는 [`useSyncTarget`](../../src/socket/sync/hooks/useSyncTarget.ts) 훅)로 `type+id` 타깃을 동적으로 켠다.

- ref-count + dispose 반환(중복 register 안전, 마지막 dispose 시 `stopSync`).
- client 재생성(재로그인/재연결) 시 등록 target을 새 runtime에 자동 replay.
- **활성 소비자**: chat·channel·**place**(per-place register). profile/join/device plan은 생성되지만 해당 화면이 아직 없어 target 미등록 — 곧 쓸 예정이라 제거하지 않는다(타깃 없으면 무동작).

### 2.3 `updateLocalSnapshot` — 기준선 다리 (필수)

수동 gateway 콜이나 초기 로딩으로 최신 모델을 받았으면, **반드시 `updateLocalSnapshot(target, snapshot)`으로 plan 기준선을 맞춘다**. 안 그러면 다음 `onConnected`/`run`이 `0` 기준으로 중복 catch-up한다.

- device → `{ tick }`, channel/place/profile/join → `{ updatedAt }` 류, chat → `{ lastNo, minNo, messages }`.

---

## 3. 도메인별 "무엇을 register / 무엇을 수동 콜" (app 사용 패턴)

| 도메인           | register (자동 유지)                                                              | 수동 gateway 콜 (보완)                                                                                 |
| ---------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **chat**         | 열린 방 1개 (`registerChat`) — focused                                            | 초기 prime(§3.1), `loadMore`(과거 페이지)                                                              |
| **channel**      | (a) 열린 방 메타 (`registerChannel`) (b) **목록의 보이는 채널 전부**(per-channel) | `channel.sync(since)` 목록 발견·델타 — 재접속/sid 변경 시                                              |
| **place**        | **목록의 보이는 place 전부**(per-place, `registerPlace`) — channel과 동일 모델    | `place.refreshList`(=`user.my-site`, full) 목록 발견 — **place엔 `.sync(since)` 델타 게이트웨이 없음** |
| **profile/join** | (예정) 화면 lifecycle                                                             | —                                                                                                      |
| **device**       | 현재 연결                                                                         | —                                                                                                      |

핵심: **register(다중 채널/place 구독 포함)가 동기화의 원칙**이고, **목록 "발견"·삭제 동기화는 gateway 수동 콜**이 담당한다. 둘은 granularity가 달라 자동 연결되지 않으며(라이브러리 명시), `updateLocalSnapshot`/repository cache로만 만난다.

- **channel**: 발견·델타 = `channel.sync(since)` 커서 델타.
- **place**: `place` 도메인엔 list-delta 게이트웨이가 없어 발견 = `place.refreshList`(full). per-place register는 각 place 메타(`place.get`/`updatedAt`)를 실시간 유지.

### 3.1 chat 초기 로딩 (prime) — 모듈 의도 정렬

chat은 `run`이 no-op이라 **세션 중 방 진입 시 register만으로는 아무것도 안 불러온다**. 모듈 의도는 "앱이 초기 prime + `updateLocalSnapshot`"이다.

- chat 캐시는 **영구 보존 + `chatNo` 정렬** → 재진입 시 캐시가 즉시 표시되고, **캐시의 max chatNo가 곧 동기화 커서**다(별도 meta 커서 불필요 — 캐시와 drift하지 않음).
- prime 규칙:
    - 캐시 비어있음 → 첫 페이지 fetch(`chat.feed`).
    - `channel.get`의 서버 최신 chatNo > 캐시 max → 그 구간만 catch-up.
    - 최신 → fetch 생략.
- **어느 경우든 `updateLocalSnapshot({ lastNo: 캐시 max chatNo })`로 plan 기준선을 세운다** ← 현재 누락된 핵심 정렬 포인트.

> 비고: `SyncManager`가 prime을 대행하는 것은 "앱 계층" 역할을 app-runtime이 흡수한 것으로 모듈 의도에 어긋나지 않는다. 단 `updateLocalSnapshot` 호출은 반드시 포함해야 모듈 계약을 지킨다.

---

## 4. 동기화 트리거 4시점 (도메인 공통)

scheduler가 plan을 자동 호출하는 시점 — 앱이 직접 부르지 않는다:

| 시점                 | 훅                  | Device                | Channel/Place/Profile/Join | Chat                       |
| -------------------- | ------------------- | --------------------- | -------------------------- | -------------------------- |
| 연결/재연결          | `onConnected`→`run` | snapshot reset + read | snapshot reset + `X.get`   | `lastNo`~`chatNo` catch-up |
| 주기                 | `run`               | `device.read`         | `X.get` (updatedAt 비교)   | no-op                      |
| `<domain>.sync` push | `onTrigger`         | read                  | `X.get` 재조회             | append / gap feed          |
| stop                 | `onStopped`         | —                     | —                          | —                          |
| 앱 snapshot 주입     | `updateLocalState`  | —                     | —                          | —                          |

- 폴링 주기 = `target.intervalMs ?? plan 기본 ?? 5000`, 변화 없으면 **idle backoff**로 감속(최대 60s). → 보이는 채널 다수 등록도 idle 시 부하가 완화된다.
- reconnect full-read는 plan이 자동(앱이 따로 하지 않음).

---

## 5. 우리 정렬 결정 (consolidation)

모듈 의도에 비춘 최종 방향:

1. **channel: per-channel register + 수동 `channel.sync`** — 모듈 스펙(다중 채널 구독 + gateway 수동 catch-up)과 정확히 일치. 목록은 register로 실시간 유지, 발견/델타는 재접속·sid 변경 시 `refreshListSince(cursor)` 수동 호출.
2. **place: per-place register + `place.refreshList` 발견** — channel과 동일하게 보이는 place를 `registerPlace`(또는 `usePlaceSync`)로 등록해 실시간 유지. place엔 list-delta 게이트웨이가 없어 목록 발견은 `place.refreshList`(full).
3. **chat prime → 캐시 max chatNo 기반 + `updateLocalSnapshot`** — 무조건 refetch 제거(`primedChatChannels` dedup 불필요), 캐시가 곧 커서. `updateLocalSnapshot`으로 plan 기준선 세팅(§3.1).
4. **`updateLocalSnapshot` 경로를 `SyncManager` 계층에 추가** — 수동/초기 로딩 후 기준선 정렬(모듈 4원칙).
5. **profile/join/device plan·register 보존** — 곧 사용. (channel·chat·place는 활성 소비자, `usePlaceSync`도 이제 사용됨.)

> ✅ 정렬 완료 (2026-06-24): `SyncManager.primeChatTarget`이 캐시 max chatNo로 `updateLocalSnapshot`을 호출하고(별도 chat 커서 없음), 캐시가 비었을 때만 첫 페이지를 fetch한다. (구버전 문구의 "updateLocalSnapshot 누락" 갭은 해소됨.)
