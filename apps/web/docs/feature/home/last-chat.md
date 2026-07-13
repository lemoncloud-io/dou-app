# home — 마지막 메시지 미리보기 (last-chat)

> 대상: `apps/web/src/app/features/home` · 참조 구현: `apps/testbed/src/app/pages/ChatHomePage.tsx`

## 배경

채널 행의 **마지막 메시지 미리보기(내용/시간/작성자)**는 예전엔 서버가 `ChannelView.lastChat$`에 실어
보냈다. 서버가 더 이상 `lastChat$`를 내려주지 않으므로, 홈은 **보이는 채널별 chat 동기화**에서 마지막
메시지를 직접 얻어 노출한다.

## 흐름

렌더된 채널 행마다 `useLastChat(channelId)` 하나로 **등록·prime·구독**을 묶는다. 이 훅은 방(room)의
`useChats`와 같은 위치 — **앱별 홈 훅**으로 둔다(app-runtime은 엔진, 프레젠테이션 훅은 앱): web는
`apps/web/src/app/features/home/hooks/useLastChat.ts`, testbed는 `apps/testbed/src/app/pages/useLastChat.ts`.
내부는 app-runtime이 공개한 `useChatSync`(등록+prime)와 `chat.observeList`(구독)를 조합한다.

1. **등록 + prime** — 내부에서 `useChatSync(channelId)`를 호출한다. chat 타깃을 register(ref-count)하고,
   `isVerified` 게이트로 prime한다 — 캐시가 비면 첫 페이지를 fetch하고, 캐시 max chatNo로 plan 기준선
   (`updateLocalSnapshot`)을 맞춘다. `ChatSyncPlan.run`은 no-op이라 register만으로는 아무것도 안 불러온다.
2. **구독** — `chat.observeList({ channelId, limit: 1 })`로 chat 캐시를 관측한다. observeList는 chat_no
   내림차순이라 보통 최신 1건이지만, 정렬에 흔들리지 않도록 방어적으로 **max chatNo**를 고른다.
3. **라이브** — 새 메시지는 `ChatSyncPlan.onTrigger`(서버 `chat.sync` push)가 chat 캐시에 append하고,
   observe가 재emit → 미리보기가 실시간 갱신된다.
4. **해제** — 행이 목록에서 빠지면(unmount) register와 observe 구독이 모두 자동 해제된다.

## 등록 범위 — 보이는 채널만

`ChannelItem`(web) / `ChannelRow`(testbed)가 **렌더될 때** 등록하므로, 선택된 place의 보이는 채널만 chat을
동기화한다. place 탭을 바꾸면 이전 행은 해제되고 새 행이 prime한다. 기존 per-row `useChannelSync`와 동일한
생명주기다.

> 비용: cold 채널은 첫 진입 시 첫 페이지 fetch가 한 번 발생한다(캐시가 차면 재fetch 없음). 전체 채널이
> 아니라 렌더된 행으로 범위를 좁혀 비용을 억제한다.

## 안읽음(unread)과의 관계 — 불변

이 변경은 **미리보기 소스만** chat 캐시로 옮겼다. 안읽음은 그대로다 — `useChannelUnreads`는 채널 메타의
`channel.chatNo`(서버가 계속 전송)와 채널에 임베드된 `$join.chatNo`로 계산하며, chat 등록/구독에 의존하지
않는다(`hooks/useChannelUnreads.ts`).

## 정렬 주의

정렬 키 `lastActivityAt`는 `toDomainChannel` 매퍼(`libs/data/src/data/domain/mappers.ts`)에서 계산된다.
`lastChat$.createdAt`가 사라지면 `updatedAt` 기준으로 폴백하므로, 새 메시지에 채널 `updatedAt`이 갱신되는 한
최신순 정렬은 유지된다.

## 파일 지도

| 파일                                           | 역할                                                         |
| ---------------------------------------------- | ------------------------------------------------------------ |
| `apps/web/.../home/hooks/useLastChat.ts`       | web `useLastChat` — 등록+prime+구독(방의 `useChats` 홈 버전) |
| `apps/testbed/.../pages/useLastChat.ts`        | testbed `useLastChat` — web과 동일 로직(앱별 사본)           |
| `apps/web/.../home/components/ChannelList.tsx` | `ChannelItem`이 `useLastChat`로 내용/시간을 렌더             |
| `apps/testbed/.../pages/ChatHomePage.tsx`      | 인라인 행을 `ChannelRow`로 추출해 `useLastChat` 사용         |

> app-runtime에는 공용 프리미티브(`useChatSync`, `chat.observeList`)만 두고, 조합 훅은 앱에 둔다 —
> 방의 `useChats`와 동일한 배치. 두 앱은 별도 앱이라 훅을 공유하지 않고 각자 사본을 갖는다.

## 관련 문서

- [components.md](./components.md) · [README.md](./README.md) — 홈 컴포넌트/기능 개요
- [../../architecture/data-flow.md](../../architecture/data-flow.md) — observe/sync/refresh 데이터 흐름
- `libs/app-runtime/docs/socket/sync/chat-sync.md` — `ChatSyncPlan`과 `chat.feed`의 분업, prime 소유
- `libs/app-runtime/docs/socket/sync/screen-registration-map.md` — 화면별 sync 등록 지도
