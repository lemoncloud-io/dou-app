# 사이트 프로필 편집 (ProfileRepositoryV2)

> 대상: `home` 헤더 + `mypage/SiteProfileEditPage`

## 사이트 프로필 vs 클라우드 프로필

두 프로필은 **별개**이며 진입점도 분리한다.

- **사이트 프로필**(nick/thumbnail) — 활성 사이트 안에서의 내 프로필. **홈 헤더에서만** 진입(`SiteProfileEditPage`, `/mypage/site-profile`). 저장은 `ProfileRepositoryV2.setMyProfile`. 헤더 표시도 이 프로필을 관측한다.
- **클라우드 프로필**(cloud name) — **마이페이지/계정정보**에서 진입(`CloudProfileEditPage`, `/mypage/cloud-profile`). 저장은 `useUpdateCloud`.

즉 홈에는 사이트 프로필만 노출한다.

### 헤더 노출 조건 (초대 클라우드 대응)

사이트가 활성(`!isDefaultCloud`)이면 게스트/초대 사용자도 편집 가능한 사이트 프로필이 있으므로, 게스트/초대 여부와 무관하게 헤더 프로필 버튼을 노출한다. 기본 클라우드에서만 게스트/`INVITED`에게 `CloudLogo`를 보인다.

```ts
showProfileButton = !isDefaultCloud || (!isGuest && userType !== INVITED); // HomePage.tsx
```

초대 클라우드+사이트 접속 시 `selectedCloudId !== 'default'` → `isDefaultCloud = false`.

## 설계 — 공용 훅 `useMyProfile`

헤더와 편집 화면이 **동일 소스(V2 내 프로필)**를 공유하도록 공용 훅을 둔다. (세션 토큰의 name이 site 프로필 nick을 반영 못 할 수 있어 세션 새로고침 방식은 배제.)

`useMyProfile()`:

- `profileId = `${sid}@${uid}``, `repos.profile.observeItem(profileId, set)`구독 + 마운트 시`getMyProfile()` 1회 fetch.
- sid는 `useSessionSelection().selectedSiteId`, uid는 `useSessionIdentity().userId`.
- sid/uid 없으면 `null`(기본 클라우드/게스트 no-op). 반환 `{ profile: DomainProfile | null }`.

소비:

- `SiteProfileEditPage` — 초기값을 `useMyProfile`의 `nick/thumbnail`에서 읽고(`initialRef` 동기화), 저장은 `setMyProfile({ nick, thumbnail })`.
- 헤더(HomePage) — 사이트 활성 시 `displayName`/`displayImageUrl`을 `myProfile.nick/thumbnail` 우선, 없으면 세션 값 폴백. 저장 즉시 반영.

## 미해결

- 썸네일 클리어 시 빈 문자열 전송이 서버 삭제로 처리되는지 E2E 확인 필요.
