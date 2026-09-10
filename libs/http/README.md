# @chatic/http

HTTP 실행 계층. 요청을 실제로 보내는 실행기와, 그 위에 얹히는 정책(리트라이·타임아웃·에러 분류·
네트워크 로깅·`bypass`), 그리고 도메인별 게이트웨이를 갖는다.

두 가지만 기억하면 된다.

- **`@chatic/*` 런타임 의존이 0이다.** `import.meta`도 읽지 않는다. 환경·세션·로거는 전부
  `HttpRuntimePorts`로 주입받고, 그 포트를 세션에 묶는 것은 `@chatic/app-runtime`의
  `http/factory.ts` 하나다. `gateways/refreshAbsence.spec.ts`가 "이 lib에는 refresh 경로가
  없다"를 부재 검사로 지킨다.
- **redact는 이 lib이 하지 않는다.** `withNetworkLog`는 원시 필드를 `HttpLogSink`에 넘기고,
  마스킹·절단은 sink 구현(`@chatic/logger`를 쓰는 조립부)이 한다. 의존 0을 지키려고 ADR 스케치와
  의도적으로 갈라선 지점이다.

문서 정본은 [docs/architecture.md](./docs/architecture.md)다 — 포트 계약, 실행기와 lemon adapter,
봉인 부팅, 게이트웨이 배치, 그리고 `@chatic/web-core`에서 이관되던 시절의 기록.
