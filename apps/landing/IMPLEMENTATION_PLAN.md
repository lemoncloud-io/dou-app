# 📋 Implementation Plan: DoU Beta Landing Page (초대 링크 접속 플로우)

---

## Tech Stack (from `package.json`)

- **React**: ^19.2.0
- **React Router**: 6.11.2
- **State Management**: Zustand ^5.0.2
- **Styling**: Tailwind CSS 3.4.3
- **Build Tool**: Vite ^7.0.0

---

## Knowledge Sources

- `./CLAUDE.md`: Nx 모노레포 구조, feature-based organization, named exports
- `apps/landing/`: 기존 랜딩 페이지 구조 (Home, Policy pages)
- **Figma 베타버전 (1302:8699)**: 초대 링크 접속 플로우 전체 디자인

---

## Figma 분석: 초대 링크 접속 플로우

### 전체 플로우 (웹뷰 기준)

```
[1] 초대 링크 클릭 (OG Tag 미리보기)
    └── OG Image: "DoU에서 초대링크가 도착했어요!" + dou.chatic.io

[2] 접속 장치 선택 화면 (웹뷰)
    ├── "웹으로 계속" → 웹뷰 플로우
    └── "앱 열기" → 앱 설치 확인 팝업
        ├── 앱 설치 O → 앱으로 이동
        └── 앱 설치 X → 스토어 이동 안내

[3] 웹뷰 플로우
    └── 초대 수락 카드 (바텀시트 스타일)
        ├── 프로필 이미지 + "sunny님이 친구 요청을 보냈어요"
        ├── "초대를 수락하고 채팅을 시작해 보세요."
        ├── [수락하기] 버튼 (Point Color: #c4ff00)
        └── [거절하기] 텍스트 버튼

[4] 프로필 설정 (신규 사용자)
    ├── 타이틀: "DoU에서 사용할 이름과 사진을 설정해 주세요"
    ├── 이름 입력 (20자 제한)
    ├── 프로필 사진 [선택]
    └── [완료] 버튼

[5] 채팅 메인 화면
    ├── 상단: D.U 로고 + 검색 + 설정
    ├── 플레이스 섹션 (기본 플레이스)
    ├── Chat 섹션 (채팅 목록)
    └── 하단 탭바: 채팅 | MY
```

### 주요 컴포넌트/화면

| 화면명                | Figma Node ID          | 설명                                               |
| --------------------- | ---------------------- | -------------------------------------------------- |
| 접속 장치 선택 (웹뷰) | 1341:15876, 1342:62410 | "웹으로 계속" / "앱 열기" 선택                     |
| 앱 이동 팝업          | 1341:20604             | "DoU앱으로 이동하시겠습니까?"                      |
| 앱 설치 필요 팝업     | 1341:20690             | "앱 설치가 필요합니다. 스토어로 이동하시겠습니까?" |
| 초대 수락 카드 (앱)   | 1341:20728             | 친구 요청 수락/거절                                |
| 초대 수락 카드 (웹)   | 1341:21166             | 친구 요청 수락/거절 (웹뷰)                         |
| 프로필 설정 (웹)      | 1341:21370             | 이름/사진 설정                                     |
| 채팅 메인 (웹)        | 1341:21191             | 채팅 목록 화면                                     |
| OG Tag 이미지         | 1341:15888             | 공유 시 미리보기                                   |

---

## Boundaries

### ✅ Do:

