# ADR-0055: 모바일 웹 — 코드블럭 렌더링, 홈 정렬 기준 정정, 로그인 후 원위치 복귀

> 상태: Accepted · 결정일: 2026-08-14 · 구현 완료: 2026-08-14
>
> 구현된 모습은 세 문서에 있다 — 결정 1은
> [chat-link-preview.md](../chat-link-preview.md), 결정 2·3은
> [apps/web/docs/feature/home/last-chat.md](../../apps/web/docs/feature/home/last-chat.md),
> 결정 4는 [apps/web/docs/feature/auth/login-return.md](../../apps/web/docs/feature/auth/login-return.md).
>
> 이 문서는 히스토리이므로 원 결정문을 고치지 않는다. **본문이 인용하는 `linkTokens.ts`·
> `LinkedText.tsx`·`useLastChat.ts` 경로는 구현 과정에서 각각 `messageTokens.ts`·`MessageText.tsx`·
> `useLastChats.ts`로 대체되어 지금은 존재하지 않는다** — 결정 당시의 코드를 가리키는 링크로 읽는다.
> 결정과 갈라진 항목에는 아래 각 결정 밑에 노트를 달았다.

## 맥락 (Context)

모바일 웹(`apps/web`)에 대해 세 건의 요구가 들어왔다. 조사해보니 셋 다 "없는 기능을 새로 만드는"
일이 아니라 **기존 구현이 의도와 어긋나 있거나, 앞선 ADR이 미뤄둔 항목**이었다.

### 1. 메시지 본문에 코드블럭 인식이 없다

메시지 본문 렌더링은 [`LinkedText`](../../apps/web/src/app/features/channels/components/LinkedText.tsx)
하나뿐이고, 그 토크나이저는 마크다운을 **의도적으로 배제**하고 있다:

> Deliberately URLs only — no markdown, no mentions. (중략) widening this to real formatting is a
> **product decision**, not a side effect of link previews.
> — [`linkTokens.ts`](../../apps/web/src/app/features/channels/utils/linkTokens.ts)

따라서 이번 요구는 그 product decision을 뒤집는 건이고, ADR로 남길 가치가 있다.

렌더 지점을 실측한 결과 요청에 적힌 세 화면이 **세 개의 독립 지점이 아니었다**:

- `ChannelRoomPage`와 `ThreadPage`는 **같은 컴포넌트**를 쓴다 —
  [`ChannelMessageRow.tsx:268`](../../apps/web/src/app/features/channels/components/ChannelMessageRow.tsx)의
  `<LinkedText>` 한 곳이 두 화면의 말풍선을 모두 그린다.
- 방 화면의 **전체보기 다이얼로그**가 별도로 `LinkedText`를 호출한다
  ([`ChannelRoomPage.tsx:897`](../../apps/web/src/app/features/channels/pages/ChannelRoomPage.tsx)).
- **홈은 성격이 다르다.** 말풍선이 아니라 한 줄 미리보기
  ([`ChannelList.tsx:117`](../../apps/web/src/app/features/home/components/ChannelList.tsx)의 `preview`)라
  코드블럭을 렌더할 자리가 없다.

기술적 제약도 확인했다. 리포에 markdown·syntax highlight 계열 의존성이 **전혀 없다**
(`@lexical/markdown`은 admin 쪽 에디터용). 하이라이팅을 넣으면 모바일 웹 번들에 새 의존성이
추가된다.

### 2. 홈 정렬이 "마지막 채팅 도착순"이 아니다

`DEFAULT_CHANNEL_SORT`는 이미 `'recent'`다
([`preferenceKeys.ts`](../../apps/web/src/app/stores/preferenceKeys.ts)). 문제는 그 `'recent'`가
읽는 값이다 — [`sortChannels.ts:40`](../../apps/web/src/app/utils/sortChannels.ts):

```
join.updatedAt  →  channel.$join.updatedAt  →  lastActivityAt / updatedAt
```

**1차 키가 내 join의 `updatedAt`, 즉 내 읽음 커서가 갱신된 시각이다.** 결과:

