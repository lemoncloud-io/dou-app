# place

> 대상: `apps/web/src/app/features/place`

## 책임

개별 **Place(=Site)**의 상세 정보를 조회·편집한다. 도메인 상 `place === site`(백엔드 모델명 `site`)다. 사용자가 소유한 사이트의 이름·프로필 이미지를 편집하는 작은 모듈이다. (이전 `places`에서 단수형 `place`로 개명됨.)

Place 목록·생성·전환은 [home](../home/README.md)이 담당한다. place feature는 단일 사이트의 **상세/편집 화면**만 소유한다.

## 화면

| 페이지                 | 경로(`ROUTES.place.*`)             | 설명                                                              |
| ---------------------- | ---------------------------------- | ----------------------------------------------------------------- |
| `PlaceSettingsHubPage` | `/place/:placeId/settings`         | 설정 허브 — 홈 프로필 드롭다운에서 진입, 하위 화면으로 이동       |
| `PlaceInfoPage`        | `/place/:placeId/settings/info`    | 플레이스 이름(1~20자)·프로필 이미지 편집 — 오너 전용              |
| `PlaceProfilePage`     | `/place/:placeId/settings/profile` | 내 플레이스 유저 프로필(닉/사진) 편집                             |
| `ChannelSortPage`      | `/place/:placeId/settings/sort`    | 채팅방 정렬 기준 선택(최근 활동순 / 안읽은 우선)                  |
| `PlaceInfoPage`        | `/place/:placeId`                  | 레거시 직접 진입(`ROUTES.place.detail`) — 위 info와 동일 컴포넌트 |

설계·데이터 흐름 상세는 [place-settings.md](place-settings.md) 참조.

## 구조

```
features/place/
  pages/PlaceSettingsHubPage.tsx  # 설정 허브
  pages/PlaceInfoPage.tsx         # 이름/이미지 (오너)
  pages/PlaceProfilePage.tsx      # 유저 프로필 (home PlaceProfileForm 재사용)
  pages/ChannelSortPage.tsx       # 채팅방 정렬 기준
  routes/                         # PlaceRoutes (:placeId, :placeId/settings/*)
  index.tsx
```

`hooks/`·`types/`·`components/`는 없다 — 편집 로직은 home의 `useUpdatePlace`·`PlaceProfileForm`·`setMyProfile`을 재사용한다.

## 데이터 흐름

- **읽기**: `useRuntimeRepositories().place.observeItem(placeId, cb)` — 단일 사이트 관측([data-flow](../../architecture/data-flow.md)).
- **쓰기(플레이스 이름/이미지)**: home의 `useUpdatePlace({ sid, name?, thumbnail? })` → `repos.place.updatePlace(...)`. 썸네일은 150px 정사각 리사이즈 후 base64.
- **쓰기(유저 프로필)**: `profileRepository.setMyProfile({ nick, thumbnail })`.
- **정렬 선호값**: 클라이언트 localStorage(`chatic-channel-sort`, 플레이스별 JSON 맵) — `usePreferenceStore.channelSort`.
- repository alias: app-runtime의 `place` repo는 data 레이어의 site repository를 노출한다(`DomainPlace = DomainSite`).

## 주요 결정/특이점

- **owner 가드**: `isOwner === false`이면 자동으로 뒤로 이동(허브에서도 오너 아닌 경우 "플레이스 설정" 행 disabled).
- 이름 1~20자, 이미지 ≤10MB(webp/png/jpeg). 초과 시 에러 메시지.
- 정렬은 "기준 선택"만 저장(수동 드래그 순서 아님), 기기별(서버 동기화 없음).
- 플레이스 알림·채팅방 관리는 범위 밖(알림 미구현, 채팅방 관리는 후속).
