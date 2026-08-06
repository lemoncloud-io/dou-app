# 푸시 크로스오버 라우팅 (relay ↔ cloud)

> 상태: Live · 최종 갱신: 2026-08-05 · 관련 ADR: [[ADR-0045]]

## 목적

푸시 알림 탭은 알림이 발생한 서버 컨텍스트(중계서버 relay 또는 특정 클라우드)로 진입해야
한다. 채널 데이터는 _활성_ 서버의 repository에서 로드되므로, 라우팅 전에 세션 컨텍스트를
먼저 목적지에 맞춰야 방 화면이 채널을 찾는다.

백엔드 push payload는 중계서버발 메시지의 `cid`를 리터럴 `'#'`로 보낸다. 이 sentinel을
판정해 cloud → relay 복귀(클라우드만 이탈, 재로그인 없음)까지 포함한 네 방향 크로스오버를
`usePushNavigate` 한 곳에서 처리한다. 이 문서는 그 라우팅 분기의 아키텍처를 담는다.

## 설계 원칙

- **단일 수렴점.** 푸시발 라우팅 분기는 `usePushNavigate` 한 곳에만 둔다. OS 알림
  탭(`useHandlePushNavigation`)과 인앱 배너 탭(`useInAppPushMessage`)이 이 훅으로
  수렴하므로, 여기 넣은 로직은 두 진입점에 자동 적용된다. → [README](./README.md)
- **sentinel은 레이어를 넘지 않는다.** `'#'`은 백엔드 push payload 스펙의 relay 표식이고,
  `'default'`는 프론트 세션 계층 내부 sentinel이다(`getSelectedCloudId()`). 이름도 레이어도
  다르다 — `'#'`은 푸시 라우팅 코드(`usePushNavigate`)에서만 해석하고 세션 계층으로
  흘려보내지 않는다.
- **relay는 클라우드의 기반 인증이다.** 클라우드가 활성이면 relay 세션은 항상
  유효하다(`switchCloudSession`이 relay delegation token 교환으로 진입하므로). 따라서
  cloud → relay 복귀는 재로그인이 아니라 `logoutCloudSession()`(클라우드만 이탈) 한
  번이면 된다.
- **무확인 자동 전환.** 기존 cloud/site 전환과 동일하게 확인 다이얼로그 없이 전환한다.
- **best-effort 네비게이션.** 전환이 실패해도 라우팅은 시도한다 — 사용자를 아무 데도 못
  가게 하는 것보다 낫다(기존 catch 패턴 유지).

## 범위

**포함:**

- `cid === '#'` 판정과 relay 복귀 분기 (`usePushNavigate.ts` 한 파일)
- 클라우드 활성 중 relay 푸시 탭 → `logoutCloudSession()` 후 target 이동
- relay 컨텍스트 중 relay 푸시 탭 → 전환 없이 target 이동 (`'#'`이 `switchCloud`로 새지
  않도록 구조적으로 차단)

**제외 (ADR-0045 Out of scope):**

- cloud A → cloud B, relay → cloud(고유 `cid`) 전환 로직 변경 — 이미 동작
- relay 푸시의 `sid`(site) 전환 특수 처리 — 기존 `switchSite` 분기가 그대로 적용될 뿐,
  크로스오버용 로직을 추가하지 않는다
- 백엔드 push payload 스펙 변경
- 로그아웃 확인 다이얼로그 등 UX 추가

## 시나리오

| #   | 현재 컨텍스트 | 푸시 출처 (`cid`) | 동작                                          |
| --- | ------------- | ----------------- | --------------------------------------------- |
| 1   | relay         | relay (`'#'`)     | 전환 없음 → 바로 이동                         |
| 2   | relay         | cloud C1 (`'c1'`) | `switchCloud('c1')` → 이동 (기존 동작 유지)   |
| 3   | cloud C1      | cloud C2 (`'c2'`) | `switchCloud('c2')` → 이동 (기존 동작 유지)   |
| 4   | cloud C1      | relay (`'#'`)     | **`logoutCloudSession()` → 이동 (이번 추가)** |
| 5   | 아무거나      | `cid` 없음        | 전환 없음 → 바로 이동 (기존 동작 유지)        |

시나리오 4의 흐름: 사용자가 클라우드 C1에서 작업 중 → 중계서버 DM 푸시 수신(OS 알림 또는
인앱 배너) → 탭 → 소켓 핸드셰이크 대기 → 클라우드만 이탈(relay 세션 유지, 재로그인 없음)
→ relay 컨텍스트에서 `/channels/{id}/room`으로 이동.

`sid`가 함께 오면 어느 시나리오든 기존 `switchSite` 분기가 이어서 적용된다(cloud 전환이
site 선택을 비우므로 cloud/relay 복귀 → site → 라우팅 순서).

## 다이어그램

