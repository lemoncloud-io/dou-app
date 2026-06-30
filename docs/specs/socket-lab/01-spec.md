# Spec: socket-lab

**Status:** Confirmed
**Date:** 2026-06-29
**Slug:** socket-lab
**Requirement:** [00-requirement.md](./00-requirement.md)
**Design:** [02-design.md](./02-design.md)

## 범위

이 문서는 **계약**(보장·scope)을 고정한다. 모델링·흐름은 [02-design.md](./02-design.md) 참조.

## 핵심 결정

| 결정               | 계약                                                                                                                                                                                                         | 이유                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **위치**           | `apps/admin/src/app/features/socket-lab/`에 **별도 feature**. socket-test에 병합하지 않는다.                                                                                                                 | 관점이 다름(참여자 vs 관찰자). socket-test 자산은 재사용하되 코드 경계는 분리.                                                               |
| **라우트**         | `routes/private/usePrivateRoutes.tsx`의 `defaultRoutes`에 `{ path: '/socket-lab/*', element: <SocketLabRoutes /> }` 1줄 추가. feature는 `<Routes>` 컴포넌트를 export.                                        | admin 기존 feature 등록 패턴과 동일.                                                                                                         |
| **진입 인증**      | admin 기존(`@chatic/web-core` + `AuthGuard` + `PrivateLayout`) 그대로. socket-lab은 신규 인증 코드 0.                                                                                                        | R9. 로그인/서명은 socket-lab 관심사 아님.                                                                                                    |
| **소켓 호출**      | raw `createClientSocketV2`를 **직접** 호출. `@chatic/socket`의 `useWebSocketV2` 래퍼 **사용 금지**.                                                                                                          | 래퍼는 모듈 전역 싱글톤(앱당 소켓 1개)이라 멀티 클라이언트를 깬다.                                                                           |
| **SDK 버전**       | `@lemoncloud/chatic-sockets-lib`를 **0.4.2**(현재 latest)로 bump.                                                                                                                                            | demo가 쓰는 auth/channel/chat 게이트웨이·sync plan·타입이 0.1.0/0.2.0엔 없고 **0.4.2에 전부 포함**(게시본 실측).                             |
| **SDK import**     | demo 딥 import 3종을 전부 main 엔트리 `@lemoncloud/chatic-sockets-lib`로 재작성.                                                                                                                             | 배포본 `exports` map이 `['.', './package.json']`만 → 딥 import 차단. 필요한 21개 심볼 전부 main에서 재노출됨.                                |
| **클라 인증 모델** | 클라이언트별 `updateAuth(token)` — **운영자가 토큰을 명시 공급**(자동 identity 파생 없음).                                                                                                                   | demo 모델 그대로. R2. R9("신규 인증 0")과 무충돌.                                                                                            |
| **UI**             | demo `styles.css` 그대로. 외곽 셸만 admin(`PrivateLayout`)에 맞춤(topbar/hero 제거).                                                                                                                         | 내부 도구라 비주얼 이질감 수용. 로직은 UI와 분리돼 100% 이식 가능.                                                                           |
| **인벤토리**       | InventoryRail은 **N개 랩 컨테이너의 자체 store**(device/channel)를 ephemeral 집계해 표시(외부 device-list API 비소비). demo의 미서명 `GET /users` 보강은 **signed web-core `fetchUsers`로 대체하거나 생략**. | 참여자 관점 — 인벤토리 = 랩이 띄운 참여 device. admin 도메인은 signed 필요. 유저 그룹화 보류와 무충돌(이 컴포넌트는 그룹화 API를 쓰지 않음). |

## 모델 계약 (의존하는 SDK/백엔드 계약)

