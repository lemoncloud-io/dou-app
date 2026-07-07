# Device 동기화 — save / sync(viewing) / registerDevice의 분업

Date: 2026-07-07
Status: viewing·status 통지 구현됨 (다른 디바이스 구독은 미구현)

> device 도메인은 **상태 동기화(state sync)** 모델이다(단일 `tick` 버전축). 쓰기 경로가 두
> 갈래로 갈리는 게 핵심 — **`device.save`(상태 변경, tick 증가)** 와 **`device.sync`(viewing
> 통지, tick 불변)** 는 목적이 다르다. 이 문서는 **무엇을 어느 API로 보내야 하는지**, 그리고
> **현재 비어 있는 앱 향 트리거(누가 언제 호출하나)를 어디에 두는지**를 정의한다.
>
> - register / 수동 콜 / 기준선 다리 → [usage.md](usage.md) §1·§4
> - plan 패밀리·트리거 시점 → [library-internals.md](library-internals.md)
> - 소유 경계·SyncManager → [README.md](README.md)

---

## 1. device는 왜 특별한가

|              | device                                                         | chat / channel / ...    |
| ------------ | -------------------------------------------------------------- | ----------------------- |
| 버전축       | 단일 `tick`(서버 단조 증가)                                    | chatNo / updatedAt      |
| 인증 전 동작 | ✅ **유일하게 `requiresAuth=false`** — 인증 전에도 sync        | ❌ authenticated 후에만 |
| 부트스트랩   | `createDeviceRuntime`이 `connected`마다 **자동 `device.save`** | 앱이 register           |
| 쓰기 갈래    | **2개** (save=상태, sync=viewing)                              | 1개                     |

> `tick`은 서버 전용이다. 클라는 **비교용으로만** 보관하고 절대 쓰지 않는다(SDK가 `DeviceSeed`에서 `tick:never`로 차단).

---

## 2. 세 가지 쓰임 — 무엇을 어느 API로

| 의도                                                        | API (data source)                        | tick     | 응답                  | 비고                                     |
| ----------------------------------------------------------- | ---------------------------------------- | -------- | --------------------- | ---------------------------------------- |
| **연결 유지 / 내 디바이스 등록**                            | ❌ 직접 호출 안 함                       | +1       | —                     | runtime이 `connected`마다 자동 save      |
| **내 상태 변경** (posX·posY·name)                           | `saveDevice(body)`                       | **+1**   | `DeviceView`          | 매 save가 서버에서 `status='green'` 강제 |
| **내 presence 통지** (green=포그라운드 / yellow=백그라운드) | `syncDevice({ status })`                 | **불변** | 없음(fire-and-forget) | 부분 병합 — viewing 짝을 건드리지 않음   |
| **내 시선 통지** (보고 있는 채널)                           | `syncDevice({ viewingType, viewingId })` | **불변** | 없음(fire-and-forget) | 화면 전환마다 자주 보내도 안전           |
| **다른 디바이스 상태 구독**                                 | `registerDevice(id)`                     | —        | (plan 콜백)           | `DeviceSyncPlan` polling + push 자동     |

핵심 분리: **상태(save)는 버전축으로 전파, 시선(sync)은 버전축을 오염시키지 않고 경량 전파.** viewing을 `save`로 보내면 tick이 올라 watcher들이 불필요하게 재동기화한다 — **viewing은 반드시 `sync`**.

device 모델 상태 필드(SDK `DeviceView`): `status('' | green | red | yellow)`, `posX/posY`, presence(`connectedAt/disconnectedAt/lastActiveAt`), viewing(`viewingType('' | channel)/viewingId/viewingSince`).

---

## 3. 현재 배선 상태 (코드 기준)

