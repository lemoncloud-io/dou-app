# ADR-0062 — MY 트리의 계정 프로필을 relay에 고정한다 (relay 토큰 소스 + relay 슬롯 쓰기)

- 상태: 채택
- 날짜: 2026-08-19
- 대체: [ADR-0045](0045-relay-default-place-scoping-profile-step-and-avatar-unification.md) 결정 5 (2026-08-06 되돌림)
- 관련: [ADR-0034](0034-relay-home-cloud-sheet-and-cloud-guide-redesign.md), [ADR-0042](0042-account-linking-server-slots.md), [ADR-0052](0052-invite-local-cache.md), [kind-scoped-routing.md](../../libs/app-runtime/docs/socket/kind-scoped-routing.md)

> **이름 안내 (2026-09-01):** 이 문서가 쓰는 `*RemoteDataSource` · `RemoteGatewayBundle` · `*DomainGateway` · `remoteFactory` · `remote/data-sources/`는 **당시 이름**이다. 소켓 축이 `Socket` 접두로 옮겨간 뒤의 대응표는 [libs/data/docs/remote/README.md](../../libs/data/docs/remote/README.md#이름-규약-2026-09-01-리네임)에 있다. 기록이므로 본문은 그대로 둔다.

## 맥락

MY 페이지와 그 하위 화면(계정 정보 · 프로필 수정 · 계정 연동 · 탈퇴)은 전부 **계정 레벨** 화면이다. 그런데 표시·편집이 모두 활성 세션을 따르고 있어서, 클라우드에 접속한 동안에는 같은 화면이 **클라우드 위임 레코드**를 보여주고 고쳤다. 클라우드 위임은 별도 백엔드에서 **다른 uid**를 발급하므로(`POST {cloudBackend}/oauth/exchange-token`), 사용자에게는 "클라우드를 바꾸면 내 계정이 바뀌는" 화면이었다.

ADR-0045 결정 5가 이미 이 문제를 지적하고 `useMyUser`를 relay 스코프로 고정하려 했으나 **되돌려졌다**. 원인은 캐시였다: 로컬 캐시의 물리 키가 `${type}:${cid}:${uid}:${id}`이고 `UserLocalDataSourceV2`의 **읽기 경로가 `contextOverride`를 무시**하기 때문에, 클라우드가 활성인 동안에는 relay `user` 행을 되읽을 방법이 없다. 데이터 레이어에서 목적지만 relay로 바꾸면 응답은 relay 계정(relay uid)인데 캐시 파티션은 클라우드 것이어서, 그 행을 관찰하는 `useRuntimeProfile`(isGuest·권한)이 빈손이 된다.

한편 이미 깨져 있던 것이 하나 더 있다. `auth.linkAccount`는 진작부터 relay에 고정돼 있는데(메인유저가 relay 뒤 중앙 백엔드에 산다), 그 게이트인 `useLinkedAccounts`는 활성 세션의 `link$`를 읽고 있었다 — relay에서 맺은 연동이 클라우드 안에서는 "미연동"으로 읽히는 읽기·쓰기 스코프 불일치.

## 결정

**1. 소스를 캐시가 아니라 relay 토큰으로 옮긴다.** `getRelaySessionUser()` / `patchRelaySessionUser()`를 web-core session에 둔다. relay 토큰은 `UserTokenView extends UserView extends Partial<UserModel>`이라 `name`/`photo`/`email`/`link$`를 이미 싣고 있고, 항상 존재하며 항상 relay 계정의 것이다. 캐시 파티션 문제가 원천적으로 없다.

**2. 반응성은 세션 시그널로 얻는다.** `useMyUser`는 `useGlobalSession()`이 리렌더될 때마다 토큰을 다시 읽는다. 세션 스토어는 notify마다 캐시된 컨텍스트를 버리고 새 객체를 만들므로, 토큰 갱신이든 우리 자신의 쓰기든 같은 경로로 팬아웃된다. 무효화할 캐시가 없고, 첫 렌더부터 값이 있어서 플래시 창도 없다.

**3. 쓰기는 relay 슬롯에 고정한다.** `getRelayAccountGateway()`가 `getScopedClient('relay')` 위에 `user.*` 게이트웨이를 세운다(`remoteFactory`의 relay 고정 관용구와 동일). 저장소를 타지 않는다 — 저장소는 캐시하고, 그 캐시가 바로 1항의 문제다. 서버 응답은 relay 토큰에 되쓰고, 그것이 유일한 팬아웃이다.

**4. 데이터 레이어와 `useRuntimeProfile`은 건드리지 않는다.** `remoteFactory`의 `user` 번들은 계속 active 파사드다. `isGuest`/`userRole`/권한은 활성 세션에서 계속 파생된다 — 그쪽까지 relay로 옮기는 것은 desktop-web까지 함께 쓰는 공유 경로를 바꾸는 별개의 결정이다. 이번 변경은 **표시·편집 스코프**에 한정된다.

**5. 클라우드 프로필 수정 행을 MY에서 뺀다.** 클라우드 엔티티의 이름은 계정 속성이 아니다. 화면과 라우트(`/mypage/cloud-profile`)는 소유자 가드까지 그대로 남기고, 진입점만 제거한다.

**6. relay 토큰 병합 버그를 고친다.** `commitServerRefreshedToken`의 relay 분기가 `{ ...view, Token }`으로 **이전 토큰을 병합하지 않아서**, 소켓 refresh view가 유저 필드를 생략하면 그것들이 사라졌다. 이제 relay 토큰이 표시 소스이므로 이건 "세션 중간에 MY 헤더가 빈다"는 뜻이 된다. cloud 분기와 같게 `...previous`를 앞에 둔다.

## 결과

- MY 트리는 클라우드 전환과 무관하게 한 계정을 보여주고 고친다. 읽기·쓰기가 같은 스코프(relay 토큰)라 어긋날 수 없다.
- `useLinkedAccounts`의 읽기가 `auth.linkAccount`의 쓰기와 처음으로 일치한다. `PhoneVerifyBanner`·`ContactInvitePage`·`useSubscriptionIap`도 같은 수정을 공짜로 받는다 — 모두 relay 메인유저 정체성을 묻는 화면이다.
- relay 프로필은 **로컬에 durable 캐시가 없다.** 콜드 스타트 표시는 토큰 값에서 나오고, 서버 최신값은 relay 슬롯이 verified된 뒤 오는 `user.profile` 1회로 맞춘다. relay 슬롯이 없으면 스코프 클라이언트는 **던진다**(조용한 폴백 금지) — 그래서 호출부는 `useKindVerified('relay')`로 게이팅한다.
- `useSeedMyUserCache`는 남지만 독자가 바뀌었다: 이제 `useRuntimeProfile`만을 위한 시드다.
- 남은 일: 클라우드 이름 변경의 새 진입점(전환 시트 또는 계정 관리). 그리고 크로스 스코프 캐시 읽기는 이 결정으로도 열리지 않았다 — 여전히 열려 있는 별개 트랙이다.

## 대안

- **데이터 레이어에서 `user.profile`/`user.update`를 relay로 라우팅** — ADR-0045 결정 5가 시도했다가 되돌린 길. 캐시 파티션이 그대로 남고, `useRuntimeProfile`이 관찰하는 uid와 응답의 uid가 어긋난다. `libs`를 통해 desktop-web까지 영향이 간다.
- **`InviteRepositoryV2`처럼 `cid === 'default'`일 때만 캐시 쓰기** — 저장소를 쓰면서 파티션 오염은 피하지만, 클라우드 활성 중에는 캐시가 비어 있어 결국 매번 소켓을 타야 한다. 그러면 저장소를 쓰는 이유가 사라진다. 토큰을 직접 읽는 편이 짧고 정직하다.
- **relay HTTP로 프로필 조회/수정** — `libs/web-core/src/api/users.ts`에 그런 엔드포인트가 없다. 예전 `PUT /users/{uid}`는 소켓 액션으로 대체되면서 사라졌다.
