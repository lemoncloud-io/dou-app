# 플레이스 생성·그룹방 생성 화면: web-ui-kit 재구축 + 생성 후 이동·owner 게이팅·이미지·한도

## Status

accepted

결정일: 2026-07-20

관련 ADR:
[[0012-place-profile-creation]](./0012-place-profile-creation.md) (프로필 설정 오버레이 — 시각 템플릿),
[[0013-home-screen-web-ui-kit-migration]](./0013-home-screen-web-ui-kit-migration.md) (web-ui-kit 우선 원칙),
[[0014-home-screen-figma-visual-refinement]](./0014-home-screen-figma-visual-refinement.md) (홈 개정 디자인 계보)

## Context

Figma에 **플레이스 생성**(노드 `3036-12309`)과 **그룹방 생성**(노드 `3135-23390`) 개정 디자인이 나왔다.
두 화면 모두 X 닫기가 있는 풀스크린이며, 구조가 거의 동일하다 — 타이틀/서브타이틀 + 원형 아바타(이미지
선택, `+` 배지) + 이름 `TextField`(0/20 카운터) + 하단 `완료` 풀버튼.

| 화면                         | 타이틀 / 서브타이틀                                                                                              | 아바타 라벨 / 필드                     | placeholder / 헬퍼                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 플레이스 생성 (`3036-12309`) | "플레이스를 만들어서 대화를 시작해 보세요" / "플레이스는 클라우드 안에서 대화방을 만들고 관리하는 공간입니다."   | 플레이스 사진 [선택] / \*플레이스 이름 | "이름 입력" / "20글자 이내로 입력해 주세요."                                                   |
| 그룹방 생성 (`3135-23390`)   | "그룹방을 만들고 대화를 시작해 보세요" / "목적에 맞는 그룹방을 만들어 필요한 사람들과 함께 대화하는 공간입니다." | 방 사진 [선택] / \*방 이름             | "예: 여름 여행, 가족 모임, 프로젝트 A" / "채팅방의 목적이 잘 드러나는 이름으로 입력해 주세요." |

**작업의 성격은 신규가 아니라 재구축이다.** 두 생성 흐름은 이미 존재하나 레거시 UI이고 요구사항과 격차가 있다:

| 항목          | 현재 상태                                                                                          | 격차                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 플레이스 생성 | `CreatePlaceDialog`(레거시 shadcn `@chatic/ui-kit`), `useCreatePlace.createPlace({ name })`        | web-ui-kit 아님. 완료 시 반환 `MySiteView`를 **버리고** 닫기만 함 → 사이트전환 미배선. 이미지 없음 |
| 그룹방 생성   | `CreateChannelDialog`(레거시), `useCreateChannel.createChannel({ stereo, name })`                  | web-ui-kit 아님. 완료 시 **토스트만** → 채널이동 미배선. 이미지 없음                               |
| 시각 템플릿   | `PlaceProfileCreateDialog`(web-ui-kit, `ModalTopBar`+`ProfileAvatar`+`TextField`+`FloatingButton`) | 이건 **생성이 아니라 온보딩 프로필 설정**(ADR-0012). 레이아웃이 Figma와 동일 → 재구축의 레퍼런스   |

조사에서 확정된 사실:

- **web-ui-kit 재료 충분.** `ModalTopBar`·`TextField`(`maxLength`+카운터+`enforceMaxLength={false}` 오버리밋)
  ·`FloatingButton`(loading/disabled)·`ProfileAvatar`(`onSelect`+`+`배지)·`Toast`·`AlertDialog` 모두 존재.
  이미지 리사이즈는 `resizeImageToBase64`(`@chatic/shared`) 재사용. **현 Figma 기준 신규 kit 컴포넌트는 불필요**
  (textarea·select 없음). 이미지 글리프 `IconImage`는 kit에 이미 존재(`db8f2b6a`).
- **이미지 API.** `place.create`는 body에 `thumbnail?`을 **지원**(`PlaceBodyData`)하나 `useCreatePlace`/
  `PlaceRepositoryV2`가 `name`만 넘긴다. `channel.create`(`ChannelCreateRequestData`)는 현재 타입상
  `{ stereo, name }`만 노출하나(thumbnail은 `ChannelUpdateRequestData`에만 존재), **이번 작업은 `channel.create`가
  `thumbnail`을 지원한다고 가정하고 단일 스텝으로 구현한다**(2026-07-20 사용자 확정). 즉 소켓 타입/백엔드가
  `channel.create` body에 `thumbnail`을 받는 것을 전제로 하며, 타입이 아직 미노출이면 `ChannelCreateInput`
  확장이 선행되어야 한다.
