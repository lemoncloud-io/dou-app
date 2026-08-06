# ADR-0045: 기본플레이스는 relay 스코프에만 저장하고, 플레이스 생성 마지막 스텝에 프로필 생성을 넣고, 표시용 아바타를 단일 컴포넌트로 통합한다

> 상태: Accepted · 결정일: 2026-08-06
> 선행: [ADR-0034](./0034-inviter-phone-verification-guest-gate-and-sheet.md) · [ADR-0036](./0036-data-surface-unification-app-runtime-cleanup.md) · [ADR-0039](./0039-dm-display-name-chain-and-invite-profile-release.md) · [ADR-0040](./0040-self-chat-title-and-profile-setup-nudge.md) · [ADR-0041](./0041-place-profile-as-invite-precondition.md)

## 맥락 (Context)

플레이스(=Site) 트랙에서 데이터 계층 결함 셋, 플로우 공백 하나, 표시 정책 하나, UI 킷 부채
하나가 함께 확인됐다. 한 브랜치(worktree `relay-default-place-avatar-ui`)에서 같이 다룬다.

1. **기본플레이스가 클라우드 목록에 섞인다.** `UserRepositoryV2.getMyProfile`이 프로필에
   임베디드된 `$site`를 활성 컨텍스트가 무엇이든 place 캐시에 저장한다
   (`libs/data/src/data/repositories-v2/UserRepositoryV2.ts:114`). 클라우드(cid ≠ `default`)로
   전환한 상태에서도 이 쓰기가 일어나 기본플레이스 행이 클라우드 스코프 캐시에 남고, 홈
   플레이스 목록에 섞여 보인다. `refreshList`는 `cacheWriteMany`만 하고 삭제하지 않으므로
   (`PlaceRepositoryV2.ts:84-91`) 일단 오염된 행은 저절로 사라지지 않는다.

2. **생성 직후 목록 반영이 안 된다.** `createPlace`는 단건 `cacheWrite`만 한다
   (`PlaceRepositoryV2.ts:93-99`). 서버 순서 스탬프(`order`)는 `refreshList`만 찍으므로
   단건 쓰기로는 목록 정렬·반영이 보장되지 않는다.

3. **place.update가 400으로 죽는다.** 백엔드가 `@id (string) is required - place.update(-)`를
   반환한다. 원인은 호출부: `PlaceInfoPage`가 `{ sid, name, thumbnail }`만 보낸다
   (`apps/web/src/app/features/place/pages/PlaceInfoPage.tsx:106-110`). `id`가 없으니
   `PlaceRepositoryV2.updatePlace`의 낙관적 캐시 쓰기(`payload.id` 기반)도 함께 스킵된다.
   place에서 `id === sid`다.

4. **플레이스 생성 후 프로필이 없다.** 생성 플로우(`CreatePlaceDialog` → `createPlace` →
   `switchSite` → 닫기)에 플레이스 유저 프로필(닉/사진) 생성 스텝이 없다. 초대로 들어온
   멤버는 ADR-0041이 프로필 생성을 전제조건으로 강제하므로, 프로필 없는 입장자는 사실상
   플레이스를 만든 owner뿐이다.

5. **MyPage 상단이 클라우드 프로필로 바뀐다.** `useMyUser`가 활성 컨텍스트의 user 캐시를
   관찰하므로(`apps/web/src/app/hooks/useMyUser.ts`) 클라우드 전환 시 상단 헤더가 클라우드
   프로필을 보여준다. 사용처 네 곳(MyPage·ProfileEditPage·WithdrawalPage·useLinkedAccounts)
   전부 계정 레벨 화면이다.

6. **아바타가 유형별로 파편화돼 있고 Figma와 어긋난다.** web-ui-kit 인벤토리:
   `ImageAvatar / ProfileAvatar / PlaceAvatar / ChatAvatar / CloudAvatar / DefaultAvatar(user|group) / AvatarGroup`
    - `defaultPlaceAvatar` asset. 그룹방·프로필·플레이스·클라우드·dm/self별 디자인 기준이
      Figma에 갱신됐다(아래 링크). desktop-web은 web-ui-kit을 쓰지 않아 파급은 apps/web으로
      한정된다.

### 제약

- `libs/data`는 apps/web과 desktop-web이 공유한다. 앱별 표시 정책을 라이브러리에 하드코딩하면
  desktop-web까지 끌려간다.
- 프로필 부재 판정에는 동기화 지연 오탐 전력이 있다(설정했는데도 "설정하라" 노출).
  리액티브 읽기의 로딩-중 `null`과 진짜 부재를 구분하지 못한 것이 원인이었고,
  `isPlaceProfileAbsent`(`apps/web/src/app/utils/placeProfile.ts`)가 그 교훈의 산물이다
  (await + `active === false` 확정 플래그 + fail-open, ADR-0041 결정 5).
