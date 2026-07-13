# Chat 동기화 — ChatSyncPlan과 chat.feed의 분업

Date: 2026-06-29

> chat 도메인은 다른 plan과 동작 모델이 다르다(`run`이 no-op인 event-driven). 이 문서는
> **`ChatSyncPlan`(라이브 정책)과 `chat.feed`(페이지 fetch 도구)가 어떻게 나뉘고 어디서
> 만나는지**, 그리고 **prime(초기 로드 + 기준선 정렬)을 누가 소유하는지**를 정의한다.
>
> - plan 패밀리·트리거 시점 → [library-internals.md](library-internals.md) §2-B
> - register / 수동 콜 / 기준선 다리 → [usage.md](usage.md) §3.1·§4
> - 소유 경계·SyncManager → [README.md](README.md)

---

## 1. 두 주체

|                                            | 정체                            | 동작                                                                             |
| ------------------------------------------ | ------------------------------- | -------------------------------------------------------------------------------- |
| **`ChatSyncPlan`**                         | 라이브 정합성 유지 **정책**     | `run`은 no-op. `onTrigger`(서버 `chat.sync` push)·`onConnected`(재연결)로만 동작 |
| **`chat.feed`** (repository `refreshList`) | 커서 기반 **페이지 fetch 도구** | 한 페이지(chat_no 내림차순)를 끌어와 캐시에 쓸 뿐, plan을 트리거하지 않음        |

핵심: **`chat.feed`는 plan을 깨우지 않는다.** gateway 콜은 scheduler와 독립이다([usage.md](usage.md) §4). 둘은 같은 chat 캐시(`chatNo` 키 idempotent 머지)에서만 만난다.

---

## 2. 누가 언제 feed를 부르나

`chat.feed`는 **앱과 plan이 각자 다른 목적으로** 호출하는 공용 도구다:

| 구간                       | 담당              | feed 호출 주체                                                         |
| -------------------------- | ----------------- | ---------------------------------------------------------------------- |
| 최초 로드(콜드 첫 페이지)  | **앱** (prime)    | 앱이 직접                                                              |
| 페이징(더 보기, 과거 이력) | **앱** (loadMore) | 앱이 직접                                                              |
| 새 메시지(미래)            | **plan**          | feed 안 씀 — push payload 직접 append                                  |
| gap(놓친 중간)             | **plan**          | plan이 내부에서 feed로 그 구간만 메움                                  |
| 재연결 누락(catch-up)      | **plan**          | plan이 `channel.get`으로 최신 chatNo 확인 후 내부 feed (최대 `cap` 50) |

> 즉 plan은 "미래"를 push로 받다가 **구멍이 생기면 그 구멍만 `chat.feed`로 스스로 메운다**.
> 앱은 plan이 절대 안 가져오는 **"과거 이력"**(첫 페이지·더 보기)을 `chat.feed`로 직접 가져온다.

기억법: **앱 = 과거 이력 조회 / plan = 라이브 + 복구.**

---

## 3. 어떻게 충돌 없이 만나나

```txt
   plan.onTrigger ──┐
   plan.onConnected─┤→ feed/append ─┐
   앱 prime ────────┤→ chat.feed ───┼→ [chat 캐시: chatNo 키 idempotent 머지] → observeList → UI
   앱 loadMore ─────┘→ chat.feed ───┘
```

- 같은 `chatNo`는 덮어써도 동일 → 누가 먼저/중복으로 가져와도 안전.
- 그래서 "앱이 feed로 prime" + "plan이 push로 append"가 동시에 일어나도 깨지지 않는다.
- **유일한 약점**: feed/append는 **캐시**만 갱신하고 plan의 **기준선(`lastNo`)** 은 안 건드린다.
  → 앱이 `updateLocalSnapshot`으로 plan에 별도 통보해야 한다(§5).

---

## 4. prime — 등록만으로 부족한 이유

`ChatSyncPlan.run`이 no-op이라 **`register`만으로는 아무것도 안 불러온다.** 그래서 방 진입 시 앱이 prime을 한다:

1. **콜드 첫 페이지 fetch** — 캐시가 비면 `chat.feed`(`refreshList`)로 첫 페이지를 적재해야 화면이 뜬다. plan은 이 영역을 안 채운다.
2. **기준선 정렬** — `updateLocalSnapshot`으로 plan에 "내 최신 chatNo는 여기"를 통보한다(§5).

| 동작               | register+start만                              | + prime           |
| ------------------ | --------------------------------------------- | ----------------- |
| 빈 방 진입 첫 화면 | ❌ 빈 화면                                    | ✅ 첫 페이지 표시 |
| 라이브 새 메시지   | ⚠️ 첫 push가 gap으로 인식돼 최신 50개 재fetch | ✅ 1건만 append   |
| 재연결 catch-up    | `onConnected`가 처리(공통)                    | 동일              |

---

## 5. `updateLocalSnapshot` — feed와 plan을 잇는 다리

수동 feed나 초기 로딩으로 최신본을 받았으면 **`updateLocalSnapshot(target, snapshot)`으로 plan 기준선을 맞춘다.** 안 그러면 다음 `onConnected`/push가 `0` 기준으로 중복 catch-up한다.

- chat snapshot 모양: `{ id, lastNo, minNo, messages }` (다른 도메인은 `{ tick }`/`{ updatedAt }` 류 — [usage.md](usage.md) §4).
- `updateLocalSnapshot`은 **도메인 무지한 runtime API**다. chat 전용이 아니다 — 현재 코드베이스에서 실제 호출처가 chat prime 한 곳일 뿐.

---

## 6. 소유 경계 — prime은 `useChatSync` 훅이 소유한다

prime은 **chat 전용 정책 + data repository 의존**이라, 도메인 무지여야 할 `SyncManager`가 아니라 chat 전용 훅이 소유한다.

| 책임                                                | 소유                        |
| --------------------------------------------------- | --------------------------- |
| 타깃 register/start/stop, runtime lifecycle, replay | `SyncManager` (도메인 무지) |
| `updateLocalSnapshot` pass-through (runtime 위임)   | `SyncManager` (generic)     |
| chat prime 정책 (콜드 fetch + 기준선 정렬)          | **`useChatSync` 훅**        |

- `useChatSync(channelId)`가 **register + prime을 함께** 한다. `isVerified` 게이트로 재인증/재연결 시 재-prime(이전 `SyncManager.replayTargets` 경로를 대체).
- 호출부(web `useChats`, testbed `ChatRoomPage`)는 `useChatSync(channelId)`만 호출 → register+prime을 그대로 얻는다. 호출부는 진입 시 `refreshList`를 직접 부르지 않는다.

> 이력: 2026-06-29 이전엔 prime이 `SyncManager.primeChatTarget`에 있었다. `SyncManager`를
> 도메인 무지로 되돌리기 위해 `useChatSync`로 이동했다.

---

## 7. 관련 문서

- [README.md](README.md) — sync 도메인 스펙(소유 경계, SyncManager)
- [usage.md](usage.md) — 앱 사용 패턴(register / 수동 콜 / prime)
- [library-internals.md](library-internals.md) — ChatSyncPlan 내부 동작(§2-B)
- [gateway-reference.md](gateway-reference.md) — `chat.feed` 등 게이트웨이 req/res