- 기존 `apps/landing` 구조 확장 (feature-based)
- 새로운 feature: `features/invite` 생성
- DoU 디자인 가이드 색상 사용 (--point: #c4ff00, --bk-\* 시리즈)
- Named exports + barrel exports 패턴 유지
- 모바일 퍼스트 반응형 디자인 (375px 기준)
- 초대 링크 파라미터 처리 (`/invite/:inviteCode`)

### ⚠️ Ask First:

- API 연동 범위 (백엔드 API 스펙 확인 필요)
- 딥링크 스킴 (`dou://` vs Universal Link)
- 프로필 이미지 업로드 구현 범위
- 인증/세션 관리 방식

### 🚫 Don't:

- 실제 채팅 기능 구현 (별도 web 앱 영역)
- 앱 다운로드 유도 외의 복잡한 앱-웹 통신
- 불필요한 상태 관리 라이브러리 추가

---

## Files to Create/Modify

| File                                              | Action | Purpose                 |
| ------------------------------------------------- | ------ | ----------------------- |
| `features/invite/routes/index.tsx`                | Create | 초대 관련 라우트 정의   |
| `features/invite/pages/InviteLandingPage.tsx`     | Create | 접속 장치 선택 화면     |
| `features/invite/pages/InviteAcceptPage.tsx`      | Create | 초대 수락 카드 화면     |
| `features/invite/pages/ProfileSetupPage.tsx`      | Create | 프로필 설정 화면        |
| `features/invite/pages/ChatMainPage.tsx`          | Create | 채팅 메인 화면 (웹뷰)   |
| `features/invite/pages/index.ts`                  | Create | 페이지 barrel export    |
| `features/invite/components/InviteCard.tsx`       | Create | 초대 수락 카드 컴포넌트 |
| `features/invite/components/DeviceSelector.tsx`   | Create | 웹/앱 선택 컴포넌트     |
| `features/invite/components/ProfileForm.tsx`      | Create | 프로필 설정 폼          |
| `features/invite/components/AppInstallDialog.tsx` | Create | 앱 설치 안내 다이얼로그 |
| `features/invite/components/index.ts`             | Create | 컴포넌트 barrel export  |
| `features/invite/hooks/useInvite.ts`              | Create | 초대 관련 훅            |
| `features/invite/hooks/index.ts`                  | Create | 훅 barrel export        |
| `features/invite/constants/index.ts`              | Create | 상수 정의               |
| `features/invite/types/index.ts`                  | Create | 타입 정의               |
| `features/invite/index.ts`                        | Create | Feature barrel export   |
| `routes/CommonRoutes.tsx`                         | Modify | invite 라우트 추가      |
| `shared/components/Header.tsx`                    | Create | 공통 헤더 (D.U 로고)    |
| `shared/components/BottomButton.tsx`              | Create | 하단 고정 버튼          |
| `shared/components/index.ts`                      | Modify | 새 컴포넌트 export      |
| `index.html`                                      | Modify | OG 메타태그 추가        |

---

## Implementation Checklist (→ implement 단계에서 사용)

### Phase 1: 기본 구조 설정

- [ ] `features/invite` 폴더 구조 생성
- [ ] 라우트 설정 (`/invite/:inviteCode`)
- [ ] 타입 정의 (InviteData, ProfileData 등)

### Phase 2: 접속 장치 선택 화면

- [ ] `InviteLandingPage.tsx` 구현
- [ ] `DeviceSelector.tsx` 컴포넌트 ("웹으로 계속" / "앱 열기")
- [ ] `AppInstallDialog.tsx` 다이얼로그
- [ ] 딥링크/유니버설링크 처리 로직

### Phase 3: 초대 수락 화면

- [ ] `InviteAcceptPage.tsx` 구현
- [ ] `InviteCard.tsx` 컴포넌트 (프로필 이미지 + 메시지)
- [ ] 수락/거절 버튼 액션

### Phase 4: 프로필 설정 화면

- [ ] `ProfileSetupPage.tsx` 구현
- [ ] `ProfileForm.tsx` 컴포넌트
- [ ] 이름 입력 (20자 제한, 글자수 표시)
- [ ] 프로필 사진 선택 UI

### Phase 5: 채팅 메인 화면 (웹뷰)

- [ ] `ChatMainPage.tsx` 구현
- [ ] 공통 헤더 컴포넌트
- [ ] 플레이스/채팅 목록 UI
- [ ] 하단 탭바 UI

### Phase 6: OG 메타태그 & SEO

- [ ] `index.html` OG 메타태그 설정
- [ ] 동적 OG 태그 처리 (react-helmet-async)

### Phase 7: 검증

- [ ] Named exports only
- [ ] Barrel exports (index.ts)
- [ ] `yarn lint` 통과
- [ ] 모바일 반응형 확인 (375px)

---

## Verification Commands

```bash
# Lint 검사
yarn lint

# 개발 서버 실행
yarn landing:start

# 빌드 테스트
yarn landing:build:prod
```

---

## Review Focus (→ review 단계에서 확인)

- [ ] 딥링크 처리가 iOS/Android 모두 동작하는지
- [ ] 앱 설치 여부 감지 로직 정확성
- [ ] 프로필 이미지 업로드 UX
- [ ] 모바일 웹뷰에서의 스크롤/터치 UX
- [ ] OG 태그가 카카오톡/메시지 앱에서 제대로 렌더링되는지
- [ ] 로딩 상태 및 에러 처리

---

## Decisions

| Choice       | Options                         | Selected  | Rationale                    |
| ------------ | ------------------------------- | --------- | ---------------------------- |
| 딥링크 방식  | Custom Scheme vs Universal Link | **TBD**   | 사용자 확인 필요             |
| 앱 설치 감지 | setTimeout fallback vs Intent   | **TBD**   | 플랫폼별 구현 필요           |
| 상태 관리    | Local state vs Zustand          | **Local** | 단순한 폼 상태만 필요        |
| API 호출     | React Query vs fetch            | **TBD**   | 백엔드 API 스펙 확인 후 결정 |

---

## Design Tokens (DoU Design Guide)

```css
/* Point Color */
--point: #c4ff00;
--point-hover: #b3e600;

/* Grayscale (BK Series) */
--bk-900: #222325; /* Primary text */
--bk-700: #53555b; /* Secondary text */
--bk-600: #84888f; /* Tertiary text */
--bk-500: #9fa2a7;
--bk-400: #babcc0;
--bk-300: #cfd0d3;
--bk-200: #dfe0e2;
--bk-100: #eaeaec; /* Border */
--bk-50: #f4f5f5; /* Background */
```

---

## Questions for User

1. **딥링크 스킴**: `dou://` 커스텀 스킴을 사용할지, Universal Link (iOS) / App Link (Android)를 사용할지?

2. **백엔드 API**: 초대 코드 검증, 프로필 설정 등의 API 엔드포인트가 이미 있는지?

3. **프로필 이미지 업로드**: 이미지 업로드 기능을 구현할지, 아니면 기본 아바타만 사용할지?

4. **인증 방식**: 웹뷰에서의 사용자 인증은 어떻게 처리하는지? (토큰 기반? 세션?)

5. **우선순위**: 전체 플로우 중 먼저 구현해야 할 화면의 우선순위가 있는지?