- **SDK 심볼(0.4.2 main 엔트리에서 도달 보장)**: 게이트웨이 `createClientSocketV2`/`createDeviceRuntime`/`createAuthGateway`/`createChannelGateway`/`createChatGateway`, sync plan `DeviceSyncPlan`/`ChannelSyncPlan`/`ChatSyncPlan`, 타입 `AuthGateway`/`ChannelGateway`/`ChatGateway`/`DeviceGateway`/`DeviceSocketRuntime`/`DeviceSyncTarget`/`SyncTargetDescriptor`/`ClientSocketState`/`SocketMessage`/`AuthUpdateResponseData`/`DeviceBody`/`DeviceSeed`/`DeviceView`/`DevicePlatform`.
- **auth 게이트웨이 계약(0.4.2 실측)**: `createAuthGateway(client): AuthGateway`. `update(data: AuthUpdateInput): Promise<AuthUpdateResponse>` — 입력 `{ token?, dryRun? }`, 응답 데이터(`AuthUpdateResponseData`)에 `connId/deviceId/authId/memberId/state` 포함.
- **channel/chat 게이트웨이 계약(0.4.2 실측)**: 응답이 **제네릭 `<T = unknown>` pass-through**(chatic-socials-api 소유). 호출부에서 응답 타입 주입/narrowing 필요 — 이식 시 demo가 이미 처리(그대로 이식).
- **인벤토리(선택 보강)**: 유저 보강이 필요하면 web-core `fetchUsers(params): Promise<ListResult<UserView>>`(signed). `DeviceView`에 user 조인 키 없음 → 유저별 device 그룹화는 불가(보류 근거).

## 서버 보장 (전제, 본 작업에서 변경 없음)

- dev WebSocket 게이트웨이가 auth.update / channel·chat·device 게이트웨이 액션 및 device.sync(tracked/viewing/pointer)를 지원한다.
- device.sync는 클라이언트가 유실분을 따라잡을 수 있는 동기화 스냅샷을 제공한다(gap-drop catch-up의 서버 측 전제).
- admin signed 요청으로 device 목록을 조회할 수 있다.

## 클라이언트 동기화 계약 (socket-lab이 보장하는 것)

- 각 client 인스턴스는 **서로 독립**된 소켓·런타임·스토어·collector를 가진다(전역 싱글톤 공유 금지).
- gap-drop ON일 때 수신 메시지를 의도적으로 누락시킨다(`shouldHandleMessage`). **catch-up 판정**: drop으로 인해 어긋난 스토어 스냅샷이, 다음 `device.sync` 응답(서버 ground-truth) 적용 후 sync 1~2주기 내에 서버 스냅샷과 일치하면 PASS. ground-truth = 서버 device.sync 스냅샷(별도 비교 소스 불필요 — sync 응답 자체가 정답).
- E2E/RTT 메트릭은 각 client별로 수집되며, 송신 시점(t0) 기준으로 측정한다.
- 페이지 unmount/HMR 시 생성된 모든 raw 소켓을 정리한다(누수 금지).
- **N(동시 클라이언트 수)**: 1차 범위는 소수(예 ≤ 10) 수동 운용을 전제. 대량 N의 dev 게이트웨이 rate-limit·브라우저 동시 WS 한계·collector 메모리 누적은 **이번 범위 밖**(부하 테스트 도구 아님).

## Out of Scope

- 유저별 디바이스 그룹화(서버 `UserView.Devices` 대기).
- 신규 로그인/인증/서명 흐름.
- prod 지원, 백엔드 API 변경.
- SDK 자체 재배포(0.4.2 게시본으로 충족).

## 차단 의존성 (구현 선행 조건)

- **SDK 0.4.2 bump 무회귀**가 socket-lab 전체의 **선행 차단 조건**. 같은 SDK를 쓰는 app-runtime/web-core/testbed가 마이그레이션 중이라 0.2.0(lock)→0.4.2 점프가 이들을 깰 수 있음. bump 회귀 검증(typecheck/test/build)이 green이어야 S1 이후 진행 가능. **회귀 발견 시**: socket-lab 착수 전 해당 소비처를 0.4.2에 맞춰 수정하거나(별도 작업), bump를 미루면 socket-lab 자체가 불가 — 즉 이 의존은 우회 fallback이 없다(0.2.0엔 필요한 게이트웨이가 없으므로). → 회귀 발견 시 사용자 에스컬레이션.
- **demo 정본 보존**: 정본이 외부 레포 chatic-sockets-api `stash@{0}`(휘발성). 이식 착수 전 안정 브랜치/태그로 고정해야 함.

## 재검토 조건

- 서버가 `UserView.Devices`를 지원하면 → 유저별 device 그룹화를 범위에 추가(요구사항/디자인 갱신).
- demo 소스 구조가 정본 기준에서 변경되면 → 이식 매핑 재확인.
