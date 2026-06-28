# home — 컴포넌트 구조

> 대상: `apps/web/src/app/features/home/components`

무거운 컴포넌트는 `<이름>/` 서브폴더에 구성 요소를 모으고, 메인 파일은 상태·로직과 조립만 담당한다. 순수 뷰 단계는 props만 받는 presentational로 분리한다.

```
components/
  index.ts                       # 배럴
  PlaceList.tsx + PlaceItem.tsx   # 플레이스 목록 (PlaceItem은 usePlaceSync 등록)
  ChannelList.tsx                 # 채널 목록 (ChannelItem은 useChannelSync + useJoinSync 등록)
  CreateChannelDialog.tsx
  CreatePlaceDialog.tsx
  CloudNameEditDialog.tsx
  SubscriptionRequiredDialog.tsx

  CloudSessionSheet.tsx           # 메인 시트 로직 (목록/전환/연결끊기)
  cloud-session/                  #   시트 구성 요소
    shared.ts                     #     스타일 상수 + isProvisioning/getCloudDisplayName + CloudTab
    ProfileSection.tsx
    CloudItem.tsx                 #     내 클라우드 행 (+ CloudStatusBadge)
    InviteCloudItem.tsx           #     초대 클라우드 행 (DomainCloud)
    TabBar.tsx
    AddAccountButton.tsx

  SubscriptionSelectDialog.tsx    # 요금제 선택 다이얼로그 (로직)
  subscription-select/
    helpers.ts                    #   PageState, 상품 ID/정책 URL 상수, buildPurchaseProduct
    PlanCard.tsx
    PolicyFooter.tsx              #   자동갱신 고지 + 약관/정책 링크

  EmailVerifyDialog.tsx           # 이메일 인증 다이얼로그 (상태/로직)
  email-verify/
    EmailStep.tsx                 #   이메일 입력 단계 (뷰)
    VerifyStep.tsx                #   코드 인증 단계 (뷰)
```

## 원칙

- 길고 복잡한 파일은 책임 단위로 서브폴더에 분리한다(예: `CloudSessionSheet` 526→272줄, `EmailVerifyDialog` 323→173줄, `SubscriptionSelectDialog` 266→176줄).
- 상태는 메인 파일에 유지하고, 단계 뷰(`EmailStep`/`VerifyStep`, `PlanCard`)는 props만 받는 presentational로 둔다.
- `any`/`as unknown` 캐스트를 두지 않는다 — 타입은 `setQueriesData<ListResult<CloudView>>`처럼 정확히.