- **owner 신호.** 전역 `userRole`은 `guest`/`user`뿐(클라우드 소유 아님). 그러나 `DomainCloud.cloudType`
  (`'invited' | 'owner'`)이 **클라우드 소유 신호**로 존재(`mappers.ts:222`, `CloudRepositoryV2.ts:32`).
  현재 게이팅은 `canCreatePlace = !isGuest && isCloudActive`, `canCreateChannel = true`로 owner 개념이 없다.
- **한도 상수 충돌(정리 필요).** `apps/web/src/app/utils/consts.ts`에 `MAX_PLACES=5`, `MAX_CHANNELS_PER_PLACE=5`,
  `GUEST_MAX_CHANNELS=1`이 있으나 **어디서도 import되지 않는 죽은 코드**다. 실제 값은 `useUserPermissions.ts`
  안에 별도 리터럴(`MAX_CHANNELS_PER_PLACE=100`, `GUEST_MAX_CHANNELS=3`)로 존재해 상충한다.
- **미사용 프로토타입.** `channels/pages/CreateChannelPage.tsx`(`/channels/create` 라우트)는 하드코딩 초대코드
  (`'ABC123'`)를 가진 프로토타입이며 앱 어디서도 진입하지 않는다. public/private 토글이 있으나 개정 Figma엔
  가시성 토글이 없다.

## Decision

두 생성 화면을 **다이얼로그 in-place 재구축**한다. 기존 `CreatePlaceDialog`/`CreateChannelDialog`를
`@chatic/web-ui-kit` 풀스크린 슬라이드업 오버레이(`PlaceProfileCreateDialog` 패턴)로 갈아엎고, HomePage에서
여는 현행 진입점을 유지한다. 새 라우트는 만들지 않는다. web-ui-kit 우선 원칙(ADR-0013) 계승 — 색 hex·아이콘을
화면에 직접 박지 않고 누락 프리미티브는 kit에 정의 후 사용(현 스코프에선 누락 없음).

**포함**

- **(1) 플레이스 생성 재구축.** `CreatePlaceDialog`를 Figma `3036-12309`에 맞춰 web-ui-kit로 재작성. 이름
  `TextField`(max 20, 오버리밋 error) + 이미지 선택(`ProfileAvatar`+hidden file input+`resizeImageToBase64`).
- **(2) 그룹방 생성 재구축.** `CreateChannelDialog`를 Figma `3135-23390`에 맞춰 web-ui-kit로 재작성. 동일한
  이름/이미지 폼. 가시성은 개정 Figma에 토글이 없으므로 현행 기본값(`stereo: 'private'`) 유지.
- **(3) 생성 후 이동.**
    - 플레이스 완료 → `createPlace`가 반환한 새 site id로 **사이트전환**(`useSwitchPlace`/`runtime/useSiteSwitch`
      의 `switchSite(newId)`) 후 오버레이 닫기.
    - 그룹방 완료 → 반환된 `DomainChannel.id`로 **채널이동**(`navigate(ROUTES.channels.room(id))`).
- **(4) owner 게이팅.** `useUserPermissions`에 클라우드 소유 개념을 추가해 `canCreatePlace`·`canCreateChannel`
  을 **`cloudType === 'owner'`**(+ 기존 `!isGuest && isCloudActive`, 렐리 클라우드 제외)로 좁힌다. 서버가 최종
  권한 주체이므로 클라이언트는 진입점 노출/차단 및 사전 검증 역할이다.
- **(5) 이미지 배선(둘 다 단일 스텝).**
    - 플레이스: `useCreatePlace`/`PlaceRepositoryV2` 경로에 `thumbnail`을 뚫어 `place.create` 한 번에 전송.
    - 그룹방: `channel.create`가 `thumbnail`을 지원한다고 가정하고 `{ stereo, name, thumbnail }`을 **한 번에 전송**.
      필요 시 `ChannelCreateInput`/리포(`useCreateChannel`·`ChannelRepositoryV2`·`ChannelRemoteDataSource`)
      경로에 `thumbnail`을 추가한다. create→update 2스텝은 쓰지 않는다.
- **(6) 한도 처리.** 플레이스 최대 5, 그룹방(플레이스당) 최대 100. 생성(+) 진입점은 **항상 노출**하고, 한도
  초과 시도 시 **안내 토스트**로 막는다(현 `handleCreatePlace`의 거부-토스트 패턴과 일관). 한도 상수는
  `useUserPermissions`(또는 그 인접)로 일원화하고, 죽은/상충하는 `utils/consts.ts`의 값은 정리한다.

