# ADR-0035: 중계 1:1 초대 수락 후 방 진입 — `channelId` 우선, 재조회, 목록 폴백 3단

> 상태: Accepted · 결정일: 2026-07-30

## 맥락 (Context)

ADR-0033/0034로 구현·통합된 중계서버 1:1 초대 기능에 대해 "초대 수락 이후
프로세스가 중계서버와 클라우드서버로 제대로 갈라지는가"를 검증했다.

**분기 자체는 정상이다.** `InviteDialog`가 딥링크의 `relay` 마커로 라우팅하고
(`apps/web/src/app/features/home/components/InviteDialog.tsx:33`), 세션 처리도
의도대로 갈린다 — relay 수락은 relay 소켓 슬롯만 갱신해 클라우드 세션을 유지하고
(`libs/app-runtime/src/socket/auth/applySessionToken.ts`), 클라우드 수락은
`/oauth/login-invite`(`libs/web-core/src/api/auth.ts:208`) → `switchCloudSession`
으로 클라우드 슬롯을 재구성한다.

문제는 그 다음, **"수락은 됐는데 새로 생긴 방으로 들어가는" 단계**다.

### 백엔드 계약 (문서·타입으로 확인)

방 생성 시점이 문서에 명시돼 있다 (`chatic-sockets-api/docs/specs/relay-server-invite/05-client-guide.md`):

- `:58` — "초대는 **코드만 만든다.** 방은 수락 순간 생긴다."
- `:222` — "**방은 응답에 없다.** 비동기로 만들어지므로 채널 목록이 갱신되기를
  기다리거나 **다시 조회한다.**"
- `:301` (미구현 절) — "수락 응답의 방 id — 수락 후 웹소켓으로 channel · join
  생성 이벤트가 온다."
- `:257` — "같은 번호로 다시 초대해도 같은 사람이다. … **이미 방이 있으면 그 방으로
  이어진다.**" → 재초대 케이스에서는 비동기 생성을 기다릴 필요조차 없다.

그리고 **방 id를 담을 필드가 백엔드 모델에 이미 존재한다**:

- `InviteModel.channelId` — 주석이 **"수락으로 생긴 dm 방"**
  (`@lemoncloud/chatic-backend-api/dist/modules/auth/model.d.ts:295-296`)
- `MyInviteView.channelId` — "이 코드가 입장시키는 채널"
  (`dist/view/types.d.ts:110-111`). `siteId`/`site$`도 함께 실린다.

즉 필드는 설계돼 있고, 남은 것은 백엔드가 수락 시점에 그것을 채우는지 여부다.
스펙의 Out of Scope("dm 방 `channelId` 회수 — backend 미구현", `01-spec.md:73`)는
2026-07-29 기준 기술이다.

### 클라이언트 현황

- **`accepted.channelId`를 아예 읽지 않는다.**
  `apps/web/src/app/features/home/hooks/useRelayInviteFlow.ts:183-197`이 수락
  응답을 `setInvite`에 병합만 하고 곧바로 `enterChannel()`로 넘어간다. 대조적으로
  클라우드 경로는 같은 필드를 읽는다
  (`apps/web/src/app/features/home/hooks/useEnterInvitedChannel.ts:21`).
- **문서가 제시한 두 대처법 중 하나만 한다.** "목록 갱신 대기"만 구현돼 있고
  (`apps/web/src/app/hooks/useAwaitInviteChannel.ts` — `syncChannels` 3초 폴링 +
  모양 매칭, 20초 타임아웃), **"다시 조회한다"(`invite.get` 재조회) 경로는 없다.**
- 결과적으로 재초대(기존 방 재사용)처럼 방 id를 즉시 알 수 있는 케이스에서도
  최소 한 번의 폴링 왕복을 기다리고, 생성이 20초를 넘기면 홈 폴백으로 빠진다.

### 조사 중 기각한 가설 (재개 방지용 기록)

