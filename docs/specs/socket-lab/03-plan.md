# socket-lab — 구현 플랜

> 요구사항: [`00-requirement.md`](./00-requirement.md) · 계약: [`01-spec.md`](./01-spec.md) · 디자인: [`02-design.md`](./02-design.md). 본 문서는 **파일 단위 작업·의존 순서·검증·리스크**. (lemon-plan 산출물 — stage 4 게이트에서 정합 검토 예정.)

## 참조 (코드 확인 완료)

- `apps/admin/src/app/routes/private/usePrivateRoutes.tsx:10-17` → `defaultRoutes` 배열, `{ path: '/x/*', element: <XRoutes /> }` 패턴.
- `apps/admin/src/app/features/socket-test/` → feature 레이아웃 정본(`api/ components/ hooks/ pages/ routes/ types/ index.tsx`). `routes/index.tsx`는 `<Routes>` export.
- `apps/admin/src/app/features/socket-test/api/deviceApi.ts:162-186` → `fetchDeviceList(params): Promise<DeviceListResponse>`, webCore signed. **인벤토리 재사용 지점.**
- `libs/web-core/src/api/users.ts:22-28` → `fetchUsers(params): Promise<ListResult<UserView>>` (유저별 그룹화는 보류, 차후 사용).
- `apps/admin/vite.config.mts:76-85` → `process.env:{}`(상시) + `global:'window'`(dev) shim **이미 존재**(추가 작업 0).
- `apps/admin/src/app/app.tsx` → `QueryClientProvider` 존재(react-query 재사용 가능).
- demo 소스(이식 대상): chatic-sockets-api `stash@{0}` `demo/src/**`. 정본 트리(refactor 후):
    - `App.tsx`, `main.tsx`, `env.d.ts`, `styles.css`
    - `runtime/client-container.ts` (SDK 결합 집중 — 클라 1개 상태 컨테이너)
    - `store/{store.ts, domain-stores.ts}`, `metrics/e2e-collector.ts`
    - `hooks/{use-client-container, use-metrics, use-store}.ts`
    - `components/` 11개: `ActionsTabs ChannelActions ChatActions ClientCard ConnectionPane DeviceActions ErrorBoundary InventoryRail MetricsPane ModeBar SyncSection`
    - `demo-model.ts`, `lab-model.ts`, `lab-runner.ts`, `inventory/users-api.ts`, `model/endpoint-presets.ts`
    - (구 flat UI `demo-client-panel/device-roster/hardening-panel/lab-panel`은 refactor로 제거됨 — 이식 대상 아님)

## SDK import 재작성 (C3) — 3종 → 1

demo 딥 import 3종을 전부 `@lemoncloud/chatic-sockets-lib` main 엔트리로:

| demo 딥 import                  | 사용 심볼                                                                                                                                                                                                                                                                                                                   | →                                |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `../../../src/client-socket-v2` | `createClientSocketV2 createDeviceRuntime createAuthGateway createChannelGateway createChatGateway ChannelSyncPlan ChatSyncPlan` + types `AuthGateway ChannelGateway ChatGateway DeviceGateway ClientSocketState DeviceSocketRuntime DeviceSyncTarget DeviceView DeviceBody DevicePlatform DeviceSeed SyncTargetDescriptor` | `@lemoncloud/chatic-sockets-lib` |
| `../../../src/lib/auth/types`   | `AuthUpdateResponseData`                                                                                                                                                                                                                                                                                                    | `@lemoncloud/chatic-sockets-lib` |
| `../../../src/lib/types`        | `SocketMessage`                                                                                                                                                                                                                                                                                                             | `@lemoncloud/chatic-sockets-lib` |

## ✅ SDK export 도달성 — 해소됨 (0.4.2 게시본 실측 완료)

이전 블로커(0.1.0/0.2.0엔 auth/channel/chat 게이트웨이·sync plan 부재)는 **0.4.2(현재 latest)에서 전부 해소**. 게시 tarball 실측 결과 demo가 쓰는 **21개 심볼 전부**가 dist에 존재하고 main 엔트리(`.`)에서 재노출됨:

