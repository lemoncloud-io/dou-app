# place

> 대상: `apps/web/src/app/features/place`

## 책임

개별 **Place(=Site)**의 상세 정보를 조회·편집한다. 도메인 상 `place === site`(백엔드 모델명 `site`)다. (이전 `places`에서 단수형 `place`로 개명됨.)

Place 목록·생성·전환은 [home](../home/README.md)이 담당한다. place feature는 단일 사이트의 **상세/편집 화면**만 소유한다.

## 화면

`edit`은 쓰는 화면, `detail`은 읽는 화면이다 — `info`는 둘 다로 읽혀 쓰지 않는다(ADR-0047).

| 페이지                   | 경로(`ROUTES.place.*`)              | 설명                                                                  |
| ------------------------ | ----------------------------------- | --------------------------------------------------------------------- |
| `PlaceSettingsHubPage`   | `/place/:placeId/settings`          | 설정 허브 — 홈 프로필 드롭다운에서 진입, 하위 화면으로 이동           |
| `PlaceDetailPage`        | `/place/:placeId/settings/detail`   | 플레이스 정보 조회(이름·만든 날짜·소유자) — 읽기 전용, 전원 접근 가능 |
| `PlaceEditPage`          | `/place/:placeId/settings/edit`     | 플레이스 이름(1~20자)·프로필 이미지 편집 — 오너 전용                  |
| `PlaceProfilePage`       | `/place/:placeId/settings/profile`  | 내 플레이스 유저 프로필(닉/사진) 편집                                 |
| `PlaceChannelManagePage` | `/place/:placeId/settings/channels` | 채팅방 관리                                                           |
| `PlaceDetailPage`        | `/place/:placeId`                   | `ROUTES.place.detail` — 위 detail과 동일 컴포넌트                     |

채팅방 정렬은 페이지가 아니라 허브에서 여는 바텀시트(`components/ChannelSortSheet.tsx`)다.

설계·데이터 흐름 상세는 [place-settings.md](place-settings.md) 참조.

## 구조

```
features/place/
  pages/PlaceSettingsHubPage.tsx     # 설정 허브
  pages/PlaceDetailPage.tsx          # 플레이스 정보 (읽기 전용)
  pages/PlaceEditPage.tsx            # 이름/이미지 편집 (오너)
  pages/PlaceProfilePage.tsx         # 유저 프로필 (home PlaceProfileForm 재사용)
  pages/PlaceChannelManagePage.tsx   # 채팅방 관리
  components/ChannelSortSheet.tsx    # 채팅방 정렬 바텀시트
  hooks/usePlaceOwnerProfile.ts      # 소유자의 플레이스 프로필 (`${sid}@${uid}`)
  routes/                            # PlaceRoutes (:placeId, :placeId/settings/*)
  index.tsx
```

`types/`는 없다 — 편집 로직은 home의 `useUpdatePlace`·`PlaceProfileForm`·`setMyProfile`을 재사용한다.

## 데이터 흐름

- **읽기**: `useRuntimeRepositories().place.observeItem(placeId, cb)` — 단일 사이트 관측([data-flow](../../architecture/data-flow.md)).
- **읽기(소유자)**: `usePlaceOwnerProfile(placeId, place.ownerId)` → `profile.observeItem('${placeId}@${ownerId}')` + 캐시 미스만 `refreshItem`. place 행의 `owner$`는 쓰지 않는다 — 그 `name`이 사람 이름이 아닌 내부 식별자(`"LMN:…"`)다.
- **쓰기(플레이스 이름/이미지)**: home의 `useUpdatePlace({ sid, name?, thumbnail? })` → `repos.place.updatePlace(...)`. 썸네일은 150px 정사각 리사이즈 후 base64.
- **쓰기(유저 프로필)**: `profileRepository.setMyProfile({ nick, thumbnail })`.
- **정렬 선호값**: 클라이언트 localStorage(`chatic-channel-sort`, 플레이스별 JSON 맵) — `usePreferenceStore.channelSort`.
- repository alias: app-runtime의 `place` repo는 data 레이어의 site repository를 노출한다(`DomainPlace = DomainSite`).

## 주요 결정/특이점

- **owner 가드는 쓰는 화면에만 있다.** `PlaceEditPage`는 `isOwner === false`이면 자동으로 뒤로 이동하고 허브 행도 disabled다. `PlaceDetailPage`는 읽기 전용이라 게이트가 없다 — 멤버도 이 플레이스가 누구 것인지 볼 자격이 있다.
- **정보 화면의 두 분기 축이 서로 다른 것을 결정한다**(ADR-0047): `isOwner`는 이름 라벨("플레이스 이름" vs "초대된 플레이스 이름"), relay/cloud(`HOME_PLACE_ID`)는 기본 아바타(DoU 캐릭터 vs 풍경 일러스트).
- **서버가 주지 않는 사실은 그리지 않는다.** relay 기본플레이스는 `stereo: 'domain'` 시스템 사이트로 `ownerId`·`isOwner`·`thumbnail`이 없어 소유자 섹션이 아예 빠진다. 플레이스홀더("-")로 채우지 않는다.
- 이름 1~20자, 이미지 ≤10MB(webp/png/jpeg). 초과 시 에러 메시지.
- 정렬은 "기준 선택"만 저장(수동 드래그 순서 아님), 기기별(서버 동기화 없음).
- 플레이스 알림은 백엔드 미구현이라 허브에 disabled 스위치로만 있다. 플레이스 나가기·삭제·신고 관리는 보류(ADR-0047) — 하단 액션 영역 자체를 렌더하지 않는다.