| 경로                                                          | 상태                      | 위치                                                                                                            |
| ------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `DeviceRemoteDataSource.saveDevice / readDevice / syncDevice` | ✅ 존재                   | [libs/data/.../DeviceRemoteDataSource.ts](../../../data/src/data/remote/data-sources/DeviceRemoteDataSource.ts) |
| `SyncManager.registerDevice(id?)`                             | ✅ 존재                   | [SyncManager.ts](../../src/socket/sync/SyncManager.ts)                                                          |
| connect 시 자동 `device.save`                                 | ✅ runtime 소유           | `createDeviceRuntime`                                                                                           |
| **viewing 통지 트리거** (채널 진입/이탈 → `syncDevice`)       | ✅ **배선됨**             | apps/web `useDeviceSync`(라우트 관측) → `DeviceRepositoryV2.syncDevice` (§4)                                    |
| **status 통지 트리거** (포/백그라운드 → `syncStatus`)         | ✅ **배선됨**             | apps/web `useDeviceSync`(`useAppVisibility` 관측) → `DeviceRepositoryV2.syncStatus` (§4.3)                      |
| **위치 변경 트리거** (`saveDevice({posX,posY})`)              | 🔴 **없음**(자동 save 외) | —                                                                                                               |
| device watch 결과 캐시 (`registerDevice` → repository)        | 🟡 미연결                 | plan `onUpdate`가 캐시에 안 붙음([usage.md](usage.md) §2 "device: 캐시 미연결")                                 |

→ **viewing·status 통지 트리거는 배선됐다**(§4). 남은 빈칸은 "내 위치(posX/posY)를 쏘는" 트리거와 "남의 디바이스 상태를 받는" watch 캐시 연결(§5)이다.

---

## 4. viewing·status 통지 surface (구현됨)

### 4.1 어디에 있나

viewing 통지는 **쓰기(write)** 다 — sync target 등록(`register*`, 자동 유지)과 성격이 다르다([usage.md](usage.md) §1 "register=자동 / gateway=수동 콜"). 실제 배선:

- **API**: `DeviceRemoteDataSource.syncDevice` (이미 존재) 를 재사용.
- **repository**: `DeviceRepositoryV2.syncDevice(viewingType, viewingId)` / `syncStatus(status)` —
  캐시 없는 thin passthrough. `DataRepositoriesV2.device`로 노출되어 UI는 `useRuntimeRepositories().device`라는
  매니저 surface만 만진다(매니저 surface 규칙). [DeviceRepositoryV2.ts](../../../data/src/data/repositories-v2/DeviceRepositoryV2.ts)
- **트리거 소유**: 컴포넌트 lifecycle이 아니라 **전역 관측**. apps/web `useDeviceSync`가
  `UnifiedLayout`(RouterProvider 안)에 마운트되어 두 신호를 관측한다 — (a) `useMatch('/channels/:channelId/room')`로
  현재 채널을 도출해 전환마다 1회 viewing 통지, (b) 네이티브 `OnBackgroundStatusChanged`와 웹
  `visibilitychange`를 병합한 `useAppVisibility`로 포/백그라운드 전환마다 status 통지. 미인증 중에는
  viewing은 보류, status는 낙관 전송하되 미전달로 취급 — 어느 쪽이든 재인증 rising edge에 현재 값을
  재assert한다(`device.sync`는 자가치유 없는 send라 끊긴 소켓에서 조용히 유실되기 때문). viewing은
  **채널 룸에서만**; settings·목록·기타 라우트는 clear.

> ⚠️ **타입 출처 주의**: `DeviceRemoteDataSource`의 device 타입은 `@lemoncloud/chatic-sockets-lib`에서
> 가져온다(게이트웨이를 제공하는 패키지). `@lemoncloud/chatic-sockets-api`의 `DeviceSyncRequestData`는
> 구버전이라 `viewingType`/`viewingId`가 없으므로 거기서 import하면 viewing 필드가 누락된다.

### 4.2 사용 패턴