- 게이트웨이: `createAuthGateway`/`createChannelGateway`/`createChatGateway`/`createDeviceRuntime` + 타입 `AuthGateway`/`ChannelGateway`/`ChatGateway`/`DeviceGateway`
- sync plan: `ChannelSyncPlan`/`ChatSyncPlan`/`DeviceSyncPlan`/`DeviceSyncTarget`/`SyncTargetDescriptor`
- 타입: `AuthUpdateResponseData`(lib/auth/types), `SocketMessage`(lib/types), `DeviceBody`/`DeviceSeed`/`DeviceView`/`DevicePlatform`(lib/device/contracts), `ClientSocketState`, `DeviceSocketRuntime`
- exports map은 여전히 `['.', './package.json']`만(딥 import 차단) → 위 import 재작성 필수. 단 모든 심볼이 `.`에 재노출되므로 main 엔트리로 충분.

→ **createDomainGateway fallback / device-only 스코핑 불필요. 클린 1:1 이식.**

## 작업 순서 (슬라이스)

### S0 — demo 소스 고정/추출 + SDK 0.4.2 bump + 회귀 · **선행**

1. **demo 정본 고정+추출**: demo는 dou-app에 없음 — chatic-sockets-api `stash@{0}`(`feat/demo-verification-tool`, **휘발성 stash**)에 존재. 착수 전 안정 브랜치/태그로 **고정**(stash apply→commit) 후, 거기서 `demo/src/**`(nested 트리)를 dou-app `apps/admin/src/app/features/socket-lab/`로 복사. (현재 dou-app 워킹트리의 구 flat 버전과 혼동 금지 — 정본은 nested 트리.)
2. **SDK bump**: 루트 `package.json`의 `@lemoncloud/chatic-sockets-lib`를 `0.4.2`로 → `yarn install` → `node_modules/.../package.json` version=0.4.2 확인. (lock은 현재 0.2.0이라 갱신됨.)
3. **회귀(1순위 리스크)**: 0.2.0→0.4.2 major 점프, 기존 소비처가 마이그레이션 중. `nx typecheck`+`nx test`+`nx build` for `admin`, `web-core`, `app-runtime`(`libs/socket`·`libs/data` 포함), `testbed`. 특히 기존 SDK 사용 파일의 API 변경 여부 확인: `libs/app-runtime/src/socket/SocketManager.ts`, `libs/socket/src/hooks/useWebSocketV2.ts`, `libs/data/src/data/remote/clients.ts`, `apps/testbed/.../RuntimeOverlay.tsx`.

- 검증: 위 4개 typecheck/test/build green. 회귀 발견 시 해당 lib 소유자와 조율(별도 이슈).

### S1 — 스캐폴딩 + 라우트 등록

4. `apps/admin/src/app/features/socket-lab/` 생성(socket-test 레이아웃 미러): `routes/index.tsx`(`SocketLabRoutes` = `<Routes>`), `pages/SocketLabPage.tsx`(빈 셸, PrivateLayout 내부 — topbar/hero 없음), `index.tsx`.
5. `usePrivateRoutes.tsx` `defaultRoutes`에 `{ path: '/socket-lab/*', element: <SocketLabRoutes /> }` **1줄** 추가 + import.

- 검증: `nx serve admin` → http://localhost:5001/socket-lab 진입(AuthGuard 통과 후 빈 셸 렌더).

### S2 — 랩 엔진 이식 (non-UI)

6. 다음 파일 복사 + import 재작성: `demo-model.ts`, `lab-model.ts`, `lab-runner.ts`, `store/{store,domain-stores}.ts`, `metrics/e2e-collector.ts`, `runtime/client-container.ts`, `hooks/{use-client-container,use-metrics,use-store}.ts`. (spec 파일은 함께 이식 — S6에서 실행.)

- 검증: `nx typecheck admin`(또는 build) green — SDK 심볼 전부 해소.

### S3 — UI 이식

7. `components/` 11개 + `styles.css` 복사(import 재작성). `App.tsx` 내용을 `SocketLabPage.tsx`로 흡수하되 **topbar/hero 제거**, PrivateLayout에 맞춤. `main.tsx`/`env.d.ts`는 admin이 대체 → 이식 제외.

- 검증: `nx serve admin` → /socket-lab 랩 UI 렌더, 콘솔 에러 0.

### S4 — 인벤토리 배선 (R7, 유저 그룹화 보류)

8. `InventoryRail`은 **N개 컨테이너의 deviceStore/channelStore를 ephemeral 집계**해 표시(외부 device-list API 비소비) → prop `{ containers }`로 그대로 이식. demo `inventory/users-api.ts`(미서명 `GET /users`)는 **선택적 유저 보강**일 뿐 → signed web-core `fetchUsers`로 대체하거나 생략. 유저별 device 그룹화는 `UserView.Devices` 도입 시로 보류.