- 클라우드 소켓에 연결된 상태에서 relay로의 원격 fetch는 보장되지 않는다. relay 고정 표시는
  relay 스코프 캐시 읽기가 기본이 되어야 한다.

## 결정 (Decision)

### 1. 임베디드 `$site` 저장을 옵션화하고, apps/web은 relay일 때만 저장한다

`UserRepositoryV2`에 임베디드 `$site`의 place-캐시 저장 여부를 제어하는 옵션(컨텍스트를 받는
predicate)을 연다. 주입처는 리포지토리 와이어링(`createRepositoriesV2`)이고, **기본값은 현행
유지(항상 저장)** — desktop-web은 아무것도 바뀌지 않는다. apps/web만 `cid === 'default'`일 때
저장하는 predicate를 주입한다.

게이트만으로는 이미 오염된 행이 남으므로 **클라우드 스코프에 저장된 기본플레이스 잔재를
정리한다**(정리 메커니즘 — 마이그레이션성 삭제냐 목록 필터냐 — 는 구현 스펙에서 확정).

### 2. `createPlace`는 성공 직후 리포지토리 내부에서 `refreshList`를 이어 호출한다

호출자마다 챙기게 하지 않고 `PlaceRepositoryV2.createPlace` 안에서 후속 `refreshList`로
서버 스냅샷(order 스탬핑 포함)을 즉시 반영한다. 모든 호출자가 일관되게 혜택을 본다.

### 3. place.update에 `id`를 필수로 싣는다 (`id === sid`)

`PlaceInfoPage` 호출부에 `id: placeId`를 추가하고, 재발 방지로
`PlaceRepositoryV2.updatePlace`에서 `id`가 없고 `sid`가 있으면 `id = sid`로 정규화한다.
정규화 덕에 낙관적 캐시 쓰기/롤백 경로도 함께 살아난다.

### 4. 플레이스 생성 플로우의 마지막 스텝으로 프로필 생성을 넣는다 — 스킵 불가

`CreatePlaceDialog` 성공(생성 + 전환) 직후 `PlaceProfileCreateDialog`를 **생성 플로우의
마지막 스텝으로 자동 오픈**하고, 이 진입에서는 닫기(X)를 제공하지 않는다 — 프로필을 만들어야
플로우가 끝난다. 방금 만든 플레이스에는 프로필이 확실히 없으므로 부재 판정이 필요 없고,
동기화 지연 오탐 문제도 원천적으로 발생하지 않는다.

범위 한정: **이 강제는 새 플레이스 생성 플로우에만 적용한다.** 기존 진입점 — 방 설정
nudge(ADR-0040), 초대 경로(ADR-0041) — 는 지금처럼 스킵 가능하게 유지한다. ADR-0039의
"프로필을 강제 스텝으로 두지 않는다"는 원칙은 이 한 지점에서만 의도적으로 뒤집는다
(부분 Supersede가 아니라 예외 추가 — 생성자는 자기 플레이스의 첫 멤버이므로 초대 수락자와
같은 수준의 전제조건을 갖는 게 ADR-0041과 오히려 정합적이다).

### 5. `useMyUser`를 relay 스코프로 고정한다 — ❌ 되돌림 (2026-08-06)

> 이 결정만 구현 후 철회했다. 의도한 규칙은 "계정 프로필은 항상 relay"가 아니라 **활성 세션을 따른다**
> — 클라우드 세션이면 그 클라우드의 user 프로필, 릴레이면 릴레이 user 프로필. `user.update`도 양쪽
> 서버에서 동작하며 활성 소켓이 닿는 쪽 레코드를 고치므로, 표시와 쓰기가 같이 활성 소켓을 따르면
> 불일치 자체가 없다. `useMyUser`는 활성 컨텍스트 관찰로 복귀했고, 이를 위해 들어갔던 relay 값 보관·
> `getRelaySessionUser`·`ProfileEditPage` 저장 게이트·`user.update` relay 핀은 모두 제거했다.
> 경위: [relay-default-place-scoping.md](../../apps/web/docs/feature/place/relay-default-place-scoping.md) §6.
> 나머지 결정(1~4·6)은 유효하다.

아래는 철회된 원문이다.

