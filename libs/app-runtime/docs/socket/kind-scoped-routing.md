# Kind-scoped 소켓 라우팅 — 목적지 선택형 요청 (relay / cloud / active)

> 상태: Live · 최종 갱신: 2026-07-23 · 관련 ADR: [[ADR-0027]](../../../../docs/adr/0027-device-push-mute-setting.md)

## 목적

`SocketManager`는 `relay`(항상 켜짐)·`cloud`(활성 시만) 두 슬롯을 소유하고, 대부분의 요청은
**active 슬롯**(cloud 있으면 cloud, 없으면 relay)으로 나간다([SocketManager.ts:239](../SocketManager.ts),
[types.ts:59-65](../types.ts)). 하지만 어떤 요청은 클라우드 활성 여부와 무관하게 **특정 서버 슬롯**으로만 가야 한다.

첫 사례는 **디바이스 전역 푸시 음소거**(`device.update-remote`) — 설정 소유처가 relay 뒤의
`chatic-pushes-api`라서, 클라우드가 켜져 있어도 **relay 소켓으로만** 요청해야 한다.

이 기능은 그런 "슬롯을 지정해 요청" 능력을 **1급 재사용 프리미티브**로 제공한다. relay-while-cloud,
cloud-specific 같은 케이스가 반복될 것이므로, 도메인마다 배선을 새로 짜는 대신 코어 하나로 흡수한다.

## 설계 원칙

- **코어는 얇고 목적지-중립.** `SocketManager`는 "kind 고정 파사드"만 제공한다. "어떤 요청이 어디로
  가야 하는가"라는 정책은 코어가 모른다.
- **목적지는 호출부가 결정한다.** data-source/repository 메서드의 기본 목적지는 `'active'`이고,
  relay/cloud로 보내야 하는 쪽(예: web 훅)이 `route`를 명시한다. 데이터 계층은 라우팅에 중립을 유지한다.
- **지연 해석 필수.** 슬롯은 `ensure()`에서 teardown/rebuild되므로([SocketManager.ts:91-118](../SocketManager.ts)),
  파사드는 클라이언트를 캡처하지 않고 매 호출 `getClient(kind)`로 다시 얻는다. 이걸 어기면 재바인드 후 stale client를 잡는다.
- **조용한 폴백 금지.** `route:'cloud'`인데 cloud 슬롯이 없으면 request 시점에 throw한다. "cloud로 갔다"는
  계약을 지키기 위한 의도적 실패다 — active로 몰래 새지 않는다.
- **정책은 한 곳에 고정.** relay-only가 호출부 규약이 된 이상, 그 호출부는 `route`를 상수로 박고 테스트로 못박는다.

## 범위

**포함**

- 코어: `SocketManager.getScopedClient(kind)` — kind 고정 안정 파사드(`request`/`send` 완전 지원).
- 라우팅: `SocketRoute` 타입 + `routed()` 헬퍼 + data-source/repository 메서드의 `route` 인자(기본 `'active'`).
- 첫 소비자: device `update-remote`(muted) 경로 + 마이페이지 푸시 음소거 토글.
- 라이브러리 업그레이드: `chatic-sockets-lib@0.4.8`, `chatic-sockets-api@0.26.704`.

**제외**

- 코어 파사드의 `onType` 재바인드 생존(현재 미구현 — 아래 "상세 구현" extension point).
- 서버 `muted` 읽기 경로(read-remote). 초기 상태는 web에서 기본 ON 가정.
- device gateway의 `save`/`read`/`sync` 목적지 변경 — 뷰잉/프레즌스는 계속 active.
- per-channel 알림(notify, [[ADR-0025]](../../../../docs/adr/0025-channel-notification-mute-toggle.md)).
- muted가 push fanout에 반영되는 것은 `chatic-pushes-api` 책임(프론트 밖).

## 시나리오

### S1. 클라우드 활성 중 푸시 음소거 (핵심 요구)

1. 사용자가 클라우드 세션에 있다 → SocketManager active 슬롯 = `cloud`.
2. 마이페이지에서 "알림 받기" 토글을 끈다.
3. `useDevicePushMute`가 `updateRemotePushMute(true, { route: 'relay' })` 호출(훅에 route 상수 고정).
4. 라우팅이 relay 파사드의 device gateway를 골라 `device.update-remote { muted: true }`를 **relay 슬롯**으로 전송.
5. 서버가 커넥션 연결 deviceId로 pushes-api에 PUT → `PushDeviceView`(muted:true) 응답.
6. 훅은 로컬 preference(`pushMuted`)를 낙관적으로 이미 반영, 성공이면 유지.