- **`useAwaitInviteChannel`의 `item.sid === selectedSiteId` 필터가 어긋날 수 있다**
  — **사실이 아니다.** relay는 플레이스가 하나뿐이고 생성 경로가 이중으로 차단돼
  있다: `canAddPlace = isCloudOwner && permissions.canCreatePlace`
  (`HomePage.tsx:64-71`), `canCreatePlace`는 `isCloudActive` 필요
  (`useUserPermissions.ts:27-31`), 그건 `selectedCloudId !== 'default'`일 때만 참
  (`libs/web-core/src/session/services.ts:454`). relay는 `cid === 'default'`라 두
  조건 모두 거짓이다. `apps/web/docs/feature/home/README.md:51-52`도 "relay는 기본
  플레이스 1개, ＋플레이스 추가 없음"으로 명시한다. 보강 근거로,
  `syncChannels`가 `$.sid` 없는 행을 버리는데도
  (`libs/data/src/data/repositories-v2/ChannelRepositoryV2.ts:169-171`) relay 홈에
  DM 방이 정상 표시되므로 relay 채널은 기본 플레이스 `sid`를 갖는다. **필터는
  유지한다.**
- **DM `channelId`를 클라이언트가 조합해서 만든다** — 현재 불가능하다.
  `buildChannelId`(`chatic-sockets-api/src/lib/channel/shared.ts:72`)는 `self`만
  결정적(`self:${ownerId}`)이고 나머지는 `$U.uuid()`이며, 주석에 "`dm` 의
  canonical id 는 P1 비스코프"로 명시돼 있다. 게다가 수락 시 DM을 만드는 주체는
  relay가 아니라 backend-api다(relay `accept-invite.ts`는 패스스루).

## 결정 (Decision)

**수락 후 방 진입을 3단 해소로 바꾼다.** 값이 이미 손에 있으면 기다리지 않고,
없을 때만 점진적으로 넓은 수단으로 내려간다.

1. **1단 — 수락 응답 직독.** `acceptInvite` 응답에 `channelId`가 있으면 그대로
   `setPendingChannel` 후 즉시 진입한다. 대기 없음. 클라우드 경로
   (`useEnterInvitedChannel.ts:21`)와 동일한 관용구로 맞춘다.
2. **2단 — `invite.get` 재조회.** 1단이 비면 `invite.get(code)`을 짧은 간격으로
   재조회해 `channelId`가 채워지는지 본다. 문서(`05-client-guide.md:222`)가
   명시적으로 권하는 방법이고, `invite.get`은 스텝 재검증용으로 이미 배선돼 있어
   신규 API가 필요 없다. **cadence는 `[0, 1500]`ms — 즉시 1회 + 1.5초 뒤 1회로
   확정했다**(구현 리뷰에서 3회에서 축소). 지연이 프로브 앞에 붙으므로 프로브를
   늘리면 답도 늦어지고 더 견고한 3단 시작도 그만큼 밀린다 — 3단은 실제 채널 행을
   보고 자체 3초 폴링이 있어 3번째 프로브의 실익이 거의 없다.
3. **3단 — 기존 목록 폴백 유지.** 2단도 비면 현행 `useAwaitInviteChannel`
   (`syncChannels` 폴링 + `stereo==='dm'` 모양 매칭 + 20초 타임아웃)을 그대로
   쓴다. 타임아웃 시 홈 이동 + "곧 도착한다" 토스트도 유지한다.

**보조 결정**

4. **`sid` 필터는 건드리지 않는다** (위 기각 가설 참조).
5. **백엔드 요청은 "필드를 채워달라"로 정정한다.** 로드맵
   (`docs/plans/relay-dm-invite-parallel-roadmap.md`) 백엔드 요청 5번을 "계약
   확장"이 아니라 "이미 있는 `InviteModel.channelId`를 수락 시점에 채워달라"로
   구체화한다. 1·2단은 그 요청이 반영되는 순간 **클라 배포 없이** 자동으로 빨라진다.
6. **웹소켓 푸시 fast path는 이번 범위에서 제외한다.** 후속 과제로 남긴다
   (아래 결과 절).

## 대안 (Alternatives)

