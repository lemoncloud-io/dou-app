# 메시지 점프 (chatNo 커서 이동)

> 상태: Approved · 최종 갱신: 2026-08-06 · 관련 ADR: [[ADR-0033]](../../adr/0033-local-global-search.md)

## 목적

채팅방 피드를 특정 메시지(chatNo) 위치로 이동시킨다. 1차 소비자는 검색
결과의 메시지 클릭([[web-search-page]](./web-search-page.md))이며, 이후
링크 미리보기·푸시 딥링크 등 "특정 메시지로 가기"가 필요한 모든 흐름이
같은 메커니즘을 쓴다.

서버 `chat.feed`는 `cursorNo` 기준 과거 방향 페이징만 지원하므로
(anchored 양방향 페치 없음), 점프는 "타깃이 로드될 때까지 과거 페이지를
반복 로드"하는 방식이다. desktop-web에 동일 방식의 완성 구현이 있어
(`useMessageJumpStore` + `MessageList`의 점프 로직) 이를 apps/web으로
이식한다.

## 설계 원칙

- **desktop-web 시맨틱 이식**: 점프 타깃 스토어(nonce 재발화), DOM
  `data-chat-no` 탐색, 페이지 예산 루프 — 검증된 구조를 그대로 따른다.
- **기존 피드 모델 유지**: `useChats`의 "최신 앵커 성장 윈도우"
  (`loadMore`)를 바꾸지 않는다. 점프는 그 위에서 `loadMore`를 반복
  호출하는 소비자일 뿐이다. 피드가 항상 최신을 포함하므로 "타깃보다
  아래(최신) 방향" 로드는 필요 없다.
- **예산 초과는 명시적 폴백**: 무한 로드하지 않는다. 예산 소진 시 채널
  최신 위치에 머물고 토스트로 안내한다.
- **타깃 전달은 URL 쿼리**: apps/web은 라우트-당-채널 구조이므로
  (desktop-web의 단일 페이지 스토어 전달과 달리) `?chatNo=` 쿼리로
  전달한다 — 딥링크·새로고침에도 안전.
- **점프와 하단 고정은 배타적이다**: 점프가 대기 중인 동안 `useChatScroll`의
  자동 하단 스크롤을 억제한다. 두 스크롤 주체가 동시에 살아 있으면 항상
  하단 고정이 이긴다(아래 "상세 구현 › 하단 고정과의 충돌" 참조).

## 범위

**포함**

- 점프 스토어(`useMessageJumpStore`) apps/web 이식.
- `/channels/:id/room?chatNo=<n>` 쿼리 계약 + 파싱.
- 메시지 행 DOM에 `data-chat-no` 노출.
- 점프 실행 훅: DOM 탐색 → 스크롤+하이라이트, 미발견 시 예산 내
  `loadMore` 반복, 폴백 토스트.

**제외**

- 서버 anchored-feed API 확장(양방향 앵커 페치) — 추진 안 함(ADR-0033).
- 크로스 클라우드 전환 — 진입 전 단계는 [[web-search-page]]의
  `useSearchNavigate` 담당. 이 문서는 "채널방 도착 이후"만 다룬다.
- 점프 히스토리(뒤로가기로 점프 전 위치 복원).

## 시나리오

1. **캐시에 이미 있는 메시지(대부분)**: 검색 결과 클릭 →
   `room?chatNo=1234` 진입 → room 페이지가 쿼리를 파싱해 점프 스토어에
   `request(channelId, 1234)` → 점프 훅이 `[data-chat-no="1234"]` DOM
   발견 → `scrollIntoView({ block: 'center' })` + 하이라이트 →
   스토어 clear + 쿼리 제거.
2. **윈도우 밖 메시지**: DOM 미발견 → `hasMore`인 동안 `loadMore()` 호출
   → `messages` 변화로 effect 재실행 → 발견 시 1번과 동일. 페이지 예산
   (`MAX_JUMP_PAGES`) 내 반복.