### S2. 요청 실패 → 롤백

1. relay 미verified/오프라인/서버 4xx·5xx.
2. `device.update-remote`가 소켓 `:error`로 reject.
3. 훅이 `pushMuted`를 이전 값으로 되돌리고 에러 토스트.

### S3. 게스트

- 로그인 없이도 relay 슬롯은 존재하므로 토글 노출·동작. device 스코프라 로그인 무관.

### S4. (미래) 상황별 relay/cloud 선택

- 같은 도메인 메서드를 호출부가 `route`로 골라 보냄. 코어/gateway 변경 없이 메서드에 `route` 노출만 추가.

## 다이어그램

### 계층 흐름

```mermaid
flowchart TD
  UI["MyPage Switch"] --> H["useDevicePushMute<br/>route: 'relay' 고정"]
  H --> R["DeviceRepositoryV2<br/>updateRemotePushMute(muted, {route})"]
  R --> DS["DeviceRemoteDataSource<br/>updateRemoteDevice(payload, route)"]
  DS -->|"device[route]"| G["routed device gateways"]
  G -->|active| FA["manager (active facade)"]
  G -->|relay| FR["getScopedClient('relay')"]
  G -->|cloud| FC["getScopedClient('cloud')"]
  FA --> AC["active slot client"]
  FR --> RC["relay slot client"]
  FC --> CC["cloud slot client (없으면 throw)"]
  RC --> WS["device.update-remote → relay 서버"]
```

### 슬롯 vs 라우트

```mermaid
flowchart LR
  subgraph SocketManager
    RS["relay slot (항상)"]
    CS["cloud slot (활성 시만)"]
  end
  A["route 'active'"] -->|cloud 있으면| CS
  A -->|없으면| RS
  RL["route 'relay'"] --> RS
  CL["route 'cloud'"] -->|없으면 throw| CS
```

## 상세 구현

핵심 파일과 역할:

**코어 (libs/app-runtime)**

- [`SocketManager.ts`](../SocketManager.ts) `getScopedClient(kind): ScopedSocketClient` — 반환 객체의
  `request`/`send`는 매 호출 `this.entries.get(kind)?.client`를 조회(지연 해석)하고, 슬롯 미바인드면 throw한다.
  `onType`은 당장 미사용이라 명시적 throw로 두고, relay-push 소비자가 생길 때 active 파사드의
  owned-subscription 재바인딩([SocketManager.ts](../SocketManager.ts) `rebindTypeListeners`)과 동일한 방식으로 확장한다(**extension point**).
- [`types.ts`](../types.ts) — `ScopedSocketClient = Pick<ISocketManager, 'request'|'send'|'onType'>` 정의 +
  `ISocketManager`에 `getScopedClient(kind): ScopedSocketClient` 시그니처.
- [`data/factories/remoteFactory.ts`](../../data/factories/remoteFactory.ts) — `SocketRoute` 타입 +
  `routed(create)` 헬퍼. `routed(createDeviceGateway)` → `{ active: create(manager),
relay: create(manager.getScopedClient('relay')), cloud: create(manager.getScopedClient('cloud')) }`.
  bundle의 device 항목을 이 routed 묶음으로 교체(기존 active 배선은 `.active`로 보존).

**라우팅/도메인 (libs/data)**

- [`gateways/index.ts`](../../../../libs/data/src/data/remote/gateways/index.ts) — `DeviceDomainGateway`에
  `updateRemote` 추가(`Pick<DeviceGateway, 'save'|'read'|'sync'|'updateRemote'>`). routed 묶음 타입 `RoutedGateway<G> = Record<SocketRoute, G>`.
- [`data-sources/DeviceRemoteDataSource.ts`](../../../../libs/data/src/data/remote/data-sources/DeviceRemoteDataSource.ts) —
  생성자가 routed device 묶음을 받고, `updateRemoteDevice(payload, route: SocketRoute = 'active')`가
  `this.device[route].updateRemote(payload)` 호출. 기존 save/read/sync는 `this.device.active`로.
- [`data-sources/index.ts`](../../../../libs/data/src/data/remote/data-sources/index.ts) — `new DeviceRemoteDataSource(gateways.device)`가
  routed 묶음을 그대로 받도록 조정.
