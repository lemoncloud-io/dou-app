# Requirement: socket-lab

**Status:** Confirmed
**Date:** 2026-06-29
**Slug:** socket-lab

## 키 / 컨셉

- **socket-lab**: dou-app `apps/admin`의 어드민 전용 WebSocket 검증 도구(feature). chatic-sockets-api의 검증 데모(`demo/`)를 admin 안으로 이식한 것.
- **참여자 관점 랩**: N개의 독립 client 소켓을 띄워 각각 실제 device/user로 서버에 참여시키고, 그 상호작용·동기화·메트릭을 한 화면에서 관찰한다.
- **상보 도구**: 기존 admin `socket-test`(어드민 소켓 1개로 남의 device를 관찰·disconnect하는 관찰자)와 testbed(단일 세션 풀스택)와 별개. socket-lab은 **다수 참여 클라이언트** 관점.

## 해결하려는 문제

- 현재 admin엔 **여러 클라이언트가 동시에 참여하는 상황**(멀티 디바이스/유저)을 재현·관찰할 도구가 없다. socket-test는 관찰자 1소켓, testbed는 단일 세션.
- WebSocket의 **종단 지연(E2E)·왕복(RTT)·메시지 유실 후 복구(catch-up)** 같은 품질 특성을 수치/재현 가능한 형태로 검증할 수단이 없다.
- 검증 데모는 chatic-sockets-api 레포에만 있어 admin 운영자가 dev 환경에서 바로 쓰지 못한다.

## 요구사항

- **R1** N개 독립 client 소켓을 생성·연결/해제하고, 각 클라이언트별로 auth/channel/chat/device 액션을 수행할 수 있다.
- **R2** 클라이언트별 인증은 운영자가 토큰을 명시 공급하는 방식으로 수행한다(auth.update).
- **R3** 메시지 종단 지연(p50/p95)과 RTT를 수집·표시한다.
- **R4** 수신 메시지를 의도적으로 유실(gap-drop)시키고, 그 뒤 동기화로 상태가 서버와 재수렴(catch-up)하는지 관찰할 수 있다.
- **R5** device 동기화 상태(tracked/viewing/pointer)를 스냅샷으로 표시한다.
- **R6** 클라이언트별 이벤트 로그를 표시한다.
- **R7** 인벤토리: 랩이 띄운 참여 클라이언트들의 device/channel 현황을 한곳에 집계·표시한다(랩-로컬 관점). 유저 정보 보강은 선택.
- **R8** dev 엔드포인트(wsUrl/restBase)를 프리셋으로 선택할 수 있다(local mock / dev).
- **R9** admin 진입 인증(로그인/세션)은 기존 admin 체계를 그대로 사용하며, socket-lab은 신규 인증 흐름을 추가하지 않는다.

## 목표

- chatic-sockets-api demo의 검증 가치(멀티 참여 클라·E2E/RTT·gap-drop)를 admin 운영자가 dev 환경에서 그대로 쓸 수 있게 한다.
- 기존 admin 자산(인증/세션·인벤토리 API·vite 환경)을 최대 재사용하여 신규 코드와 유지비를 최소화한다.
- 기존 socket-test/testbed와 충돌 없이 공존한다.

## 비목표

- **유저별 디바이스 그룹화** — 현 device 데이터에 user 조인 키가 없음. 서버가 추후 `UserView.Devices`로 지원 예정. 그때까지 보류하며, 이번 범위는 flat device 목록 재사용에 한정.
- 신규 로그인/인증/서명 흐름 도입.
- prod 환경 지원(데모는 dev 전용).
- 새로운 백엔드 API 추가/수정.

## 수용 기준 (AC)

구현 완료 판정. 각 AC는 요구사항에 매핑된다.

| AC      | 판정                                                                                                                                          | 매핑          |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| **AC1** | `yarn nx serve admin` → `/socket-lab` 진입(AuthGuard 통과·PrivateLayout 내부 렌더).                                                           | R9            |
| **AC2** | dev 엔드포인트로 N개 클라이언트 connect → 각 클라가 독립 소켓으로 연결되고, 인벤토리에 참여 device가 집계 표시.                               | R1, R7        |
| **AC3** | 메시지 송수신 시 각 client별 E2E p50/p95·RTT 패널이 갱신.                                                                                     | R3            |
| **AC4** | gap-drop ON → 수신 유실 발생 후 다음 `device.sync` 적용으로 스토어 스냅샷이 서버 스냅샷과 sync 1~2주기 내 일치(catch-up). OFF 대비 차이 관찰. | R4            |
| **AC5** | `yarn nx test admin` 통과(이식 spec 포함). SDK 0.4.2 bump 후 web-core/app-runtime/testbed 빌드·테스트 무회귀.                                 | (차단 의존성) |

> 참고: auth/channel/chat·device 게이트웨이 액션(R1·R2)과 device.sync 가시화(R5)·로그(R6)·프리셋(R8)은 AC1~AC4 시나리오 수행 중 함께 확인된다.
