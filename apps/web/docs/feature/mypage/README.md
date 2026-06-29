# mypage

> 대상: `apps/web/src/app/features/mypage`

## 책임

내 계정·정책 설정 허브다. 프로필/계정 관리, 클라우드 프로필 편집, 탈퇴, 약관·정책 표시를 담당한다. 개발자 도구는 별도 [debug](../debug/README.md) feature로 분리됐다.

## 화면

| 페이지                                       | 경로(`ROUTES.mypage.*`)  | 설명                                                                   |
| -------------------------------------------- | ------------------------ | ---------------------------------------------------------------------- |
| `MyPage`                                     | `/mypage`                | 허브 — 설정 메뉴, 앱 버전(디버그 언락 탭)                              |
| `AccountInfoPage`                            | `/mypage/account`        | 계정 정보                                                              |
| `AccountManagePage`                          | `/mypage/account-manage` | 계정 관리(클라우드 세션)                                               |
| `ProfileEditPage`                            | `/mypage/edit`           | 기본 클라우드(relay) 프로필 편집                                       |
| `CloudProfileEditPage`                       | `/mypage/cloud-profile`  | 클라우드 프로필(이름) 편집                                             |
| `SiteProfileEditPage`                        | `/mypage/site-profile`   | 사이트 프로필(닉·썸네일) 편집 (→ [site-profile.md](./site-profile.md)) |
| `WithdrawalPage`                             | `/mypage/withdrawal`     | 회원 탈퇴                                                              |
| `TermsPage` / `PrivacyPage` / `LicensesPage` | `/mypage/policy/*`       | 약관·개인정보·라이선스                                                 |

## 구조

```
features/mypage/
  pages/      # 위 화면들
  hooks/
    useAppIcon.ts   # 네이티브 앱 아이콘 (지원여부/현재/목록 fetch + 변경 + 라벨)
  consts/     # 정책 콘텐츠 재노출 등
  components/
  routes/
  index.ts
```

`debug`가 분리되면서 mypage는 일반 설정 UX만 남았다(이전 ~6,100줄 중 debug 4,300줄 이동).

## 데이터 흐름

세션 상태는 web-core 신 훅으로만 읽는다(core 객체 직접 접근 금지, [architecture/README.md](../../architecture/README.md)).

- 프로필/신원 → `useSessionIdentity()` (`activeProfile`, `userType`, `cloudProfile`)
- 선택 상태 → `useSessionSelection()` (`selectedCloudId`)
- 로그아웃 → `navigate(ROUTES.auth.logout)` ([auth](../auth/README.md)의 `LogoutPage`가 캐시 클리어 + 세션 종료를 담당)
- 클라우드 세션 로그아웃 → `useLogoutCloudSession()`
- 클라우드 프로필 저장 → `useUpdateCloud` + `useRefreshCurrentCloudSession`

## 두 종류의 프로필

mypage는 세 가지 프로필 편집 진입점을 가진다 — 구분 주의:

| 진입점                 | 대상                           | API                                |
| ---------------------- | ------------------------------ | ---------------------------------- |
| `ProfileEditPage`      | 기본 클라우드(relay) 프로필    | `useUpdateProfile`                 |
| `CloudProfileEditPage` | 클라우드 이름                  | `useUpdateCloud`                   |
| `SiteProfileEditPage`  | 사이트 내 내 프로필(닉·썸네일) | `ProfileRepositoryV2.setMyProfile` |

사이트 프로필은 홈 헤더에서만 진입하며 상세는 [site-profile.md](./site-profile.md).

## 디버그 언락

앱 버전 텍스트 탭(`useDebugMode().registerTap`)으로 [debug](../debug/README.md) 모드를 연다. 게이트 로직은 debug feature가 소유한다.
