# ADR-0045: 푸시 알림의 중계서버/클라우드서버 크로스오버 라우팅

> 상태: Accepted · 결정일: 2026-08-05

## 맥락 (Context)

푸시 탭 라우팅은 `apps/web/src/app/bridge/navigation/usePushNavigate.ts`에 이미 단일
수렴점이 있다. OS 알림 탭(`useHandlePushNavigation`)과 인앱 배너 탭
(`useInAppPushMessage`)이 모두 이 훅으로 모이고, `resolvePushNavigation`이 링크
쿼리에서 `cid`/`sid`를 뽑아준다. 지금 이 훅의 분기는 다음과 같다:

```ts
const needsSwitch = (!!cid && cid !== selectedCloudId) || (!!sid && sid !== selectedSiteId);
// ...
if (cid && cid !== selectedCloudId) await switchCloud(cid);
if (sid && sid !== selectedSiteId) await switchSite(sid);
```

이는 "클라우드 A → 클라우드 B" 또는 "중계 → 클라우드"(고유 `cid`가 오는 경우)
크로스오버는 이미 처리한다. 그런데 **클라우드 세션이 활성 상태에서 중계서버 푸시를
받는 경우**를 다루지 못한다: 백엔드 push payload는 중계서버발 메시지의 `cid`
필드를 리터럴 `'#'`로 고정해서 보내는데(프론트 세션 계층의 내부 sentinel인
`'default'`와는 별개 개념 — `libs/web-core`의 `getSelectedCloudId()`가 쓰는
`'default'`는 세션 계층 내부용이고, `'#'`은 백엔드 push payload 스펙에만 있는
값), 지금 코드는 `cid`가 truthy이기만 하면 무조건 `switchCloud(cid)`를 시도한다.
`'#'`은 유효한 클라우드 id가 아니므로 이 경로를 타면 전환이 실패하거나(400 등)
엉뚱한 컨텍스트로 진입하게 되어, "클라우드 세션 로그아웃 후 중계 채팅방 진입"이라는
기대 동작이 나오지 않는다.

세션 모델상 relay는 클라우드의 기반 인증이다(`switchCloudSession`이 relay 세션의
delegation token 교환으로 클라우드에 진입하므로, 클라우드가 활성이면 relay 세션은
항상 유효). 따라서 클라우드에서 벗어나는 데 재로그인은 필요 없고,
`logoutCloudSession()`(`libs/web-core/src/session/services.ts`) 한 번으로
relay 컨텍스트로 복귀할 수 있다 — `logoutRelaySession()`(전체 로그아웃, 재로그인
필요)과는 다른, 이미 존재하는 "클라우드만 이탈" 경로다.

## 결정 (Decision)

`usePushNavigate.ts`에 relay-origin 판정을 추가한다:

- `cid === '#'`이고 현재 `activeServer.kind === 'cloud'`이면, `switchCloud(cid)`
  대신 `logoutCloudSession()`을 호출해 relay 컨텍스트로 복귀한 뒤 `target`으로
  이동한다.
- `cid === '#'`이고 이미 relay 컨텍스트라면 아무 전환도 하지 않고 그대로
  `navigateNormalized(target)`한다(현재도 정상 동작하는 경로).
- 고유 `cid`(클라우드발 메시지)인 경우의 기존 `switchCloud(cid)` 분기는
  변경하지 않는다 — relay→cloud, cloud A→cloud B 모두 이미 올바르게 동작한다.
- `sid`는 이번 변경의 범위 밖이다: relay 컨텍스트도 `siteId` 개념이 있지만,
  중계서버 푸시에 대해 site 전환은 요구되지 않는다(현재처럼 `sid`가 오면 기존
  `switchSite` 분기가 그대로 적용되되, 이번 크로스오버 케이스를 위해 별도 로직을
  추가하지 않는다).
- 변경 위치는 `usePushNavigate.ts` 한 곳으로 한정한다 — OS 탭과 인앱 배너 탭이
  이미 이 훅으로 수렴하므로 두 경로 모두 자동으로 적용받는다.

### 범위 밖 (Out of scope)

- 클라우드 A → 클라우드 B, 중계 → 클라우드(고유 cid) 전환 로직 변경 (이미 동작).
- relay push의 `sid`(site) 전환.
- 백엔드 push payload 스펙 자체의 변경.
- 로그아웃 확인 다이얼로그 등 UX 추가 — 기존 전환도 확인 없이 자동 처리되므로
  동일한 무확인 자동 전환 패턴을 따른다.

## 대안 (Alternatives)

- **`resolvePushNavigation.ts`에서 `'#'`을 특수 처리**: path 파싱 단계에서
  `cid === '#'`을 `null`로 정규화하는 안도 고려했으나, 이러면 "relay 메시지임"이라는
  정보 자체가 지워져 `usePushNavigate`가 "cid 없음(그대로 유지)"과 "명시적으로
  relay로 돌아가야 함(로그아웃 필요)"을 구분하지 못한다. 현재 클라우드 세션
  활성 중에 `cid`가 아예 없는 push(레거시/사이트 전용 등)가 들어오면 아무 전환도
  안 하는 게 맞는데, 이를 relay 복귀와 뭉뚱그리면 안 된다. 따라서 `'#'`은
  `usePushNavigate`까지 그대로 전달하고 그 안에서 분기한다.
- **`logoutRelaySession()`(전체 로그아웃) 사용**: 재로그인 화면으로 튕기게 되어
  "채팅방으로 바로 이동"이라는 요구를 만족하지 못함. 세션 모델상으로도 relay는
  이미 유효하므로 불필요하게 무겁다.

## 결과 (Consequences)

- 클라우드 세션 중 중계서버 푸시를 클릭하면 `logoutCloudSession()`으로 클라우드만
  이탈하고 relay 채팅방으로 바로 진입한다 — 재로그인 없음.
- 중계서버 세션 중 클라우드서버 푸시를 클릭하는 기존 동작(`switchCloud(cid)`)은
  변경되지 않는다.
- `'#'`이라는 백엔드 전용 sentinel이 프론트 라우팅 코드에 하드코딩된 매직 문자열로
  들어간다 — 세션 계층의 `'default'` sentinel과 이름이 다르고 레이어도 다르다는
  점을 주석으로 명시해 혼동을 막아야 한다.
- 이후 백엔드가 relay sentinel 값을 바꾸면(예: `'#'` → 다른 값) 이 지점만 고치면
  된다 — 단일 수렴점이라 변경 파급이 좁다.
