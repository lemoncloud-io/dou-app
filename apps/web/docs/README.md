# apps/web Docs

`apps/web`를 레거시 `@chatic/socket` 의존에서 `@chatic/app-runtime` + `@chatic/data` + `@chatic/web-core`로 옮기는 작업 문서.

## 문서

1. **[마이그레이션 플레이북](./migration-playbook.md)** — 컴포넌트(파일) 단위 구현 지침. 권위 심볼 매핑(tsc 검증), 신 API 형태, 패턴별 레시피, 컴포넌트별 작업 인벤토리, 검증 프로토콜, 미해결 사항. **구현 시 이 문서를 기준으로 한다.**
2. [런타임 마이그레이션 가이드](./runtime-migration.md) — 아키텍처/배경(부트스트랩, 읽기/쓰기, 리프레시 타이밍, 델타, 초대, 디렉터리). 플레이북의 "왜"를 설명.
3. **[디렉터리·구조 스펙](./directory-structure.md)** — `src/app` 레이어/feature 표준/횡단 배치 규칙과 결정 트리. **"이 파일 어디 두지?"의 단일 기준.** 파일을 옮길 때 목표 위치는 이 문서를 따른다.
4. [Subscription 구조 정리](feature/subscription-cleanup.md) — subscription feature를 표준(`hooks`/`types`/`consts`)에 맞춰 정리한 적용 기록.
5. [MyPage 구조 개선](feature/mypage/feature-restructure.md) — debug feature 분리, hooks 추출, 깨진 참조 복구.
6. [MyPage 런타임 마이그레이션](feature/mypage/runtime-migration.md) — apps/web을 web-core/app-runtime 신 API로 옮겨 `tsc -b apps/web` green 달성한 기록.
7. [사이트 활성 프로필 편집 — ProfileRepositoryV2 전환](feature/mypage/site-profile-edit-v2.md) — 사이트 활성 시 프로필(닉·썸네일) 편집을 V2 `setMyProfile`로 저장하고 헤더를 V2 관측으로 전환.

## 작업 방식

컴포넌트를 하나씩 마이그레이션한다. 각 파일에 대해 플레이북 §5 절차(식별 → §2/§3 매핑·레시피 적용 → 테스트 → 루트에서 tsc 단조 감소 확인)를 반복한다.

## 참조 구현

최신 `apps/testbed`가 목표 아키텍처의 참조 구현이다. 패턴은 testbed에서 검증된 것을 따른다.

## 진행 상태(라이브)

베이스라인·진행 로그는 `~/.claude/plans/chatic-front/web-runtime-migration.md`에 있다(현재 타입 에러 카운트, 완료 컴포넌트, 확정 매핑). 플레이북 §4의 컴포넌트는 이 로그와 대조해 완료/잔여를 판단한다.