- 새 메시지가 안 와도 **내가 방에 들어가 읽기만 하면** 그 방이 맨 위로 올라온다.
- **남이 보낸 최신 메시지는 내 join을 건드리지 않으므로** 순서를 바꾸지 못한다.

이건 이미 알려진 사실이다. ADR-0047이 조사 중 발견하고 **명시적으로 후속으로 미뤘다**:

> 정렬은 조사 결과 리액션에 거의 반응하지 않는다. `'recent'`의 1차 키가 내 join의 `updatedAt`이라
> 남이 무엇을 보내든 순서가 바뀌지 않는다. (중략) 곁가지로 **남의 새 메시지도 홈 순서를 바꾸지
> 않는다**는 선재 특성이 드러났으나 이번 범위가 아니다(후속 참조).
> — [ADR-0047 §3](0047-web-reaction-and-thread-refinements.md)

**이 ADR이 그 후속이다.**

같은 행이 **표시하는 시각은 전혀 다른 출처**라는 점도 확인됐다. `time`은
[`useLastChat`](../../apps/web/src/app/hooks/useLastChat.ts)이 채팅 캐시에서 꺼낸 실제 마지막
메시지의 `createdAt`이다. 즉 **화면에 찍힌 시각과 정렬 순서가 서로 다른 값을 보고 있다.**

#### `lastChat$`은 죽은 필드다

폴백 경로의 `lastActivityAt`은 매퍼에서 파생된다
([`mappers.ts:90`](../../libs/data/src/data/domain/mappers.ts)):

```ts
lastActivityAt: Math.max(lastChatAtMs, updatedAtMs); // lastChatAtMs = toEpochMs(api.lastChat$?.createdAt)
```

그런데 **서버는 더 이상 `lastChat$`를 채널에 임베드하지 않는다.** 리포 곳곳이 이를 증언한다:

- `useLastChat` 자체가 존재하는 이유 — "the server no longer embeds `lastChat$`".
- desktop-web — "The channel record's `lastChat$` cannot stand in".
- [ADR-0048](0048-unread-count-derivation-contract.md)이 `computeUnreads`의 `lastChat$.chatNo` 사용을
  **규칙 1 위반**으로 표에 명시.

즉 `lastChatAtMs`는 항상 `0`이고, `lastActivityAt`은 실질적으로 `channel.updatedAt`과 같다.
파생 필드가 아무 일도 하지 않으면서 "마지막 채팅 시각"인 척하고 있다.

### 3. 로그인 후 무조건 홈으로 튕긴다

요청에 지목된 [`features/auth/pages/LoginPage.tsx`](../../apps/web/src/app/features/auth/pages/LoginPage.tsx)는
18줄짜리 리다이렉트 shim이고 화면이 아니다. **실제 로그인 화면은
[`features/mypage/pages/LoginPage.tsx`](../../apps/web/src/app/features/mypage/pages/LoginPage.tsx)**이며,
범인은 그 안의 `leaveForHome()`이다:

```ts
// [/, /mypage, /mypage/login] → [/]
const stepsBack = window.history.length - 1;
window.history.go(-stepsBack); // 히스토리를 처음까지 되감고
// popstate 후 window.location.replace('/'); // 홈으로 풀 리로드
```

소셜 로그인과 폰 로그인 **양쪽이 모두 이걸 호출한다.** 진입 경로는 5곳이고 각자 돌아갈 곳이 다르다:

| 진입점                     | 위치                                                                                                            | 기대 복귀 지점   |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------- |
| `MyPage`                   | [MyPage.tsx:127](../../apps/web/src/app/features/mypage/pages/MyPage.tsx)                                       | 마이페이지       |
| `PhoneVerifyBanner`        | [PhoneVerifyBanner.tsx:34](../../apps/web/src/app/features/auth/components/PhoneVerifyBanner.tsx)               | 배너를 띄운 화면 |
| `SubscriptionSelectDialog` | [SubscriptionSelectDialog.tsx:87](../../apps/web/src/app/features/home/components/SubscriptionSelectDialog.tsx) | 홈(구독 선택)    |
| `SubscriptionPage`         | [SubscriptionPage.tsx:43](../../apps/web/src/app/features/subscription/pages/SubscriptionPage.tsx)              | 구독 화면        |
| `SubscriptionPlansPage`    | [SubscriptionPlansPage.tsx:61](../../apps/web/src/app/features/subscription/pages/SubscriptionPlansPage.tsx)    | 플랜 화면        |

