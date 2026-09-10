# @chatic/auth-sign — lemon HMAC 서명 계산

> 관련 ADR: [ADR-0070](../../docs/adr/0070-app-runtime-session-hub.md) (결정 2)

## 목적

lemon HMAC auth 서명 계산의 **단일 소유자**인 플랫폼 비종속 leaf. 소스 5파일 200줄이 전부이고,
런타임 의존은 `crypto-js` 서브모듈 둘뿐이다.

이 서명은 `ClientSocketAuth`의 `auth.refresh`/`auth.update`/`auth.switch` 패킷에 실린다. 한때
HTTP refresh body에도 쓰였지만 그 엔드포인트를 치는 코드가 리포에서 사라지면서 함께 없어졌다 —
지금 소비자는 소켓 sign callback 하나다.

**존재 이유는 순환 회피다** (ADR-0070 결정 4). lemon HMAC을 `@chatic/http`에 두면
`ClientSocketAuth`의 sign callback 배선이 HTTP lib을 소켓 인증 경로로 끌어들이고, 훗날
sockets-lib이 서명 모듈을 직접 물면 `chatic-sockets-lib → @chatic/http`(lemon-web-core adapter까지
통째로) 의존이 생긴다. 서명만 든 leaf면 어느 쪽이 물어도 무해하다.

## 서명식

```
data      = [current, accountId, identityId, '', userAgent].join('&')
signature = base64(hmac(hmac(hmac(data, authId), accountId), identityId))
```

**4번째 슬롯 `''`는 호출 관례가 아니라 식 자체의 불변이다.** lemon-web-core의 자체 구현도 그
자리를 하드코딩한다(identityToken을 실제로 넣는 변형은 별도 export `calcTestSignature`뿐이고
refresh 경로에서 쓰이지 않는다). `SignaturePayload.identityToken`은 호출부 호환용으로 남아
있을 뿐 **식이 읽지 않는다** — 테스트가 그 사실을 단언한다.

`current`는 호출자가 만든다. **서명에 넣은 값과 패킷의 `current`가 같아야** 서버 검증이 통과한다.

## 설계 원칙

- **네트워크·저장 금지.** 이 lib은 refresh 엔드포인트를 모르고, 호출하지 않고, credential을
  저장하지 않는다. 재료 → 문자열의 순수 계산이 전부다.
- **전역 읽기 금지.** `current`·`userAgent`는 **필수 주입 인자**다. 이관 전 구현은 둘을
  `new Date()`/`navigator.userAgent` 기본값으로 읽었는데, RN에는 `navigator.userAgent`가 없거나
  다르고 node 테스트 환경에는 아예 없다. 편의 기본값이 필요하면 조립 지점이 소유한다.
- **endpoint·store·refresh 실행 무지.** `session/store`를 읽는 것은 이 lib이 아니라 소비자다.
  ADR §결정 2의 시퀀스 다이어그램은 `auth-sign → session/store` 화살표를 그리지만, 같은 ADR
  결정 6 표의 "endpoint·store·refresh 실행 무지"와 충돌한다 — **후자가 맞다.**
- **계약은 인터페이스, 구현은 클래스.** `IAuthSigner` + `LemonHmacSigner`. 공유 leaf이므로 계약을
  이 lib이 소유한다 — `@chatic/http`가 `ports.ts`를 자기 소유로 두는 것과 같은 정당화다.

## 구조

```
libs/auth-sign/src/
├── index.ts
├── contracts.ts            SignaturePayload · SignatureContext · AuthSignResult · IAuthSigner
├── purity.spec.ts          의존 0 · 전역 무접근 게이트 (grep 기반)
└── hmac/
    ├── LemonHmacSigner.ts  IAuthSigner 구현
    └── LemonHmacSigner.spec.ts
```

## authId 선택은 lib 밖의 일이다

식은 kind와 무관하게 같고, 다른 것은 **`authId`의 출처뿐**이다.

| 경로       | `authId`       | 나머지 재료                     |
| ---------- | -------------- | ------------------------------- |
| relay 소켓 | **`$auth.id`** | `Token.{accountId, identityId}` |
| cloud 소켓 | `Token.authId` | `Token.{accountId, identityId}` |

relay에서 `Token.authId`를 쓰면 서버가 다른 키로 HMAC을 재계산해 **`no auth model`로 영구
실패**한다. 이 계약은 [signing.md §1](../app-runtime/docs/socket/auth/signing.md)이 커밋 이력과
함께 고정한다. 분기는 `session/store`를 읽어야 하므로 lib 밖에 산다 — 배선은
[`sessionAuthAdapter`](../app-runtime/src/session/auth/sessionAuthAdapter.ts)이고, lib을 부르는
얇은 헬퍼가 [`utils/calcSignature.ts`](../app-runtime/src/session/auth/utils/calcSignature.ts)다.

SDK가 sign callback에 넘기는 `token` 인자는 무시된다(식이 토큰 문자열에 의존하지 않는다).
`ctx.target`(사이트 전환 선택자)도 서명을 바꾸지 않는다 — SDK가 `auth.switch` 패킷에만 싣는다.

