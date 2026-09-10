# home — 컴포넌트 구조

> 상태: Live · 최종 갱신: 2026-09-10 · 대상: `apps/web/src/app/features/home/components`
> · 관련 ADR: [ADR-0013](../../../../../docs/adr/0013-home-screen-web-ui-kit-migration.md) (web-ui-kit 조립)

무거운 컴포넌트는 `<이름>/` 서브폴더에 구성 요소를 모으고, 메인 파일은 상태·로직과 조립만
담당한다. 순수 뷰 단계는 props만 받는 presentational로 분리한다.

```
components/
  index.ts                     배럴
  PlaceList.tsx · PlaceItem.tsx   플레이스 섹션 — 클라우드 모드 전용 (PlaceItem 이 usePlaceSync 등록)
  ChannelList.tsx              채널 섹션. 행 상태 표기 — 고정(pinnedChannelIds → 시각 우측 Pin),
                               알림꺼짐(내 join.notify === 'none' → 제목 옆 BellOff)
  ChannelEmptyState.tsx        채널이 없을 때의 안내
  CloudPromoBanner.tsx         클라우드 유도 배너 (중계 홈 + 시트 공용, useCloudPromo 가 노출·24h dismiss 판정)
  CreateChannelDialog.tsx      그룹방 생성
  CreatePlaceDialog.tsx        플레이스 생성
  PlaceLimitDialog.tsx         플레이스 상한 도달 — 슬롯 비우기 / 클라우드 추가 두 출구
  SubscriptionRequiredDialog.tsx
  CloudSessionSheet.tsx        전환 시트 로직 (BottomSheet + CollapsibleSection 3개)
  cloud-session/               시트 구성 요소
    shared.ts                    스타일 상수 + isProvisioning · getCloudDisplayName · sortCloudsForSwitcher
    DouHomeItem.tsx              Home 섹션의 중계(default) 행
    CloudItem.tsx                내 클라우드 행 (+ CloudStatusBadge)
    InviteCloudItem.tsx          초대 클라우드 행
    CloudUnreadBadge.tsx         20×20 핑크 N 배지 — 위 세 행이 공유한다
    AddAccountButton.tsx         '내 클라우드' 섹션 footer 의 ＋ 클라우드 추가 (개수 무관 상시 노출)
```

**여기 없는 것들.** 초대 수락 화면(`InviteAcceptScreen` 등)은 `features/invite/accept/components/`가,
요금제 선택과 이메일 인증(`AddCloudFlowHost` 이하)은 `features/subscription/components/`가 소유한다.
홈은 그 플로우들을 import하지 않고 의도만 올린다(ADR-0046 §3).

## 행이 등록하는 것

`ChannelItem`은 `runtime.sync.useChannelSync`만 등록한다. **마지막 메시지는 행이 읽지 않는다** —
목록 레벨 `useLastChats`가 한 번 읽어 `lastChat` prop으로 내려준다([last-chat.md](./last-chat.md)).
chat sync 등록도 호스트의 `useChatSyncRegistration(channels)` 소관이다.

## 원칙

- **web-ui-kit로 조립한다.** 색상 hex·아이콘을 홈에 직접 박지 않고 `@chatic/web-ui-kit`의 컴포넌트/토큰을 쓴다. 헤더는 페이지(`pages/HomePage.tsx`)가 `AppHeader`로 직접 구성하고, 우측 프로필·채널 생성은 `AppHeader.avatar`/섹션 actions에 `DropdownMenu`를 조합해 얹는다.
- 길고 복잡한 파일은 책임 단위로 서브폴더에 분리한다 — `cloud-session/`이 그 형태다.
- 상태는 메인 파일에 유지하고, 단계 뷰는 props만 받는 presentational로 둔다.
- `any` / `as unknown` 캐스트를 두지 않는다 — 타입은 `setQueriesData<ListResult<CloudView>>`처럼 정확히.
