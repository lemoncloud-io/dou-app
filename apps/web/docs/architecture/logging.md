# 로깅

> 대상: `libs/logger`(`@chatic/logger`) · `libs/bridges/src/logger`(`@chatic/bridges`) · `apps/web/src/main.tsx` · `apps/web/src/app/runtime/webLogPersistence.ts`
>
> **통합 로깅 전체(모바일 재배선·지연 리포트·감지 확장 포함)의 정본은
> [libs/logger/docs/architecture.md](../../../../libs/logger/docs/architecture.md)다.**
> 이 문서는 apps/web 관점의 배선만 요약한다. 결정 배경은 [ADR-0047](../../../../docs/adr/0047-unified-logging-core-and-report-traceability.md).

앱 전역 로깅은 `logger.{debug,info,warn,error}(tag, message, data)` 한 API로 통일돼 있다. 호출부는 환경(웹/네이티브)을 몰라도 되고, 로그를 **어디로 흘려보낼지는 구독자(sink)가 결정**한다 — pub/sub 구조다. ADR-0047 이후 모바일도 같은 코어를 쓰므로, `LogEntry` 계약은 웹·네이티브·wire 전 구간에서 하나다.

## 값 모델

```ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
    level: LogLevel;
    tag: string;
    message: string;
    data?: unknown;
    error?: unknown;
    timestamp: number; // dispatch 시점에 코어가 찍는다 — 경계를 건너도 재스탬프되지 않는다
    source?: 'web' | 'native'; // 런타임 경계를 건넌 엔트리만 표시
}
```

- `LogLevel`은 코어(`@chatic/logger`)가 자체 정의한다 — `@chatic/app-messages`의 `AppLogLevel`과 동일 문자열 유니온이지만 코어의 의존성을 0으로 유지하기 위해 끊었다.
- 브리지를 건너온 엔트리는 `ingestLogEntry`로 적재되어 원본 timestamp·tag·source가 보존된다.

## 웹 배선 (`main.tsx`, 부팅 순서대로)

| 순서 | 호출                                          | 역할                                                                                                                          |
| ---- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1    | `setupBridgeLogger({ consoleInNative: DEV })` | sink 배선: 네이티브면 SendLog 포워더(+dev 콘솔), 웹이면 콘솔                                                                  |
| 2    | `attachLogContext()`                          | 발생 시점 컨텍스트 프로바이더 등록 — dispatch가 매번 읽으므로 첫 로그보다 앞이어야 한다                                       |
| 3    | `startLogUploader({ bridgeLogger })`          | **큐 + 업로더 배선.** 큐가 유일한 저장소이므로 이 줄보다 먼저 찍힌 로그는 어디에도 남지 않는다                                |
| 4    | `attachWebCrashSentinel()`                    | alive 센티널 + 직전 세션 크래시 판정                                                                                          |
| 5    | `schedulePageCrashReport(...)`                | 직전 세션이 pagehide 없이 죽었으면 `[page-crash]` **로그 엔트리**를 남긴다 (지연 없음 — 3번이 먼저 걸려 있다)                 |
| 6    | `schedulePendingReportFlush()`                | 하이브리드 한정 — 네이티브 지연 리포트 큐(WebView 크래시·RN 예외·네이티브 크래시)를 pull해 `ingestLogEntry`로 합류시킨 뒤 Ack |

- **이 순서가 유실 방어 그 자체다(원칙 15).** 링버퍼 시절에는 코어가 `ingest`에서 직접 적재해 "구독과 무관하게 남는다"가 구성상 보장이었지만, 저장소가 큐 하나로 줄면서 큐는 hub **구독**으로 채워진다. 그래서 `startLogUploader`가 3번으로 올라왔고, 그 앞(1~2번)에 동기 로그가 없다는 것을 실측으로 확인했다. **부팅 경로에 로그를 추가할 때 확인해야 하는 것이 이것이다** — 순서를 깨면 조용히 사라진다.
- **구독자가 하나도 없으면** facade가 콘솔 폴백으로 직접 출력한다 — `setupBridgeLogger`를 부르지 않는 앱(desktop-web·admin·landing·testbed)도 기존 콘솔 동작을 그대로 유지한다.
- **저장소는 미전송 큐 하나뿐이다(2026-08-21).** 링버퍼(500)와 그 영속화는 제거됐다 — 두 저장소를 나눠 둔 근거가 수명 차이였는데, 전송 보류 토글이 생겨 큐가 비워지지 않게 되면서 그 차이가 사라졌다(원칙 10).
- 큐에 들어가는 것은 **`info` 이상**이다. 필드 디버깅의 현실적 입도가 `info` 이상이라는 판단이다(원칙 13).
- **`debug`는 콘솔 전용이다.** 영속 sink 둘 — 업로드 큐와 (하이브리드의) Crashlytics breadcrumb — 이 **모두** `debug`를 버리므로, `prodRelease`에서 `debug`는 어디에도 남지 않는다. 그것이 이 레벨의 목적이다: 터미널에서 실시간으로 읽는 것. `prodDebug`·`dev*` 빌드는 콘솔에 찍히고, `prodRelease`만 조용해진다. **디버그 화면에 `debug`가 안 보이는 것은 버그가 아니다.**

## 전역 에러 감지 (`app.tsx`)

**감지는 전부 `logger.error` 한 줄로 끝난다(2026-09).** 자동 에러 리포트(`reportError`)가 폐지돼서, 감지 경로가 하는 일은 엔트리를 남기는 것뿐이고 그 엔트리는 업로드 파이프라인을 타고 서버에 간다.