## userAgent 주입의 제약

서명 data에 userAgent가 들어가므로 **서명에 넣은 UA와 서버가 검증에 쓰는 UA가 같아야 한다.**
서버 검증 코드는 리포 밖이라 실측하지 못했다 — 웹에서 동작한다는 사실로부터 "서버가 요청의 UA를
쓴다면 브라우저 전송 UA = `navigator.userAgent`라서 일치한다"까지만 추정할 수 있다.

따라서 규칙은 하나다: **조립 지점은 전송 계층이 실제로 보내는 UA를 주입한다.** 웹은
`navigator.userAgent`(WS 핸드셰이크·HTTP 모두 브라우저가 설정), 다른 플랫폼은 그 전송 스택의 UA.
임의 상수 주입은 서버 검증 실패를 낳을 수 있으므로 금지.

## 검증

```bash
cd libs/auth-sign && npx jest
```

- **fixture 테스트** — relay·cloud 각각 고정 재료·고정 시각·고정 UA로 서명 문자열을 **리터럴로**
  박았다. 스냅샷이 아니라 리터럴인 이유는 식이 바뀌면 반드시 빨간불이어야 하기 때문이다. 리터럴
  값은 이 lib도 lemon도 아닌 **제3의 구현**(node 표준 `crypto`)으로 독립 재계산해 확정했다.
- **lemon 동등성 테스트** — 같은 입력에 `@lemoncloud/lemon-web-core`의 `calcSignature`와 결과가
  같음을 단언한다. "이관이 식을 보존했다"의 직접 증명이자, lemon 업그레이드가 서버 계약을 움직이면
  잡아내는 카나리아다. lemon 판은 기본 인자가 navigator를 읽으므로 **인자를 반드시 명시**한다 —
  node 환경에서 기본값 경로는 throw한다.
- **`identityToken` 불변성** — `''`와 임의 문자열의 서명이 같음을 단언한다.
- **전역 무접근 게이트** — 실효 게이트는 `purity.spec.ts`다. 소스에서 `navigator`·`new Date(`
  부재를 grep으로 단언한다(주석은 벗겨내고 검사 — 이 문서의 설계 원칙 서술을 오탐하지 않으려고).

    > **원래 논거 하나가 무너졌다.** jest `testEnvironment: 'node'`(jsdom 아님)를 쓰는 이유는
    > "`navigator`가 없는 환경에서 green인 것 자체가 증명"이었는데, **Node 21부터 전역
    > `navigator`가 생겼다.** 이 리포의 Node 22에서는 `typeof navigator === 'object'`이고,
    > 그것을 단언하던 `LemonHmacSigner.spec.ts`의 "navigator 전역이 없어도 동작한다" 케이스가
    > 지금 **실패한다**(1 failed / 12). 환경이 더 이상 부재를 증명하지 못하므로 남은 보증은 위
    > grep 게이트뿐이다 — 테스트 수정은 별도 작업.

- **의존 0 게이트** — `purity.spec.ts`가 소스에서 `@chatic/*`·`@lemoncloud/*` import 부재를
  단언한다. `@chatic/http`의 `refreshAbsence.spec.ts`와 같은 패턴이다 — 리포에 per-lib ESLint
  `no-restricted-imports` 선례가 없어 grep 테스트로 갔다. 동등성 테스트의 lemon import는 spec
  파일이라 게이트 대상이 아니다.

## 함정 두 가지

**crypto-js 서브모듈 default import.** `esModuleInterop`이 `tsconfig.base.json`에 없어 ts-jest의
CJS 변환 경로에서 `encBase64`/`hmacSHA256`가 `.default` 접근으로 무너진다.
`libs/auth-sign/tsconfig.spec.json`이 `esModuleInterop: true`를 **스코프 한정으로** 갖고 있는
이유다. 같은 문제가 ESM 전용인 `@lemoncloud/lemon-web-core`를 ts-jest가 재변환할 때도 터지므로,
동등성 테스트가 살아나려면 같은 플래그가 필요했다. 이관 전 web-core 사본에도 같은 import가
있었지만 테스트가 `calcSignature`를 통째로 목으로 대체해 **한 번도 실제 실행되지 않았다.**

**buildable lib이 물 leaf의 package.json.** 이 lib을 `package.json`만으로 스캐폴딩하면
`@nx/js/typescript`의 `build` 타깃 추론이 명시적 `main`/`exports`/`targets` 필드를 보고 건너뛴다.
non-buildable 소비자만 물릴 때는 무해하지만, buildable lib이 직접 import하는 순간
`@nx/enforce-module-boundaries`의 "Buildable libraries cannot import from non-buildable" 위반이
난다. 그래서 `package.json`은 `@chatic/http`와 같은 최소 형태(`name`/`version`/`dependencies`/
`private`)로 두고 `project.json`으로 `build` 타깃을 살린다. **앞으로 신설하는 leaf lib도 이
패턴을 따라야 한다.**
