# ADR-0027: 디바이스 전역 푸시 음소거 설정 — kind-scoped 소켓 파사드(코어) + 마이페이지 토글 (apps/web)

> 상태: Accepted · 결정일: 2026-07-23

관련 ADR:
[[0025-channel-notification-mute-toggle]](./0025-channel-notification-mute-toggle.md) (채팅방별 알림 끄기 — join.update notify. 본 ADR은 device 전역 음소거로 스코프가 다름),
[[0011-web-layout-shell-and-floating-bottom-nav]](./0011-web-layout-shell-and-floating-bottom-nav.md) (마이페이지 셸)

참고 스펙(서버, 이미 확정): `chatic-sockets-api/docs/specs/update-remote-device/{00-requirement,01-spec,02-design}.md`

> **이름 안내 (2026-09-01):** 이 문서가 쓰는 `*RemoteDataSource` · `RemoteGatewayBundle` · `*DomainGateway` · `remoteFactory` · `remote/data-sources/`는 **당시 이름**이다. 소켓 축이 `Socket` 접두로 옮겨간 뒤의 대응표는 [libs/data/docs/remote/README.md](../../libs/data/docs/remote/README.md#이름-규약-2026-09-01-리네임)에 있다. 기록이므로 본문은 그대로 둔다.

## 맥락 (Context)

디바이스 **전역** 푸시 알림을 사용자가 켜고 끌 방법이 없다. 이 음소거(`muted`)의 소유처는
`chatic-pushes-api`이며, sockets-api가 커넥션↔디바이스 연결 정보를 알고 있으므로 소켓 액션
`device.update-remote`로 "현재 연결된 디바이스"의 `muted`를 대신 갱신한다.

라이브러리 업그레이드로 이 경로가 열린다:

- `@lemoncloud/chatic-sockets-lib` `0.4.6 → 0.4.8` — `DeviceGateway.update-remote` (`updateRemote`) 추가.
- `@lemoncloud/chatic-sockets-api` `0.26.703 → 0.26.704` — 소켓 액션 `device.update-remote`, 입력 `{ muted: boolean; id? }`, 응답 `PushDeviceView`(muted 포함).

**서버 계약 요약** (source of truth = 위 스펙):

- 입력 `muted`(boolean) **필수**, 생략 시 400. `id`는 선택 — 생략 시 커넥션 연결 deviceId 사용.
- 응답은 `PushDeviceView`를 passthrough(요청한 muted 반영). **write 전용 — muted 읽기 액션은 서버 스코프 밖**.
- 실패(4xx/5xx/timeout)는 소켓 `:error`로 전파.

**조사에서 확인한 프론트 아키텍처 제약(핵심):**

- 모든 gateway는 `SocketManager`의 **active-slot 파사드**에 바인딩된다
  ([remoteFactory.ts:21-26](../../libs/app-runtime/src/data/factories/socketFactory.ts) — 지금은 `socketFactory.ts`,
  [SocketManager.ts:239](../../libs/app-runtime/src/socket/SocketManager.ts)).
  `request()`는 항상 활성 슬롯으로 나간다 — **클라우드가 켜져 있으면 cloud 슬롯**.
- 따라서 lib 0.4.8의 `DeviceGateway.updateRemote`를 기존 device gateway로 그냥 호출하면
  클라우드 활성 시 cloud 소켓으로 나가버려 **"relay에서만 요청" 요구사항을 위반**한다.
- `SocketManager`는 `relay`(항상 켜짐)·`cloud`(활성 시만) 두 슬롯을 소유하고,
  특정 슬롯을 지목하는 유일한 탈출구는 `getClient(kind)`다
  ([SocketManager.ts:124-129](../../libs/app-runtime/src/socket/SocketManager.ts)).
  relay 강제 선례는 auth 계층뿐(logoutSession, reauthenticateActiveSocket)이며
  모두 `getClient('relay')`로 파사드를 우회한다.
- 프론트 어디에도 `muted` **읽기 경로가 없다** — `device.read`는 로컬 device 모델(muted 미포함)이고,
  푸시 토큰 등록(HTTP `reg-dev`) 응답에도 muted가 없다.

## 결정 (Decision)

디바이스 전역 푸시 음소거 토글을 마이페이지에 추가하되, 이를 **일회성 device 배선이 아니라
재사용 가능한 코어 프리미티브 위의 첫 도메인**으로 구현한다. 클라우드 활성 중 relay(또는 특정
kind) 소켓으로 API를 쏘는 케이스는 앞으로 반복되므로, 그 능력을 1급 코어로 만들고 도메인을 그 위에 얹는다.

### 계층 (Layering)

- **코어 (app-runtime / SocketManager 소유) — 유일한 재사용 자산**
    - `SocketManager.getScopedClient(kind: SocketKind): ISocketClient` 신설. 반환값은 **kind에 고정된 안정 파사드**로,
      `request/send/onType`를 매 호출 `getClient(kind)`로 **지연 해석**한다(슬롯 ensure teardown/rebuild 후에도 최신
      슬롯 클라이언트를 잡음). 기존 active-slot 파사드(`ISocketManager.request` = 활성 슬롯)와 **대칭**이며,
      이제 "active / relay / cloud" 파사드가 나란히 존재한다.
    - 이 하나로 relay-while-cloud, cloud-specific 등 모든 kind-지정 요청을 커버한다. 슬롯이 없으면(예: 미바인드 relay)
      호출 시 명확히 throw.
- **라우팅 (libs/data) — 파사드 위에 얹는 목적지-중립 골격**
    - 목적지는 도메인에 **고정하지 않는다.** `SocketRoute = 'active' | 'relay' | 'cloud'` 타입과
      `routed(create)` 헬퍼를 둔다 — 같은 gateway를 kind별 파사드에 각각 바인딩해
      `Record<SocketRoute, Gateway>`(active=manager, relay/cloud=`getScopedClient(kind)`)로 묶는다.
      파사드가 지연 해석이라 세 인스턴스를 만들어도 값싸고 stale 위험이 없다.
    - data-source/repository 메서드는 **`route?: SocketRoute` 인자(기본 `'active'`)** 를 받아 해당 인스턴스를 고른다.
      데이터 계층은 목적지에 **중립**이며, "어디로 보낼지"는 **호출부(web)가 결정**한다.
    - 신규 라우팅 케이스는 코어/gateway 변경 없이 그 메서드에 `route` 인자를 노출하는 것으로 끝난다.

### 포함 (In scope)

1. **라이브러리 업그레이드**: `chatic-sockets-lib@0.4.8`, `chatic-sockets-api@0.26.704`.

2. **코어: kind-scoped 소켓 파사드** — 위 "계층"의 `getScopedClient(kind)`. 이번엔 `request`/`send`만 완전 지원한다.
   `onType`의 재바인드 생존(active 파사드가 하는 owned-subscription 재바인딩과 동일 복잡도)은
   relay-push 소비자가 실제로 생길 때 확장할 **문서화된 extension point**로 남긴다(지금은 미구현/throw 또는 no-op 명시).

3. **라우팅 골격 (libs/data)** — 위 "라우팅"의 `SocketRoute` + `routed()` + 메서드 `route` 인자(기본 `'active'`).
    - device는 이 골격의 첫 소비자. `DeviceRemoteDataSource.updateRemoteDevice({ muted }, route?)`,
      `DeviceRepositoryV2.updateRemotePushMute(muted, opts?: { route })` 추가.
    - 기존 device gateway(save/read/**sync**)는 **그대로 active로 유지**한다 — 뷰잉/프레즌스(sync)는
      현재 활성 서버 기준이어야 하므로 목적지를 옮기지 않는다.

4. **입력**: 클라는 `{ muted }`만 보낸다. `id`는 보내지 않고 서버가 커넥션 연결 deviceId로 해석하게 둔다(IDOR 표면 최소화).

5. **UI (apps/web/src/app/features/mypage) — "relay에서만"을 여기서 강제**:
    - `MyPage`의 Settings `MenuCard`에 `Switch` 행 1개(다크모드/메시지 미리보기와 동일 패턴).
    - 라벨은 "알림 받기" 의미 — **토글 ON = 알림 받기 = `muted: false`** (muted를 반전해 표시).
    - 전용 훅 `useDevicePushMute`가 `updateRemotePushMute(muted, { route: 'relay' })`로 **호출부에서 relay를 지정**한다.
      `route: 'relay'`는 훅 내 **상수로 고정 + 테스트로 못박아**, 데이터 계층 기본값(active)으로 새는 것을 방지한다.

6. **초기 상태 / 재조정**: standalone muted read가 없으므로 첫 write 전 **기본 ON(알림 받기, `muted: false`) 가정**.
   단, `device.update-remote` **응답에 authoritative `muted`가 담겨 오므로 write가 read를 겸한다** — 매 토글은 낙관적
   반영 후 성공 시 응답의 `muted`로 재조정한다(응답에 없으면 요청값 폴백). 첫 write 전 초기값만 가정이고, 그 이후는 서버 진실을 따른다.

7. **게스트 포함**: 로그인 여부와 무관하게 **모두에게 노출**. 푸시는 device(기기) 스코프이고 relay 슬롯은 게스트에게도 존재한다.

8. **오프라인/미verified 동작**: 토글은 **항상 허용**(낙관적)하되, 요청 실패 시 **이전 값으로 롤백 + 에러 토스트**.
   `isKindVerified('relay')`로 사전 차단하지 않는다.

### 제외 (Out of scope)

- `muted` 외 device 설정(status/deviceToken/platform/endpoint 등) 갱신.
- 서버 muted **읽기(read-remote)** 경로 신설 — 이번엔 프론트에서 기본 ON 가정으로만 처리.
- per-channel 알림(notify, [ADR-0025]) 변경 — 별개 축.
- 클라이언트 측 알림 렌더링/필터링 로직(apps/web은 서버 푸시 발송에 의존).
- muted가 push fanout에 실제 반영되는 것은 pushes-api 책임(계약 범위 밖).

## 대안 (Alternatives)

- **(폐기) relay 전용 device gateway 일회성 배선** — device에만 묶인 relay 파사드+게이트웨이를 device 전용으로 추가.
  당장은 단순하지만 relay-while-cloud 요청이 반복될 것이 확실하므로 매번 유사 배선이 늘어난다.
  → kind-scoped 파사드를 **코어 프리미티브**로 올리고 device를 그 첫 소비자로 두는 방식으로 일반화(작성자 지적 반영).
- **(폐기) 목적지를 도메인에 고정(`bundle.relay.device`)** — relay 네임스페이스에 relay-pinned gateway를 두는 초안.
  하지만 같은 메서드를 상황에 따라 relay/cloud로 보내는 케이스가 예상됨 → 목적지를 **호출 시점 `route` 인자**로
  빼고 데이터 계층은 중립화. 기본 route는 `'active'`, 정책은 호출부(web)가 소유(작성자 지적 반영).
- **(폐기) app-runtime 런타임 우회 헬퍼** — logoutSession처럼
  `getSocketManager().getClient('relay').request('device.update-remote', ...)`를 훅에서 직접 호출.
  최소 변경이지만 gateway/repository 계층을 건너뛰고 지연 해석/재사용성이 각 호출처에 흩어짐 → 코어 파사드 채택.
- **(폐기) device gateway 전체를 relay로 이전** — save/read/sync까지 relay로 가면 뷰잉/프레즌스 sync가
  활성 클라우드 기준이 아니게 되어 깨짐 → relay-pinned은 update-remote만.
- **(보류) `getScopedClient`를 `ISocketManager`의 슬롯-지정 request로 승격** — 파사드 객체 대신
  `manager.request(type, data, { kind })` 형태. gateway가 단일 client를 받도록 설계돼 있어 파사드 객체가 배선에 더 자연스러움.
  relay-only write가 충분히 늘면 재검토(아래 재검토 조건).
- **(폐기) 서버 read-remote 추가 후 초기 상태 동기화** — 정합성은 좋지만 서버 스코프 확장 필요.
  작성자 결정으로 이번엔 기본 ON 가정으로 단순화(재검토 조건에 등재).
- **(폐기) 게스트 숨김 / 미verified 시 disabled** — 제품 관점상 device 스코프라 전원 노출 + 낙관적 허용 채택.

## 결과 (Consequences)

**얻는 것**

- 클라우드 활성 여부와 무관하게 디바이스 전역 푸시 음소거를 relay로 일관되게 갱신.
- **kind-scoped 파사드(코어) + route 인자(라우팅)** 로, 목적지는 호출부가 자유롭게 선택. 다음 relay/cloud-지정 API는
  코어·gateway 변경 없이 해당 메서드에 `route` 인자만 노출하면 끝 — 반복될 relay-while-cloud 케이스의 표준 경로.
- 데이터 계층이 목적지에 중립이라, 같은 도메인 메서드를 상황에 따라 relay/cloud/active로 재사용 가능.
- 계층(코어 파사드→routed gateway→data-source→repository→hook)을 따라 단위 테스트 가능.

**감수하는 트레이드오프 / 리스크**

- **"relay에서만"이 데이터 계층 보증이 아니라 호출부 규약이 됐다.** 기본 route가 `'active'`라, push-mute 훅이
  `route:'relay'`를 빠뜨리면 클라우드로 조용히 샌다 → 훅 내 상수 고정 + 테스트로 완화(위 In scope 5).
- **첫 write 전 초기 상태만 서버 진실과 어긋날 수 있다.** standalone read가 없어 부팅 직후 첫 토글 전까지는 기본 ON 가정.
  write 응답의 authoritative `muted`로 매번 재조정하므로 한 번이라도 토글하면 서버 값으로 수렴한다(드리프트 창이 첫 write 전으로 축소). (재검토 조건 1)
- kind-scoped 파사드가 **지연 해석**을 안 하면 슬롯 재바인드 후 stale client를 잡는 버그 위험 → 코어 구현 시 필수 준수(테스트로 못박음).
- **`route:'cloud'`인데 cloud 슬롯 미바인드면 request 시점에 throw**(조용한 active 폴백 안 함). "cloud로 갔다"는 계약을 지키기 위한 의도적 실패 — 호출부는 cloud가 의미 있을 때만 지정.
- 코어 파사드의 **onType 미완성**(request/send만) — relay-push 소비자가 생기기 전까지 부분 구현. 그 전에 잘못 쓰면 안 되도록 명시적 throw/no-op + 문서화.
- `input.id` 무검증 IDOR은 서버가 수용한 리스크(`device.*` unguarded). 클라는 id 미전송으로 표면 최소화.
- SocketManager/파사드는 web 런타임(app-runtime) 소유 — testbed 참조 구현 정합 유지 필요([[web-runtime-migration]]).

## 재검토 조건

- 사용자 혼선(토글 표시값 ≠ 실제)이 문제되면 → 서버 **muted read-remote** 경로 신설 + 초기 동기화 재검토.
- pushes-api `PUT /devices/<id>`가 부분 갱신이 아니라 전체 치환으로 확인되면 → 클라 body 구성 재검토(서버 스펙과 연동).
- relay-only write가 늘어나면 → relay-pinned 파사드를 `ISocketManager`의 1급 API(예: 슬롯 지정 request)로 승격 검토.

## 추록 (2026-07-23) — route 인자 노출 철회, 목적지를 데이터 소스에 고정

운영 중 원 결정의 리스크("호출부가 `route:'relay'`를 빠뜨리면 active로 조용히 샌다")가 상시 비용으로
확인되어, **"목적지는 호출부가 결정"을 부분 철회**한다:

- `DeviceRemoteDataSource.updateRemoteDevice(payload)`가 **relay를 직접 고정**하고,
  repository/훅의 `route` 인자·`PUSH_MUTE_ROUTE` 상수·누수 방지 테스트를 제거했다.
  update-remote는 계약상 목적지가 relay 하나뿐이라(pushes-api가 relay 뒤), 호출 시점 선택지가
  존재하지 않는 메서드에 선택 표면을 노출하는 것은 사고 표면만 늘리는 투기적 일반화였다.
- **코어 `getScopedClient(kind)`와 routed 게이트웨이 묶음은 유지** — 재사용 프리미티브는 코어까지다.
  호출 시점에 목적지가 정말 달라지는 두 번째 소비자가 생기면 그 메서드에만 `route`를 노출한다(S4).
- 같은 정리에서 `ScopedSocketClient`의 미구현 `onType`(무조건 throw)을 타입 표면에서 제거했다 —
  소비자가 생길 때 추가(extension point 문서 유지).

관련: [kind-scoped-routing.md](../../libs/app-runtime/docs/socket/kind-scoped-routing.md) 설계 원칙 개정.
또한 비셸(일반 브라우저)은 pushes-api에 push 디바이스가 없어 write가 404 — 마이페이지 토글은
`isSupported`(`CHATIC_APP_PLATFORM`) 기준 disabled + "앱에서만 설정" 안내로 렌더한다.
