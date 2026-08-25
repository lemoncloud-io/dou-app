# ADR-0029: 에러 리포트 분류·태깅 및 맥락 보강

> 상태: Accepted · 결정일: 2026-07-24

## 맥락 (Context)

프로덕션 모바일(WKWebView) 에러 리포트가 트리아지가 안 되는 상태로 쌓이고 있다. 실제 수집된 3건 예시는 모두 아래 문제를 드러낸다.

- **타이틀이 전부 `[mobile] error`로 동일**하다 ([`common.ts:103`](../../libs/web-core/src/api/common.ts)). Slack 알림과 admin 리포트 목록에서 스크립트 에러인지 네트워크 에러인지 제목만으로 구분이 안 돼, 열어보기 전에는 성격을 알 수 없다.
- **`"Script error."`가 유추 불가능한 형태로 등장**한다. 전역 핸들러 [`app.tsx:22`](../../apps/web/src/app/app.tsx)가 `event.error ?? new Error(event.message)`만 넘기는데, 크로스오리진으로 판정된 스크립트 예외는 `event.error === null`이라 message가 문자 그대로 `"Script error."`가 되고 stack도 `번들URL:line:col` 한 줄뿐이다. 원본 원인을 알 수 없다. (예시의 `url`·`stack`은 모두 동일 오리진 `dou.chatic.io`인데도 opaque하게 지워졌다 → 네이티브 주입 스크립트/서드파티 컨텍스트에서 던진 예외 가능성이 있으나 근본 원인은 미확인.)
- **스로틀 키가 `error.message` 하나**다 ([`common.ts:16`](../../libs/web-core/src/api/common.ts)). `"Script error."`로 뭉뚱그려진 서로 다른 원인들이 한 버킷으로 묶여 60초당 1건만 통과하고 나머지는 소리 없이 버려진다 → 신호 손실.
- **직전 맥락(breadcrumb)이 없다.** 이미 [`libs/logger`의 링버퍼](../../libs/logger/src/core/RingBuffer.ts)가 존재하고 `reportIssue`는 `extras`로 최근 로그를 붙이지만, `reportError`에는 붙지 않는다.
- **`ErrorEvent`의 `filename`/`lineno`/`colno`를 버린다.** 이 세 값은 message가 opaque해도 브라우저가 별도로 채워주는데 현재 핸들러가 폐기한다.

제약:

- 리포트 조립은 [`reportError()` / `reportIssue()`](../../libs/web-core/src/api/common.ts) 한 곳(`libs/web-core`)에 집중돼 있다. 소비 측(admin-v2)은 [`parseReportLog.ts`](../../apps/admin-v2/src/app/features/report-logs/lib/parseReportLog.ts)가 타이틀 대괄호 `[app] error`를 파싱하고, payload는 `[key: string]: unknown`이라 새 필드를 추가해도 그대로 소비한다.
- 이미 `classifyError()`([`transport/error.ts`](../../libs/web-core/src/transport/error.ts))라는 HTTP 중심 분류기가 있으나 리포트에는 쓰이지 않는다.

## 결정 (Decision)

에러 리포트에 **출처/종류 기준의 카테고리를 부여**하고, 타이틀과 payload 양쪽에 노출하며, opaque 에러 대응을 위해 캡처를 개선하고 맥락을 보강한다.

### 포함

1. **분류 체계(6종, 출처/종류 기준)** — HTTP 중심의 기존 `classifyError`와 별개로 다음 category를 정한다:

    | category                         | 판별 기준                                                      |
    | -------------------------------- | -------------------------------------------------------------- |
    | `script-error`                   | `window.onerror`에서 `event.error == null` (opaque, 스택 없음) |
    | `unhandled-rejection`            | `unhandledrejection` 경로                                      |
    | `react-render`                   | ErrorBoundary (`componentStack` 존재)                          |
    | `network`                        | ERR_NETWORK / offline / timeout (`isNetworkError` 재활용)      |
    | `http-4xx` / `http-5xx` / `auth` | HTTP status 존재 (`classifyError` 재활용)                      |
    | `unknown`                        | 그 외                                                          |

2. **카테고리 노출 = 타이틀 + payload 필드 둘 다**
    - 타이틀: `[mobile] error` → `[mobile] script-error` 형태로 category를 실어 Slack·목록에서 한눈에 구분.
    - payload: `category`(및 필요 시 `tags`) 구조 필드를 추가해 admin 필터링/집계 가능.
    - admin-v2 `parseTitle`을 소폭 확장해 새 타이틀 포맷에서 category를 뽑도록 한다(`/^error\b/` 기존 매칭은 유지되어 하위 호환).