3. **도달 실패(예산 소진 또는 히스토리 끝)**: 반복 중단 → 채널 최신
   위치 유지 → "메시지를 찾을 수 없어요" 토스트 → 스토어 clear.
4. **같은 메시지 재점프**: 같은 chatNo로 다시 클릭해도 스토어 `nonce`
   증가로 effect가 재발화되어 다시 스크롤/하이라이트된다.

## 다이어그램

```mermaid
stateDiagram-v2
    [*] --> Pending: room?chatNo=n 진입\n(store.request)
    Pending --> Found: DOM에 data-chat-no=n 존재
    Pending --> Loading: 미발견 & hasMore & 예산 남음
    Loading --> Pending: loadMore 완료\n(messages 갱신)
    Pending --> Failed: 미발견 & (예산 소진 | !hasMore)
    Found --> [*]: scrollIntoView + 하이라이트\nstore.clear + 쿼리 제거
    Failed --> [*]: 최신 위치 유지 + 토스트\nstore.clear + 쿼리 제거
```

## 상세 구현

### 점프 스토어 (신규: `apps/web/src/app/stores/useMessageJumpStore.ts`)

desktop-web 구조를 이식 — `MessageJumpTarget { channelId, chatNo, nonce }`,
`request(channelId, chatNo)`, `clear()`. zustand, 비영속.

**nonce 계산은 desktop-web과 다르게** 모듈 스코프의 별도 카운터로
관리한다(`target?.nonce`에서 파생하지 않음). desktop-web처럼 다음
nonce를 `get().target?.nonce ?? 0) + 1`로 계산하면, `clear()`가
target을 null로 되돌린 뒤 같은 메시지로 다시 점프할 때 nonce가 다시
1부터 시작해 이전 점프와 값이 같아져 재발화가 안 되는 경우가 생긴다
(테스트로 확인). 별도 카운터는 `clear()` 여부와 무관하게 항상 증가한다.

### 쿼리 계약

- `paths.ts`의 `ROUTES.channels.room`은 유지하고, 검색 쪽에서
  `${ROUTES.channels.room(id)}?chatNo=${n}` 형태로 조립한다.
- `ChannelRoomPage`에서 `useSearchParams`로 `chatNo` 파싱 → 유효한
  양의 정수면 `useMessageJumpStore.request(channelId, chatNo)` 후 쿼리
  파라미터를 제거(`replace`)해 새로고침 시 재점프를 막는다.

### 메시지 행 DOM 노출

- `ChannelRoomPage.tsx`의 메시지 행 래퍼에
  `data-chat-no={message.chatNo}` 추가(`chatNo`가 있는 확정 메시지만 —
  pending/failed 행은 제외).

### 점프 실행 훅 (신규: `features/channels/hooks/useMessageJump.ts`)

- 입력: `{ channelId, containerRef, messages, hasMore, isLoadingMore, loadMore }`
  — `useChats` 반환과 `useChatScroll`의 `containerRef`를 그대로 받는다.
- effect 의존: `[target?.nonce, messages]` — 타깃이 현재 채널과 일치할
  때만 동작.
- 발견 시: `scrollIntoView({ block: 'center' })` + 하이라이트 클래스
  일정 시간 부여 → `clear()`.
- 미발견 시: `!isLoadingMore && hasMore && pagesLoaded < MAX_JUMP_PAGES`
  이면 `loadMore()` 호출하고 카운터 증가. 조건 불충족이면 폴백(토스트 +
  `clear()`).
- 로드 반복 중에는 스크롤을 건드리지 않는다 — 점프 스크롤은 발견 시
  1회만 실행되어 `useChatScroll`의 loadMore 앵커 보존과 충돌하지 않는다.

### 하단 고정과의 충돌 (이번 개정에서 수정)

점프가 대부분의 경우 동작하지 않던 원인이다. 첫 로드에서 두 스크롤 주체가
같은 effect 플러시에 겹친다:

1. `ChannelRoomPage.tsx:187`의 `useChatScroll`이 먼저 호출되므로 그 자동
   하단 스크롤 effect가 먼저 실행되고, `scrollToBottom()`은 실제 스크롤을
   `requestAnimationFrame`에 **예약**한다(`useChatScroll.ts:48-54,71-79`).
