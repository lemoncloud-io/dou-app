# MyPage feature 구조 개선

> 대상: `apps/web/src/app/features/mypage` · 기준 문서: [directory-structure.md](../../directory-structure.md)

debug 도구를 별도 feature로 분리하고, mypage를 표준 구조(`hooks/`·`consts/`)에 맞춰 정리하고,
마이그레이션 과정에서 생긴 깨진 참조를 복구한 기록.

## 배경

기존 mypage는 약 6,100줄이었고, 그중 debug 도구 페이지 7개가 약 4,300줄
(`DebugUploadPage` 1,741줄, `DebugCacheTestPage` 1,402줄 등)을 차지해 일반 설정 UX와 개발자
도구가 한 폴더·한 라우트 트리에 섞여 있었다. `hooks/`·`types/`도 없었고 `consts/`·`constants/`
중복 폴더가 있었으며, `CloudProfileEditPage`는 삭제된 `useUserMutations`를, `routes`/`pages`는
존재하지 않는 `DebugStatePage`를 참조해 깨져 있었다.

## debug → 별도 feature 분리

```
features/debug/
  pages/    DebugPage · DebugLoginPage · DebugChatPage · DebugLogBufferPage
            DebugCacheTestPage · DebugUploadPage · DebugBadgeCountPage
  hooks/    useDebugMode   # 10탭 잠금해제 / isEnabled / disable
  consts/   DEBUG_STORAGE_KEY
  routes/   DebugRoutes
  index.ts
```

- debug 페이지 7개를 `git mv`로 이동(히스토리 보존).
- 라우트를 `/mypage/debug/*` → 최상위 **`/debug/*`** 로 이동(`ROUTES.mypage.debug` → `ROUTES.debug`).
  `PrivateRoutes.tsx`에 다른 feature와 동일한 `lazy` + `withSuspense` 패턴으로 `debug/*` 마운트.
- 디버그 모드 잠금/해제 로직을 `useDebugMode`로 캡슐화. MyPage(앱버전 10탭 → `registerTap`)와
  DebugPage(가드 `isEnabled`/`disable`)가 공유.
- debug 페이지들은 mypage `components/`를 쓰지 않아 분리 시 끌려오는 의존성 없음.

## MyPage 슬림화 (hooks 추출)

- 네이티브 앱아이콘 로직(지원여부/현재아이콘/목록 fetch + 변경 + 라벨 계산)을
  `mypage/hooks/useAppIcon.ts`로 추출. `MyPage.tsx`에서 약 60줄 제거.
- 디버그 잠금해제/상태는 `useDebugMode`로 치환.

## consts/constants 통합

- `DEBUG_STORAGE_KEY`는 debug feature로 이동.
- 남은 policy-content 재노출만 단일 `consts/`로 합치고 `constants/` 제거.
  `TermsPage`/`PrivacyPage` import를 `../consts`로 갱신.

## 깨진 참조 복구

- **`CloudProfileEditPage`**: 삭제된 `useUserMutations` → web-core `useUpdateCloud`로 교체
  (이름만 저장, 이미지 보류). 참고 구현은 `home/components/CloudNameEditDialog`.
- **dead `DebugStatePage`** 참조를 `pages/index.ts`·`routes/index.tsx`에서 제거(파일 부재).

## 결정 사항

- **`model/` 대신 `types/`** — 코드베이스 전체가 `types/` 관례라 일관성 우선. 다만 추출 결과 재사용
  가능한 로컬 타입이 없어 빈 `types/` 폴더는 만들지 않음(YAGNI).
- debug 거대 페이지 **내부** 분해는 이번 범위에서 제외(이동만). 후속 작업.

## 검증

- `tsc -b apps/web`: 본 작업으로 인한 신규 타입 오류 0건.
- 유닛 테스트: `useDebugMode` 6/6, `useAppIcon` 4/4, `paths`(debug 블록) 통과.