- **현행 유지 (폴링만).** 지금 동작에 정확성 버그는 없다 — 실제로 이 조사에서
  버그를 찾지 못했다. 하지만 손에 있을 수 있는 값을 안 읽고 최소 한 왕복을 항상
  기다리며, 재초대(기존 방 재사용) 케이스에서 특히 낭비다. 1단 추가가 거의
  무비용이라 버림.
- **DM `channelId`를 결정적으로 만들어달라고 백엔드에 요청 (조합 방식).** 되면
  가장 깨끗하다 — `useAwaitInviteChannel`이 통째로 삭제 대상이 된다. 하지만
  `buildChannelId`가 이를 "P1 비스코프"로 명시적으로 배제했고 생성 주체가
  backend-api라 범위가 넓다. **후속 과제로 남기고**, 그때까지 유효한 3단 구조를
  먼저 넣는다. 5번 요청이 먼저 반영되면 이 대안의 실익은 대부분 사라진다.
- **`getSocketManager().onType('channel.sync')` 푸시 fast path로 폴링 대체.**
  훅 포인트가 이미 있고 아무도 쓰지 않는다(`libs/app-runtime/src/socket/SocketManager.ts:310`,
  `libs/app-runtime/src/index.ts:60`). 다만 백엔드가 수락받은 쪽에 실제로 emit하는지
  미검증이고(`emitSync` 프로덕션 호출자 부재, 스펙도 "미구현" 절), 검증 없이
  폴링을 대체하면 회귀 위험이 크다. 이번엔 제외.
- **수락 직후 무조건 `invite.get` 재조회 (1단 없이 2단만).** 1단이 성립하는
  케이스에서 불필요한 왕복이 생긴다. 1단이 공짜라 버림.

## 결과 (Consequences)

- 얻는 것:
    - 백엔드가 `channelId`를 채우고 있거나 앞으로 채우면, **클라 배포 없이** 수락
      직후 즉시 방 진입이 된다.
    - 재초대(기존 방 재사용) 케이스는 방이 이미 있으므로 1·2단에서 바로 해소될
      가능성이 높다.
    - 문서가 권한 "다시 조회한다" 경로가 처음으로 구현된다.
    - dev 스테이지에서 1·2단이 값을 얻는지 관찰하면 "backend 미구현"이 아직 사실인지
      바로 판명된다 — 백엔드 요청 5번의 근거 데이터가 된다.
- 감수하는 것:
    - 해소 경로가 3개로 늘어 분기가 늘어난다. 각 단의 성공/실패를 테스트로 고정해야
      한다.
    - 2단 재조회가 추가 소켓 왕복을 만든다 — 1단이 비었을 때만, 최대 2회.
      최악 지연은 3단 시작이 **1.5초** 밀리는 것이다(20초 → 21.5초). 3단 20초 자체가
      임의의 안전망이라 수용 가능하다고 판단했다.
    - 3단 20초 타임아웃 폴백은 그대로 남는다 — 방 생성이 그보다 느린 경우의 사용자
      경험은 개선되지 않는다.
- 후속 과제:
    1. 푸시 fast path(`onType('channel.sync')`) — 백엔드 emit 검증 후 재검토.
    2. DM `channelId` 결정성(조합 가능화) — 되면 `useAwaitInviteChannel` 삭제.
    3. 백엔드 요청 5번 정정 반영 (결정 5번).
- 되돌리는 조건: 백엔드가 수락 응답에 `channelId`를 **동기로** 실어주게 되면
  (`01-spec.md:83`의 재검토 조건) 2·3단을 제거하고 1단만 남긴다 — 클라우드 경로와
  완전히 동일해진다.
- 관련: [ADR-0033](0033-relay-dm-invite-and-auth-parallel-tracks.md) D10(스텝 순서),
  [ADR-0034](0034-inviter-phone-verification-guest-gate-and-sheet.md),
  [ADR-0032](0032-dm-chat-room-screen.md)(DM 방 화면),
  로드맵 [docs/plans/relay-dm-invite-parallel-roadmap.md](../plans/relay-dm-invite-parallel-roadmap.md).
