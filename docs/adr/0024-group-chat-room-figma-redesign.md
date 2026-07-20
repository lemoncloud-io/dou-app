# ADR-0024: 그룹 채팅방 화면 Figma 재디자인 (헤더 아바타 스택·총원 수·읽음 표시)

> 상태: Accepted · 결정일: 2026-07-20

관련: [ADR-0021 채팅방 Figma 시각 정제](0021-channel-room-figma-refinement.md)의 후속(추가 개선). 0021을 대체하지 않고 헤더/읽음 표시를 확장한다.

## 맥락 (Context)

그룹 채팅방 화면([`ChannelRoomPage.tsx`](../../apps/web/src/app/features/channels/pages/ChannelRoomPage.tsx))의 디자인이 갱신되어 반영이 필요하다. 참조 Figma:

- 빈 상태: `node-id=3209-26754`
- 대화 있는 상태: `node-id=3209-27020`

요구사항:

- 상단에 참여자 아바타 목록 노출 — **소유자가 가장 왼쪽, 최대 5개까지**, 그 뒤에 **채널 총원 수** 표시.
- 메시지 버블 디자인 개선.
- 컴포넌트는 [`@chatic/web-ui-kit`](../../libs/web-ui-kit) 기반. 누락 컴포넌트는 해당 라이브러리에 신규 정의 후 사용.
- 아이콘이 필요하면 리소스를 확보(web-ui-kit `resources/icons` 관례 준수).

**Figma를 현재 코드와 대조한 핵심 발견 (재디자인 범위를 좁히는 근거):**

| 항목                  | 현재 코드                                                                          | Figma                                                | 판정                      |
| --------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------- |
| 내 버블 색            | `--bubble-mine` = #102346                                                          | #102346(`blue_bk`)                                   | 이미 일치                 |
| 읽음 강조색           | `--main-accent` = #90C304                                                          | #90c304(`main2_Color`)                               | 이미 일치                 |
| 버블 패딩/라운드/꼬리 | `px-[14px] py-2`, 라운드 18px, 꼬리 1코너(내 메시지=우상단 각짐, 상대=좌상단 각짐) | 동일 (14/8 패딩, 동일 꼬리 형태)                     | 이미 일치                 |
| 메시지 아바타 크기    | 39px (`size-[39px]`)                                                               | 32px (`1명 Profile` 32×32)                           | **변경 필요**             |
| 읽음 표시             | 안읽음 **숫자만** `--main-accent`로                                                | `읽음 N`(초록) · `안읽음 N`(회색), 라벨+불릿(•) 구분 | **변경 필요 (동작+시각)** |
| 헤더                  | 아바타 1개 + 제목 (1줄)                                                            | 제목(1줄) + 그 아래 **아바타 스택 + 총원 수**(2줄)   | **변경 필요**             |
| 빈 상태 본문          | "친구 초대하기" 이미 구현                                                          | 동일                                                 | 변경 없음(헤더만 영향)    |

즉, 버블의 색·라운드·패딩·꼬리는 이미 Figma와 일치한다. 실질 변경은 **① 헤더 2줄화(아바타 스택+총원), ② 읽음 표시를 읽음+안읽음 2요소로 확장, ③ 메시지 아바타 32px화** 세 가지다.

필요한 데이터는 모두 확보되어 있다: `channel.ownerId`, `channel.memberCount`, `activeMemberIds`, `profileMap`(닉/썸네일), `getReadCount`(readCount·unreadCount 동시 반환). 재사용 컴포넌트도 존재한다: [`AvatarGroup`](../../libs/web-ui-kit/src/foundations/avatar/AvatarGroup.tsx)(겹침 스택+카운트, 6px 겹침=Figma와 일치), `ImageAvatar`/`DefaultAvatar`, `IconGroup`/`IconChevronRight`. 새 아이콘 리소스는 불필요하다.

## 결정 (Decision)

### 범위 (포함)

1. **헤더에 참여자 메타 행 추가.** [`ChatRoomHeader`](../../libs/web-ui-kit/src/composites/header/ChatRoomHeader.tsx)에 제목 아래로 렌더되는 optional `meta` 슬롯(2줄 구조)을 추가한다. 그룹 채널에서만 이 슬롯에 아바타 스택+총원을 넘긴다.
    - 스택은 `AvatarGroup` 재사용, `max={5}`. 아바타 노드는 페이지가 조립: **소유자(`channel.ownerId`)를 가장 왼쪽**, 이후 나머지 참여자는 `activeMemberIds` 순으로 채운다. 각 아바타는 `profileMap`(닉/썸네일) → 멤버 유저캐시 순으로 해석, 썸네일 없으면 `DefaultAvatar`. 20px 원, 6px 겹침(Figma 일치).
    - **총원 수 = `channel.memberCount`**(본인 포함 전체). 빈방이면 `1`.
