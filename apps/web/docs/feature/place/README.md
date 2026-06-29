# place

> 대상: `apps/web/src/app/features/place`

## 책임

개별 **Place(=Site)**의 상세 정보를 조회·편집한다. 도메인 상 `place === site`(백엔드 모델명 `site`)다. 사용자가 소유한 사이트의 이름·프로필 이미지를 편집하는 작은 모듈이다. (이전 `places`에서 단수형 `place`로 개명됨.)

Place 목록·생성·전환은 [home](../home/README.md)이 담당한다. place feature는 단일 사이트의 **상세/편집 화면**만 소유한다.

## 화면

| 페이지          | 경로(`ROUTES.place.*`) | 설명                                                                                     |
| --------------- | ---------------------- | ---------------------------------------------------------------------------------------- |
| `PlaceInfoPage` | `/place/:placeId`      | 사이트 정보 조회/편집 — 생성일 표시, 이름(1~20자), 프로필 이미지 업로드, owner 권한 검증 |

`ROUTES.place.order`(정렬) 경로도 정의되어 있으나, place 순서 관리는 home feature 쪽에서 다룬다.

## 구조

```
features/place/
  pages/PlaceInfoPage.tsx
  routes/        # PlaceRoutes (:placeId)
  index.tsx
```

`hooks/`·`types/`·`components/`는 없다 — 수정 로직은 home의 `useUpdatePlace`를 재사용한다.

## 데이터 흐름

- **읽기**: `useRuntimeRepositories().place.observeItem(placeId, cb)` — 단일 사이트 관측([data-flow](../../architecture/data-flow.md)).
- **쓰기**: home의 `useUpdatePlace({ sid, name?, thumbnail? })` → 내부적으로 `repos.place.updatePlace(...)`. 썸네일은 150px 정사각으로 리사이즈 후 base64.
- repository alias: app-runtime의 `place` repo는 data 레이어의 site repository를 노출한다(`DomainPlace = DomainSite`).

## 주요 결정/특이점

- **owner 가드**: `isOwner === false`이면 자동으로 뒤로 이동.
- 이름 1~20자, 이미지 ≤10MB(webp/png/jpeg). 초과 시 에러 메시지.
- `isDirty` 추적 + `canSubmit`(변경 && 유효 && 미대기) 조건으로 제출 제어.
