# web-core 문서

`web-core`는 웹 클라이언트가 공통으로 사용하는 런타임 경계입니다.

## 기능 폴더

`session`이 relay/cloud/identity를 묶는 통합 경계이므로 문서는 session부터 읽는 것을 권한다.

| 폴더                                | 개요(README)                                                   | 그 외 문서                                                                                                                                                                                                                                  |
| ----------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [session/](./session/README.md)     | 전역 세션 read model — relay/cloud/identity/active server 조합 | [context-model.md](./session/context-model.md) — 컨텍스트 정의·source of truth · [session-scenarios.md](./session/session-scenarios.md) — 전환/갱신/소켓 인증/초대 시나리오 · [public-api.md](./session/public-api.md) — 공개 세션 API 계약 |
| [transport/](./transport/README.md) | transport 계층의 역할과 경계                                   | [runtime-model.md](./transport/runtime-model.md) — runtime 모델·init 규칙 · [request-lifecycle.md](./transport/request-lifecycle.md) — request builder·auth 흐름                                                                            |
| [hooks/](./hooks/README.md)         | hook 분류 원칙·폴더 구조·정리 방향                             | [public-surface.md](./hooks/public-surface.md) — 공개 hook/surface 규칙(로직↔hook 매핑) · [orchestration.md](./hooks/orchestration.md) — lifecycle/loop hook 동작 정책                                                                     |

## 범위

이 문서 세트는 `session` 계층부터 시작합니다. 이유는 `session`이 아래 요소들을 연결하는 통합 경계이기 때문입니다.

- relay 런타임 상태
- cloud 런타임 상태
- identity raw 상태
- hook, API 모듈 같은 외부 소비자

주요 코드 기준:

- `libs/web-core/src/session`
- `libs/web-core/src/session/core/cloudCore.ts`
- `libs/web-core/src/session/core/relayCore.ts`
- `libs/web-core/src/session/core/identityCore.ts`
- `libs/web-core/src/hooks`
