# ADR-0057: 홈 마지막 메시지 프리뷰 — 채널별 윈도우 관측을 단일 네이티브 쿼리로

> 상태: Accepted · 결정일: 2026-08-14

## 맥락 (Context)

홈 `ChannelList`의 행별 [`useLastChat`](../../apps/web/src/app/hooks/useLastChat.ts)은 채널마다 chat 캐시의 최신 30행 윈도우를 구독한다(`PREVIEW_LOOKBACK = 30`). 네이티브(WebView) 환경에서 이 구조가 만든 실측 비용:

- 홈 진입 1회당 채널 N개 × **브릿지 `loadAll:chat` 2회**(prime limit 50 + observe limit 30 — 페이로드가 달라 인플라이트 공유 불가) + `load:channel` 1회.
- 방↔홈 전환마다 옵저버 그룹/sync 타깃이 파괴·재생성되어 위 버스트가 매번 반복.
- 실측(2026-08-14 QA 세션): `loadAll:chat` 568회·avg 2130ms·**max 15015ms(=브릿지 타임아웃 상한)**. 타임아웃된 첫 쿼리는 콜백을 한 번도 부르지 않아 프리뷰가 빈 채로 고착되고, 같은 혼잡이 `useChannel`의 10초 resolve 타이머를 넘겨 입장 오류를 만들었다.

추가 정합성 결함: 낙관적 전송 행은 `chat_no = 0`으로 저장되는데 네이티브 조회는 `ORDER BY chat_no DESC LIMIT n`이라, 커밋 행이 limit 이상인 채널에서 **pending 행이 조회 윈도우에 들어오지 못한다**. IndexedDB 경로의 보정(`ChatQueryExecutor.includeUnsent`)은 네이티브에 없고, 호출부도 아무도 쓰지 않는다.

프리뷰가 "최신 1건"이 아니라 30행 윈도우인 이유는 제외 규칙(리액션 이벤트·스레드 답글·시스템 행·실패 전송은 프리뷰 불가, 톰스톤은 프리뷰 가능)이 JS(`pickPreviewChat`)에 있었기 때문이다.

## 결정 (Decision)

### 1. 프리뷰 의미론을 쿼리로 내리고, 홈은 채널 목록 전체를 브릿지 왕복 1회로 읽는다

새 브릿지 메시지 **`FetchLastChatsData`**(chat 전용): 요청은 `channelIds[]`, 응답은 채널별 `{ channelId, lastNo, item }`.

- `item` = 프리뷰 규칙을 통과한 최신 행 1건. SQL 판정: `parentId IS NULL AND stereo <> 'system' AND subType <> 'reaction' AND isFailed 아님`. **hidden(톰스톤)은 제외하지 않는다** — "삭제된 메시지입니다"로 렌더해야 한다.
- pending(`chat_no = 0`, 실패 아님) 행은 **최신 취급**(`compareByChatNo`와 동일 의미론) — 커밋 top-1과 별도 프로브로 읽어 pending이 있으면 그것을 답한다. 기존 D6(윈도우 탈락)이 홈에서 해소된다.
- `lastNo` = 그 채널 캐시의 **타입 무관 최대 chatNo**. 웹의 head-트리거(채널 폴링이 올린 `channel.chatNo`와 비교해 그 채널만 소량 refresh)의 비교 기준이며, "최신 행이 리액션이라 프리뷰 chatNo가 head보다 낮은" 상태를 부족분으로 오판하지 않게 한다.

### 2. 웹이 앱보다 먼저 배포된다 — 구버전 앱 폴백은 선택이 아니라 필수

새 기능을 기존 `FetchAllCacheData`의 쿼리 옵션으로 얹지 **않는다**: 구버전 앱은 모르는 옵션을 조용히 무시하고 잘못된 결과를 답한다(에러가 아니라 오답). 새 메시지 타입이면 구버전 host가 `NOT_FOUND`로 거절하므로 실패가 명시적이다.

- 웹은 `NOT_FOUND` 1회로 미지원을 학습(모듈 스코프 플래그, 전례: `NativeDBAdapter.batchReadUnsupported`)하고 이후 **오늘의 동작**(채널별 30행 윈도우 + JS `pickPreviewChat`)으로 폴백한다.
- 네이티브 처리 오류는 `items: null`로 답한다(형제 핸들러들과 동일) — 웹은 그 읽기 1회만 폴백한다(학습하지 않음).
- 앱에 박힌 SQL 의미론은 구버전에서 갱신할 수 없으므로, 웹은 응답 행을 자신의 `isPreviewableChat`으로 재검증하고 불합격이면 그 채널만 윈도우 폴백한다 — 의미론의 최종 소유자는 웹이다.
- IndexedDB(일반 브라우저) 어댑터는 이 메시지를 구현하지 않는다 — 폴백 경로가 곧 정답이다(인프로세스라 왕복 비용이 없고, 오늘과 동일 동작).

### 3. 프리뷰 의미론 유틸은 `@chatic/data`로 이동한다

`compareByChatNo`/`isPreviewableChat`/`pickPreviewChat`(+ 구성 요소)을 [`libs/data` 도메인 유틸](../../libs/data/src/data/domain/chatPreview.ts)로 옮기고 `apps/web/utils/chat.ts`는 재수출한다. 폴백 경로(데이터소스)와 웹 렌더링이 같은 판정을 쓰기 위함이다. `apps/desktop-web`의 사본은 참조만 하고 건드리지 않는다.