```mermaid
flowchart TD
    A[푸시 탭: rawPath] --> B[resolvePushNavigation<br/>→ target, cid, sid]
    B --> C{cid === '#' ?}
    C -- 예 --> D{activeServer.kind<br/>=== 'cloud' ?}
    D -- "예 (시나리오 4)" --> E[핸드셰이크 대기]
    E --> F["logoutCloudSession()<br/>(클라우드만 이탈, relay 유지)"]
    D -- "아니오 (시나리오 1)" --> J
    C -- 아니오 --> G{cid 있음 &&<br/>cid ≠ selectedCloudId ?}
    G -- "예 (시나리오 2·3)" --> H[핸드셰이크 대기 →<br/>invited-cloud 복구(native) →<br/>switchCloud cid]
    G -- "아니오 (시나리오 5)" --> J
    F --> I{sid 있음 &&<br/>sid ≠ selectedSiteId ?}
    H --> I
    I -- 예 --> K[switchSite sid]
    I -- 아니오 --> J[navigateNormalized target]
    K --> J
```

## 상세 구현

분기는 전부 `apps/web/src/app/bridge/navigation/usePushNavigate.ts`에 있다.

**relay-origin 판정.** 모듈 상수 `RELAY_ORIGIN_CID = '#'`(백엔드 payload 스펙 전용 값이며
세션 계층의 `'default'`와 다른 개념 — 상수 주석 참조)을 기준으로, 분기 조건을 이름 있는
불리언으로 분해한다 (`usePushNavigate.ts:146`):

```ts
const isRelayPush = cid === RELAY_ORIGIN_CID;
const needsRelayReturn = isRelayPush && activeServer.kind === 'cloud';
const needsCloudSwitch = !!cid && !isRelayPush && cid !== selectedCloudId;
const needsSiteSwitch = !!sid && sid !== selectedSiteId;
const needsSwitch = needsRelayReturn || needsCloudSwitch || needsSiteSwitch;
```

- 클라우드 활성 판정은 `useGlobalSession().activeServer.kind === 'cloud'`
  (`libs/web-core/src/session/contextStore.ts:84` `resolveActiveServerContext` — `cloud.isActive`
  일 때만 `'cloud'`). `selectedCloudId !== 'default'` 비교보다 커밋된 세션 진실에 가깝다.
- `needsCloudSwitch`의 `!isRelayPush` 덕에 `'#'`이 `switchCloud`로 새는 경로가 구조적으로
  없다 — relay 컨텍스트에서 relay 푸시를 받는 시나리오 1도 이 조건이 보장한다.
- invited-cloud 복구 가드도 `cid && !isRelayPush && isNativeApp()`로 좁혀져 있다 —
  `'#'`은 복구할 클라우드가 아니다.

**relay 복귀 호출.** 전환 블록은 cloud-먼저-site-나중 순서를 유지한다 (`cid &&`/`sid &&`는
TS 내로잉용):

```ts
if (needsRelayReturn) await logoutCloudSession();
if (cid && needsCloudSwitch) await switchCloud(cid);
if (sid && needsSiteSwitch) await switchSite(sid);
```

`logoutCloudSession`은 app-runtime의 `useLogoutCloudSession` 훅
(`libs/app-runtime/src/session/useLogoutCloudSession.ts`, apps/web 재export
`apps/web/src/app/runtime/useLogoutCloudSession.ts`)으로 가져온다. ADR-0045는 web-core의
`logoutCloudSession()`(`libs/web-core/src/session/services.ts:297`)을 지목했지만, 앱
레이어의 정석 진입점은 그것을 감싼 app-runtime 버전이다
(`libs/app-runtime/src/socket/auth/logoutCloudSession.ts:16` — cloud 소켓에 best-effort
`auth.logout` 통지 후 web-core 클리어). `CloudSessionSheet`·`AccountManagePage`가 같은
훅을 쓴다.

**핸드셰이크 게이트는 relay 복귀에도 동일하게 적용된다.** `needsRelayReturn`이
`needsSwitch`에 포함되므로 기존 `waitUntilVerified` 대기를 그대로 탄다. 로그아웃 자체는
토큰 교환이 없지만, 복귀 직후 relay repository에서 채널을 읽으므로 반쯤 열린 소켓 위에서
전환하지 않는다는 기존 불변식을 유지한다.

**`switchSite`의 relay 적용 범위**: `'#'` + `sid` 조합에서 relay 복귀 후 `switchSite`가
기존 분기대로 실행된다. 중계 푸시에 `sid`가 실제로 실리는지는 payload 스펙상 불명 —
특수 처리하지 않으며(ADR-0045 out of scope), 실리는 경우가 관찰되면 그때 다룬다.

## 검증 방법

- 유닛 테스트: `apps/web/src/app/bridge/navigation/useHandlePushNavigation.test.ts` —
  `usePushNavigate`의 동작 스펙이 이 스위트에 있다(진입점 경유로 훅 전체를 검증하는 기존
  패턴). `중계서버 푸시 (cid='#')` describe가 시나리오 1·4와 복구 가드·best-effort·sid
  후속 전환을 커버한다.
- 실행: `npx nx test web --testPathPatterns=bridge/navigation`
- 수동 확인 포인트: 클라우드 세션 진입 → 중계 DM 푸시 수신 → OS 알림 탭 / 인앱 배너 탭
  각각에서 재로그인 없이 relay 채팅방 도착, 클라우드 세션은 종료되어 있는지.
