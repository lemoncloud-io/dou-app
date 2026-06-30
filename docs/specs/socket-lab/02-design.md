# Design: socket-lab

**Status:** Confirmed
**Date:** 2026-06-29
**Slug:** socket-lab
**Spec:** [01-spec.md](./01-spec.md)

## 범위

모듈/컴포넌트 구조와 데이터 흐름을 다룬다. 외부 계약은 [01-spec.md](./01-spec.md)가 source of truth.

> **주의**: 이 기능은 lemon-core 백엔드 도메인이 아니라 **admin React feature 이식**이다. sdd 기본 디자인 템플릿(`데이터 모델링`/`use-case 분해`/`proxy·pool`)은 백엔드 전용이라 **프론트 모듈·컴포넌트·상태 흐름**으로 대체한다. demo 소스는 chatic-sockets-api `stash@{0}`(`feat/demo-verification-tool`)의 `demo/src/**`(refactor 후 nested 트리)가 정본.

## 이식 모듈 구조 (demo → admin feature)

타깃: `apps/admin/src/app/features/socket-lab/` (socket-test feature 레이아웃 미러)

| demo 소스(stash@{0})                                              | → admin 타깃                  | 이식 방식          | 역할                                                                                                                                                                |
| ----------------------------------------------------------------- | ----------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runtime/client-container.ts`                                     | `runtime/client-container.ts` | 복사+import 재작성 | **클라 1개 상태 컨테이너**: client+runtime+gateways(auth/channel/chat/device)+store 3종+collector 조립/파괴. SDK 결합 집중.                                         |
| `store/store.ts`, `store/domain-stores.ts`                        | 동일                          | 복사               | 반응형 스토어(device/channel/chat 스냅샷).                                                                                                                          |
| `metrics/e2e-collector.ts`                                        | 동일                          | 복사               | E2E p50/p95·RTT 수집(markSend t0 기준).                                                                                                                             |
| `hooks/use-client-container.ts`, `use-metrics.ts`, `use-store.ts` | 동일                          | 복사               | React 바인딩(스토어 구독).                                                                                                                                          |
| `components/*` (11)                                               | `components/*`                | 복사+styles import | ActionsTabs·ChannelActions·ChatActions·ClientCard·ConnectionPane·DeviceActions·ErrorBoundary·InventoryRail·MetricsPane·ModeBar·SyncSection.                         |
| `demo-model.ts`                                                   | 동일                          | 복사+import 재작성 | 도메인 타입/헬퍼(`DemoConnectionDraft`·`pushLogEntry`·`toDeviceBody`…).                                                                                             |
| `lab-model.ts`, `lab-runner.ts`                                   | 동일                          | 복사               | 랩 유틸(percentile 등)·랩 하니스.                                                                                                                                   |
| `model/endpoint-presets.ts`                                       | 동일                          | 복사+env 경유      | dev wsUrl/restBase 프리셋(`import.meta.env`).                                                                                                                       |
| `inventory/users-api.ts`                                          | `inventory/`                  | **선택 교체/생략** | InventoryRail은 `containers`에서 device/channel을 집계하므로 이 파일은 **유저 보강용(선택)**. 미서명 `GET /users` → signed web-core `fetchUsers`로 대체하거나 생략. |
| `styles.css`                                                      | `styles.css`                  | 복사 그대로        | UI 옵션 A.                                                                                                                                                          |
| `App.tsx`                                                         | `pages/SocketLabPage.tsx`     | 흡수+개조          | topbar/hero 제거, `PrivateLayout` 내부 셸로.                                                                                                                        |
| `main.tsx`, `env.d.ts`                                            | —                             | **제외**           | admin 엔트리/vite가 대체.                                                                                                                                           |
| (신규)                                                            | `routes/index.tsx`            | 신규               | `SocketLabRoutes`(`<Routes>`).                                                                                                                                      |
| (신규)                                                            | `index.tsx`                   | 신규               | feature 배럴(socket-test 패턴).                                                                                                                                     |

## SDK import 재작성 (3종 → 1)

| demo 딥 import                                                   | →                                |
| ---------------------------------------------------------------- | -------------------------------- |
| `../../../src/client-socket-v2` (게이트웨이·sync plan·다수 타입) | `@lemoncloud/chatic-sockets-lib` |
| `../../../src/lib/auth/types` (`AuthUpdateResponseData`)         | `@lemoncloud/chatic-sockets-lib` |
| `../../../src/lib/types` (`SocketMessage`)                       | `@lemoncloud/chatic-sockets-lib` |

**이식 주의(0.4.2 실측):**

- `createAuthGateway(client).update(data)`는 입력 `AuthUpdateInput`(`{token?,dryRun?}`), 응답 `AuthUpdateResponse`(데이터에 `authId/state/connId/deviceId`). demo 호출부 `update({ token })`와 정합.
- `createChannelGateway`/`createChatGateway` 메서드는 응답이 **제네릭 `<T=unknown>` pass-through**(chatic-socials-api 소유). demo 호출부가 이미 타입 주입/캐스팅을 하므로 그대로 이식하되, 컴파일 시 `unknown` narrowing 누락에 주의.

## 상태/소유 모델

- **SocketLabPage**(컨테이너): N개의 `ClientContainer` 인스턴스를 생성·보유·파괴. 인벤토리 데이터(react-query) 보유.
- **ClientContainer**(React 밖, per-client): raw `createClientSocketV2` 1개 + runtime + gateway 4종 + store 3종 + E2ECollector. 클라이언트끼리 **완전 독립**(싱글톤 공유 금지 — 멀티클라 보장).
- **hooks**: `use-client-container`로 컨테이너 수명 관리, `use-store`/`use-metrics`로 스토어·메트릭 구독 → 컴포넌트 리렌더.
- **정리**: SocketLabPage unmount/HMR 시 모든 ClientContainer.`disconnect()`/`dispose()` 호출(누수 금지).

## 데이터 모델링 (핵심 타입, demo-model 기준)

| 타입                                                     | 출처                | 설명                                                                              |
| -------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------- |
| `DemoConnectionDraft`                                    | demo-model          | 연결 설정(wsUrl, keepAlive/reconnect/rotation/sync 간격 등). ConnectionPane 입력. |
| `DeviceDraft` / `DeviceBody` / `DeviceSeed`              | demo-model / SDK    | device 액션 입력·정규화 결과.                                                     |
| `DemoChannelView` / `DemoChatView` / `DemoChannelStereo` | demo-model          | channel/chat 액션·뷰 모델.                                                        |
| `DeviceSnap` / `ChannelSnap` / `ChatSnap`                | store/domain-stores | 도메인별 스토어 스냅샷(렌더 단위).                                                |
| `DemoLogEntry`                                           | demo-model          | 클라이언트별 로그 1건(level/key/detail/ts).                                       |
| `ContainerEvent`                                         | client-container    | 컨테이너 → 구독자 이벤트(`state`/`log`/`sync-targets`).                           |
| `AuthUpdateResponseData`                                 | SDK(lib/auth/types) | auth.update 응답(authId/state).                                                   |

## ID / 참조 포맷

| 맥락            | 포맷                          | 예                             |
| --------------- | ----------------------------- | ------------------------------ |
| 라우트          | `/socket-lab/*`               | usePrivateRoutes defaultRoutes |
| client 인스턴스 | `ClientContainer.id`(opts.id) | 멀티클라 식별                  |
| device          | `deviceId` / `connId`         | 인벤토리 공존 확인(AC2)        |

## 모듈 책임 (use-case 대체 — 프론트 모듈 분해)

| 모듈                          | 트리거                           | 책임                                                                                                                  |
| ----------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `runtime/client-container.ts` | SocketLabPage가 client 추가/연결 | raw client+runtime+gateway 4종+store 3종+collector 조립, connect/disconnect/dispose, gateway 액션(updateAuth 등) 노출 |
| `store/*`                     | 소켓 메시지 수신                 | 도메인 스냅샷 갱신, gap-drop 시 수신 누락 시뮬레이션                                                                  |
| `metrics/e2e-collector.ts`    | 송/수신                          | markSend(t0)·기록, p50/p95·RTT 산출                                                                                   |
| `components/InventoryRail`    | 컨테이너 store 변화 구독         | **N개 컨테이너의 deviceStore/channelStore를 ephemeral 집계** 표시(외부 API 비소비). prop = `{ containers }`.          |
| `inventory/*` (선택)          | InventoryRail "users" 보강 버튼  | 선택적 유저 보강 — signed web-core `fetchUsers` 또는 생략                                                             |
| `pages/SocketLabPage.tsx`     | 라우트 진입                      | N ClientContainer 수명 관리, 레이아웃, 정리                                                                           |

## 구조

```
apps/admin/src/app/features/socket-lab/
├── index.tsx                 # feature 배럴
├── routes/index.tsx          # SocketLabRoutes (<Routes>)
├── pages/SocketLabPage.tsx   # 셸(App.tsx 흡수, PrivateLayout 적응)
├── runtime/client-container.ts
├── store/{store,domain-stores}.ts
├── metrics/e2e-collector.ts
├── hooks/{use-client-container,use-metrics,use-store}.ts
├── components/ (11)
├── inventory/                # admin signed 배선(교체)
├── model/endpoint-presets.ts # env 경유
├── demo-model.ts, lab-model.ts, lab-runner.ts
└── styles.css
```

## 시스템 흐름

```mermaid
flowchart TD
    Route["/socket-lab/* (AuthGuard·PrivateLayout)"] --> Page[SocketLabPage]
    Page -->|N개 생성/파괴| CC[ClientContainer × N]
    subgraph 각 ClientContainer (독립)
      direction TB
      RC[raw createClientSocketV2 + runtime] --> GW[auth/channel/chat/device gateway]
      RC --> ST[device/channel/chat store]
      RC --> EC[E2ECollector]
    end
    CC --> RC
    GW -->|auth.update token| WS[(dev WS gateway)]
    RC <-->|messages / device.sync| WS
    ST -->|use-store| UI[components: ClientCard·ActionsTabs·SyncSection·MetricsPane…]
    EC -->|use-metrics| UI
    ST -->|store 집계 구독| RailUI[InventoryRail]
    Opt[선택: signed fetchUsers] -.유저 보강.-> RailUI
    UI -.gap-drop toggle.-> ST
```

## 설계 대안

### A안 — dou-app 내 createDomainGateway 범용 대체 (폐기)

0.4.2가 특화 게이트웨이를 제공하므로 불필요. 범용 대체는 SDK 로직 중복·취약성으로 비채택.

### B안 — device-only 1차 이식 (보류)

0.4.2로 풀 이식이 가능해 device-only 축소 불필요. (SDK가 device만 지원했다면 채택했을 fallback.)

### C안 — 독립 Nx 앱 `apps/socket-lab` (폐기)

admin이 세션·인벤토리·vite 환경을 이미 갖춰 별도 앱은 중복. feature가 우월.

## 변경 파일

- **신규**: `apps/admin/src/app/features/socket-lab/**` (위 구조 전체).
- **수정**: `apps/admin/src/app/routes/private/usePrivateRoutes.tsx`(라우트 1줄+import), `apps/admin/src/app/shared/config/menuConfig.ts`(사이드바 'Socket Lab' 등록), 루트 `package.json`(SDK 0.4.2), `.env`(VITE_WS_ENDPOINT, 필요 시).
- **제외**: demo `main.tsx`/`env.d.ts`(admin 대체).

## 구현 반영 (자기검증 후 변경 — 2026-06-29)

- **인벤토리 users 보강 = 드롭**: `inventory/users-api.ts` 미서명 `GET /users`는 spec 계약 위반이라 제거. InventoryRail은 **컨테이너 store 집계만**(참여자 관점). `inventory/` 디렉터리 삭제, `UserHead` 타입 인라인. (signed web-core `fetchUsers`는 composite stale-dist로 tsc 미해소 → 드롭 선택.)
- **lab-runner 제거**: 부하 시나리오 하니스(out-of-scope·UI 미배선) `lab-runner.ts` 삭제. `lab-model.ts`(percentile)는 유지.
- **dev 프리셋 항상 노출**: `VITE_WS_ENDPOINT` 미설정 시 `example.com` placeholder로 dev 프리셋 유지(드롭다운에서 사라지지 않음).
- **spec 4개 이식**: `demo-model/store/e2e-collector/lab-model.spec.ts`(vitest) → 23/23 통과. `lab-runner.spec`은 제외(모듈 제거).
- **사전 차단 버그 수정**: `libs/web-core/src/transport/webTransport.ts`의 `setStorageAdapter` import를 `@chatic/shared`(없음)→`../core/coreStorage`(존재)로. dev 서버 부팅 차단이던 사전 버그(socket-lab 무관).
- **AC4 caveat**: catch-up 카운터(`E2ECollector.incCatchUp`)는 demo 원본부터 프로덕션 미배선(spec에서만 호출) → MetricsPane catch-up 표시는 비기능. 정량 가시화하려면 client-container의 device.sync 적용부에서 `incCatchUp()` 호출 추가 필요(후속).