2. **읽음 표시를 읽음+안읽음 2요소로 확장.** [`ReadReceipt`](../../libs/web-ui-kit/src/composites/chat/ReadReceipt.tsx)를 확장해 `읽음 N`(`--main-accent` 초록) · 불릿(•) · `안읽음 N`(`text-description` 회색)로 렌더한다. `readCount`/`unreadCount`와 `readLabel`/`unreadLabel`을 props로 받는다.
    - 표시 조건: 기존 그룹 판별(`showReadReceipt && isReady`) 유지. 표시될 때 `읽음 N`은 항상 노출, `안읽음 N`은 `> 0`일 때만 노출(불릿은 둘 다 있을 때만). 모두 읽으면 `읽음 N`만 남는다(기존엔 아무것도 안 보였음).
    - 배치: 상대 메시지 = `시간 · [읽음·안읽음]`, 내 메시지 = `[읽음·안읽음] · 시간`(시간이 바깥쪽). 이 배치는 이미 `MessageRow`의 `flex-row-reverse` 로직으로 성립.
3. **메시지 아바타 크기 39px → 32px.** [`ChannelMessageRow`](../../apps/web/src/app/features/channels/components/ChannelMessageRow.tsx)의 아바타/스페이서를 32px로. 아바타 없을 때의 플레이스홀더 아이콘은 `lucide` 직접 import 대신 web-ui-kit `resources/icons` 배럴 경유로 정렬한다.

### 범위 (제외)

- 나와의 채팅(`self`)·1:1 DM 헤더 — 아바타 스택/총원 미노출(`meta` 미전달). 이번 개선은 그룹 채널 한정.
- 버블 색·라운드·패딩·꼬리 형태 — 이미 Figma와 일치하므로 손대지 않는다.
- 헤더 아바타/제목 탭 시 동작 변경 — 현행 유지(⋯ 메뉴 → 방 설정).
- 메시지 조회/전송/스크롤/읽음처리 로직 — 변경 없음.

## 대안 (Alternatives)

- **그룹 전용 `GroupChatHeader` composite 신설** — 기각. `ChatRoomHeader`가 이미 back/title/avatar/moreMenu를 갖추고 있어 `meta` 슬롯 추가가 최소 변경이다. 별도 컴포넌트는 헤더 로직이 두 벌로 갈라져 중복·표류를 부른다.
- **읽음 표시를 안읽음 숫자만 유지하고 스타일만 조정** — 기각. Figma가 `읽음 N · 안읽음 N`을 명시하고 `getReadCount`가 두 값을 이미 제공하므로, 읽음 확인 UX를 살리는 쪽을 택했다.
- **헤더 `avatar` prop에 조립된 노드를 통째로 전달** — 기각. 2줄(제목+메타) 레이아웃이 필요해 단일 아바타 슬롯으로는 정렬이 깨진다. 구조적 슬롯 추가가 맞다.

## 결과 (Consequences)

- `ChatRoomHeader`가 2줄 헤더를 지원하게 되어 향후 다른 채널 유형에도 메타 행을 재사용할 수 있다. 기존 호출부(DM/self)는 `meta` 미전달로 무영향.
- `ReadReceipt`의 props가 바뀌므로(안읽음 전용 → 읽음+안읽음) 이 컴포넌트를 쓰는 곳을 함께 갱신해야 한다. 모두 읽은 메시지에도 `읽음 N`이 새로 보이는 UX 변화가 생긴다.
- `ChannelRoomPage`가 `useChannelMembers`에서 `members`(또는 `total`)를 추가로 구독하고, 아바타 조립 로직(소유자 우선 정렬)을 페이지에서 소유하게 된다.
- 버블 자체는 손대지 않아 회귀 위험이 낮고, 변경은 헤더·읽음표시·아바타 크기로 국한된다.
- 다음 단계: 본 ADR을 입력으로 dev-2_implement의 스펙 작성(Phase A)으로 이어진다.
