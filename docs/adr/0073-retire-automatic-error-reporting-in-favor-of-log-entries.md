# ADR-0073: 자동 에러 리포트(`reportError`)를 폐지하고 에러는 로그 엔트리 하나로 남긴다

> 상태: Accepted · 결정일: 2026-09-02
> 관련: [ADR-0029](./0029-error-report-categorization-and-enrichment.md) (이 결정으로 Superseded — 분류·태깅·맥락 보강 일체) · [ADR-0047](./0047-unified-logging-core-and-report-traceability.md) (리포트 추적성 강화분이 이 결정으로 무효) · [ADR-0063](./0063-log-upload-source-port-and-native-charge-queue.md) (미전송 큐·배치 업로드 — 남는 경로) · [ADR-0066](./0066-log-pipeline-collector-listener-split.md) ("자동 error 리포트 제거"를 별도 트랙으로 예고했던 곳)

## 맥락 (Context)

에러가 서버에 도착하는 경로가 둘이었다.

1. `logger.error(tag, msg, { error })` → 미전송 큐 → 업로더가 주기마다 `POST /hello/report-bulk`
2. `reportError(error, ctx)` → 즉시 `POST /hello/report` (`stereo: 'log'`, `save: true`, `silent: true`)

그리고 **둘은 같은 저장소에 쌓인다.** admin-v2의 `STEREO_BY_KIND`를 보면 `error`와 `log-entry`가 같은 `stereo=log` 버킷을 긁어 클라이언트에서 갈린다. 즉 "리포트"와 "로그 엔트리"의 차이는 저장 위치가 아니라 payload 모양뿐이었다.

더 결정적인 것은 **호출부가 이미 둘 다 부르고 있었다**는 것이다. 비테스트 호출부 36건 중 19건이 바로 위에서 `logger.error`를 부른 뒤 `reportError`를 불렀다. 같은 사건이 두 벌 저장되고 있었고, 그렇게 짜여 있던 근거(ADR-0047 S1의 "리포트가 스로틀돼도 엔트리는 남는다")는 스로틀이 폐지되면서 이미 사라져 있었다. `silent: true`가 된 뒤로는 Slack 알림이라는 차별점도 없다.

## 결정 (Decision)

`reportError`와 그 조립 모듈 일체를 삭제한다. 에러는 `logger.error` 엔트리 하나로 남는다.

- 삭제: `reportError` · `classifyReport`(`reportCategory.ts`) · `describeHttp`(`httpContext.ts`) · `collectCauses`(`errorCause.ts`) · 타입 `ErrorCategory`·`ErrorReportContext`·`ErrorReportPayload`.
- 존치: `reportIssue`. 로그 파이프라인이 옮길 수 없는 것 — 사용자가 쓴 본문, Slack 알림, 사진 첨부 — 만 남았고, `reportIssue.ts`로 분리했다.
- 존치: `sanitizeReportUrl`·`uploadLogBatch`.
- 경로 구분은 **메시지 접두사**(`[window.onerror]`·`[resource-error]`·`[csp-violation]`·`[query]`·`[mutation]`·`[error-boundary]`·`[page-crash]`)로 남긴다. admin이 message로 그룹을 묶으므로(`groupReportLogs`) 그게 남은 분류 축이다.
- 지연 리포트(`page-crash`·네이티브 대리 전송)는 `ingestLogEntry`로 합류시킨다 — `logger.error`는 dispatch 시점에 timestamp를 찍어, 이미 죽은 런의 사건을 이번 부팅 시각으로 옮겨버린다.

## 잃는 것 (의도된 손실)

이 결정의 값은 중복 제거이고, 대가는 payload다. 명시해 둔다.

- **카테고리 분류.** `script-error`·`resource-error`·`csp-violation`·`http-4xx`·`http-5xx`·`auth`·`network`·`react-render` … 와 그것으로 만든 `[app] <category>` 타이틀. 대체(메시지 접두사)는 채널만 구분하고 **에러의 성질은 구분하지 못한다** — 특히 HTTP status로 갈라주던 분류가 사라진다.
- **실패한 요청의 전모.** `describeHttp`가 채우던 메서드·URL·서버가 말한 사유·redact된 요청/응답 본문. `message`에 붙던 `→ METHOD URL`과 `: reason` 접미사도 함께 사라지므로, **원인이 제각각인 500이 admin에서 "Request failed with status code 500" 한 줄로 뭉친다.**
- **`error.cause` 체인.** `collectCauses`. 감싼 에러의 `stack`은 감싼 자리를 가리키므로, React가 렌더 실패를 감싼 경우 원점이 리포트에서 통째로 빠진다.
- **즉시 전송.** 건당 즉시 POST → 업로더의 다음 주기(60초). ADR-0066에서 error 앞당김 트리거가 제거된 뒤로는 앞당겨지지도 않고, 큐 상한(500건 / 512KB) 초과 시 드랍 대상이며 4xx면 배치가 통째로 폐기된다. **크래시 직전 에러의 도달률이 낮아진다.**

구조를 로그 엔트리에 그대로 실을 수는 없다: `toWireLogEntry`가 `data`/`error`를 `WIRE_FIELD_CHAR_LIMIT`(2000자) 문자열로 잘라 넣기 때문이다. 필요해지면 그 cap을 손보는 것이 선행 조건이다.

## 검토한 대안

- **카테고리만 살린다** (`classifyReport`를 남겨 `data.category`로 전달). admin 그룹핑 축을 지키면서 wire cap 문제를 피하는 절충안. **기각** — 중간 상태를 남기지 않기로 했다.
- **조립을 얇은 래퍼로 살린다** (`logError()` 하나로 classify + describeHttp를 돌려 `data`에 실음). payload를 지키지만 wire cap을 함께 손봐야 한다. **기각** — 같은 이유.

## 알려진 부수 효과

- 이 삭제는 **미커밋 상태였던 자격증명 만료 트랙의 유일한 프로덕션 소비자를 제거했다.** `markStaleCredential`/`staleCredentialRoute`(`libs/http/src/error/credentialStale.ts`)가 붙이는 표시를 읽던 곳은 `classifyReport`뿐이었고(status 없는 `ERR_NETWORK`로 도착하는 API Gateway IAM 403을 `network`이 아니라 `auth`로 집계하기 위한 것), 그 파일과 함께 그 회귀 테스트도 삭제됐다. `ErrorClassification.refreshRoute`는 아직 소비자가 없으므로, 그 트랙은 자격증명 재발급 경로(`useRelayCredentialRefresh`)를 배선해야 자립한다.
- ADR-0029는 이 결정으로 Superseded다. `parseReportLog`의 `ERROR_CATEGORIES` Set과 admin의 `error` 종류 필터는 **폐지 이전에 저장된 레코드를 읽기 위해** 남는다 — 새로 쓰이지 않는다.