특히 **구독 결제 도중 로그인**이면 결제 화면으로 돌아가야 흐름이 이어지는데 홈으로 튕겨 끊긴다.

히스토리를 되감는 원래 의도는 "뒤로가기로 로그인 화면에 다시 들어가는 루프" 방지다. 이건
`replace` 내비게이션만으로도 달성된다.

세션 측면 검토: 폰 로그인은 `applySessionToken`이 `onVerified` **이전에** web-core와 라이브 소켓에
새 신원을 넣고([`usePhoneVerify.ts`](../../apps/web/src/app/features/auth/hooks/usePhoneVerify.ts)),
소셜은 `useLoginRelaySocial`이 세션을 하이드레이트한다. 즉 풀 리로드는 신원 교체를 위해
**필수가 아니다.** 게스트도 `isAuthenticated`이므로 로그인은 게스트→실계정 승격이고 라우터의
route set(`privateRoutes`)은 그대로 유지된다
([`routes/index.tsx`](../../apps/web/src/app/routes/index.tsx)).

남은 우려는 게스트 신원으로 채운 로컬 캐시가 승격 후에도 남는다는 점이었으나, **캐시는 유저가
달라져도 호환된다는 것이 확인**되어(사용자 확인) 별도 처리가 필요 없다.

## 결정 (Decision)

### 결정 1 — 코드블럭은 인라인 + 펜스 블록까지, 하이라이팅은 없다

- **지원 문법**: 인라인 백틱(`` `code` ``)과 3중 백틱 펜스 블록(` ``` `). 그 외 마크다운
  (굵게, 기울임, 헤딩, 리스트, 인용, 링크 문법)은 **여전히 지원하지 않는다.** `linkTokens.ts`가
  선언한 "마크다운 아님" 원칙은 이 두 문법에 대해서만 예외를 둔다.
- **신택스 하이라이팅은 하지 않는다.** 펜스의 언어 태그(` ```ts `)는 파싱해서 버리거나
  라벨로만 표시하고, 색은 입히지 않는다. shiki/highlight.js 계열 의존성을 모바일 웹 번들에
  추가하지 않기 위해서다.
- **토크나이저는 단일 패스로 통합한다.** 코드 토크나이징이 URL 토크나이징보다 **먼저** 적용되어야
  하며, 코드 영역 안의 `https://...`는 **링크가 되지 않는다.** 같은 이유로
  `extractFirstUrl`(링크 프리뷰 카드)도 코드 영역을 건너뛴다 — 코드 예제 속 URL이 언퍼링 카드를
  띄우면 안 된다.
- **펜스 블록에는 자체 복사 버튼을 단다.** 메시지 전체가 아니라 **코드 본문만** 클립보드로 간다.
  기존 롱프레스→액션시트→복사와 공존하므로, 버튼 영역이 롱프레스 제스처를 삼키지 않도록
  포인터 이벤트 경계를 명시적으로 처리한다.

**적용 범위**:

| 화면                          | 처리                                                            |
| ----------------------------- | --------------------------------------------------------------- |
| 채널방 말풍선 · 스레드 말풍선 | `ChannelMessageRow` **한 곳** 수정으로 양쪽 동시 적용           |
| 방 화면 전체보기 다이얼로그   | 같은 렌더러 적용 (잘리지 않은 전문이므로 펜스가 온전)           |
| 홈 리스트 한 줄 미리보기      | **백틱을 벗긴 평문.** 펜스 블록은 펜스 줄을 버리고 내용 첫 줄만 |

홈은 렌더가 아니라 **평문화(plain-text 변환)** 다. 마크업 문자가 목록에서 소음으로 보이지 않게
하는 것이 목적이며, 코드임을 알리는 별도 뱃지·모노폰트는 넣지 않는다(행 구조 복잡화 및
`blurLastMessage` 설정과의 얽힘 회피).