- [`repositories-v2/DeviceRepositoryV2.ts`](../../../../libs/data/src/data/repositories-v2/DeviceRepositoryV2.ts) —
  `updateRemotePushMute(muted: boolean, opts?: { route?: SocketRoute }): Promise<void>` 추가. id는 미전송.
- [`gateways/__mocks__/MockRemoteGateways.ts`](../../../../libs/data/src/data/remote/gateways/__mocks__/MockRemoteGateways.ts) —
  device mock에 routed 형태(active/relay/cloud 각 `updateRemote: jest.fn()`) 반영.

**UI (apps/web)**

- [`stores/preferenceKeys.ts`](../../../../apps/web/src/app/stores/preferenceKeys.ts) — `pushMuted`(strategy `local`, default `'false'`) 추가.
- [`stores/usePreferenceStore.ts`](../../../../apps/web/src/app/stores/usePreferenceStore.ts) — `pushMuted`/`setPushMuted`
  (issueReportHidden 패턴 그대로).
- `features/mypage/hooks/useDevicePushMute.ts`(신규) — `useRuntimeRepositories().device` + preference store.
  `route: 'relay'`를 모듈 상수로 고정. 낙관적 set + 실패 롤백 + 토스트([`useToast`](../../../../apps/web/src/app/features/mypage/pages/AccountManagePage.tsx) 패턴).
- [`features/mypage/pages/MyPage.tsx`](../../../../apps/web/src/app/features/mypage/pages/MyPage.tsx) — Settings `MenuCard`에
  `Switch` 행 1개. `checked = pushEnabled(= !muted)`, `onCheckedChange`로 write. 게스트 포함 노출.
- [`public/locales/{ko,en}/translation.json`](../../../../apps/web/public/locales/ko/translation.json) — `mypage.pushNotifications` 등 키.

## 검증 방법

- **코어 단위 테스트** — [`SocketManager.test.ts`](../SocketManager.test.ts) "getScopedClient (kind-scoped routing)"
  (mocked `createClientSocketV2`, `makeClient()`). 21/21 통과:
    - `getScopedClient('relay').request(...)`가 **relay 슬롯** 클라이언트로 위임(cloud 슬롯이 active여도).
    - 슬롯 재바인드(`ensure` 재호출) 후에도 최신 relay 클라이언트로 위임(**지연 해석** 회귀 방지).
    - 슬롯 미바인드 시 request throw / `onType` throw.
- **라우팅/도메인 테스트** — [`DeviceRemoteDataSource.test.ts`](../../../../libs/data/src/data/remote/data-sources/DeviceRemoteDataSource.test.ts)
    - [`DeviceRepositoryV2.test.ts`](../../../../libs/data/src/data/repositories-v2/DeviceRepositoryV2.test.ts) (11/11):
    * `updateRemoteDevice(payload, 'relay')` → routed `device.relay.updateRemote`, active/cloud 미호출.
    * `updateRemotePushMute(true, { route: 'relay' })` → `{ muted: true }`만 전달(id 미포함), route 그대로 전파.
    * route 생략 시 data-source 기본값 `active`.
- **훅 테스트** — [`useDevicePushMute.test.ts`](../../../../apps/web/src/app/features/mypage/hooks/useDevicePushMute.test.ts) (2/2):
  `route:'relay'` 상수가 실제 전달되는지(정책 누수 방지 회귀), 실패 시 롤백 + 토스트.
- **타입** — `nx typecheck data app-runtime` green (gated lib check).
- **수동 확인** — 클라우드 세션 진입 후 토글 → 소켓 프레임이 **relay** wss로 나가는지(디버그 오버레이/네트워크).
  (실 확인은 인증된 relay 소켓 + `device.update-remote` 지원 서버가 필요해 로컬 프리뷰만으로는 재현 불가 — 단위 테스트로 대체 검증.)

## 라이브러리

`chatic-sockets-lib 0.4.6→0.4.8`(`DeviceGateway.updateRemote` 제공), `chatic-sockets-api 0.26.703→0.26.704`
(`device.update-remote`, 입력 `{ muted: boolean; id? }`, 응답 passthrough). 이 업그레이드가 별개로 `join.update`
입력 배럴(`JoinUpdateInput`)을 channel 변형으로 재해석해 [JoinRemoteDataSource.ts](../../../../libs/data/src/data/remote/data-sources/JoinRemoteDataSource.ts)가
깨졌고, 명시 alias `JoinDomainUpdateInput`로 교체해 수정했다.
