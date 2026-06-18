# web-core 문서

`web-core`는 웹 클라이언트가 공통으로 사용하는 런타임 경계입니다.

## 문서 목록

- [session/README.md](./session/README.md): `session` 계층의 역할과 경계
- [session/context-model.md](./session/context-model.md): 컨텍스트 정의와 source of truth
- [session/session-scenarios.md](./session/session-scenarios.md): 토큰 전환, 갱신, 소켓 인증, 초대 흐름
- [session/public-api.md](./session/public-api.md): 공개 세션 API 계약

## 범위

이 문서 세트는 `session` 계층부터 시작합니다. 이유는 `session`이 아래 요소들을 연결하는 통합 경계이기 때문입니다.

- relay 런타임 상태
- cloud 런타임 상태
- identity raw 상태
- hook, API 모듈 같은 외부 소비자

주요 코드 기준:

- `libs/web-core/src/session`
- `libs/web-core/src/core/cloudCore.ts`
- `libs/web-core/src/core/relayCore.ts`
- `libs/web-core/src/core/identityCore.ts`
- `libs/web-core/src/hooks/session.ts`
