# 사이트 활성 프로필 편집 — ProfileRepositoryV2 전환

> 상태: 구현 완료(E2E 수동검증 대기) · 범위: `home` 헤더 + `mypage` 편집 화면

## 0. 사이트 프로필 vs 클라우드 프로필 (진입점 분리)

두 프로필은 **별개**이며 진입점도 분리한다.

- **사이트 프로필**(V2 `setMyProfile`, nick/thumbnail) — **홈 헤더**에서만 진입(`SiteProfileEditPage`, `/mypage/site-profile`). 헤더 표시도 이 프로필을 관측.
- **클라우드 프로필**(기존 `useUpdateCloud`, cloud name) — **마이페이지/계정정보**에서 진입(`CloudProfileEditPage`, `/mypage/cloud-profile`). 기존 동작 그대로 유지.

즉 홈에는 클라우드 프로필을 노출하지 않는다(사이트 프로필만). `CloudProfileEditPage`는 V2로 갈아끼우지 않고 원복했다.

### 헤더 노출 조건 (초대 클라우드 대응)

사이트가 활성(`!isDefaultCloud`)이면 게스트/초대 사용자도 편집 가능한 사이트 프로필이 있으므로, **게스트/초대 여부와 무관하게 헤더 프로필 버튼을 노출**한다. 기본 클라우드에서만 기존처럼 게스트/`INVITED`에게는 `CloudLogo`를 보인다.

- `showProfileButton = !isDefaultCloud || (!isGuest && userType !== INVITED)` (`HomePage.tsx`)
- 근거: 초대 클라우드+사이트 접속 시 `selectedCloudId !== 'default'` → `isDefaultCloud=false`. (`userType`은 보통 `INVITED_WITH_CLOUD`.)

## 1. 목표

사이트(클라우드) 활성 상태에서 사용자가 **해당 사이트 내 자기 프로필(닉네임·썸네일)**을 변경할 수 있게 한다. 저장은 레거시 `useUpdateCloud`가 아니라 **`ProfileRepositoryV2.setMyProfile`**으로 한다(런타임 마이그레이션 방향). 헤더의 프로필 표시도 세션 기반이 아니라 **V2 내 프로필 관측**에서 읽어 저장 즉시 반영한다.

성공 기준: 헤더 프로필 클릭 → 편집 화면에서 닉/썸네일 수정 → 저장 → 헤더가 즉시 새 값으로 갱신, 재진입 시 값 유지.

## 2. 범위

- **포함**: `CloudProfileEditPage` 저장 경로 교체(+썸네일 저장 활성화), 초기값을 V2 관측에서 읽기, 헤더(HomePage) 표시를 V2 관측으로, 공용 훅 `useMyProfile` 신설.
- **제외**: 기본 클라우드 `ProfileEditPage`(relay, `useUpdateProfile`), 게스트/초대 헤더, 타인 프로필 표시(`useChannelProfiles`는 이미 V2).

## 3. 현재 상태(근거)

- 헤더: 사이트 활성 시 이미 `cloud-profile`로 이동. 표시는 세션 기반.
  `features/home/pages/HomePage.tsx:51-52, 83-86`
- 편집 화면: UI 완성, 저장은 `useUpdateCloud` + `refreshCurrentCloudSession`, 썸네일은 deferred.
  `features/mypage/pages/CloudProfileEditPage.tsx:24, 40-55`
- V2 저장 API: `setMyProfile(body: ProfileBody): Promise<DomainProfile>` — 내부에서 sid를 채워 optimistic `setProfile` 호출.
  `libs/data/src/data/repositories-v2/ProfileRepositoryV2.ts:148-152`. `ProfileBody.nick/thumbnail: string`.
- 참조 패턴: `useRuntimeRepositories().profile`(`features/channels/hooks/useChannelProfiles.ts:20`), `observeItem(`${sid}@${uid}`)` + `setMyProfile`(`apps/testbed/.../RuntimeOverlay.tsx:185,205-208`).
- sid: `useSessionSelection().selectedSiteId` / uid: `useSessionIdentity().userId`.