훅 자체를 relay(cid=`default`) 스코프 고정으로 바꾼다 — 캐시 읽기는 relay 스코프로 pin하고
(기존 `withContext` / 컨텍스트 오버라이드 메커니즘 활용), 원격 fetch는 relay 연결일 때만
수행한다. 클라우드 전환 중에는 relay 스코프 캐시(+ 세션 시드) 값이 그대로 보인다.
사용처 네 곳 모두 계정 레벨 화면이므로 일괄 적용하며, MyPage 상단은 클라우드로 전환해도
relay 프로필만 보이게 된다.

### 6. 표시용 아바타를 variant 기반 단일 `Avatar`로 통합 재설계한다

web-ui-kit의 표시용 아바타(플레이스·클라우드·그룹방·dm/self·chat placeholder·user, 사진
포함)를 Figma 기준으로 variant 기반 단일 `Avatar` 컴포넌트로 새로 만들고, apps/web 사용처를
전면 교체한다. **통합 경계**: 편집용 `ProfileAvatar`(사진 선택 버튼)와 `AvatarGroup`(겹침
레이아웃)은 성격이 달라 별도 컴포넌트로 유지하되 내부 렌더는 새 `Avatar`를 쓴다.

디자인 기준(Figma DoU):

- 플레이스: [3700-11621](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3700-11621&m=dev) · [3769-34384](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3769-34384&m=dev) · [3700-11935](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3700-11935&m=dev) · [3408-27532](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3408-27532&m=dev)
- 프로필: [3644-58498](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3644-58498&m=dev) · [3408-27063](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3408-27063&m=dev) · [2981-16916](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=2981-16916&m=dev)
- 클라우드: [3037-19916](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3037-19916&m=dev)
- 그룹방: [3158-26215](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3158-26215&m=dev)
- dm/self: [3451-21343](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3451-21343&m=dev)

구현 시 Figma 데스크톱 앱 MCP로 노드를 직접 읽는다(해당 파일을 Figma 데스크톱에서 열어둘 것).

## 대안 (Alternatives)

- **프로필 입장 게이트** — 플레이스 입장 시 프로필 부재를 판정해 강제 모달을 띄우는 안.
  비정상 이탈·기존 플레이스까지 커버하는 장점이 있으나, 부재 판정 오탐 리스크(동기화 지연
  전력)와 적용 범위 실수 시 닫기 불가 모달에 갇히는 트랩 리스크를 안는다. 검토 끝에 기각 —
  생성 시점 강제로 단순화한다.
- **생성 다이얼로그 2스텝 시퀀스**(플레이스 정보 → 프로필 정보 → 마지막에
  `createPlace`→`switchSite`→`setMyProfile` 연쇄) — 이탈 시 아무것도 안 만들어져 "필수"가
  자연스럽지만, 마지막 제출이 비동기 3연쇄가 되어 중간 실패 분기(플레이스는 생성됐는데
  프로필 저장 실패 등)로 흐름이 꼬일 수 있어 기각.
- **이탈 시 플레이스 롤백**(`deletePlace`) — 강제성은 확보되나 생성-삭제 왕복과 전환 복귀까지
  얽혀 실패 모드가 더 많다. 기각.
- **`libs/data`에 `cid === 'default'` 하드코딩** — 가장 짧지만 앱 표시 정책이 공유
  라이브러리에 박혀 desktop-web까지 강제된다. 옵션 주입으로 대체.
- **아바타 유형별 컴포넌트 유지 + 시각 정합만** — 파급은 작지만 파편화가 그대로 남는다.
  통합 재설계로 결정(사용자 선택).

## 결과 (Consequences)

- 클라우드 홈에서 기본플레이스가 사라지고, relay에서만 보인다. desktop-web은 옵션 기본값
  덕에 동작 변화가 없다.
- 플레이스 생성 직후 목록 반영·정렬이 보장되고, 이름/사진 수정이 다시 동작한다(400 해소).
- 새 플레이스의 owner는 반드시 프로필을 갖게 되어, 초대 수락자(ADR-0041)와 전제조건이
  대칭이 된다. **트레이드오프**: 생성 직후 새로고침 등 비정상 이탈 시 프로필 없는 플레이스가
  남을 수 있다 — 입장 게이트를 기각했으므로 이 구멍은 기존 nudge 경로(ADR-0040)가 보완하는
  것으로 감수한다.
- MyPage 계열 화면은 클라우드 전환과 무관하게 일관된 계정(relay) 프로필을 보여준다.
  **트레이드오프**: 클라우드 연결 중에는 relay 원격 fetch를 못 하므로 캐시가 오래됐다면
  이전 값이 보인다(다음 relay 연결에서 갱신).
- 아바타는 단일 API로 수렴하지만 apps/web 10개 feature 영역의 사용처 교체가 필요한 규모
  있는 UI 작업이 된다. 기존 유형별 컴포넌트는 교체 완료 후 제거한다.
