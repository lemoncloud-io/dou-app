# app-runtime 문서

`libs/app-runtime`는 앱이 보는 **유일한 런타임 창구**다. 세션을 소유하고, 그 세션으로부터
**socket transport · HTTP · sync · data**를 조립하는 composition root다.

축은 다섯이다 — `session/store`(세션 SSoT) · `SocketManager`(소켓 생성/교체) ·
`HttpManager`(HTTP 실행기) · `SyncManager`(sync runtime) · `DataManager`(repository 그래프).
인증 수명주기는 SDK `ClientSocketAuth`(`client.auth`)가 소유하고, bootstrap 시퀀싱은
`SocketBinder`가 호출하는 순수 함수가 담당한다. 상세 규칙과 소유 경계는
[architecture.md](./architecture.md)가 정본이다.

## 시작 지점

- [architecture.md](./architecture.md) — 확정 아키텍처, 5축 소유 규칙, 스코프 세 뷰, 모듈 구조 (**전체 그림은 여기부터**)
- [public-surface.md](./public-surface.md) — 앱이 사용하는 공개 API 표면 / 노출하지 않는 내부

## 기능 폴더

| 폴더                                    | 개요                                                                         | 그 외 문서                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [session/](./session/architecture.md)   | 세션 허브 — store·auth·scope·hooks, refresh 소유, `ActiveScope`              | —                                                                                                                                                                                                                                                                                                                                   |
| [runtime/](./runtime/README.md)         | value-deriving 훅, `RuntimeBinding`, binder 역할                             | [session-lifecycle.md](./runtime/session-lifecycle.md) — Host 마운트 라이프사이클                                                                                                                                                                                                                                                   |
| [socket/](./socket/README.md)           | `SocketManager` 듀얼 슬롯·active-facade, bootstrap·reauth·switch/logout 헬퍼 | [kind-scoped-routing.md](./socket/kind-scoped-routing.md) — relay/cloud kind 고정 라우팅                                                                                                                                                                                                                                            |
| [socket/auth/](./socket/auth/README.md) | SDK `ClientSocketAuth` 소유·표면·부팅/재인증 배선                            | [usage.md](./socket/auth/usage.md) — 배선/사용 패턴·트러블슈팅 · [signing.md](./socket/auth/signing.md) — per-kind authId/sign/writeback 계약                                                                                                                                                                                       |
| [socket/sync/](./socket/sync/README.md) | sync 도메인 스펙, `SyncManager` 소유 경계                                    | [usage.md](./socket/sync/usage.md) · [chat-sync.md](./socket/sync/chat-sync.md) · [device-sync.md](./socket/sync/device-sync.md) · [library-internals.md](./socket/sync/library-internals.md) · [gateway-reference.md](./socket/sync/gateway-reference.md) · [screen-registration-map.md](./socket/sync/screen-registration-map.md) |
| [data/](./data/README.md)               | repository / local·socket·http data source 조립, 캐시 라우팅                 | [cache-storage-routing.md](./data/cache-storage-routing.md) (ADR-0051) · [cache-contract-versions.md](./data/cache-contract-versions.md) (ADR-0053) · [invite-local-cache.md](./data/invite-local-cache.md) (ADR-0052) · [invite-cloud-durability.md](./data/invite-cloud-durability.md)                                            |
| [push/](./push/README.md)               | 디바이스 토큰 등록 훅, `DeviceTokenDelegate` 주입 계약, force+스로틀 전략    | —                                                                                                                                                                                                                                                                                                                                   |

`http/`는 별도 폴더 문서를 두지 않는다 — app-runtime 쪽 조립 규칙은
[architecture.md §HttpManager](./architecture.md#4-httpmanager-http)가, 실행기·서명·정책의 구현은
[`libs/http/docs/architecture.md`](../../http/docs/architecture.md)가 소유한다.

## 문서 규칙

- 각 폴더의 개요 문서(대개 `README.md`)가 그 도메인의 진입점이다. 시나리오·중요사항·레퍼런스는
  같은 레벨의 별도 파일로 둔다.
- 같은 사실은 한 곳(정본)에만 쓰고 나머지는 링크한다 — 소유 규칙·스코프 세 뷰는
  [architecture.md](./architecture.md), 세션 내부는 [session/architecture.md](./session/architecture.md),
  plan 패밀리는 [sync/library-internals.md](./socket/sync/library-internals.md), 게이트웨이 타입은
  [sync/gateway-reference.md](./socket/sync/gateway-reference.md).
- **결정의 근거는 ADR이 소유한다.** 이 폴더는 "지금 어떻게 되어 있는가"만 쓴다. 왜 그렇게 됐는지는
  [ADR-0070](../../../docs/adr/0070-app-runtime-session-hub.md)을 링크한다.