경로 구분은 **메시지 접두사**로 남는다 — admin이 message로 그룹을 묶으므로(`groupReportLogs`) 접두사가 곧 분류 축이다. 폐지된 `category` 필드와 `[app] <category>` 타이틀을 대신하는 자리이며, 그만큼 거칠다: HTTP status나 네트워크 성격으로 갈라주던 분류는 없다.

| 경로                      | 남는 엔트리                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `window.onerror` (bubble) | `[window.onerror] …` — opaque면 stack이 핸들러를 가리키므로 `data.errorWasNull`로 표시하고 `filename`/`lineno`/`colno`를 싣는다 |
| `unhandledrejection`      | `[unhandledrejection] …`                                                                                                        |
| `error` (capture)         | `[resource-error] …` — `<img>`/`<script>`/`<link>` 등 로드 실패                                                                 |
| `securitypolicyviolation` | `[csp-violation] …` — WebView 안 차단 스크립트는 Script Error 원인군 단서                                                       |
| Query/Mutation `onError`  | `[query] …` / `[mutation] …`                                                                                                    |
| ErrorBoundary             | `[error-boundary] …` (`data`에 `componentStack`)                                                                                |

## 리포트와 로그의 관계

**리포트로 남는 것은 사용자 제보(`reportIssue`)뿐이다(2026-09).** 자동 에러 리포트가 폐지되면서 `/hello/report`를 쓰는 클라이언트는 하나로 줄었다 — 로그 파이프라인이 옮길 수 없는 것(사용자가 쓴 본문, Slack 알림, 사진 첨부)만 남았다.

폐지의 근거는 두 경로가 **같은 저장소에 두 벌을 쌓고 있었다**는 것이다. 리포트는 `stereo: 'log'`로, 로그 엔트리도 같은 버킷으로 들어가고(admin은 클라이언트에서 가른다), 감지 경로는 이미 `logger.error`를 먼저 부르고 있었다. 그래서 남긴 쪽은 이미 존재하던 엔트리다.

**폐지로 잃은 것**(의도된 손실이다):

- `category` 분류(`script-error`·`resource-error`·`csp-violation`·`http-4xx/5xx`·`auth`·`network` …)와 그것으로 만들던 `[app] <category>` 타이틀. 대체는 메시지 접두사이고, 이는 HTTP 성격을 갈라주지 못한다.
- 실패한 요청의 전모(`describeHttp` — 메서드·URL·서버가 말한 사유·redact된 본문)와 `error.cause` 체인(`collectCauses`). 로그 엔트리의 `data`/`error`는 wire에서 `WIRE_FIELD_CHAR_LIMIT`(2000자) 문자열로 잘리므로 이 구조를 그대로 실을 자리가 없다.
- 즉시 전송. `reportError`는 건당 즉시 POST였고, 로그 엔트리는 업로더의 다음 주기(60초)를 기다린다 — ADR-0066에서 error 앞당김 트리거가 제거된 뒤로는 앞당겨지지도 않는다.

**리포트는 로그를 첨부하지 않는다(2026-08-21).** `reportIssue`도 네이티브 대리 전송도 마찬가지다. 둘을 잇는 축은 엔트리마다 실려 있는 `runId`(+`uid`)다 — 어드민에서 제보의 runId로 그 실행의 로그 전체를 좁힌다.

`LogSource`·`collectBreadcrumbs`·`setReportLogSource`는 함께 제거됐다. 그리고 링버퍼는 **그 breadcrumb 저장소가 존재 이유였다** — 첨부가 폐지되자 마지막 독자를 잃어 함께 폐지됐다(2026-08-21). 남은 로그 저장소는 미전송 큐 하나다(ADR-0063).

## 디버그 UI 통합

`LogBufferScreen`(debug 오버레이)은 **미전송 큐**를 읽는다 — 하이브리드는 `FetchLogUploadQueue` 브리지 왕복(계약상 비파괴), 순수 웹은 실행 중인 업로더가 등록한 읽기 전용 뷰(`logQueueView`)의 동기 조회. 큐를 소유한 것은 업로더뿐이라 뷰가 등록제이며, 그래서 화면이 "업로더가 안 돌고 있음"과 "로그가 아직 없음"을 구별할 수 있다.

`webLogSource`와 `PollAppLogBuffer` 호출은 제거됐다. poll은 보여주는 것을 소비했으므로 애초에 뷰어가 쓸 표면이 아니었다 — 4번 원칙(조회는 `peek`)을 깨는 유일한 소비자였고, 이제 사라졌다.

**전송이 켜져 있으면 이 화면이 비는 것이 정상이다.** 업로더가 보낸 것을 큐에서 지우기 때문이다. 붙잡아 보려면 같은 화면의 **서버 전송 보류** 토글을 켠다 — 큐가 유지되면서 모니터링 뷰가 된다. 기기 opt-out과는 다른 레버다: opt-out은 큐를 버린다(원칙 14).

## 관련

- 통합 아키텍처 정본: [libs/logger/docs/architecture.md](../../../../libs/logger/docs/architecture.md)
- 브릿지 메시지 규약은 [bridge](./bridge.md).
- 디버그 오버레이·`LogBufferScreen`은 [debug feature](../feature/debug/README.md).
- 에러 리포트 경로 상세는 [docs/guides/trace-report.md](../../../../docs/guides/trace-report.md).
