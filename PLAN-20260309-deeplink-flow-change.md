# Implementation Plan: 딥링크 랜딩 페이지 로직 변경

---

**Tech Stack** (from `package.json`)

- React: 19.x
- TypeScript: 5.x
- Tailwind CSS: 4.x
- i18next: (internationalization)
- Vite: Build tool

---

## 요구사항 분석 (플로우차트 기반)

### 현재 흐름 (AS-IS)

```
링크 접속 → 랜딩 페이지 진입 → [디바이스 판단]
                                ├─ WEB(데스크톱) → 웹 페이지 리다이렉트
                                └─ APP(모바일) → 앱 열기 시도
                                                    ├─ 성공 → 앱
                                                    └─ 실패(2.5초) → 스토어 페이지 표시
```

### 변경된 흐름 (TO-BE)

```
링크 접속 → 랜딩 페이지 진입 → [접속 환경 판단]
                                ├─ WEB(데스크톱) → 웹 페이지로 리다이렉트
                                └─ APP(모바일) → 랜딩 페이지 표시
                                                    ├─ "D.U 앱 열기" 클릭
                                                    │   └─ 다이얼로그: "DoU 앱으로 이동하시겠습니까?"
                                                    │       ├─ 취소 → 랜딩 페이지
                                                    │       └─ 확인 → 앱 열기 시도
                                                    │           ├─ 앱 설치됨 → 앱
                                                    │           └─ 앱 미설치 → 다이얼로그: "앱 설치가 필요합니다. 스토어로 이동하시겠습니까?"
                                                    │               ├─ 취소 → 랜딩 페이지
                                                    │               └─ 확인 → 스토어
                                                    │
                                                    └─ "웹으로 보기" 클릭 → 웹 페이지로 리다이렉트
```

---

## Figma 디자인 분석

### 1. 랜딩 페이지 UI (node-id: 1550:6922)

- **배경**: 흰색 (`#FFFFFF`)
- **상단**: 채팅 말풍선 일러스트 (Hello!, Welcome~)
- **중앙 텍스트**: "안전한 대화공간에서 자유롭게 소통하기!"
    - 폰트: Pretendard SemiBold, 28px, 라인 높이 1.35
- **버튼 영역**:
    - **"D.U 앱 열기" 버튼**: 라임 그린 (`#B0EA10`), 라운드 100px, D.U 로고 포함
    - **"웹으로 보기" 링크**: 회색 텍스트 (`#53555B`), 18px

### 2. 다이얼로그 UI (node-id: 37:4487)

- **배경**: 흰색 (`#FFFFFF`), 라운드 12px
- **상단**: 타이틀 + 서브타이틀
- **하단**: 2개 버튼 (취소 | 확인)
    - 구분선: `#CFD0D3`
    - 취소 버튼: 회색 텍스트 (`#53555B`)
    - 확인 버튼: 진한 텍스트 (`#081837`, SemiBold)

---

## Knowledge Sources

- `./CLAUDE.md`: Zustand for state, TanStack Query for server state, i18next
- `apps/landing/src/app/features/deeplink/`: 현재 딥링크 처리 구조
- `libs/deeplinks/`: 딥링크 라이브러리 (변경 불필요)

---

## Boundaries

### Do:

- [x] 모바일 환경에서 새로운 UI 흐름 구현 (랜딩 → 다이얼로그 → 앱/스토어/웹)
- [x] 데스크톱 환경에서는 즉시 웹으로 리다이렉트 (기존과 동일)
- [x] 다이얼로그 컴포넌트 추가 (Figma 디자인 기반)
- [x] 새로운 랜딩 페이지 UI 구현 (Figma 디자인 기반)
- [x] i18n 번역 키 추가
- [x] 채팅 말풍선 일러스트 에셋 추가

### Ask First:

- [ ] 다이얼로그 오버레이 배경색 (반투명 검정?)
- [ ] 웹 리다이렉트 시 로딩 상태 표시 여부

### Don't:

- libs/deeplinks 라이브러리 수정 (불필요)
- 데스크톱 흐름 변경 (기존 즉시 리다이렉트 유지)
- 불필요한 상태 추가

---

## Files to Create/Modify

| File                                                                           | Action | Purpose                                 |
| ------------------------------------------------------------------------------ | ------ | --------------------------------------- |
| `apps/landing/src/app/features/deeplink/components/DeepLinkUI.tsx`             | Modify | 새로운 Figma 디자인 기반 UI             |
| `apps/landing/src/app/features/deeplink/components/DeepLinkDialog.tsx`         | Create | 다이얼로그 컴포넌트                     |
| `apps/landing/src/app/features/deeplink/components/ChatBubbleIllustration.tsx` | Create | 채팅 말풍선 일러스트 컴포넌트           |
| `apps/landing/src/app/features/deeplink/components/index.ts`                   | Modify | Export 추가                             |
| `apps/landing/src/app/features/deeplink/pages/DeepLinkPage.tsx`                | Modify | 새로운 흐름 로직 (다이얼로그 상태 관리) |
| `apps/landing/src/app/features/deeplink/hooks/useAppLauncher.ts`               | Modify | 다이얼로그 기반 흐름으로 변경           |
| `apps/landing/src/app/features/deeplink/types/index.ts`                        | Modify | 새로운 상태 타입 추가                   |
| `apps/landing/src/i18n/locales/ko.json`                                        | Modify | 다이얼로그 텍스트 추가                  |
| `apps/landing/src/i18n/locales/en.json`                                        | Modify | 다이얼로그 텍스트 추가                  |

