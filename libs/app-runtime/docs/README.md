# app-runtime 문서

`libs/app-runtime`는 상위 세션 레이어(`@chatic/web-core`)가 제공한 `RuntimeBinding`을 받아
**socket transport · session/auth · sync · data**를 조립하는 composition root다.

transport 계층은 3축으로 정리된다 — `SocketManager`(소켓 생성/교체), `SocketSessionController`(인증/세션),
`SyncManager`(sync runtime 생성/조작). 상세 규칙과 소유 경계는 [architecture.md](./architecture.md)가 정본이다.

## 시작 지점

- [architecture.md](./architecture.md) — 목표 아키텍처, 3축 소유 규칙, 모듈 구조, 정렬 상태 (**전체 그림은 여기부터**)
- [public-surface.md](./public-surface.md) — 앱이 사용하는 공개 API 표면 / 노출하지 않는 내부

## 기능 폴더

| 폴더                            | 개요(README)                                                         | 그 외 문서                                                                                                                              |
| ------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| [runtime/](./runtime/README.md) | composition root, `RuntimeBinding`, binder 역할                      | [session-lifecycle.md](./runtime/session-lifecycle.md) — Runner / Bootstrap 라이프사이클                                                |
| [socket/](./socket/README.md)   | `SocketManager` / `SocketSessionController`, 인증·401·site 전환 규칙 | —                                                                                                                                       |
| [sync/](./sync/README.md)       | sync 도메인 스펙, `SyncManager` 소유 경계                            | [usage.md](./sync/usage.md) · [library-internals.md](./sync/library-internals.md) · [gateway-reference.md](./sync/gateway-reference.md) |
| [data/](./data/README.md)       | repository / local·remote data source 조립                           | [context-design.md](./data/context-design.md) — 전역/요청 context 분리 설계                                                             |

## 문서 규칙

- 각 폴더의 `README.md`가 그 도메인의 개요다. 시나리오·중요사항·레퍼런스는 같은 레벨의 별도 파일로 둔다.
- 같은 사실은 한 곳(정본)에만 쓰고 나머지는 링크한다 — 정렬 상태·3축 소유 규칙은 [architecture.md](./architecture.md), plan 패밀리는 [sync/library-internals.md](./sync/library-internals.md), 게이트웨이 타입은 [sync/gateway-reference.md](./sync/gateway-reference.md).
