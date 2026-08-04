# home — 컴포넌트 구조

> 대상: `apps/web/src/app/features/home/components`

무거운 컴포넌트는 `<이름>/` 서브폴더에 구성 요소를 모으고, 메인 파일은 상태·로직과 조립만 담당한다. 순수 뷰 단계는 props만 받는 presentational로 분리한다. UI는 `@chatic/web-ui-kit`로 조립한다(ADR-0013) — 헤더는 `AppHeader`, 섹션은 `CollapsibleSection`, 행은 `ListRow`, 시트는 `BottomSheet`.

```
components/
  index.ts                       # 배럴
  PlaceList.tsx + PlaceItem.tsx   # 플레이스 섹션 — 클라우드 모드 전용 (CollapsibleSection + ListRow; PlaceItem은 usePlaceSync 등록)
  CloudPromoBanner.tsx            # 클라우드 유도 배너 (중계 홈 + 시트 공용; useCloudPromo가 노출/24h dismiss 판정)
  ChannelList.tsx                 # 채널 섹션 (CollapsibleSection + ListRow; ChannelItem은 useChannelSync + useLastChat 등록, ＋ 생성 팝오버 내장)
  CreateChannelDialog.tsx
  CreatePlaceDialog.tsx
  SubscriptionRequiredDialog.tsx

  InviteDialog.tsx                # 초대 수락 오케스트레이터 (URL 구동, 풀스크린 Dialog + 실패 AlertDialog; useInviteAccept/useInviteCountdown)
  invite/                         #   초대 수락 화면 뷰 (presentational) — invite-accept.md 참조
    InviteAcceptScreen.tsx        #     수락 화면 본문 (헤더+카드들+거절/수락, props 구동)
    InviteCard.tsx                #     카드 셸
    InvitePlaceCard.tsx           #     플레이스 카드 (썸네일/명/소개, degrade)
    InviteTargetCard.tsx          #     You 카드 (1:1 / 방 친구 N 배지)
    InviteExpiryCard.tsx          #     초대 링크 유효기간 카운트다운

  CloudSessionSheet.tsx           # 메인 시트 로직 (BottomSheet + CollapsibleSection 3개; 목록/전환/중계 복귀)
  cloud-session/                  #   시트 구성 요소 (ProfileSection은 ADR-0013에서, TabBar는 ADR-0034에서 제거)
    shared.ts                     #     스타일 상수 + isProvisioning/getCloudDisplayName/sortCloudsForSwitcher
    DouHomeItem.tsx               #     Home 섹션의 중계(default) 행
    CloudItem.tsx                 #     내 클라우드 행 (+ CloudStatusBadge; 이름 편집은 ADR-0034에서 제거)
    InviteCloudItem.tsx           #     초대 클라우드 행 (DomainCloud)
    AddAccountButton.tsx          #     '내 클라우드' 섹션 footer의 ＋ 클라우드 추가 (개수 무관 상시 노출)

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

- **web-ui-kit로 조립한다.** 색상 hex·아이콘을 홈에 직접 박지 않고 `@chatic/web-ui-kit`의 컴포넌트/토큰을 쓴다. 헤더는 페이지(`pages/HomePage.tsx`)가 `AppHeader`로 직접 구성하고, 우측 프로필·채널 생성은 `AppHeader.avatar`/섹션 actions에 `DropdownMenu`를 조합해 얹는다.
- 길고 복잡한 파일은 책임 단위로 서브폴더에 분리한다(예: `CloudSessionSheet` 526→272줄, `EmailVerifyDialog` 323→173줄, `SubscriptionSelectDialog` 266→176줄).
- 상태는 메인 파일에 유지하고, 단계 뷰(`EmailStep`/`VerifyStep`, `PlanCard`)는 props만 받는 presentational로 둔다.
- `any`/`as unknown` 캐스트를 두지 않는다 — 타입은 `setQueriesData<ListResult<CloudView>>`처럼 정확히.
