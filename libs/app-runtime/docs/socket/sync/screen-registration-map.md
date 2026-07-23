# 화면별 Sync 등록 지도 (web)

> 앱이 **어느 화면에서 무엇을 sync 등록하는가**를 한 장으로 본다. 런타임/라이브러리 메커니즘이
> 아니라 **소비자(apps/web) 관점의 등록 지도**다.
>
> - register vs 수동 gateway 콜 구분 → [usage.md](usage.md) §1
> - plan 패밀리·트리거 시점 → [library-internals.md](library-internals.md)
> - 소유 경계·SyncManager 책임 → [README.md](README.md)
> - device save/sync 분업 → [device-sync.md](device-sync.md) · chat prime → [chat-sync.md](chat-sync.md)

---

## 0. 세 축으로 읽기

동기화는 세 가지가 맞물려 동작한다. 화면이 직접 건드리는 건 (2)뿐이다.

1. **Sync 플랜 (핸들러)** — 타입별로 "응답이 오면 캐시에 어떻게 쓸지". 부팅 시 1회 정의, 화면과 무관.
2. **Sync 타깃 등록 (`register*`)** — "무엇을 polling/push로 유지할지". 화면이 `type+id`로 등록, ref-count로 dedup.
3. **백그라운드 리스트 sync** — 플랜과 별개로 목록 추가/삭제를 따라잡는 주기 delta/snapshot 콜.

> **실시간 개별 항목 = 타깃 등록(2)**, **목록 발견 = 백그라운드 sync(3)**. 같은 단어 'sync'가
> 자동 유지(register)와 수동 catch-up(gateway) 두 뜻으로 쓰인다 — [usage.md](usage.md) §1.

---

## 1. Sync 플랜 (앱 전체 공통, 1회 정의)

앱 도메인 plan은 `SyncManager` 생성 시 `createSyncPlans()`로 만들어져 `createDeviceRuntime`에
`extraSyncPlans`로 주입된다(정의: `libs/app-runtime/src/socket/sync/plans.ts`). 무엇을 동기화할지는
정하지 않고 타입별 캐시 반영만 담당한다. **`DeviceSyncPlan`은 plans.ts에 없다** — `createDeviceRuntime`가
자체 주입한다.

| 플랜              | 트리거                                                  | 캐시 반영                                            |
| ----------------- | ------------------------------------------------------- | ---------------------------------------------------- |
| `DeviceSyncPlan`  | createDeviceRuntime 주입, connect 시 `device.save` 소유 | (라이브러리)                                         |
| `ChannelSyncPlan` | `onUpdate` / `onRemove`                                 | `channel.cacheWrite(toDomainChannel)` — `$join` 포함 |
| `PlaceSyncPlan`   | `onUpdate` / `onRemove`                                 | `place.cacheWrite(toDomainPlace)`                    |
| `ProfileSyncPlan` | `onUpdate` / `onRemove`                                 | `profile.cacheWrite(toDomainProfile)`                |
| `ChatSyncPlan`    | `onApply` (append-only 델타, 오름차순)                  | `chat.cacheWriteMany(toDomainChat)`                  |
| `JoinSyncPlan`    | `onUpdate` (single-join polling)                        | `join.cacheWrite(toDomainJoin)`                      |

등록 API: `registerDevice/Channel/Place/Profile/Chat/Join(id)` — 키로 ref-count, 같은 id 중복
등록은 dedup (`SyncManager.register`).

---

## 2. 화면별 타깃 등록

### 🌐 전역 (라우트 무관, 앱 마운트 시)

| 무엇                       | 메커니즘                                                                                                                                      | 진입점                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| device viewing·status 통지 | `useDeviceSync` — 현재 보는 채널을 `device.syncDevice`로, 포/백그라운드를 `device.syncStatus`(green/yellow)로 통지(라우트·가시성 파생, dedup) | `UnifiedLayout` → `apps/web/src/app/hooks/useDeviceSync.ts` |
| 백그라운드 리스트 sync     | `BackgroundSyncRunner` → `useBackgroundSync` (§3)                                                                                             | `apps/web/src/app/runtime/AppRuntime.tsx`                   |

### 🏠 홈 화면

