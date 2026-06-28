# Home components 폴더 구조 / 정리

> 작성일: 2026-06-25 · [runtime-migration.md](runtime-migration.md)의 후속 정리

런타임 마이그레이션 이후 `apps/web/src/app/features/home/components` 폴더를 정리한 결과.
긴 파일을 책임 단위로 쪼개고, deprecated 타입과 `any` 캐스트, 마이그레이션 잔재(TODO/FIXME)를 제거했다.

## 구조

```
components/
├── index.ts                       # 배럴 (ChannelList, PlaceList, CloudSessionSheet, dialogs)
├── PlaceList.tsx + PlaceItem.tsx   # 플레이스 목록 (PlaceItem은 usePlaceSync 등록)
├── ChannelList.tsx                 # 채널 목록 (ChannelItem은 useChannelSync + useJoinSync 등록)
├── CreateChannelDialog.tsx
├── CreatePlaceDialog.tsx
├── CloudNameEditDialog.tsx
├── SubscriptionRequiredDialog.tsx
│
├── CloudSessionSheet.tsx           # 메인 시트 로직만 (목록/전환/연결끊기)
├── cloud-session/                  #   시트 구성 요소
│   ├── index.ts
│   ├── shared.ts                   #   스타일 상수 + isProvisioning/getCloudDisplayName + CloudTab
│   ├── ProfileSection.tsx
│   ├── CloudItem.tsx               #   내 클라우드 행 (+ CloudStatusBadge)
│   ├── InviteCloudItem.tsx         #   초대 클라우드 행 (DomainCloud)
│   ├── TabBar.tsx
│   └── AddAccountButton.tsx
│
├── SubscriptionSelectDialog.tsx    # 요금제 선택 다이얼로그 (로직)
├── subscription-select/
│   ├── index.ts
│   ├── helpers.ts                  #   PageState, 상품 ID/정책 URL 상수, buildPurchaseProduct
│   ├── PlanCard.tsx                #   요금제 카드
│   └── PolicyFooter.tsx            #   자동갱신 고지 + 약관/정책 링크
│
├── EmailVerifyDialog.tsx           # 이메일 인증 다이얼로그 (상태/로직)
└── email-verify/
    ├── index.ts
    ├── EmailStep.tsx               #   이메일 입력 단계 (뷰)
    └── VerifyStep.tsx              #   코드 인증 단계 (뷰)
```

원칙: 무거운 컴포넌트는 `<이름>/` 서브폴더에 구성 요소를 모으고, 메인 파일은 상태·로직과
조립만 담당한다. 순수 뷰 단계(EmailStep/VerifyStep, PlanCard)는 props만 받는 presentational
컴포넌트로 분리해 상태는 메인에 유지한다.

## 정리 항목

- **파일 분할** — 길고 복잡하던 파일을 책임 단위로 분리.
    - `CloudSessionSheet.tsx` 526 → 272줄 (`cloud-session/` 6개 파일)
    - `EmailVerifyDialog.tsx` 323 → 173줄 (`email-verify/` 2개 단계)
    - `SubscriptionSelectDialog.tsx` 266 → 176줄 (`subscription-select/` 3개 파일)
- **타입 정리**
    - deprecated `DomainInviteCloud` → `DomainCloud`
    - `CloudNameEditDialog.onSuccess`의 `(old: any)`/`(c: any)` → `setQueriesData<ListResult<CloudView>>`
    - 인라인 `Tab` → 공용 `CloudTab`
    - 정리 후 home 피쳐에 `any`/`as unknown`/`as any` 캐스트 없음(테스트 제외)
- **TODO/FIXME 제거** — `SubscriptionSelectDialog`의 feature-boundary FIXME, 상품목록 TODO 삭제.
  home 피쳐에 잔여 TODO/FIXME/@deprecated 없음.

## 검증

- 타입체크: home 피쳐 0 에러 (`tsc -p apps/web/tsconfig.app.json --noEmit`).
- 유닛 테스트: `useChannelUnreads`/`useSwitchPlace` 7건 통과 (분할은 컴포넌트 한정, 훅 로직 불변).