### 결정 2 — 홈 정렬은 채팅 캐시의 최신 메시지 시각, 폴백은 `channel.updatedAt`

- **`sortChannels`의 1차 키에서 `join.updatedAt` / `$join.updatedAt`을 제거한다.** 내 읽음 커서는
  "채팅이 도착한 시각"이 아니다.
- **새 1차 키는 채팅 캐시의 최신 메시지 시각**이다. 지금 홈 행이 시각을 표시하려고 이미 끌어오는
  바로 그 값(`useLastChat`의 결과)을 정렬에도 쓴다. **표시와 정렬이 한 출처를 보게 되는 것이 이
  결정의 핵심**이며, 두 값이 갈라져 있던 선재 결함이 여기서 닫힌다.
- **폴백은 `channel.updatedAt`.** 캐시가 아직 안 찬 채널(콜드 부팅 직후, 화면 밖에 있던 행)은
  이 값으로 자리를 잡는다.
- **`useLastChat` 관측을 리스트 레벨로 올린다.** 현재는 `ChannelItem`(행)이 각자 호출하는데,
  정렬은 행을 그리기 **전에** 시각을 알아야 한다. 등록·구독 API가 모두 명령형이므로
  (`getSyncManager().register`, `repositories.chat.observeList` —
  [`useSyncTarget.ts`](../../libs/app-runtime/src/socket/sync/hooks/useSyncTarget.ts)) 리스트 레벨에서
  N개를 다루는 훅이 가능하다. 행은 결과를 **prop으로 받는다** — 중복 관측을 만들지 않는다.
- **`'unread'` 정렬과 핀은 그대로다.** 둘 다 이 기본 순서 위에 얹히는 안정 정렬이므로 자동으로
  같이 교정된다.

> **구현 노트 (2026-08-14).** 이 결정은 `useLastChat`(단수)이 `PlaceChannelManagePage`용으로 남는다고
> 봤으나, 실제로는 **그 화면도 `sortChannels`를 호출하고 있었다** — 코드 주석이 "홈과 같은 순서"를
> 명시적 목표로 적어둔 채였다. 홈만 1차 키를 바꾸면 두 화면의 순서가 조용히 갈라지므로 관리 화면도
> 같이 전환했고, 그 결과 단수 훅은 호출자가 없어져 삭제했다. 위 표의 "행이 각자 호출" 서술은 홈뿐
> 아니라 관리 화면에도 해당했다.

### 결정 3 — `lastChat$` 파생을 매퍼에서 제거한다

- [`mappers.ts`](../../libs/data/src/data/domain/mappers.ts)의 `toDomainChannel`에서 `lastChat$`
  기반 `lastActivityAt` 파생을 제거하고, 해당 단위 테스트도 새 계약으로 고친다.
- **범위는 `libs/data` 매퍼까지로 한정한다.** `apps/testbed`의 `computeUnreads`는 ADR-0048이 이미
  위반으로 표시해둔 별도 항목이고, `desktop-web`은 이번 변경 대상이 아니다.

### 결정 4 — 로그인 복귀는 `returnTo` + `replace` 소프트 내비게이션

- **로그인 화면은 라우트로 유지한다.** 모달/시트로 승격하지 않는다 — 진입점 5곳을 모두 고쳐야
  하고 딥링크 경로도 별도 처리해야 해서, 얻는 것에 비해 변경면이 넓다.
- 로그인 화면 진입 시 **직전 경로를 `location.state`로 넘긴다.** 로그인 성공 후
  `navigate(returnTo, { replace: true })`로 복귀한다. `replace`가 로그인 항목을 대체하므로
  **뒤로가기 루프는 생기지 않는다** — `leaveForHome`의 히스토리 되감기가 하던 방어를 그대로
  대신한다.
- **`returnTo`가 없으면 홈으로.** 딥링크나 새로고침으로 로그인 화면에 직접 도달한 경우다.
- **`window.location.replace`(풀 리로드)를 걷어낸다.** 소셜·폰 양쪽 모두 세션 신원이 콜백 이전에
  교체되므로 리로드가 불필요하고, 흰 화면 한 번을 없앤다.
