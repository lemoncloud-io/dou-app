# home — 마지막 메시지 미리보기와 정렬

> 상태: Live · 최종 갱신: 2026-09-10 · 관련 ADR: [ADR-0057](../../../../../docs/adr/0057-home-last-chat-preview-single-query.md) (단일 쿼리), [ADR-0055](../../../../../docs/adr/0055-web-code-block-home-sort-and-login-return.md) 결정 2 (정렬)

**읽기 경로의 정본은 [docs/specs/cache/last-chat-preview.md](../../../../../docs/specs/cache/last-chat-preview.md)다.**
여기서는 홈 목록이 그 결과를 어떻게 **정렬에 쓰는지**만 다룬다.

## 읽기 — 목록 하나에 쿼리 하나

행마다 훅을 거는 구조가 아니다. `apps/web/src/app/hooks/useLastChats.ts`가 목록 전체의
`channelIds`로 `chat.observeLastList(channelIds)`를 **한 번** 구독하고, `ChannelList`가 각 행에
`lastChat` prop으로 내린다. 이 읽기는 **네트워크를 만들지 않는다** — 캐시 관측이다.

행이 등록하는 것은 `runtime.sync.useChannelSync`뿐이고, chat sync 등록은 호스트의
`useChatSyncRegistration(channels)`가 소유한다.

프리뷰 행도 재입장 창을 지난다 — `joinByChannel`이 join-window 필터의 입력으로 함께 들어간다
(ADR-0067).

## 정렬 — 미리보기와 같은 출처

홈·관리 화면의 기본 순서는 **미리보기가 찍는 그 시각**이다. `sortChannels`가 `useLastChats`의
결과를 `lastChatByChannel`로 받아 `createdAtMs` 내림차순으로 정렬하므로, 행에 보이는 시각과 행의
위치가 갈라질 수 없다.

- **내 `join.updatedAt`은 정렬에 쓰지 않는다** — 내가 방을 *읽을 때*도 갱신되므로 "방이 움직인 시각"이 아니다.
- **캐시에 메시지가 없는 채널만** `channel.updatedAt`으로 자리를 잡는다.
- **서버의 `lastChat$`는 쓰지 않는다.** 서버가 채널마다 실어 보내지만 `toDomainChannel`이 그것을 **읽지 않는다**(`libs/data/src/domain/mappers.ts`). 프리뷰 시드로도 쓰지 않는다 — 파생은 chat 캐시에서만 한다.

`joinByChannel`은 정렬 밖에서도 쓰인다 — 닉네임·음소거 표시, unread 커서(`useChannelUnreads`),
그리고 위의 join-window 필터.

## 관련 문서

- [README.md](./README.md) — 홈 전체 개요와 unread 집계
- [unread-dot.md](./unread-dot.md) — 비활성 플레이스·타 클라우드의 점
- [../../architecture/data-flow.md](../../architecture/data-flow.md) — observe/sync/refresh 흐름
