# Manual Test Flow — 1:1 초대 및 DM 채팅

Manual Playwright run against the live dev backend. Covers the relay 1:1 invite
(send → accept → room) and the DM display rules of
[ADR-0039](../adr/0039-dm-display-name-chain-and-invite-profile-release.md) —
feature docs: [dm-chat](../../apps/web/docs/feature/channels/dm-chat.md) ·
[invite-accept-entry](../invite-accept-entry.md).

Scope is **`apps/web` in a browser**. The native leg (real SMS → deeplink → converter →
WebView, and the SMS composer bridge) is out of scope; the debug overlay's
`InviteRedirectScreen` stands in for the deeplink hop.

## Environment

- Dev server: `cd apps/web && ../../node_modules/.bin/vite --port 4200`
- URL: `http://localhost:4200`
- Backend: real dev via `.env.dev` (relay cloud = `default`)
- **Two browser contexts are required** — this feature has two actors and each holds its own
  session/IndexedDB. Use two separate profiles/incognito windows, referred to below as **A
  (inviter)** and **B (invitee)**. Two tabs in one profile will NOT work: they share the session.

### Debug overlay (the tooling this flow leans on)

Entry: **MyPage → app version row → tap 10× → "Debug Mode"**. Then:

| Screen                 | What this flow uses it for                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| `EmailLoginScreen`     | Sign in as a real account **without phone verification** — how A becomes a main user          |
| `InviteRedirectScreen` | Paste a share link, preview the converted URL, navigate — replaces the SMS/native hop         |
| `ProfileEditorScreen`  | Set/clear a place-profile nick — the only practical way to drive the title chain's tiers      |
| `DBBrowserScreen`      | Read the local cache (`join.nick`, `channel.name`, profiles) when a title's tier is ambiguous |
| `LogBufferScreen`      | Socket/packet errors when a step fails without a visible reason                               |

## Preconditions to resolve on the first run

These are unknowns, not steps — settle them once and note the answers in this file.

1. **Can B accept without an OTP?** Accept rejects with 403 unless the session's verified number is
   the invited one. If B's dev account already has that phone alias attached, `needVerify` is false
   and the accept goes straight through (**Path A**). Otherwise B must verify (**Path B**).
2. **Path B code delivery.** `send` returns only `sent`/`expiredAt` — **the OTP is never in the
   response**, and `dryRun` means "do not deliver at all". A dev build's practical channel is the
   **Slack switch** on the verify screen (`slack: true, sms: false`). Confirm a dev Slack
   destination exists before planning around Path B.
3. **Does `channel.name` come back on a relay DM?** Tier 3 of the title chain. Read it in
   `DBBrowserScreen`. If it is empty, T7 expects the shared label instead — see the note there.

> **Rate limits burn fast.** 60s cooldown, 10 sends/day/number, 20/day/device, 5 wrong answers →
> all reject with 429. A number that does not match the invite rejects at SEND with 400. Do not
> loop the verify screen; prefer Path A.

## Setup