**제외**

- 데이터 흐름·sync 등록·미읽음 모델 변경(ADR-0013 계승).
- 그룹방 PRO 게이트 정책 변경 — 현행 `planTier === 'pro'` 게이트(ADR-0013 계보)는 그대로 유지하고 owner
  게이트를 그 위에 얹는다.
- 1:1 대화 생성, 검색 등 미구현 기능의 실제 동작.
- 서버측 owner/한도 강제 로직(백엔드 소관). 클라이언트는 UX 게이팅과 사전 검증만 담당.

## Alternatives

- **라우트 페이지 신규(`/place/create`, `/channels/create`).** 미사용 `CreateChannelPage` 프로토타입 재활용
  가능하나, 기존 진입이 전부 HomePage 오버레이이고 Figma가 풀스크린-오버레이 형태라 이질적. 딥링크 요구가
  없어 기각.
- **owner 판정을 현행 유지(비게스트+활성클라우드) + 서버 위임.** 요구사항이 "owner만"을 명시했고 정확한
  신호(`cloudType==='owner'`)가 이미 존재하므로, 진입점 자체를 소유 클라우드로 좁히는 편이 UX가 정확. 기각.
- **그룹방 이미지 create→update 2스텝.** 현재 타입상 `channel.create`에 thumbnail이 없어 생성 후 update로
  반영하는 안을 검토했으나, 부분 실패(방은 생성·썸네일만 누락) 처리가 지저분하고 왕복이 늘어 기각. 대신
  `channel.create`가 thumbnail을 받는다고 가정하고 단일 스텝으로 간다(사용자 확정). 그룹방 이미지 제외(이름만)
  안도 Figma가 "방 사진"을 명시하므로 기각.
- **한도 초과 시 (+) 버튼 숨김/비활성.** 가장 깔끔하나, 기존 거부-토스트 패턴과의 일관성 및 진입점 상시 노출을
  택해 토스트로 통일. 기각.
- **`utils/consts.ts` 상수 그대로 사용.** 죽은 코드이고 값이 요구사항(방 100/플레이스 5)과 상충(방 5)해
  신뢰 불가. 일원화 후 정리.

## Consequences

- **레거시 UI 제거.** `CreatePlaceDialog`/`CreateChannelDialog`가 레거시 `@chatic/ui-kit`에서 web-ui-kit로
  전환되어 shadcn 의존 지점이 두 곳 줄어든다. 미사용 `CreateChannelPage`+`/channels/create` 라우트는 정리
  후보(가시성 토글 프로토타입, 현 Figma와 불일치).
- **owner 게이팅은 진입점에 영향.** `canCreatePlace`/`canCreateChannel`이 `cloudType==='owner'`로 좁혀지면
  `HomePage`의 Place `+`, Chat `그룹 방 만들기` 노출 조건이 바뀐다. 초대(invited) 클라우드에선 생성 진입점이
  사라진다. `useUserPermissions.test.ts`의 기대값 갱신 필요.
- **그룹방 이미지 = `channel.create` thumbnail 전제.** 단일 스텝이라 부분 실패 처리가 없다. 단, 현재
  `ChannelCreateRequestData` 타입엔 thumbnail이 없으므로 소켓 API 타입/백엔드가 이를 받도록 선행되어야 한다.
  구현 착수 시 `channel.create` body의 thumbnail 지원 여부를 먼저 확인하고, 미지원이면 타입 확장 또는 백엔드
  협의가 블로커다.
- **한도 상수 일원화.** 플레이스 5/그룹방 100을 단일 소스로 모으고 `utils/consts.ts`의 상충 값을 제거해, 이후
  한도 변경이 한 곳에서만 일어나도록 한다.
- **`PlaceProfileCreateDialog`는 건드리지 않는다.** 생성이 아니라 온보딩 프로필 설정(ADR-0012)이므로 시각
  레퍼런스로만 참고하고 로직은 분리 유지한다.
- **아이콘/애셋.** 이미지 글리프는 기존 `IconImage` 재사용. 그룹방 기본 아바타 글리프가 kit 기존 아이콘
  (`IconUsers` 등)으로 충족되지 않으면 Figma에서 애셋을 따와 `resources/`에 추가한다(그때만 신규 export).

## 다음 단계

[[dev-2_implement]] 스펙 작성(Phase A)으로 이어간다. 착수 시 `channel.create` body의 `thumbnail` 지원 여부를
먼저 확인하고(미지원이면 `ChannelCreateInput` 확장/백엔드 협의가 선행), 한도 상수 위치는 스펙에서 구체화한다.