## 4. 설계 방향

헤더와 편집 화면이 **동일 소스(V2 내 프로필)**를 공유하도록 공용 훅을 둔다. 세션 새로고침 방식은 세션 토큰 name이 site 프로필 nick을 반영 못 할 수 있어 배제.

`useMyProfile()`:

- `profileId = `${sid}@${uid}``, `repos.profile.observeItem(profileId, set)`구독 + 마운트 시`getMyProfile()` 1회 fetch.
- sid/uid 없으면 `null` 반환(기본 클라우드/게스트 no-op). 반환 `{ profile: DomainProfile | null }`.

`CloudProfileEditPage`: 초기값을 `useMyProfile`의 `nick/thumbnail`에서(로드 시 `initialRef` 동기화), 저장은 `setMyProfile({ nick, thumbnail })`, 레거시 훅 제거. UI/스타일/i18n 키 유지.

헤더(HomePage): 사이트 활성 시 `displayName`/`displayImageUrl`을 `myProfile.nick/thumbnail` 우선으로, 없으면 기존 세션 값 폴백.

## 5. 구현 단계

1. `useMyProfile` 훅 신설(+barrel export).
2. `CloudProfileEditPage` 저장/초기값 교체.
3. 헤더(HomePage) 표시 소스 교체.
4. 유닛 테스트(`useMyProfile`, 저장 핸들러).

## 6. 리스크

- 썸네일 클리어 시 빈 문자열 전송이 서버 삭제로 처리되는지 미확인(우선 빈 문자열, 동작 확인).
- 초기 로드 타이밍 → `initialRef`/`useEffect` 동기화로 완화.
- 공용 훅 배치 위치는 기존 관례 확인 후 결정.

## 7. 검증

### 변경 파일

- 신규: `app/hooks/useMyProfile.ts`(+barrel), `app/hooks/useMyProfile.test.ts`, `features/mypage/pages/SiteProfileEditPage.tsx`
- 수정: `features/home/pages/HomePage.tsx`(헤더 표시 V2 + 진입점 → siteProfile), `routes/paths.ts`(`siteProfile`), `features/mypage/routes/index.tsx`·`pages/index.ts`(라우트/배럴), `public/locales/{ko,en}/translation.json`(`profileEdit.tabSite`·`siteDescription1/2`·`siteSaveSuccess/Error`)
- 원복: `features/mypage/pages/CloudProfileEditPage.tsx`(클라우드 프로필 = 기존 `useUpdateCloud`)

### 검증 체크리스트

- [x] `tsc -b apps/web` 통과(EXIT 0).
- [x] 유닛 테스트 `useMyProfile.test.ts` 3/3 통과 — (1) sid/uid 없으면 null·미구독, (2) `${sid}@${uid}` 구독 + 1회 fetch + 콜백 반영, (3) 언마운트 시 unsubscribe.
- [x] dev 서버 부팅 + 홈 렌더, **변경 파일발(發) 콘솔 에러 없음**. (관측된 `JoinLocalDataSourceV2 channelId` 에러는 `useChannelUnreads` 기존 이슈로 본 작업과 무관.)
- [ ] **E2E 수동검증(자격증명 필요)**: 사이트 활성 로그인 → 헤더 프로필 클릭 → 닉/사진 변경 → 저장 → (1) 토스트, (2) 뒤로가기 후 헤더 즉시 갱신, (3) 재진입 시 값 유지.

### 미해결

- `CloudProfileEditPage` 페이지 렌더 테스트는 jest `moduleNameMapper`가 `@chatic/lib/utils` 등 서브패스 import를 매핑하지 않아 불가(레포에 페이지 테스트 선례 0). 공유 jest 설정 변경은 범위 밖으로 보류 → 신규 로직은 `useMyProfile` 훅 테스트로 커버, 페이지는 타입체크+E2E로 커버.
- 썸네일 클리어(빈 문자열) 서버 처리 동작은 E2E에서 확인 필요.