- **캐시는 비우지 않는다.** 유저가 달라져도 호환된다는 것이 확인됐다.
- **복귀는 "화면 단위"이지 "상태 단위"가 아니다.** 구독 플랜 화면으로 돌아가도 로그인 전에
  고르던 플랜 선택 상태는 복원되지 않는다. 상태 복원은 이번 범위 밖이다.

### 범위에서 제외하는 것

- 신택스 하이라이팅, 언어별 색상.
- 코드블럭 외 마크다운 문법(굵게·기울임·헤딩·리스트·인용·링크).
- 입력창(`MessageInput`)의 작성 보조 — 백틱 자동 닫기, 코드블럭 삽입 버튼, 프리뷰.
- `apps/desktop-web`, `apps/testbed`의 대응 변경.
- 홈 미리보기의 코드 뱃지·모노폰트.
- 로그인 복귀 시 화면 내부 상태(폼 입력, 선택한 플랜) 복원.
- 홈 배지·언리드 집계 로직 (ADR-0048 소관, 이번 정렬 변경과 독립).

## 대안 (Alternatives)

### 코드블럭 — 인라인 백틱만

말풍선 레이아웃을 전혀 건드리지 않는 최소 변경이었다. 버린 이유: 실제 사용에서 공유하고 싶은
코드는 대개 여러 줄이고, 인라인만 지원하면 정작 필요한 경우에 아무 일도 일어나지 않는다.

### 코드블럭 — 하이라이팅까지

가장 좋아 보이지만 shiki/highlight.js 의존성이 붙고 lazy-load 설계가 필요하다. **모바일 웹**
번들이 대상이고, 리포에 선례가 없어 첫 도입 비용이 기능 가치보다 크다고 판단했다. 등폭 폰트와
가로 스크롤만으로 가독성 목표는 충족된다.

### 홈 미리보기 — 원문 그대로 노출

`HomePage`를 아예 안 건드려도 되는 안이었다. 버린 이유: 백틱이 목록에 그대로 노출되어, 코드블럭
지원을 켠 뒤 오히려 홈이 더 지저분해진다.

### 정렬 — `lastActivityAt`(=`channel.updatedAt`) 단독

변경면이 `sortChannels` 한 파일로 가장 작았다. 버린 이유: `lastChat$` 제거 후 이 값은
`channel.updatedAt`과 동일한데, **`updatedAt`은 채널명·설정 변경으로도 오른다.** "마지막 채팅
도착순"을 요구하면서 채널 이름을 바꿨다고 방이 맨 위로 올라오는 건 요구를 반만 만족시킨다.
`updatedAt`은 캐시 미충전 채널을 위한 폴백으로만 남긴다.

### 정렬 — 채팅 캐시가 채널의 `lastActivityAt`을 갱신하도록 쓰기

정확도와 증분 갱신을 모두 잡는 안이었다. 버린 이유: 채팅 로컬 소스가 채널 레코드에 쓰는
**레이어 경계를 넘는 쓰기**가 생기고, 캐시 계약(ADR-0051/0053)에 새 결합을 만든다. 읽기만으로
같은 목적을 달성할 수 있다.

### 로그인 — 모달/시트로 승격

히스토리 문제가 통째로 사라지고 "직전 화면"이 자동으로 유지된다. 버린 이유: 진입점 5곳을 전부
고쳐야 하고, 로그인 화면으로 오는 딥링크·리다이렉트 경로를 별도 설계해야 한다. `returnTo` +
`replace`가 같은 결과를 훨씬 작은 변경면으로 준다.

### 로그인 — 라우트 유지 + 풀 리로드로 복귀

`window.location.replace(returnTo)`. 캐시 재부팅 효과를 그대로 보존해 가장 안전했다. 버린 이유:
캐시 호환이 확인되어 안전 이득이 사라졌고, 복귀마다 흰 화면이 한 번 낀다.

## 결과 (Consequences)

### 얻는 것

- 채널방·스레드·전체보기에서 코드가 코드처럼 보인다. **한 컴포넌트 수정으로 두 화면이 동시에**
  해결되므로 요청 대비 실제 변경면이 작다.
