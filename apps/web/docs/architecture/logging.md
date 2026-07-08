# 로깅

> 대상: `libs/logger`(`@chatic/logger`) · `libs/bridges/src/logger`(`@chatic/bridges`) · `apps/web/src/main.tsx` · `apps/web/src/app/features/debug/lib/webLogSource.ts`

앱 전역 로깅은 `logger.{debug,info,warn,error}(tag, message, data)` 한 API로 통일돼 있다. 호출부는 환경(웹/네이티브)을 몰라도 되고, 로그를 **어디로 흘려보낼지는 구독자(sink)가 결정**한다 — pub/sub 구조다.

과거 web 로거는 호출마다 `isNative()`로 어댑터를 양자택일(네이티브면 앱 전송, 아니면 `console`)했다. 구독자 개념이 없어 버퍼링·다중 출력·디버그 조회가 불가능했다. 모바일(`apps/mobile`)의 `LogService` + `LogBufferService` 구조를 web에 미러링해 이 격차를 없앴다.

## 값 모델

```ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
    level: LogLevel;
    tag: string;
    message: string;
    data?: unknown;
    error?: unknown;
    timestamp: number; // publish 시점에 코어가 찍는다
}
```

- `LogLevel`은 코어(`@chatic/logger`)가 자체 정의한다 — `@chatic/app-messages`의 `AppLogLevel`과 동일 문자열 유니온이지만 코어의 의존성을 0으로 유지하기 위해 끊었다.
- `timestamp`는 facade가 publish할 때 찍는다 (모바일이 수신 시점에 찍는 것과 대응).

## 구성 요소

`@chatic/logger` — 플랫폼 독립 코어. 의존성 0.

| 역할         | 위치                      | 책임                                                                        |
| ------------ | ------------------------- | --------------------------------------------------------------------------- |
| pub/sub 허브 | `hub.ts` (`logHub`)       | `subscribe`/`publish`. 리스너 에러 격리(한 sink가 던져도 나머지는 수신)     |
| 링버퍼       | `ringBuffer.ts`           | 고정 용량 FIFO, 가득 차면 오래된 것부터 덮어쓴다 (`peek`/`shift`)           |
| 콘솔 sink    | `consoleListener.ts`      | 레벨별 `console.*` 매핑 (기존 폴백 출력 형식 유지)                          |
| facade       | `logger.ts` (`logger`)    | 공개 API. publish + 내장 버퍼 적재 + 무구독 시 콘솔 폴백                    |
| 버퍼 뷰      | `logger.ts` (`logBuffer`) | `peek`(유지)/`poll`(소비)/`clear`/`size` — 모바일 `LogBufferService` 의미론 |

`@chatic/bridges` — 환경별 sink 배선.

| 역할          | 위치                   | 책임                                                      |
| ------------- | ---------------------- | --------------------------------------------------------- |
| 코어 재수출   | `logger/index.ts`      | `export * from '@chatic/logger'` — 기존 import 경로 보존  |
| 네이티브 sink | `nativeForwarder.ts`   | `LogEntry` → `SendLog` bridge 메시지 (기존 페이로드 형식) |
| 배선 진입점   | `setupBridgeLogger.ts` | 환경 판별 후 sink 구독. idempotent, teardown 반환         |

## 흐름

```
어디서나  logger.info('SOCKET', '...', data)
              │  timestamp 부여
              ▼
          logHub.publish ──────────────▶ 내장 ringBuffer (항상 적재)
              │
      ┌───────┴───────┐  (구독자는 setupBridgeLogger가 배선)
      ▼               ▼
  console sink   native forwarder ──▶ SendLog ──▶ (모바일) useLogHandler
                                                    → LogService → LogBufferService
```

- **내장 버퍼는 구독과 무관하게 항상 적재**한다. 배선 전(부팅 초기)에 찍힌 로그도 유실되지 않는다. 용량은 `LOG_BUFFER_CAPACITY = 500`.
- **구독자가 하나도 없으면** facade가 콘솔 폴백으로 직접 출력한다 — `setupBridgeLogger`를 부르지 않는 앱(desktop-web·admin·landing·testbed)도 기존 콘솔 동작을 그대로 유지한다.

## 환경별 배선 규칙

`setupBridgeLogger(options)`가 환경을 판별해 sink를 붙인다. `apps/web`은 `main.tsx` 최상단에서 다른 부팅 로직보다 먼저 호출한다.

```ts
// apps/web/src/main.tsx
setupBridgeLogger({ consoleInNative: import.meta.env.DEV });
```

| 환경               | 배선되는 sink                                      |
| ------------------ | -------------------------------------------------- |
| 네이티브 WebView   | native forwarder (+ `consoleInNative`면 콘솔 병행) |
| 순수 웹 / 데스크톱 | 콘솔                                               |
| 배선 안 함         | 없음 → facade 콘솔 폴백 (동작 동일)                |

- `consoleInNative`는 dev 빌드에서만 켠다 — WebView 인스펙터를 붙인 상태에서 앱 전송과 콘솔을 동시에 본다. prod 네이티브는 앱 전송만.
- 재호출은 기존 teardown을 반환하고 중복 배선하지 않는다. teardown은 이 호출이 붙인 sink만 해제한다(주로 테스트용).

## 디버그 UI 통합

`LogBufferScreen`(debug 오버레이)은 **로그 소스를 환경에 따라 바꾼다**. fetch/poll/clear/size 버튼과 렌더링은 공유한다.

- **네이티브**: 기존대로 `appBridge.fetchAppLogBuffer` 등 브릿지 왕복으로 앱의 `LogBufferService`를 조회한다(nonce/pending 상태 사용).
- **순수 웹**: `webLogSource`(`features/debug/lib/webLogSource.ts`)로 내장 `logBuffer`를 **동기 조회**한다 — 브릿지 왕복이 없으므로 nonce가 없다. 응답 형태는 브릿지 페이로드(`OnFetchAppLogBuffer` 등)와 동일해 UI가 양쪽을 같은 모델로 다룬다.

웹 버퍼는 메모리 링버퍼라 **현재 세션 한정**이다(리로드 시 초기화). 영속화(IndexedDB 등)는 도입하지 않았다.

## 마이그레이션 메모

- **호출부 무수정**: `@chatic/bridges`가 코어를 재수출하므로 기존 `import { logger } from '@chatic/bridges'`(~59개 파일)는 그대로 동작한다. API 시그니처도 동일.
- **동작 변화는 dev 네이티브의 콘솔 병행뿐**. prod 경로(네이티브=앱 전송, 웹=콘솔)는 이전과 같다.
- **모바일(RN)은 손대지 않았다**. web logger가 `SendLog`로 보내면 모바일 `useLogHandler`가 받아 자기 `LogService`에 넣는 파이프라인이 유지된다. 모바일의 코어 통합은 후속 과제.

## 관련

- 브릿지 메시지 규약은 [bridge](./bridge.md).
- 디버그 오버레이·`LogBufferScreen`은 [debug feature](../feature/debug/README.md).