```ts
// 채널 진입
syncDevice('channel', channelId); // → device.sync { viewingType:'channel', viewingId: channelId }

// 채널 이탈 / 목록 복귀 (clear)
syncDevice('', ''); // → device.sync { viewingType:'', viewingId:'' }

// 포그라운드 복귀 / 백그라운드 진입 (status만 — 부분 병합, viewing 유지)
syncStatus('green');
syncStatus('yellow');
```

규칙:

1. **`device.sync`만 쓴다**(save 아님) — tick 불변·fire-and-forget. 실패해도 다음 전환에서 갱신된다.
2. **viewing은 항상 짝으로** — `viewingType`/`viewingId`를 함께 set 또는 함께 clear.
3. **status는 단독 필드로** — 서버가 부분 병합하므로 `{ status }`만 보낸다. viewing 필드를 빈
   문자열로 채워 보내면 시선이 지워지니 필드 자체를 생략한다.
4. **`viewingType`은 LUT 제한** — 시작은 `'channel'`뿐. `viewingId`는 대상 id(채널이면 channelId).
5. **연결 끊긴 동안의 위치는 통지 안 됨** — 서버가 연결 활성 여부와 함께 해석한다.

### 4.3 status는 sync로, 위치는 save로

- **presence status(green/yellow)** → `syncStatus(status)` — `device.sync` 부분 병합, tick 불변.
  포/백그라운드 전환마다 보내도 watcher 재동기화를 유발하지 않는다. `'red'`/`''`는 서버 소관
  (연결 단절 등)이라 클라가 보내지 않는다.
- **위치(posX/posY)·name** → `saveDevice(body)` — **request/response, tick +1**. 고빈도 입력
  (마우스 좌표 등)은 **throttle / coalesce** 필수. 매 픽셀 save = tick 폭증.
- 단순 "온라인 표시"는 별도 콜 불필요 — connect 자동 save가 이미 `status='green'`을 만든다.

---

## 5. 다른 디바이스 구독 (multi-device presence)

내가 아닌 **다른 디바이스의 상태**(위치·status·viewing)를 화면에 띄우려면 `registerDevice(id)`로 watch한다.

```ts
const off = sync.registerDevice('device-A'); // A의 상태를 polling + push로 추적
// ...
off(); // ref-count 0이면 stopSync
```

- `DeviceSyncPlan.run`이 `device.read`로 최신 상태를 끌어오고, `onTrigger`(서버 `device.sync` push)로 즉시 재조회한다.
- **out-of-order 방어**: 더 낮은 tick은 무시(`lastAppliedTick`).
- ⚠️ **결과 캐시가 현재 미연결**(§3). watch 결과를 UI에 흘리려면 plan `onUpdate` → device repository cache 연결이 선행돼야 한다(현재 channel/place/chat만 캐시 연결됨 — [usage.md](usage.md) §2).

---

## 6. 요약

- **내 presence(status green/yellow)** → `syncStatus` (tick 불변, 부분 병합) — ✅ **구현됨**(§4, 가시성 관측 트리거)
- **내 위치(posX/posY)** → `saveDevice` (tick +1, throttle) — 트리거 미구현
- **내 시선(viewing)** → `syncDevice` (tick 불변, fire-and-forget) — ✅ **구현됨**(§4, 라우트 관측 트리거)
- **남의 상태 보기** → `registerDevice` (캐시 연결 선행 필요) — 미구현
- **연결 유지** → 안 건드림(runtime 자동)

남은 작업 = (1) 내 위치 save 트리거(필요 시), (2) device watch 결과 캐시 연결(§5).

## 7. 관련 문서

- [usage.md](usage.md) — register vs 수동 콜, `updateLocalSnapshot` 기준선
- [library-internals.md](library-internals.md) — plan 트리거 시점·도메인별 차이
- [chat-sync.md](chat-sync.md) — event-driven plan(no-op run) 대조군
- [README.md](README.md) — SyncManager 소유 경계
