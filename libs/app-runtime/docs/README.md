# app-runtime 문서

`libs/app-runtime`는 상위 세션 레이어(`@chatic/web-core`)가 제공한 `RuntimeBinding`을 받아
**socket transport · session/auth · sync · data**를 조립하는 composition root다.

transport 계층은 2개 manager 축으로 정리된다 — `SocketManager`(소켓 생성/교체), `SyncManager`(sync runtime 생성/조작).
인증 수명주기는 SDK `AuthController`(`client.auth`)가 소유하고, bootstrap 시퀀싱은 `SocketBinder`가 호출하는 순수 함수가 담당한다. 상세 규칙과 소유 경계는 [architecture.md](./architecture.md)가 정본이다.

## 시작 지점

- [architecture.md](./architecture.md) — 목표 아키텍처, manager 2축 + SDK 인증 소유 규칙, 모듈 구조, 정렬 상태 (**전체 그림은 여기부터**)
- [public-surface.md](./public-surface.md) — 앱이 사용하는 공개 API 표면 / 노출하지 않는 내부

## 기능 폴더

| 폴더                                    | 개요(README)                                                                 | 그 외 문서                                                                                                                                                                                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [runtime/](./runtime/README.md)         | composition root, `RuntimeBinding`, binder 역할                              | [session-lifecycle.md](./runtime/session-lifecycle.md) — Host 마운트 라이프사이클                                                                                                                                                                          |
| [socket/](./socket/README.md)           | `SocketManager` 듀얼 슬롯·active-facade, bootstrap·reauth·switch/logout 헬퍼 | —                                                                                                                                                                                                                                                          |
| [socket/auth/](./socket/auth/README.md) | SDK `AuthController`(`client.auth`) 소유·표면·부팅/재인증 배선               | [usage.md](./socket/auth/usage.md) — 배선/사용 패턴·트러블슈팅 · [signing.md](./socket/auth/signing.md) — per-kind authId/sign/writeback 계약                                                                                                              |
| [socket/sync/](./socket/sync/README.md) | sync 도메인 스펙, `SyncManager` 소유 경계                                    | [usage.md](./socket/sync/usage.md) · [chat-sync.md](./socket/sync/chat-sync.md) · [device-sync.md](./socket/sync/device-sync.md) · [library-internals.md](./socket/sync/library-internals.md) · [gateway-reference.md](./socket/sync/gateway-reference.md) |
| [data/](./data/README.md)               | repository / local·remote data source 조립                                   | [context-design.md](./data/context-design.md) — 전역/요청 context 분리 설계                                                                                                                                                                                |
| [push/](./push/README.md)               | 디바이스 토큰 등록 훅, `DeviceTokenDelegate` 주입 계약, force+스로틀 전략    | —                                                                                                                                                                                                                                                          |

## 문서 규칙

- 각 폴더의 `README.md`가 그 도메인의 개요다. 시나리오·중요사항·레퍼런스는 같은 레벨의 별도 파일로 둔다.
- 같은 사실은 한 곳(정본)에만 쓰고 나머지는 링크한다 — 정렬 상태·소유 규칙(manager 2축 + SDK 인증)은 [architecture.md](./architecture.md), plan 패밀리는 [sync/library-internals.md](./socket/sync/library-internals.md), 게이트웨이 타입은 [sync/gateway-reference.md](./socket/sync/gateway-reference.md).