### 4. 홈의 행별 chat 구독을 제거한다

`ChannelList`는 리스트 레벨 `useLastChats(channels)` 하나로 전환: 결합 관측 + (첫 결과 수신 후에만 동작하는) head-트리거 소량 refresh. 행별 `useChatSync` 등록·prime·reconnect 시 N×`channel.get` catch-up이 홈에서 사라진다. `useLastChat`은 `PlaceChannelManagePage`가 아직 쓰므로 유지한다(후속 과제).

## 결과 (Consequences)

- 홈의 chat 브릿지 왕복: **채널당 2회+α → 전체 1회**. 페이로드도 30행×N → 1행×N.
- 방금 보낸 pending 메시지가 ack 전에도 홈 프리뷰에 보인다.
- head-트리거가 "이미 손에 든 결합 결과"와 비교하므로 초기화 레이스(cachedMax가 채워지기 전 refresh 발사)가 구조적으로 사라진다.
- 폭주의 나머지 절반 — 네비게이션마다의 sync 타깃 즉시 폴링/스냅샷 소실(P0-2), 옵저버 그룹 즉시 파기(P0-3), `useChannel` 10초 타이머(P1-2) — 는 이 ADR 범위 밖이며 별도 트랙으로 남는다.
- 구버전 앱에서는 성능 개선이 없다(오늘과 동일 경로) — 앱 배포가 따라와야 효과가 난다.

## 보완 (2026-08-15)

결정 4의 head-트리거 refresh는 **삭제**했다. 최근 메시지를 캐시에 적재하는 일은 이 트랙의
범위 밖에서 이미 별도로 관리되고 있어(네이티브 백그라운드 적재), 목록 계층이 같은 일을 다시
할 이유가 없다. `useLastChats`는 순수 캐시 관측이며, 적재 쪽의 쓰기가 `chats-last` 리이밋으로
목록을 갱신한다 — 목록 렌더는 어떤 경우에도 네트워크를 만들지 않는다.

## 보완 (2026-08-18) — 적재 주체를 홈이 명시적으로 갖는다

위 보완이 전제한 "별도로 관리되는 네이티브 백그라운드 적재"는 **실재하지 않았다**. `apps/mobile`의
`ChatDataSource`는 브릿지 crud 핸들러로만 도달하므로 chat 캐시 쓰기는 전부 웹이 조회할 때만
일어나고, 브라우저(IndexedDB)에는 그런 주체가 아예 없다. 그 결과 홈에 머무는 동안 chat 캐시를
쓰는 주체가 하나도 없어 — 행별 `useChatSync`는 결정 4가, head-트리거는 위 보완이 걷어냈다 —
프리뷰와 (ADR-0055로 프리뷰 시각을 따르게 된) 정렬이 방에 들어갔다 나올 때까지 멈췄다.

`channel`/`join`과 같은 방식으로, **활성 사이트의 채널들에 대한 chat sync를 홈이 등록한다**:
[`useChatSyncRegistration`](../../apps/web/src/app/hooks/useChatSyncRegistration.ts)(`useJoinSyncRegistration`의
chat 도메인 형제)을 `HomePage`가 마운트한다.

- **타깃 등록** — 채널마다 `registerChat(channelId)`. `chat.sync` 프레임은 등록된 모든 chat
  타깃에 디스패치되고 각 타깃이 자기 `channelId`로 거르므로, 사이트의 어느 채널에 도착한
  메시지든 라이브로 append된다. 방이 등록한 같은 키와는 ref-count로 dedup된다.
- **head-트리거 catch-up** — `ChatSyncPlan.run`이 no-op이라 등록만으로는 아무것도 안 당긴다.
  폴링으로 앞선 `channel.chatNo`가 캐시의 `lastNo`를 넘어선 채널만 소량 페이지를 당긴다. push가
  오든 안 오든 수렴을 보장하는 안전판이며, 실제로 움직인 채널에만 발사되므로 warm 목록은 0회다.
- **기준선** — 목록이 이미 도는 결합 관측(`observeLastList`, 동일 채널 집합 → 동일 옵저버 키라
  읽기가 공유된다)의 `lastNo`로 `updateLocalSnapshot`한다. `lastNo`만 패치하므로 열려 있는 방의
  메시지 윈도우는 건드리지 않는다.

위 보완의 원칙 — **목록 렌더는 네트워크를 만들지 않는다** — 은 그대로 유지된다. catch-up은 행이
아니라 화면이 소유하는 sync 등록 훅에 있고, `useLastChats`는 순수 관측인 채로 남는다(그 계약은
`useLastChats.test.ts`가 계속 못박는다).

## 관련

- 스펙/아키텍처: [docs/specs/cache/last-chat-preview.md](../specs/cache/last-chat-preview.md)
- 전례: ADR-0053(도메인별 캐시 계약 버전), `FetchManyCacheData`의 NOT_FOUND 학습 폴백
- 근거 감사: 2026-08-14 홈 요청 폭주 전수조사 (본 ADR의 맥락 수치)