- 코드 영역 안의 URL이 링크·언퍼링 카드로 오작동하지 않는다. 이건 부수 효과가 아니라
  통합 토크나이저의 **설계 목표**다.
- 홈 순서가 실제 대화 흐름을 따른다. **남이 보낸 메시지가 순서를 바꾸고, 내가 읽기만 한 것은
  바꾸지 않는다** — ADR-0047이 미뤄둔 항목이 닫힌다.
- 홈 행의 **표시 시각과 정렬 순서가 같은 값**을 보게 된다. 두 출처가 갈라져 있던 선재 결함 해소.
- 죽은 `lastChat$` 의존이 매퍼에서 사라져, `lastActivityAt`이 실제로는 아무 일도 안 하면서
  "마지막 채팅 시각"인 척하던 오해가 제거된다.
- 로그인이 흐름을 끊지 않는다. 특히 **구독 결제 도중 로그인**이 결제 화면으로 복귀한다.
- 로그인 복귀에서 풀 리로드로 인한 흰 화면이 사라진다.

### 감수하는 트레이드오프

- **코드블럭에 색이 없다.** 등폭 폰트·배경·가로 스크롤로만 구분된다. 하이라이팅 요구가 다시
  오면 별도 ADR로 다룬다.
- **과거 메시지에 소급 적용된다.** 백틱을 문장부호로 쓴 기존 메시지가 갑자기 코드로 렌더될 수
  있다. 불가피하며, 토크나이저가 "닫히지 않은 백틱은 평문" 규칙으로 오탐을 줄인다.
- **긴 메시지 잘림과 펜스가 충돌한다.** 말풍선은 `MAX_MESSAGE_LENGTH`에서 자르는데 그 지점이
  펜스 안일 수 있다. `LinkedText`의 `truncated`가 잘린 URL을 링크하지 않는 것과 같은 원리로,
  잘린 지점에서 열린 펜스는 닫힌 것으로 간주해 렌더하고 전문은 전체보기에서 본다.
- **복사 버튼과 롱프레스가 같은 영역에서 경쟁한다.** 모바일에서 서로 잡아먹지 않도록 포인터
  이벤트 경계를 명시적으로 설계해야 하며, 이번 작업에서 가장 손이 많이 가는 지점이다.
- **홈 정렬 관측이 리스트 레벨로 올라간다.** `ChannelItem`의 `useLastChat` 호출이 prop으로
  대체되는 구조 변경이며, 관련 테스트(`ChannelList.test.tsx`)가 함께 바뀐다.
- **콜드 부팅 직후 순서가 한 번 재배치될 수 있다.** 캐시가 채워지기 전에는 폴백
  (`channel.updatedAt`)으로 그렸다가, 채팅 캐시가 도착하면 정렬이 갱신된다. 두 값이 대체로
  비슷해 재배치 폭은 작지만 0은 아니다.
- **`PREVIEW_LOOKBACK = 30`의 비용이 정렬에도 얹힌다.** 행 수에 곱해지는 관측량은 그대로이고,
  `useLastChat` 주석이 경고한 "홈 진입이 느려지면 가장 먼저 되돌릴 것" 항목의 중요도가 올라간다.
- **로그인 복귀는 화면까지만이다.** 구독 플랜 선택 같은 화면 내부 상태는 복원되지 않아, 사용자가
  선택을 다시 해야 한다.
- **`returnTo` 전달을 진입점 5곳이 각자 책임진다.** 한 곳이라도 빠뜨리면 그 경로만 조용히 홈으로
  간다. 기본값이 홈이라 실패가 눈에 띄지 않으므로, 5개 경로 모두 테스트로 고정한다.

## 참조

- [ADR-0047: 웹 리액션·스레드 정제](0047-web-reaction-and-thread-refinements.md) — §3이 이 ADR의
  정렬 항목을 후속으로 남겼다.
- [ADR-0048: 언리드 카운트 파생 계약](0048-unread-count-derivation-contract.md) — `lastChat$`를
  머리 출처로 쓰는 것을 규칙 위반으로 명시.
- [ADR-0045: 웹 이모지 리액션과 스레드](0045-web-emoji-reaction-and-thread.md) — `pickPreviewChat`
  피드 필터의 근거.