---

## Implementation Checklist

### Phase 1: 타입 및 상수 업데이트

- [ ] `types/index.ts`: 다이얼로그 상태 타입 추가 (`DialogType: 'app-confirm' | 'store-confirm' | null`)
- [ ] `constants/index.ts`: 필요한 상수 추가

### Phase 2: 컴포넌트 구현

- [ ] `DeepLinkDialog.tsx`: Figma 디자인 기반 다이얼로그 컴포넌트 생성
    - 타이틀, 서브타이틀, 취소/확인 버튼
    - 애니메이션 (fade in/out)
- [ ] `ChatBubbleIllustration.tsx`: 채팅 말풍선 일러스트 (SVG 또는 이미지)
- [ ] `DeepLinkUI.tsx`: 새로운 랜딩 페이지 UI
    - 흰색 배경
    - 채팅 일러스트
    - "안전한 대화공간에서 자유롭게 소통하기!" 텍스트
    - "D.U 앱 열기" 버튼 (라임 그린)
    - "웹으로 보기" 링크

### Phase 3: 훅 및 로직 업데이트

- [ ] `useAppLauncher.ts`: 다이얼로그 기반 흐름으로 리팩토링
    - `showAppConfirmDialog()` → 앱 열기 확인 다이얼로그
    - `launchApp()` → 실제 앱 열기 시도
    - `showStoreDialog()` → 스토어 이동 확인 다이얼로그
- [ ] `DeepLinkPage.tsx`: 다이얼로그 상태 관리 및 렌더링

### Phase 4: i18n 번역 추가

- [ ] `ko.json`: 다이얼로그 텍스트 추가
    ```json
    "dialog": {
      "appConfirm": {
        "title": "DoU 앱으로 이동하시겠습니까?",
        "cancel": "취소",
        "confirm": "확인"
      },
      "storeConfirm": {
        "title": "앱 설치가 필요합니다.",
        "subtitle": "스토어로 이동하시겠습니까?",
        "cancel": "취소",
        "confirm": "확인"
      }
    }
    ```
- [ ] `en.json`: 영어 번역 추가

### Phase 5: 검증

- [ ] Named exports only
- [ ] Barrel exports (index.ts)
- [ ] Verification commands pass
- [ ] 데스크톱: 즉시 웹 리다이렉트 동작 확인
- [ ] 모바일: 새로운 다이얼로그 흐름 동작 확인

---

## Verification Commands

```bash
# Lint 검사
yarn lint

# 빌드 확인
yarn build:landing

# 개발 서버 확인
yarn landing:start
```

---

## Review Focus (→ 03_review 단계에서 확인)

- [ ] 다이얼로그 닫기 후 상태 초기화 정상 동작
- [ ] 앱 열기 실패 시 스토어 다이얼로그 정확히 표시
- [ ] 웹 리다이렉트 시 envs 파라미터 정상 전달
- [ ] 데스크톱 접속 시 즉시 리다이렉트 (기존 동작 유지)
- [ ] Figma 디자인과 UI 일치 여부

---

## Decisions

| Choice          | Options                         | Selected    | Rationale                                       |
| --------------- | ------------------------------- | ----------- | ----------------------------------------------- |
| 다이얼로그 구현 | Radix Dialog vs Custom          | Custom      | 간단한 확인 다이얼로그이므로 커스텀 구현이 적합 |
| 상태 관리       | useState vs Zustand             | useState    | 페이지 로컬 상태로 충분                         |
| 애니메이션      | Tailwind animation vs CSS-in-JS | Tailwind    | 기존 프로젝트 패턴 따름                         |
| 채팅 일러스트   | SVG inline vs Image asset       | Image asset | Figma 에셋 직접 활용                            |

---

## 상태 흐름도

```
DeepLinkPage State Machine:

[initial]
    │
    ├─ (desktop) ──────────────────────→ [web-redirecting] → 웹 리다이렉트
    │
    └─ (mobile)
        │
        ├─ "D.U 앱 열기" 클릭 ──────────→ [app-confirm-dialog]
        │                                     │
        │                                     ├─ 취소 → [initial]
        │                                     │
        │                                     └─ 확인 → [launching]
        │                                                 │
        │                                                 ├─ 앱 열림 → (종료)
        │                                                 │
        │                                                 └─ 앱 안열림 → [store-confirm-dialog]
        │                                                                     │
        │                                                                     ├─ 취소 → [initial]
        │                                                                     │
        │                                                                     └─ 확인 → 스토어 이동
        │
        └─ "웹으로 보기" 클릭 ──────────→ [web-redirecting] → 웹 리다이렉트
```

---

## Assets 필요

Figma에서 추출 필요한 에셋:

1. 채팅 말풍선 캐릭터 이미지들 (DoU_1, DoU_2, DoU_5)
2. D.U 로고 (버튼용, SVG)

현재 `@chatic/assets`에 로고가 있으므로 캐릭터 이미지만 추가 필요.
