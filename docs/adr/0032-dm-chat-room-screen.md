# ADR-0032: 1:1(DM) 채팅 화면

> 상태: Accepted · 결정일: 2026-07-27

## 맥락 (Context)

`ChannelRoomPage`는 이미 self / group 채팅을 처리하지만 `stereo === 'dm'`은
"not special-cased yet" 주석만 남긴 채 미처리 상태였다. 1:1 채팅 화면을 추가해야
한다.

기존 코드 조사에서 확인한 사실:

- **삭제 vs 나가기**는 이미 구현되어 있다. `ChannelSettingsPage`가 `isOwner`로
  분기해 초대자(owner)→삭제, 초대받은자(member)→나가기를 수행한다. DM도 초대자가
  owner이므로 추가 작업 없이 동작한다.
- `ChatRoomHeader`에는 이미 `kind='direct'`(1인 글리프 fallback)가 정의돼 있으나
  페이지가 `self`/`group`만 넘긴다.
- `isGroupChat`은 이미 `stereo !== 'dm'`으로 계산돼, 그룹 전용 참여자 스택(meta)은
  DM에서 뜨지 않는다.
- 그룹용 `ReadReceipt`는 "읽음 N · 안읽음 M" 포맷이다.

제약: 컴포넌트는 `@libs/web-ui-kit` 기반으로 구현하고, 누락 시 해당 라이브러리에
새로 정의한다. DM은 `stereo === 'dm'`으로 식별한다.

## 결정 (Decision)

### 포함 (In scope)

1. **DM 식별**: `isDmChat = channel.stereo === 'dm'` 파생.
2. **헤더**: `kind='direct'`. 제목은 **상대(나를 제외한 상대 멤버)의
   `profile.nick`**, 아바타는 상대 thumbnail. 상대는 roster에서 `userId`가 아닌
   멤버로 식별하고, site profile(`profileMap`)의 nick/thumbnail을 우선 사용하되
   없으면 user 캐시(`member.nick`/`name`)로 폴백한다.
3. **방 이름 변경 없음**: DM 방 이름은 **변경 불가**, 헤더는 항상 상대 nick 파생.
   `ChannelSettingsPage`에서 DM일 때 "방 이름 변경" row는 편집 진입(다이얼로그
   오픈)을 제거하고, "친구 추가" row는 숨긴다. (알림 토글·멤버 목록·삭제/나가기는
   유지.)
4. **읽음 표시(카톡식 '1' 뱃지)**: DM에서는 상대가 안 읽었을 때 메시지 옆에 `1`을
   표시하고 읽으면 사라진다. `ReadReceipt`에 DM 표시 모드를 추가(예: `mode`/`variant`
   prop)해 unread 인원(0 또는 1)만 뱃지로 렌더링한다. `showReadReceipt` 조건
   (`!isSelfChat && activeCount >= 2`)은 DM에서 이미 참이므로 그대로 재사용한다.
5. **빈 상태**: DM은 메시지가 없을 때 **버블이 없는 것이 곧 초기 상태**다. 그룹
   빈 상태의 "초대하기" CTA는 DM에 표시하지 않는다(빈 상태 분기를
   `!isDmChat`으로 게이트).

### 제외 (Out of scope)

- DM 방 이름 변경 UI/정책 (변경 불가로 확정, 별도 기능 없음).
- 신규 web-ui-kit 컴포넌트 신설: `ChatRoomHeader`·`MessageInput` 등은 재사용하고,
  읽음 표시는 기존 `ReadReceipt`에 모드만 추가한다(신규 컴포넌트 불필요).
- DM 채널 생성 흐름(이번 화면은 이미 존재하는 DM 채널을 여는 것에 한정).

## 대안 (Alternatives)

- **읽음 표시에 기존 "읽음/안읽음" 포맷 재사용**: DM은 인원이 1명이라 자연히 최대
  1로 표시되지만, 카톡식 '1' 뱃지가 요구사항("읽기횟수 최대 1")과 UX에 더
  부합하여 채택하지 않음.
- **DM 방 이름 변경 허용**: 헤더가 상대 nick 파생이라 사용자 지정 이름과 충돌하고
  의미가 모호해져 제외.
- **DM 전용 헤더/읽음 컴포넌트 신설**: `kind='direct'`와 `ReadReceipt` 모드 추가로
  충분하여 신설하지 않음(YAGNI).
- **빈 상태 안내 문구 추가**: Figma 초기 상태가 "버블 없음"이라 불필요.

## 결과 (Consequences)

- 얻는 것: 최소 변경으로 DM 화면 완성. 삭제/나가기·그룹 제외 로직이 이미 있어
  대부분 재사용된다. 헤더·입력·읽음 표시가 그룹과 한 컴포넌트 계열로 유지된다.
- 트레이드오프:
    - 상대가 초대 수락 전(join `joined === 0`, pending)이면 `activeMemberIds`에
      상대가 없어 헤더 nick을 roster/user 캐시 폴백으로 구해야 한다. 프로필 미로딩
      시 잠깐 폴백 이름이 보일 수 있다.
    - `ReadReceipt`에 모드 분기가 생겨 컴포넌트가 약간 복잡해진다(그룹 카운트 vs DM
      뱃지).
    - DM 방 이름을 영구히 바꿀 수 없다(정책상 의도된 제약).