| 무엇           | 메커니즘                                                                                                                | 진입점                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| place 실시간   | `usePlaceSync(place.id)` — 렌더된 place row마다 `registerPlace`                                                         | `apps/web/src/app/features/home/components/PlaceItem.tsx`           |
| channel 실시간 | `useChannelSync(channel.id)` — 렌더된 channel row마다 `registerChannel` (메타데이터 + `$join` 갱신)                     | `apps/web/src/app/features/home/components/ChannelList.tsx`         |
| 마지막 메시지  | `useLastChat(channel.id)` — 렌더된 channel row마다 `registerChat` + prime 후 chat 캐시의 max chatNo 관측(미리보기 소스) | `apps/web/src/app/features/home/hooks/useLastChat.ts` (ChannelItem) |
| 안읽음 계산    | `useChannelUnreads` — **join 등록 없이** `channel.$join.chatNo`에서 파생                                                | `apps/web/src/app/features/home/hooks/useChannelUnreads.ts`         |

> 홈은 채널별 **join** 타깃은 등록하지 않는다 — 읽음 경계는 채널에 임베드된 `$join`을 타고 오고, 읽음
> 전송 시 ChannelPlan으로 채널 동기화가 트리거되어 `$join.chatNo`가 갱신된다. 단 **chat** 타깃은 마지막
> 메시지 미리보기를 위해 렌더된 행마다 등록한다(서버가 `lastChat$`를 더 이상 내려주지 않음 →
> [chat-sync.md](chat-sync.md), 소비처는 apps/web `feature/home/last-chat.md`).

### 💬 채팅방 화면 (`apps/web/src/app/features/channels/pages/ChannelRoomPage.tsx`)

| 무엇                    | 메커니즘                                                                                      | 진입점                        |
| ----------------------- | --------------------------------------------------------------------------------------------- | ----------------------------- |
| channel 실시간          | `useChannel` → `useChannelSync(channelId)` (`registerChannel`)                                | `hooks/useChannel.ts`         |
| chat 메시지             | `useChats` → `useChatSync(channelId)` (`registerChat` + 초기 페이지 prime)                    | `hooks/useChats.ts`           |
| 멤버 로드               | `useChannelMembers` → `syncChannelUsers(since)` — user + `$join` 적재 (since:0이 전체 스냅샷) | `hooks/useChannelMembers.ts`  |
| 멤버별 읽음(read-state) | `useJoinPositions` → 활성 멤버마다 `registerJoin(\`${ch}@${uid}\`)` + join 캐시 관측          | `hooks/useJoinPositions.ts`   |
| 멤버별 프로필           | `useChannelProfiles` → 캐시된 활성 멤버마다 `register({type:'profile'})` (5s 간격)            | `hooks/useChannelProfiles.ts` |
| 내 읽음 전송            | `useReadMarker` → 입장 / 포그라운드 복귀 / 전송 시 `readMessage`(= `join.readChat`)           | `hooks/useReadMarker.ts`      |

---

## 3. 백그라운드 리스트 sync (`useBackgroundSync`)

플랜과 별개로 **목록 추가/삭제 발견**용 주기 delta/snapshot. 60초 주기 + `isVerified` 상승엣지,
스위치 중엔 skip. `apps/web/src/app/runtime/useBackgroundSync.ts`.

| 대상    | 호출                                | 커서(watermark)                       |
| ------- | ----------------------------------- | ------------------------------------- |
| place   | `place.refreshList()` (전체 스냅샷) | 없음                                  |
| channel | `channel.syncChannels(since)`       | `channel-sync:${cid}` (클라우드 전역) |
| profile | `profile.syncProfiles(since)`       | `profile-sync:${cid}:${sid}`          |

---

## 4. 안읽음(unread) 파생 규칙 — 요약

읽음 상태는 join의 `chatNo`(마지막 읽은 번호)에 담긴다. 화면별로 소스가 다르다.

| 화면               | 소스                                                                                        | 공식                                                                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 홈 채널별 배지     | `channel.chatNo`/`metaNo` + 구독 join 목록의 내 커서 (`useMyJoins`가 채널별 `registerJoin`) | `max(0, (channel.chatNo - channel.metaNo) - readNo)`; `readNo = max(join.readNo, join.chatNo)`. head를 사용자 메시지 수로 환산해 시스템 메시지 제외. join 행 없으면 배지 없음(0). 채널 임베드 `$join`은 안 씀(읽음 상태가 뒤처짐) |
| 채팅방 멤버별 읽음 | join 캐시(멤버별 `registerJoin` + `syncChannelUsers`의 `$join`)                             | 멤버 커서 = `max(readNo, chatNo)`                                                                                                                                                                                                 |

> 홈은 채널별로 내 join을 등록(`useMyJoins`)해 구독 join 목록에서 커서를 파생하고, 채팅방은
> 멤버별 join을 등록해 실시간 읽음 인원을 센다. 읽음 경계의 단일 출처는 양쪽 모두 join의 `chatNo`다.