- 검증: 레일에 랩이 띄운 참여 device/channel 집계 표시. (유저 보강 채택 시 signed 호출 동작.)

### S5 — dev 엔드포인트 프리셋 (R8)

9. `model/endpoint-presets.ts`의 dev `wsUrl`/`restBase`를 **소스 하드코딩 대신 `import.meta.env` 경유**(admin 기존 `VITE_WS_ENDPOINT` 패턴, `deviceApi.ts:158` 일관). 팀 `.env`로 실값 주입(`wss://wss.eureka.codes/cht-d1` 계열). 번들에 dev 인프라 주소 노출 최소화.

- 검증: dev 프리셋 선택 → 실제 connect 성공.

### S6 — 통합 검증

AC 정의는 [`00-requirement.md` §수용 기준](./00-requirement.md) 참조. 10. `nx serve admin` 수동 시나리오:

- **AC2**(멀티클라+인벤토리): N개 독립 클라 connect → InventoryRail에 참여 device/channel 집계. (보조: admin socket-test 관찰자 목록에도 동일 `deviceId`/`connId`가 green으로 보이면 공존 확인.)
- **AC3**: 메시지 송수신 시 client별 E2E p50/p95·RTT 패널 갱신.
- **AC4**(gap-drop): 토글 ON → 수신 유실 후 다음 `device.sync` 적용으로 스토어 스냅샷이 서버 스냅샷과 sync 1~2주기 내 일치(catch-up). OFF 대비 차이 관찰.
- 토큰 출처 확정(인증, 리스크 RK3): 수동 입력 vs admin identityToken 재사용.

11. `nx test admin` — 이식 spec(store/metrics/sync-plan 등) 포함 통과(AC5).

- 검증: AC1~AC5 전부 충족.

## 리스크

> 리스크 ID는 요구사항 `R#`와 구분해 `RK#` 사용.

| #   | 리스크                                                                                                                                                                                                                                                                                     | 대응                                                                                                | 단계  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ----- |
| RK1 | ~~SDK auth/channel/chat export 미도달~~ **해소** — 0.4.2 게시본에 21개 심볼 전부 존재·재노출 확인                                                                                                                                                                                          | —                                                                                                   | —     |
| RK2 | **SDK bump 회귀** (최상, 차단 의존성) — 0.2.0→0.4.2 major 점프, app-runtime/web-core/testbed가 마이그레이션 중이라 영향 큼. green 아니면 S1 이후 불가(0.2.0 fallback 없음 — 게이트웨이 부재)                                                                                               | S0에서 4개 lib typecheck/test/build + 기존 SDK 사용 파일 API 변경 확인. 회귀 시 사용자 에스컬레이션 | S0    |
| RK3 | 랩 클라 인증 — demo `updateAuth(token)`는 **운영자가 토큰을 명시 공급**하는 수동 액션(자동 identity 파생 없음). R9("신규 인증 0")과 무충돌. 단 N개 distinct 토큰 출처는 운영상 결정(수동 입력 / admin 자기 identityToken). 수동 토큰이 dev WS auth.update에서 통하는지는 **런타임 미검증** | S2 이식 시 토큰 입력 UI 보존, S6 connect 검증 시 토큰 출처·수용성 확정                              | S2/S6 |
| RK4 | N개 raw 소켓 생명주기 — raw 직접 호출(useWebSocketV2 미사용)이라 자동 정리 없음. 페이지 이탈/HMR 시 소켓 누수 위험                                                                                                                                                                         | ClientContainer의 `disconnect()`/`dispose()`를 페이지 unmount·HMR에서 호출 보장                     | S2/S3 |
| RK5 | UI 체계 이질감(Tailwind/ui-kit vs demo css) — CSS 전역 오염은 콘솔 에러 없이 깨질 수 있음                                                                                                                                                                                                  | 수용(내부 도구). S3에서 시각 확인                                                                   | S3    |
| RK6 | 유저별 device 그룹화 부재                                                                                                                                                                                                                                                                  | 보류(서버 `UserView.Devices` 대기)                                                                  | S4    |

## 다음

- 계약·디자인은 [`01-spec.md`](./01-spec.md)·[`02-design.md`](./02-design.md) 참조(이 plan은 stage 4 게이트에서 정합 검토).
- 바로 구현 → `/lemon-implement` (S0부터)