2. `ChannelRoomPage.tsx:217`의 `useMessageJump`이 뒤이어 실행되며
   `scrollIntoView`를 **동기로** 수행한다(`useMessageJump.ts:61`).
3. 모든 effect가 끝난 뒤 rAF 콜백이 실행되어 `scrollTo({ top: 0 })`
   (반전 리스트의 하단)로 덮어쓴다 → 점프가 사라진다.

첫 페이지에 있는 메시지(최근 메시지 검색)는 항상 실패하고, 과거 페이징으로
찾은 경우는 마지막 메시지 id가 바뀌지 않아 자동 스크롤이 뛰지 않으므로
성공한다 — "가끔 되고 대부분 안 됨" 증상의 정확한 원인이다.

**수정**: `useChatScroll`에 `suppressAutoScroll?: boolean` 입력을 추가하고,
`ChannelRoomPage`가 "이 채널의 점프 타깃이 대기 중"인지를 스토어에서 읽어
넘긴다. 억제 중에도 `prevMessageCount`/`prevLastMessageId` 부기는 계속
갱신한다 — 그래야 점프가 끝나고 억제가 풀린 순간 그동안 쌓인 증가분을
소급해서 하단으로 튀지 않는다. 플래그는 effect 의존성에 넣지 않고 ref로
읽는다(같은 이유).

억제 해제는 점프 훅의 `clear()`가 담당하므로 별도 배선이 없다: 발견/실패
어느 쪽이든 스토어 타깃이 비워지고 자동 하단 스크롤이 정상 복귀한다.

### 하이라이트 스타일

- 기존 tailwind 토큰으로 임시 배경 강조(예: `bg-primary/10` 트랜지션).

## 검증 방법

- 유닛 테스트: `useMessageJump` — (a) DOM 존재 시 스크롤+clear, (b)
  미존재→loadMore 반복→발견, (c) 예산 소진 폴백, (d) nonce 재발화, (e)
  타 채널 타깃 무시. jsdom에서 `data-chat-no` 요소 주입으로 검증.
- 유닛 테스트: `useMessageJumpStore` — request/nonce/clear.
- 유닛 테스트: `useChatScroll` — (a) 새 최신 메시지 도착 시 하단 스크롤,
  (b) `suppressAutoScroll` 중에는 스크롤하지 않음, (c) 억제가 풀린 뒤에도
  그동안 쌓인 증가분으로 소급 스크롤하지 않음, (d) loadMore 앵커 보존은
  억제와 무관하게 동작. rAF는 가짜 타이머/스텁으로 제어한다.
- 수동 확인: 검색 → 메시지 클릭 → 스크롤·하이라이트, **최근 메시지(첫
  페이지 내)로 점프해도 하단으로 튀지 않는지**, 오래된 메시지로 폴백 토스트,
  같은 결과 재클릭 재점프, 점프 후 새 메시지가 오면 하단 고정이 복귀하는지.

---

## 구현 체크리스트

1. `useChatScroll`에 `suppressAutoScroll` 입력 추가 — ref로 읽고, 억제 중에도
   부기는 갱신.
2. `ChannelRoomPage`에서 점프 대기 여부를 스토어에서 읽어 전달.
3. `useChatScroll` 유닛 테스트 신설(현재 테스트 파일 없음).

## 리스크와 미지수

- **키보드/리사이즈 재고정**: `useChatScroll`의 focus/resize 핸들러도
  하단으로 재고정한다(`useChatScroll.ts:82-92`). 점프 직후 사용자가 입력창을
  터치하면 점프 위치를 잃는다 — 현재도 그렇고 이번 수정 범위 밖이다.
  실제로 거슬리면 별도로 다룬다.
- **rAF 테스트 제어**: jsdom에서 `requestAnimationFrame` 스텁이 필요하다.
  기존 채널 훅 테스트에 선례가 없어 방식은 구현 시 확정한다.