3. **`Script error.` 캡처 개선 + 원인 조사 기록**
    - 전역 핸들러가 `ErrorEvent`의 `filename`/`lineno`/`colno`를 payload에 실어, opaque 에러도 `번들파일:줄:칸` 위치를 남긴다(소스맵 결합 시 원본 추적 가능).
    - `event.error === null`인 이유(네이티브 주입 스크립트 / 서드파티 컨텍스트 가설)를 코드 레벨로 조사해 원인 후보를 이 ADR 및 후속 구현 문서에 정리한다.

4. **맥락(breadcrumb) 보강** — `reportError` payload에 링버퍼 로그 tail(최근 N개) + 직전/현재 라우트를 첨부한다. `reportIssue`의 `extras` 방식과 정합.

5. **스로틀 키 개선** — dedupe 키를 `error.message` 단독에서 `category` + message(또는 안정적 fingerprint) 조합으로 바꿔, 서로 다른 opaque 에러가 한 버킷으로 붕괴하지 않게 한다.

### 제외

- `"Script error."`의 **실제 근본 원인 검증**(네이티브 WKWebView 주입 스크립트 확인, `<script crossorigin>` + CORS 헤더 적용, 소스맵 업로드/배포 파이프라인)은 네이티브·배포까지 얽히므로 **별도 스파이크**로 분리한다. 이번엔 캡처 개선과 원인 후보 정리까지만.
- **노이즈 감소**(일시적 `Network Error` silent 처리/드롭/샘플링)는 이번 범위 밖. (스로틀 키 개선으로 신호 손실은 일부 완화.)
- **콘솔/로컬 logger 메시지 문구 개선**은 서버 리포트와 별개 축이라 이번 범위 밖.

## 대안 (Alternatives)

- **카테고리를 payload 필드로만 두기** — admin 필터는 되지만 Slack 제목이 여전히 `[mobile] error`로 뭉뚱그려져 트리아지가 안 됨. 트리아지 개선이 1차 목표라 기각.
- **카테고리를 타이틀 문자열로만 두기** — admin이 다시 파싱해야 해 필터/집계가 약함. 기각.
- **기존 `classifyError`(authentication/network/server/client/unknown)를 그대로 category로 사용** — HTTP 중심이라 `script-error`·`unhandled-rejection`·`react-render` 같은 프런트 런타임 에러의 출처를 구분하지 못함. 출처 기준 6종 별도 정의로 대체하되 HTTP 판별은 `classifyError`/`isNetworkError`를 재활용.
- **이번에 근본 원인까지 완전 규명** — 네이티브·CORS·소스맵·배포 파이프라인까지 범위가 커져 로깅 개선이 지연됨. 캡처 개선으로 즉시 가치를 얻고 검증은 스파이크로 분리.

## 결과 (Consequences)

**얻는 것**

- Slack·admin에서 제목만으로 에러 성격을 즉시 구분 → 트리아지 가능.
- opaque `Script error.`도 `filename:line:col` + breadcrumb + 라우트로 "무슨 일 직후 어디서 터졌는지" 파악 가능.
- category 기반 dedupe로 서로 다른 원인이 뭉개지지 않아 신호 손실 감소.
- admin payload가 유연 스키마라 소비 측 변경이 작다(타이틀 파서 소폭 확장만).

**트레이드오프 / 감수**

- 타이틀 포맷 변경으로 admin `parseTitle` 확장이 필요하고, 과거에 쌓인 `[mobile] error` 레코드와 신규 포맷이 혼재한다(하위 호환 매칭으로 완화).
- breadcrumb(로그 tail)를 서버로 보내므로 payload 크기 증가와 민감정보 노출 가능성 → 링버퍼의 redact 적용 및 tail 개수 상한 필요.
- 근본 원인이 미해결로 남아, `script-error` 태깅은 되지만 원본 스택 복구는 후속 스파이크(crossorigin/CORS/소스맵) 완료 전까지 제한적.

## 다음 단계

이 ADR을 입력으로 `dev-2_implement`의 스펙 작성(Phase A)으로 넘어간다. 별도로 `"Script error." 근본 원인 검증 스파이크`(네이티브 주입 스크립트 확인 · `<script crossorigin>`+CORS · 소스맵 배포)를 후속 작업으로 분리해 추적한다.
