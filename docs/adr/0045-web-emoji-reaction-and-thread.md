# ADR-0045: apps/web에 이모지 리액션과 스레드를 붙인다 — 전체화면 스레드 · 액션 시트 · 유틸은 앱 로컬

> 상태: Accepted · 결정일: 2026-08-05
> 선행: [ADR-0008](./0008-threads-client-derived-from-parentid.md) (스레드를 `parentId`에서 클라이언트가 파생, 모바일은 out of scope로 유보) · [ADR-0024](./0024-group-chat-room-figma-redesign.md) · [ADR-0032](./0032-dm-chat-room-screen.md)
>
> 외부 계약 원본: `chatic-sockets-api` `docs/specs/chat-emoji-reaction/` (01-spec.md · 05-client-guide.md, Rev 2026-07-31)

> **이름 안내 (2026-09-01):** 이 문서가 쓰는 `*RemoteDataSource` · `RemoteGatewayBundle` · `*DomainGateway` · `remoteFactory` · `remote/data-sources/`는 **당시 이름**이다. 소켓 축이 `Socket` 접두로 옮겨간 뒤의 대응표는 [libs/data/docs/remote/README.md](../../libs/data/docs/remote/README.md#이름-규약-2026-09-01-리네임)에 있다. 기록이므로 본문은 그대로 둔다.

## 맥락 (Context)

`apps/web`(모바일)의 채팅방에는 이모지 리액션도 스레드 답글도 없다. 둘 다 붙인다.

### 이건 신규 구현이 아니라 포팅이다

`apps/desktop-web/src/app/features/chat/`에 두 기능이 전부 구현돼 있고, 스레드 설계는 ADR-0008이
결정 기록이다. ADR-0008은 "모바일(apps/web)은 out of scope"라고 명시적으로 유보해 둔 것을 이번에 연다.

**엔진 계층은 이미 끝나 있다.** 새로 뚫을 배선이 없다.

- `ChatRepositoryV2.setReaction()`이 낙관적 이벤트 행(`chatNo: 0` 센티넬 → fold가 마지막으로 정렬)
  생성·서버 이벤트로 교체·실패 시 삭제까지 처리한다 (`libs/data/src/data/repositories-v2/ChatRepositoryV2.ts:190`).
- `ChatRemoteDataSource.setReaction()`이 `chat.reaction` 패킷을 부른다 (`libs/data/.../ChatRemoteDataSource.ts:77`).
- `sendChat`은 `parentId`를 통과시키고 `createOptimisticChat`도 읽는다 (`ChatRepositoryV2.ts:277`).

**apps/web은 이 둘을 아무도 부르지 않을 뿐이다.**

### 지금 apps/web은 리액션 앞에서 깨진다 — 기능이 아니라 급한 수정이다

리액션 이벤트는 `stereo:'system'` · `subType:'reaction'`인 **평범한 chat 한 건**이고, `chat.feed`와
`chat.sync`에 그대로 섞여 온다. 서버는 걸러 주지 않는다(스펙 §3). apps/web에는 피드 가시성 필터가 없다:

- **방 화면** — `useChats`가 필터 없이 넘기고, `ChannelRoomPage.tsx:518`이 `isSystem`으로 시스템 분기,
  `systemMessageSuffixKey('reaction')`이 `null`, 레거시 한글 정규식 폴백이 `content`(undefined)를
  렌더 → **빈 `SystemNotice` 알약**. 내 이벤트는 `isOwnSystemChat`이 걸러주지만 남의 것은 안 걸러진다.
- **홈 목록** — `useLastChat.ts:52`가 "내 시스템 메시지"만 건너뛴다 → **남의 리액션 이벤트가 행의
  마지막 메시지 미리보기로 올라온다.**
- **스레드 답글**도 같은 이유로 본문 피드에 그냥 섞여 보인다.

즉 데스크톱에서 누가 이모지를 누르면 지금 모바일이 깨진다. 필터는 부가 기능이 아니다.

### 타입 갭 — 착수 전 해소가 필요했다

설치된 `@lemoncloud/chatic-socials-api@0.26.412`에는 `reaction$`도 `subType:'reaction'`도 없다
(직접 확인: `Type '"reaction"' is not assignable to type '"" | "join" | "leave" | undefined'`).
그래서 엔진이 `as DomainChat` 생캐스팅으로 밀어넣고 있고, `ChatDomainGateway` Pick에는 `'reaction'`이
빠져 있는데 `ChatRemoteDataSource`가 `ChatDomainGateway['reaction']`을 참조한다 — 런타임은 되고
타입만 안 맞는 상태다 (`libs/data/src/data/remote/gateways/index.ts:26`).

**범프 가능성을 조사했고, 순전히 가산적이었다.** `0.26.412 → 0.26.721`에서 `.d.ts` 5개만 바뀌고
제거·축소가 하나도 없다.

| 변경                            | 내용                                               |
| ------------------------------- | -------------------------------------------------- |
| `ChatSubType`                   | `'reaction'` 추가 (union 확장)                     |
| `ChatModel`                     | `reaction$?: ChatReaction` · `metaNo?` 추가        |
| `JoinModel`                     | `metaNo?` 추가                                     |
| 신규                            | `ChatReaction` · `SetReactionBody` · `DMStartBody` |
| `SiteRole`                      | `dummy` 추가 (union 확장)                          |
| `generated/field-registry.d.ts` | checksum만                                         |

union 확장이 위험한 곳(`Record<ChatSubType, …>` 전수 매핑)을 전부 조사했는데 유일한 사용처가
`Partial<Record<…>>`(`apps/desktop-web/.../systemMessage.ts:12`)라 안전하다. 스펙이 지목한 `0.26.720`과
최신 `0.26.721` 차이는 쓰지 않는 `DMStartBody` 하나뿐이다.

### 제약

- **서버는 리액션 집계를 저장하지도 내려주지도 않는다.** 클라이언트가 이벤트를 `chatNo` 순으로
  fold해 `(chatId, emoji, ownerId)`별 마지막 `action`을 현재 값으로 삼는다 (스펙 §2).
- **`action`은 목표 상태다.** 서버는 토글 판정을 하지 않는다 — 클라이언트가 현재 상태를 보고
  `'on'`/`'off'`를 정해 보낸다.
- **응답과 `chat.sync`가 둘 다 온다.** 리액션에는 `broadcast.exclude`가 없어 발신자도 에코를 받는다.
  chat id 기준 중복 제거가 필요한데, 엔진 캐시가 `id` 키로 idempotent write를 하므로 이미 충족된다.
- **`chat.feed`에 `parentId` 필터가 없고**, 루트에 `replyCount`도 없다 (ADR-0008). 스레드는 로컬
  캐시에 로드된 범위에서만 파생되므로 개수·내용이 best-effort다.
- **`parentId` 이중 인코딩** — 전송은 부모의 full id `<channelId>:<chatNo>`, 저장/브로드캐스트는
  루트의 bare `chatNo` 문자열, 낙관적 행은 payload 그대로. 매칭이 둘 다 받아야 한다.
- **이모지 fold 키는 서버 `normalizeEmoji`와 같아야 한다** — NFC + U+FE0F 제거. 다르면 한 클라이언트가
  켠 리액션이 다른 클라이언트에서 안 꺼진다.
- **모바일에는 데스크톱의 hover 툴바도, trailing 사이드 패널도 없다.** apps/web에 있는 것은
  롱프레스(450ms) → Radix 드롭다운(항목 하나: 복사)뿐이다.
- **리액션에는 푸시가 없다** (`stereo !== 'user'`라 push leg 자체가 안 붙는다). **답글에는 있다** —
  평범한 `stereo:'user'` chat이므로.

## 결정 (Decision)

### 1. 이모지와 스레드를 한 트랙으로 함께 넣는다

둘이 같은 지점을 건드린다 — 메시지 롱프레스 액션 표면, 피드 가시성 필터, `MessageRow` 슬롯,
홈 미리보기 필터. 나눠 하면 같은 파일을 두 번 고치게 된다.

### 2. 피드 가시성 필터를 먼저 넣는다 (버그 수정)

`isFeedVisible = chat => !chat.parentId && chat.subType !== 'reaction'` 를 `useChats`의 매핑 단계에
넣는다. 삭제된 메시지는 남긴다(서버 delete가 soft delete이므로 tombstone으로 제자리 유지).
시스템 join/leave도 남긴다(알림 줄로 렌더).

홈 미리보기에는 한 조건이 더 붙는다 — `isPreviewableChat = isFeedVisible && !isSystem && !isFailed`.
join/leave는 본문이 없어 미리보기가 빈 줄이 되고, 실패한 전송은 채널에 도달하지도 않았는데
`chatNo: 0`을 무한히 유지해 미리보기를 붙잡는다.

### 3. 파생 유틸은 apps/web에 별도로 둔다 — libs 승격은 하지 않는다

`foldReactions` · `buildThread`/`buildThreadIndex` · `feedVisibility` · `previewChat`을
`apps/web/src/app/features/channels/utils/`에 앱 로컬로 구현한다. 데스크톱 코드는 건드리지 않는다.

diff를 apps/web 안에 가두고 데스크톱 회귀 위험을 0으로 만드는 것이 이번 트랙의 우선순위다.
`libs`로 승격하면 데스크톱 import 경로까지 바뀌어 리뷰 범위가 두 앱으로 벌어진다.

### 4. 스레드 표면은 전체화면 라우트

`ROUTES.channels.thread` = `:channelId/thread/:chatNo`. 뒤로가기·딥링크·페이지 전환 애니메이션이
기존 라우팅에 그대로 얹히고, 답글 입력창에 키보드가 올라올 공간이 확보된다. 바텀시트는 시트 안에
스크롤 목록 + 입력창 + 키보드를 같이 넣어야 해 높이 다툼이 생긴다.

**flat · 루트 전용(2단계).** 답글의 `parentId`는 항상 스레드 루트다. 답글에 답글을 달면 서버가
루트로 정규화한다 — 중첩 스레드는 없다.

### 5. 스레드 루트에 답글 푸터를 달고, 안 본 답글을 암시적으로 강조한다

루트 행 하단에 "답글 N · 최신 답글자 아바타" 푸터를 달고, 내 읽음 커서(`join.readNo`) 이후의 답글이
있으면 점·강조로 표시한다.

이게 없으면 실제로 사상된다. 답글은 `stereo:'user'`라 미읽음 배지에 잡히는데 본문 피드에서는 숨긴다.
배지 3개를 보고 방에 들어오면 새 게 없고, 읽음 커서는 `chatNo` 기준이라 그냥 읽음 처리돼서
**답글을 못 본 채 배지만 사라진다.** 데스크톱은 사이드 패널이 상시 떠 있어 덜 티나지만 모바일은
표면이 따로다. 재료는 전부 로컬(로드된 답글 + `readNo`)이라 별도 상태 설계가 필요 없다.

ADR-0008이 반대한 "답글을 본문에 인라인 노출"은 채택하지 않는다 — 데스크톱과 멘탈모델이 갈라진다.

### 6. 메시지 롱프레스는 Radix 드롭다운 → BottomSheet로 바꾼다

한 시트에 담는다: **이모지 바로선택 줄**(최근 사용 + 기본, 6개) → **복사** → **답글(스레드 열기)**.
실패/대기 행에는 기존 재시도·삭제가 그대로 붙는다.

`libs/web-ui-kit`의 `BottomSheet`/`SheetOption`(키보드 인식, `--keyboard-height`)을 재사용한다.
ko/en 번역에 **쓰이지 않는 `chat.room.messageActions` 키가 이미 있다** — 원래 이 방향이었다는 흔적이다.
좁은 드롭다운에는 이모지 바로선택 줄이 들어가지 않는다.

### 7. 이모지 선택은 바로선택 줄 + 전체 피커

액션 시트 상단의 6개 줄에서 한 탭으로 끝내고, "더보기"로 데스크톱의 6카테고리 큐레이션 피커
(`EMOJI_CATEGORIES`, 외부 emoji DB 없음)를 시트로 띄운다. 최근 사용 이모지는 로컬에 유지한다.

### 8. `@lemoncloud/chatic-socials-api`를 `^0.26.721`로 범프한다

가산적임을 확인했으므로 로컬 augmentation을 쓰지 않는다. 범프와 함께:

- `ChatRepositoryV2.setReaction`의 `as DomainChat` 생캐스팅을 제거한다.
- `ChatDomainGateway` Pick에 `'reaction'`을 정직하게 추가한다 (`libs/data/.../gateways/index.ts:26`).

### 범위 (포함/제외)

**포함** — 리액션 칩·바로선택·전체 피커·토글 · 피드/미리보기 가시성 필터 · 스레드 전체화면 라우트와
답글 전송 · 루트 답글 푸터와 안 본 답글 강조 · 메시지 액션 BottomSheet · socials-api 범프와
그에 딸린 캐스팅·Pick 정리 · ko/en 번역 키.

**제외** — `chat.feed`의 `parentId` 필터와 서버측 답글 집계(백엔드 후속, ADR-0008이 유보) ·
중첩 스레드 · 리액션 푸시 · 리액션한 사람 목록 상세 시트 · 데스크톱 코드 변경 ·
파생 유틸의 libs 승격 · 답글 전용 미읽음 카운터(서버 자리 없음).

**채널 종류를 구분하지 않는다** — 그룹·DM·셀프 채팅 모두 같게 동작한다. 셀프 채팅에서 자기 메모에
리액션·답글을 붙이는 것은 무해하고, 분기를 넣으면 코드만 늘어난다.

## 대안 (Alternatives)

- **파생 유틸을 `libs`로 승격해 두 앱이 공유** — 이번엔 버렸다. `parentId` 이중 인코딩과 이모지 fold 키
  같은 서버 계약이 두 군데 생기므로 드리프트 위험은 실재한다(`feedVisibility` 주석 자신이 그 경고를
  담고 있다). 그래도 데스크톱 회귀 위험 0과 리뷰 범위 한정을 이번 트랙에서 더 높게 봤다. 통합은
  별도 리팩토링 트랙 — 그때까지 드리프트를 감수한다.
- **이모지만 먼저, 스레드는 다음 트랙** — 버렸다. 두 기능이 같은 파일 4곳을 건드려 같은 코드를
  두 번 고치게 된다.
- **스레드를 바텀시트로** — 버렸다. 시트 안에 스크롤 목록 + 입력창 + 키보드를 같이 넣어야 해 높이
  다툼이 생긴다. 채널 맥락이 뒤에 남는 이점보다 손해가 크다.
- **스레드를 루트 아래 인라인 확장** — 버렸다. 새 표면이 없어 제일 가볍지만 답글이 많아지면 피드가
  무너지고, ADR-0008이 명시적으로 거부한 선택지다.
- **Radix 드롭다운 유지 + 항목만 추가** — 버렸다. 변경은 최소지만 좁은 드롭다운에 이모지 바로선택
  줄이 들어가지 않고, 모바일 터치 타깃에도 안 맞는다.
- **범프 대신 로컬 타입 augmentation** — 버렸다. 범프가 가산적임을 확인한 뒤로는 계약을 익명으로
  적는 장점이 사라졌다.
- **이모지 바로선택 줄만 (고정 6개, 전체 피커 없음)** — 버렸다. 가장 가볍지만 데스크톱과 반응
  집합이 갈라진다.

## 결과 (Consequences)

- **지금 있는 버그가 막힌다.** 데스크톱발 리액션 이벤트가 모바일에서 빈 알약으로 뜨는 것과 홈 행
  미리보기를 점거하는 것이 이번 필터로 함께 사라진다.
- **답글 개수와 스레드 내용이 best-effort다** (ADR-0008 계승). 로드된 캐시 범위에 있는 답글만
  센다 — 오래 묵은 스레드는 히스토리를 페이징해 들여야 옛 답글이 나타난다. UI가 개수를 권위 있는
  값으로 제시하지 않아야 한다. 탈출구는 유보된 `chat.feed` `parentId` 필터이고, 이 설계는 그게
  오면 로컬 필터를 서버 조회로 갈아끼우도록 모양을 맞춰 뒀다.
- **미읽음 배지는 리액션에 부풀지 않는다.** `useChannelUnreads.ts:36`가 `chatNo - metaNo`로 시스템
  이벤트를 상계하고 리액션 이벤트는 `stereo:'system'`이라 `metaNo`에 잡힌다 — 확인했고, 손댈 것이 없다.
- **답글은 여전히 배지에 잡힌다.** 서버에 답글 전용 카운터 자리가 없어서다. 결정 5의 루트 푸터와
  암시 강조가 완화책이고, 완전한 해결은 아니다.
- **파생 로직이 두 앱에 존재한다.** 서버 계약이 바뀌면(예: 리액션 응답이 집계를 싣기 시작하면)
  두 군데를 고쳐야 한다. 알고 진 부채다.
- **`ChatSubType` union이 넓어진다.** 지금은 `Partial<Record<…>>`뿐이라 안전하지만, 앞으로 이 union
  위에 전수 매핑을 만들면 `'reaction'` 케이스를 반드시 다뤄야 한다.
- **`BottomSheet`가 메시지 액션까지 맡는다.** 드롭다운이 사라지므로 우클릭(`contextmenu`) 경로도
  시트로 모인다 — 모바일 웹뷰에서는 사실상 롱프레스 하나로 수렴한다.
- **답글에는 푸시가 온다.** 리액션과 달리 평범한 `stereo:'user'` chat이므로 기존 푸시·`viewing`·
  `mutedUserIds` 규칙이 그대로 적용된다. 별도 작업은 없지만, 스레드에 답글을 달면 채널 전체에
  푸시가 나가는 동작을 제품이 받아들여야 한다.

## 후속 (Follow-ups)

- `chat.feed`에 `parentId` 필터와 루트 답글 집계(`replyCount`·`lastReplyAt`)를 넣는 백엔드 작업.
  들어오면 답글 개수가 권위를 얻고 best-effort 단서를 UI에서 걷을 수 있다. 별도 ADR.
- 파생 유틸(`foldReactions`·`buildThread`·`feedVisibility`·`previewChat`)의 `libs` 통합 리팩토링.
  별도 ADR.
- 리액션한 사람 목록을 보여주는 상세 시트. `foldReactions`가 이미 `userIds`를 들고 있어 UI만 남았다.