| Step | Where | Action                                                                                                                  |
| ---- | ----- | ----------------------------------------------------------------------------------------------------------------------- |
| S1   | A     | Open `/`, wait out the guest login, open the debug overlay → `EmailLoginScreen` → sign in as the inviter account        |
| S2   | A     | Confirm the relay (default) cloud is active and a place is selected — the home channel list must render                 |
| S3   | B     | Open `/` in the second context, let the guest login settle. Do **not** sign in yet if testing Path A as a fresh invitee |
| S4   | —     | Decide the invite target phone number (Path A: the number B's account owns)                                             |

## Test cases

### 초대 발송 (A)

| #   | Area              | Steps                                                                   | Expected                                                                                                                                                     | Result |
| --- | ----------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| T1  | 초대 발송         | A: home → ＋ → "1:1 대화" → `/invite/contact` → 이름 + 번호 입력 → 발송 | Waiting screen `/invite/:id/waiting`. Browser is non-native so the link goes to the **clipboard** (`contactInvite.sentToast.clipboard`), not an SMS composer |        |
| T2  | 초대 행 — pending | A: home 목록                                                            | 초대 행: `pending` 뱃지 + 입력한 이름 + 부제 `010-****-{last4}`. 아바타는 **링 있는 네이비 원 + 흰 solid 실루엣**(42px) — 링 없는 lucide 아웃라인이면 회귀   |        |
| T3  | DM 행 생성        | A: home 목록                                                            | 서버가 DM 채널을 만들면 초대 행과 별개로 DM 행이 나타난다 (동기화까지 몇 초)                                                                                 |        |

### 표시 이름 체인 — A 관점, 상대 프로필 없음 (S1)

| #   | Area                  | Steps                                            | Expected                                                                                                                                               | Result |
| --- | --------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| T4  | **홈 = 방 헤더**      | A: DM 행 제목을 적어두고 그 방을 연다            | **두 문자열이 정확히 같다.** 이 플로우의 핵심 검증 — 다르면 ADR-0039가 고친 버그의 회귀                                                                |        |
| T5  | 관리 목록도 같다      | A: 플레이스 설정 → 채팅방 관리                   | 같은 DM의 제목이 T4와 동일                                                                                                                             |        |
| T6  | 방 설정도 같다        | A: 방 → ⋯ → 방 설정                              | 이름 행 제목이 T4와 동일, 아바타는 1인 글리프                                                                                                          |        |
| T7  | 체인 3·4단            | A: `DBBrowserScreen`에서 그 채널의 `name`을 확인 | `channel.name`이 있으면 제목이 그 값. 비어 있으면 **"대화 상대"**(`chat.dm.unnamedPeer`). `***1234` 같은 번호 표시명은 **어디에도 나오지 않아야 한다** |        |
| T8  | 입장 안내 — 이름 없음 | A: DM 방 본문 최상단                             | 날짜 구분선 바로 아래 2줄 블록: **"대화 상대가 채팅방에 입장했습니다."** / "1:1 대화를 시작해 보세요."                                                 |        |
| T9  | 초대 CTA 없음         | A: 빈 DM 방                                      | 그룹방의 "친구초대하기" CTA가 **없다**                                                                                                                 |        |

### 수락 (B)

| #   | Area                     | Steps                                                                            | Expected                                                                                                                                  | Result |
| --- | ------------------------ | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| T10 | 딥링크 진입              | B: 디버그 오버레이 → `InviteRedirectScreen` → T1의 클립보드 링크 붙여넣기 → 이동 | `/invite/accept?…`로 리다이렉트되고 수락 화면이 뜬다. 홈이 깜빡이지 않아야 한다                                                           |        |
| T11 | 수락 화면 내용           | B: 수락 화면                                                                     | 초대자 이름/아바타, "You / 1:1 대화" 카드, 유효시간 카운트다운(`HH:mm:ss 남음` 또는 `N일 N시간 남음`). **1:1이므로 플레이스 카드는 없다** |        |
| T12 | **프로필을 묻지 않는다** | B: "수락"                                                                        | ADR-0039 결정 5 — 플레이스 프로필 입력 화면이 **뜨지 않는다.** (Path B면 전화 인증만 한 번)                                               |        |
| T13 | 방 진입                  | B: 수락 완료                                                                     | 홈을 경유해 DM 방으로 replace 이동. 뒤로가기가 수락 화면으로 돌아오지 않는다                                                              |        |
| T14 | 미해소 폴백              | B: 방이 즉시 안 잡히는 경우                                                      | 스피너에 머물지 않고 `relayInviteAccept.channelPending` 토스트 + 홈. 방은 다음 동기화에 목록에 나타난다                                   |        |

### 수락 후 — 양쪽 갱신 (S2)

| #   | Area                           | Steps                                                        | Expected                                                                                                                         | Result |
| --- | ------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------ |
| T15 | 입장 시스템 메시지             | A: 같은 DM 방                                                | 스트림에 가운데 정렬 pill "…님이 채팅방에 입장했습니다."가 뜬다. 최상단 블록과 **같은 문장이 두 모양으로 보이는 것은 의도된 것** |        |
| T16 | 프로필 도착 시 4화면 동시 갱신 | B: `ProfileEditorScreen`에서 nick을 "토끼"로 저장 → A로 전환 | A의 **홈 목록·관리 목록·방 헤더·방 설정** 제목이 모두 "토끼"로 바뀐다. 홈 행 아바타도 상대 사진(있으면)으로                      |        |
| T17 | 입장 안내에 이름 반영          | A: DM 방 본문 최상단                                         | "토끼님이 채팅방에 입장했습니다."로 바뀐다 (T8의 이름 없는 변형에서 전환)                                                        |        |
| T18 | 인원수 pill 없음               | A: home 목록의 DM 행                                         | 2인이지만 인원수 pill이 **없다**. 그룹 행에는 여전히 있다                                                                        |        |

### 방 이름 변경 — 내 join.nick (S3)

| #   | Area               | Steps                                                  | Expected                                                                                                     | Result |
| --- | ------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------ |
| T19 | 이름 행 진입       | A: 방 설정 → 이름 행                                   | `>` 가 있고 탭하면 이름 편집 다이얼로그가 열린다 (그룹용 채널명 다이얼로그가 아니다)                         |        |
| T20 | placeholder        | A: 다이얼로그                                          | placeholder가 **지금 보이는 이름**("토끼"). 내 프로필 닉이 뜨면 회귀                                         |        |
| T21 | 저장 → 4화면       | A: "토끼친구" 저장                                     | 네 화면 모두 즉시 "토끼친구". **방 헤더가 즉시 바뀌는지** 특히 확인 — projection 캐시를 읽으면 여기서 늦는다 |        |
| T22 | 상대에게 안 보인다 | B: 같은 방                                             | B의 제목은 A가 붙인 이름이 아니다(B는 A의 프로필 닉/폴백을 본다)                                             |        |
| T23 | 우선순위 유지      | B: `ProfileEditorScreen`에서 nick을 "토끼2"로 변경 → A | A는 여전히 **"토끼친구"** — 내가 붙인 이름이 상대 프로필을 계속 이긴다                                       |        |
| T24 | 비우면 복귀        | A: 이름을 지우고 저장                                  | 체인이 상대 프로필로 내려가 "토끼2"                                                                          |        |
| T25 | 20자 상한          | A: 21자 입력                                           | 20자에서 캡, 카운터 `20/20`                                                                                  |        |
| T26 | "친구 추가" 없음   | A: DM 방 설정                                          | "친구 추가" 행이 **없다**(그룹에는 있다). 멤버 프로필의 "내보내기"도 비활성                                  |        |

### 메시지·읽음 (S4·S5)

| #   | Area             | Steps                                                    | Expected                                                                               | Result |
| --- | ---------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------ |
| T27 | 송수신           | A→B, B→A 각각 전송                                       | 내 말풍선 오른쪽, 상대 왼쪽. 그룹과 같은 버블/그룹핑                                   |        |
| T28 | 읽음 '1' 뱃지    | A: 전송 후 B는 방을 열지 않은 상태                       | A의 메시지 시간 옆에 `1`. 그룹식 "읽음 N · 안읽음 M"이 아니다                          |        |
| T29 | 읽으면 사라진다  | B: 방을 연다 → A                                         | A의 `1`이 사라진다                                                                     |        |
| T30 | 인트로 고정      | A: 메시지 여러 개 + 날짜 여러 그룹                       | 스크롤 최상단에서 `[날짜][입장 안내][첫 메시지]` 순서                                  |        |
| T31 | **페이지네이션** | 메시지 100건 초과인 방에서 위로 스크롤해 `loadMore` 유발 | 입장 안내가 **히스토리 중간에 나타나지 않는다.** 과거를 다 불러온 뒤에만 최상단에 뜬다 |        |
| T32 | 수직 정렬        | 메시지 0건 → 1건                                         | 0건은 화면 위, 1건부터는 아래(최신이 바닥) — 그룹방과 동일                             |        |

### 삭제·나가기 (S6)

| #   | Area            | Steps           | Expected                                | Result |
| --- | --------------- | --------------- | --------------------------------------- | ------ |
| T33 | 초대자 = 삭제   | A: 방 설정 하단 | "채팅방 삭제" (나가기 아님)             |        |
| T34 | 수신자 = 나가기 | B: 방 설정 하단 | "채팅방 나가기" (삭제 아님)             |        |
| T35 | 알림 토글       | 양쪽            | 대화방 알림 토글이 있고 상태가 유지된다 |        |

### 만료·에러 경로

| #   | Area              | Steps                             | Expected                                                                | Result |
| --- | ----------------- | --------------------------------- | ----------------------------------------------------------------------- | ------ |
| T36 | 만료 초대 행      | A: 만료된 초대가 있는 상태의 home | `expired` 뱃지 + 부제 "초대 링크가 만료되었어요…", 아바타·이름이 흐리게 |        |
| T37 | 만료 링크 수락    | B: 만료된 링크로 진입             | 빨간 제목 `AlertDialog` → 확인 → 홈                                     |        |
| T38 | 이미 수락된 링크  | B: 같은 링크를 다시 진입          | "이미 참여" 안내 → 홈 (재시도 버튼 없음)                                |        |
| T39 | 초대가 아닌 쿼리  | B: `/invite/accept?foo=bar`       | `/`로 replace                                                           |        |
| T40 | 진행 중 닫기 차단 | B: 수락 진행 중 X                 | 막힌다(실패 다이얼로그를 삼키지 않도록)                                 |        |

## 회귀 감시 포인트

이번 변경에서 실제로 버그였던 것들 — 우선 확인 대상이다.

1. **T4/T5/T6** — 네 화면의 제목이 갈리는 것이 원래 버그였다.
2. **T21** — 방 헤더가 join 캐시가 아닌 projection을 읽으면 이름 변경이 헤더에만 늦게 반영된다.
3. **T20** — 상대 프로필이 없을 때 placeholder로 _내_ 닉이 새던 문제.
4. **T31** — 인트로가 "가장 오래된 로드 그룹"에 붙어 히스토리 중간에 뜨던 문제.
5. **T2** — 초대 행 아바타 글리프(solid vs 아웃라인)와 42px 크기.
6. **T12** — 프로필 강요가 되살아나지 않았는지.

## 미검증으로 남는 것

- **`channel.name` 실제 값**(T7) — 비어 있으면 체인 3단이 죽은 분기다. 이 플로우가 처음으로 실측하는 지점.
- **`user.nick`/`user.name` 폴백 부재** — 설계상 체인에 없다. T7에서 `***1234`가 보이면 어딘가 폴백이 살아 있다는 뜻.
- **Path B(전화 인증) 전 구간** — Slack 수신 경로가 확인되기 전에는 T12의 인증 한 단계만 얕게 밟는다.
- **네이티브 경로** — 실제 SMS 수신, 딥링크 변환기, SMS 작성기 브릿지. 범위 밖.
