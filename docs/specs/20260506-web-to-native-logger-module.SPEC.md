# Web-to-Native Logger Module SPEC

## 1. 목적

### 왜 logger 모듈화가 필요한가

현재 코드베이스에는 Web → Native 로그 전달을 위한 인프라(`SendLogPayload`, `type: 'SendLog'`, Native측 `useLogHandler`)가 **정의만 되어 있고, Web 측에서 실제 호출하는 코드가 없다**. Web 코드는 `console.log/error/warn`을 직접 호출하고 있으며, 이 로그는 WebView 환경에서 Native 로그 시스템(ring buffer, Crashlytics)으로 구조화되어 전달되지 않는다.

기존 `injectionScripts.ts`의 console override 방식(`getConsoleOverrideScript`)은 `console.log`와 `console.error`만 캡처하며, 구조화된 tag/level 정보 없이 문자열 단위로 전달한다.

### 현재 코드에서 발생할 수 있는 문제

1. Web 코드의 로그가 Native 로그 시스템(logBuffer, Crashlytics)에 구조화되어 전달되지 않음
2. `console.log`에 의존하므로 환경별 분기(WebView vs 일반 브라우저)가 없음
3. 로그에 tag/level 메타데이터가 없어 Native에서 필터링 불가
4. 기능 코드가 직접 `postMessage({ type: 'SendLog', ... })`를 호출하게 되면 bridge 세부사항에 결합됨

### 기능 코드가 bridge 구현에 의존하지 않게 한다는 의미

기능 코드는 아래처럼 공통 logger만 호출한다:

```typescript
logger.info('AUTH', 'token refresh started');
logger.warn('SOCKET', 'connection unstable', { latency: 500 });
logger.error('API', 'request failed', {
    error,
    data: { endpoint: '/users', status: 500 },
});
```

기능 코드는 아래 구현 세부사항에 직접 의존하지 않는다:

- `window.ReactNativeWebView.postMessage`
- `window.ChaticMessageHandler.postMessage`
- `window.webkit.messageHandlers.ChaticMessageHandler.postMessage`
- `type: 'SendLog'`
- `SendLogPayload`

실제 Native 전달 여부, payload 변환, console fallback, bridge 전송 실패 방어는 logger 모듈 내부 adapter가 담당한다.

### 이번 작업의 범위

- `libs/app-messages/src/logger/` 내에 logger 모듈 추가
- Logger interface 정의 (`debug/info/warn/error`)
- Native bridge adapter 구현 (기존 `postMessage` + `SendLogPayload` 활용)
- Console fallback adapter 구현
- 기존 contract (`SendLogPayload`, `type: 'SendLog'`) 그대로 유지

### 이번 작업에서 하지 않을 것

- `SendLogPayload` 구조 변경
- Native message type `'SendLog'` 변경
- Native handler(`useLogHandler`) 수정
- 기존 `postMessage()` 함수 수정
- 기존 `reportError()` 수정
- Analytics / Audit log 시스템 구현
- 기존 `console.log` 호출 전체 일괄 교체 (별도 TASK)
- `reportError()`와의 자동 연동
- 민감 정보 자동 sanitize 구현
- 기존 console override(`getConsoleOverrideScript`) 제거

---

## 2. 환경

### 사용 기술 스택

- React + TypeScript
- Nx Monorepo
- WebView (React Native WebView) 환경에서 동작
- Bridge: `window.ChaticMessageHandler` (Android), `window.webkit.messageHandlers.ChaticMessageHandler` (iOS), `window.ReactNativeWebView` (RN Standard)
- Mobile 감지: `getMobileAppInfo()` → `window.CHATIC_APP_PLATFORM`

### 관련 package 위치

| Package                | 경로                 | 역할                                                         |
| ---------------------- | -------------------- | ------------------------------------------------------------ |
| `@chatic/app-messages` | `libs/app-messages/` | Web ↔ Native 메시지 타입, bridge 유틸, **logger 모듈 위치** |
| `@chatic/web-core`     | `libs/web-core/`     | OAuth, error reporting(`reportError`), 공통 hooks            |
| `@chatic/shared`       | `libs/shared/`       | 공통 유틸, 컴포넌트                                          |
| Mobile app             | `apps/mobile/`       | Native 측 로그 핸들러, logger 서비스                         |
| Web app                | `apps/web/`          | 기능 코드 (logger 호출 대상)                                 |

### WebView 환경 여부 판단

```typescript
// libs/app-messages/src/utils/index.ts (lines 70-81)
export const getMobileAppInfo = () => {
    const platform = window.CHATIC_APP_PLATFORM?.toLowerCase();
    return {
        isOnMobileApp: platform === 'ios' || platform === 'android',
        isIOS: platform === 'ios',
        isAndroid: platform === 'android',
    };
};
```

### Web → Native bridge 방식

```typescript
// libs/app-messages/src/utils/index.ts (lines 86-100)
export const postMessage: (message: WebMessage) => void = (message: WebMessage) => {
    const messageStr = JSON.stringify(message);
    try {
        if (window.ChaticMessageHandler?.postMessage) {
            window.ChaticMessageHandler.postMessage(messageStr);
        } else if (window.webkit?.messageHandlers?.ChaticMessageHandler) {
            window.webkit.messageHandlers.ChaticMessageHandler.postMessage(messageStr);
        } else if (window.ReactNativeWebView?.postMessage) {
            window.ReactNativeWebView.postMessage(messageStr);
        }
    } catch (error) {
        console.error('[Bridge] Send Error:', error);
    }
};
```

### 기존 message payload 구조

```typescript
// libs/app-messages/src/types/model/common.ts (lines 5, 18-24)
export type AppLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface SendLogPayload {
    level?: AppLogLevel;
    tag?: string;
    message: string;
    data?: any;
    error?: any;
}
```

### 기존 error reporting 구조

- `reportError()` (`libs/web-core/src/api/index.ts:81-184`): Error → Slack via `DOU_ENDPOINT/hello/report`
- 60초 throttle, 사용자/클라우드 컨텍스트 포함
- `reportIssue()` (`libs/web-core/src/api/index.ts:190-228`): 사용자 직접 이슈 보고
- **logger와는 완전히 분리된 시스템** — `logger.error()`가 `reportError()`를 자동 호출하면 안 됨

### 관련 파일 목록

- `libs/app-messages/src/types/model/common.ts`
    - 역할: `AppLogLevel`, `SendLogPayload` 타입 정의
    - 이번 작업과의 관계: logger가 사용할 payload 타입 (변경 금지)

- `libs/app-messages/src/types/web-message.ts` (lines 38, 100, 312-314)
    - 역할: `SendLog` 메시지 타입 정의
    - 이번 작업과의 관계: logger adapter가 이 타입으로 전송 (변경 금지)

- `libs/app-messages/src/utils/index.ts`
    - 역할: `postMessage()`, `getMobileAppInfo()` 유틸
    - 이번 작업과의 관계: logger adapter가 내부에서 사용 (변경 금지)

- `libs/app-messages/src/index.ts`
    - 역할: 패키지 barrel export
    - 이번 작업과의 관계: logger module export 추가 필요

- `apps/mobile/src/app/common/services/log/log.ts`
    - 역할: Native 측 logger (수신측 인터페이스 참고)
    - 이번 작업과의 관계: Web logger는 이 인터페이스 구조 참고 (변경 금지)

- `apps/mobile/src/app/common/webview/hooks/useLogHandler.ts`
    - 역할: Native 측 `SendLog` 메시지 수신 후 `logger.*` 호출
    - 이번 작업과의 관계: 수신측 (변경 금지)

- `libs/web-core/src/api/index.ts` (lines 81-184)
    - 역할: `reportError()` 함수
    - 이번 작업과의 관계: logger.error()와 분리, 자동 연동 금지, 수정 금지

---

## 3. 인터페이스

### 기존 contract (변경 금지)

```typescript
// libs/app-messages/src/types/model/common.ts
export type AppLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface SendLogPayload {
    level?: AppLogLevel;
    tag?: string;
    message: string;
    data?: any;
    error?: any;
}
```

```typescript
// libs/app-messages/src/types/web-message.ts
export interface SendLog extends WebDefaultMessage<'SendLog'> {
    data: SendLogPayload;
}
```

```typescript
// libs/app-messages/src/utils/index.ts
export const postMessage: (message: WebMessage) => void;
```

### 신규 interface

```typescript
// libs/app-messages/src/logger/types.ts

// AppLogLevel은 ../types에서 re-export됨 (확인 완료)
// 체인: types/model/common.ts → types/model/index.ts → types/index.ts
import type { AppLogLevel } from '../types';

export type LogLevel = AppLogLevel; // 'debug' | 'info' | 'warn' | 'error'

export interface LogErrorOptions {
    error?: unknown;
    data?: unknown;
}

export interface Logger {
    debug(tag: string, message: string, data?: unknown): void;
    info(tag: string, message: string, data?: unknown): void;
    warn(tag: string, message: string, data?: unknown): void;
    error(tag: string, message: string, options?: LogErrorOptions): void;
}

export interface LogEntry {
    level: LogLevel;
    tag: string;
    message: string;
    data?: unknown;
    error?: unknown;
}

export interface LogAdapter {
    log(entry: LogEntry): void;
}
```

> **logger.error() 시그니처 설계 이유**:
>
> - error 객체와 디버깅 컨텍스트(endpoint, status 등)를 함께 전달해야 하는 케이스가 많음
> - `{ error, data }` 옵션 객체 방식으로 명확하게 분리
> - `reportError()` 자동 연동 금지 원칙은 유지

> **LogAdapter가 LogEntry 객체를 받는 이유**:
>
> - data와 error의 위치 혼동 방지
> - logger.error(tag, message, { error, data })와 자연스럽게 연결
> - 추후 context 필드 추가 시 확장 용이

### safeSerializable 유틸

```typescript
// libs/app-messages/src/logger/utils/safeSerializable.ts

/**
 * JSON.stringify 실패 방어를 위한 safe serialization.
 *
 * 정책:
 * - undefined / null → undefined 반환
 * - Error 객체 → { name, message, stack } 형태로 변환
 * - 직렬화 가능한 값 → 그대로 반환
 * - circular reference 등 직렬화 불가능한 값 → String(value) fallback
 */
export const safeSerializable = (value: unknown): unknown => {
    if (value === undefined || value === null) {
        return undefined;
    }

    if (value instanceof Error) {
        return {
            name: value.name,
            message: value.message,
            stack: value.stack,
        };
    }

    try {
        JSON.stringify(value);
        return value;
    } catch {
        return String(value);
    }
};
```

### Native bridge adapter

```typescript
// libs/app-messages/src/logger/adapters/nativeBridgeAdapter.ts

import { postMessage } from '../../utils';
import { safeSerializable } from '../utils/safeSerializable';
import type { LogAdapter, LogEntry } from '../types';

export const createNativeBridgeAdapter = (): LogAdapter => ({
    log(entry: LogEntry): void {
        postMessage({
            type: 'SendLog',
            data: {
                level: entry.level,
                tag: entry.tag,
                message: entry.message,
                data: safeSerializable(entry.data),
                error: safeSerializable(entry.error),
            },
        });
    },
});
```

### Console fallback adapter

```typescript
// libs/app-messages/src/logger/adapters/consoleFallbackAdapter.ts

import type { LogAdapter, LogEntry, LogLevel } from '../types';

const CONSOLE_MAP: Record<LogLevel, (...args: any[]) => void> = {
    debug: console.debug,
    info: console.log,
    warn: console.warn,
    error: console.error,
};

export const createConsoleFallbackAdapter = (): LogAdapter => ({
    log(entry: LogEntry): void {
        const fn = CONSOLE_MAP[entry.level];
        const prefix = `[${entry.tag}]`;

        if (entry.level === 'error' && entry.error) {
            fn(prefix, entry.message, entry.error, entry.data ?? '');
        } else if (entry.data !== undefined) {
            fn(prefix, entry.message, entry.data);
        } else {
            fn(prefix, entry.message);
        }
    },
});
```

### Default logger export (lazy adapter 방식)

```typescript
// libs/app-messages/src/logger/index.ts

import { getMobileAppInfo } from '../utils';
import { createNativeBridgeAdapter } from './adapters/nativeBridgeAdapter';
import { createConsoleFallbackAdapter } from './adapters/consoleFallbackAdapter';
import type { Logger, LogEntry } from './types';

/**
 * Lazy adapter: 호출 시점마다 환경을 확인하여 적절한 adapter를 선택한다.
 * - WebView 환경 → Native bridge adapter (postMessage)
 * - 일반 브라우저 → Console fallback adapter
 *
 * eager 방식(모듈 로드 시 1회 결정) 금지:
 * CHATIC_APP_PLATFORM 주입 시점이 모듈 로드보다 늦을 수 있기 때문.
 */
const dispatch = (entry: LogEntry): void => {
    const { isOnMobileApp } = getMobileAppInfo();
    const adapter = isOnMobileApp ? createNativeBridgeAdapter() : createConsoleFallbackAdapter();
    adapter.log(entry);
};

export const logger: Logger = {
    debug(tag, message, data?) {
        dispatch({ level: 'debug', tag, message, data });
    },
    info(tag, message, data?) {
        dispatch({ level: 'info', tag, message, data });
    },
    warn(tag, message, data?) {
        dispatch({ level: 'warn', tag, message, data });
    },
    error(tag, message, options?) {
        dispatch({
            level: 'error',
            tag,
            message,
            data: options?.data,
            error: options?.error,
        });
    },
};

export type { Logger, LogAdapter, LogEntry, LogErrorOptions, LogLevel } from './types';
```

### error reporting 연동 여부

**연동하지 않는다.**

```typescript
// 올바른 사용법
logger.error('API', 'request failed', {
    error,
    data: { endpoint: '/users', status: 500 },
});

// Slack report가 필요하면 호출부에서 별도로
reportError(error);
```

- `logger.error()` = 로그 기록 (Native bridge 또는 console)
- `reportError()` = Slack error reporting
- 두 시스템은 자동 연결하지 않음

---

## 4. 고려사항

### 기존 SendLogPayload backward compatibility

- `SendLogPayload` 타입은 **절대 변경하지 않는다**
- logger adapter는 이 타입에 맞춰 `postMessage({ type: 'SendLog', data: SendLogPayload })`를 구성
- `LogEntry`의 `data`/`error` 필드가 `SendLogPayload`의 `data`/`error`에 그대로 매핑됨

### type: 'SendLog' contract 유지

- Native 측 `useLogHandler.ts`가 이 메시지를 수신해 `logger.debug/info/warn/error('WEBVIEW', ...)` 호출
- 메시지 구조 변경 시 Native 측 핸들러가 깨지므로 절대 변경 금지

### WebView가 아닌 환경에서의 동작

- `getMobileAppInfo().isOnMobileApp === false`이면 console fallback adapter 사용
- 개발환경(localhost), 일반 브라우저에서도 동일한 logger 인터페이스 사용 가능

### window.ReactNativeWebView가 없는 경우

- 기존 `postMessage()` 함수가 이미 3가지 bridge를 순서대로 시도하고, 모두 없으면 아무것도 하지 않음
- bridge가 없으면 메시지가 사라지지만 crash는 발생하지 않음 (기존 `try-catch` 보호)

### postMessage 실패 시 crash 방지

- 기존 `postMessage()` 함수 내부에 `try-catch`가 있음 (`[Bridge] Send Error:` 로그)
- logger adapter의 `safeSerializable()`이 1차 방어, `postMessage()` try-catch가 최종 방어

### JSON 직렬화 실패 가능성 및 순환 참조

- `postMessage()` 내부에서 `JSON.stringify(message)` 호출 — circular reference 시 throw
- **결정**: logger native bridge adapter에서 `safeSerializable()`로 payload를 사전 검증
- `safeSerializable()`은:
    1. `undefined`/`null` → `undefined` 반환
    2. `Error` 객체 → `{ name, message, stack }` 변환
    3. 직렬화 가능 → 그대로 반환
    4. 직렬화 불가 → `String(value)` fallback
- `postMessage`에 도달하기 전에 안전한 payload가 보장됨
- **로그 유실은 허용, crash만 방지**

### Error 객체 직렬화

- `JSON.stringify(new Error('boom'))` → `{}` (의미 있는 정보 사라짐)
- `safeSerializable()`이 Error를 `{ name, message, stack }` 형태로 먼저 변환
- Native `useLogHandler`가 `error` 필드를 받을 때 구조화된 정보를 얻을 수 있음

### Console fallback과 getConsoleOverrideScript 충돌 방지

- WebView 환경에서는 항상 Native bridge adapter를 사용
- Console fallback adapter는 일반 브라우저 환경에서만 활성화
- 따라서 WebView 환경에서 console → override → postMessage 무한 루프는 발생하지 않음

### 민감 정보 logging 방지

- logger 모듈이 자동으로 sanitize하지 않음 (scope 밖)
- 호출부가 민감 정보를 넘기지 않도록 주의 (기존과 동일한 책임)
- 이번 작업에서 별도 필터 구현하지 않음

### error log와 reportError()의 관계

- **완전히 분리**: `logger.error()`는 로그 전달만, `reportError()`는 Slack 보고
- `logger.error()` 호출이 자동으로 `reportError()`를 trigger하면 안 됨
- 기능 코드가 둘 다 필요하면 명시적으로 각각 호출

### 운영 환경에서 debug log 처리

- Web logger는 level 필터링을 하지 않음 (모든 level 그대로 전달)
- Native 측에서 debug 로그의 표시 여부를 결정 (Native `logger`의 `__DEV__` 체크)
- Console fallback adapter는 모든 level을 console에 출력 (브라우저 DevTools 필터 활용)

### 테스트 가능성

- `LogAdapter` interface를 통해 mock adapter 주입 가능
- adapter 단위 테스트: `createNativeBridgeAdapter()`의 postMessage 호출 검증
- `safeSerializable()` 단위 테스트: Error 객체, circular reference, 정상 값 각각 검증
- 현재 프로젝트에 테스트 파일 없음 → 테스트 인프라 존재 시 추가, 없으면 수동 QA

### 기존 코드와의 충돌 가능성

- Web 코드에서 `SendLog` 타입을 import하거나 직접 호출하는 곳 **없음** (확인 완료)
- `postMessage`를 사용하는 기존 코드는 `FetchFcmToken`, `SetCanGoBack`, `OpenURL` 등 다른 타입만 사용
- logger 모듈 추가는 기존 코드와 충돌 없음

---

## 5. 시나리오 / 사용 케이스

### Scenario 1: WebView 환경에서 info 로그를 Native로 전달한다

```
Given: Web이 WebView 환경에서 실행 중이다 (window.CHATIC_APP_PLATFORM === 'ios')
When: 기능 코드가 logger.info('AUTH', 'token refresh started')를 호출한다
Then: dispatch()가 getMobileAppInfo()를 호출하여 WebView 환경임을 확인한다
And: nativeBridgeAdapter.log({ level: 'info', tag: 'AUTH', message: 'token refresh started' })가 실행된다
And: postMessage({ type: 'SendLog', data: { level: 'info', tag: 'AUTH', message: 'token refresh started' } })가 호출된다
And: Native useLogHandler가 logger.info('WEBVIEW', 'token refresh started', { tag: 'AUTH', data: undefined })를 호출한다
```

### Scenario 2: WebView 환경이 아니면 console로 fallback한다

```
Given: Web이 일반 브라우저에서 실행 중이다 (window.CHATIC_APP_PLATFORM === undefined)
When: 기능 코드가 logger.warn('SOCKET', 'connection unstable', { latency: 500 })를 호출한다
Then: dispatch()가 getMobileAppInfo()를 호출하여 일반 브라우저임을 확인한다
And: consoleFallbackAdapter.log({ level: 'warn', tag: 'SOCKET', message: 'connection unstable', data: { latency: 500 } })가 실행된다
And: console.warn('[SOCKET]', 'connection unstable', { latency: 500 })가 호출된다
And: postMessage는 호출되지 않는다
```

### Scenario 3: Native bridge가 존재하지 않아도 앱이 crash 나지 않는다

```
Given: Web이 WebView 환경으로 감지된다 (window.CHATIC_APP_PLATFORM === 'android')
And: 하지만 window.ChaticMessageHandler, window.webkit, window.ReactNativeWebView 모두 undefined이다
When: 기능 코드가 logger.error('CHAT', 'message send failed', { error: new Error('timeout') })를 호출한다
Then: nativeBridgeAdapter가 선택된다
And: safeSerializable()이 Error 객체를 { name, message, stack }으로 변환한다
And: postMessage 내부에서 bridge를 찾지 못하고 아무 동작도 하지 않는다
And: 앱은 정상 작동을 계속한다
And: 에러가 throw되지 않는다
```

### Scenario 4: error 로그를 남기지만 외부 error reporting은 자동으로 수행하지 않는다

```
Given: Web이 WebView 환경에서 실행 중이다
When: 기능 코드가 아래를 호출한다
  logger.error('API', 'request failed', {
      error,
      data: { endpoint: '/users', status: 500 },
  })
Then: postMessage({ type: 'SendLog', data: { level: 'error', tag: 'API', message: 'request failed', data: { endpoint: '/users', status: 500 }, error: { name, message, stack } } })가 호출된다
And: reportError()는 호출되지 않는다
And: Slack 알림이 발송되지 않는다
```

### Scenario 5: 전송할 수 없는 data가 들어와도 앱이 crash 나지 않는다

```
Given: Web이 WebView 환경에서 실행 중이다
And: data에 circular reference가 포함되어 있다
When: 기능 코드가 logger.info('DEBUG', 'some message', circularObject)를 호출한다
Then: nativeBridgeAdapter의 safeSerializable()이 data 직렬화 가능 여부를 확인한다
And: JSON.stringify(circularObject)가 실패한다
And: safeSerializable()이 String(circularObject)으로 fallback한다
And: postMessage에는 직렬화 가능한 payload만 전달된다
And: 앱은 정상 작동을 계속한다
And: 로그 유실 또는 일부 데이터 축약은 허용된다
```

### Scenario 6: 기존 SendLogPayload contract가 유지된다

```
Given: logger 모듈이 구현되었다
When: logger.info('TAG', 'msg', { key: 'value' })를 호출한다
Then: postMessage에 전달되는 data는 다음 구조이다:
  {
    level: 'info',
    tag: 'TAG',
    message: 'msg',
    data: { key: 'value' },
    error: undefined
  }
And: 이 구조는 SendLogPayload interface와 정확히 일치한다
And: Native useLogHandler가 기존과 동일하게 처리할 수 있다
```

### Scenario 7: Error 객체가 구조화되어 Native에 전달된다

```
Given: Web이 WebView 환경에서 실행 중이다
When: 기능 코드가 아래를 호출한다
  logger.error('AUTH', 'token expired', { error: new TypeError('invalid token') })
Then: safeSerializable()이 Error 객체를 변환한다:
  { name: 'TypeError', message: 'invalid token', stack: '...' }
And: postMessage에 전달되는 data.error가 위 구조를 포함한다
And: Native useLogHandler가 구조화된 error 정보를 받는다
```

---

## 6. 자체검증 (Codex 구현 후 체크리스트)

- [ ] 기존 `SendLogPayload` 타입을 변경하지 않았다
- [ ] 기존 `type: 'SendLog'` contract를 변경하지 않았다
- [ ] 기존 Native `useLogHandler`를 수정하지 않았다
- [ ] 기존 `reportError()`를 수정하지 않았다
- [ ] 기존 `postMessage()` 함수를 수정하지 않았다
- [ ] `logger.error()`가 `reportError()`를 자동 호출하지 않는다
- [ ] `logger.error()`가 `{ error, data }` 옵션 객체를 받는다 (`LogErrorOptions`)
- [ ] `Error` 객체가 `{ name, message, stack }` 형태로 변환된다
- [ ] circular reference data가 들어와도 앱이 crash 나지 않는다
- [ ] WebView 환경에서는 Native bridge adapter가 사용된다
- [ ] 일반 브라우저 환경에서는 console fallback adapter가 사용된다
- [ ] adapter는 import 시점이 아니라 logger 호출 시점에 lazy하게 선택된다
- [ ] 기존 console.log 전체 교체는 이번 작업에 포함하지 않았다
- [ ] `@chatic/app-messages` barrel export(`libs/app-messages/src/index.ts`)에 logger가 포함된다
- [ ] TypeScript typecheck가 통과한다

---

## 7. 실제검증 (QA 시나리오)

### QA-1: WebView 환경에서 로그가 Native에 도달하는지 확인

1. 모바일 앱에서 WebView를 연다
2. Web 코드에서 `logger.info('TEST', 'hello native')`를 호출한다
3. Native 로그 출력에서 `[WEBVIEW] hello native { tag: 'TEST' }` 형태가 확인된다

### QA-2: 일반 Web 환경에서 console fallback 확인

1. 브라우저에서 Web을 직접 연다 (localhost 또는 배포 URL)
2. `logger.info('TEST', 'hello console')`를 호출한다
3. 브라우저 DevTools Console에서 `[TEST] hello console`이 출력된다

### QA-3: error 로그 호출 시 앱 crash 여부 확인

1. WebView 환경에서 아래를 호출한다:
    ```typescript
    logger.error('CRASH_TEST', 'test error', { error: new Error('boom') });
    ```
2. 앱이 crash 나지 않고 정상 작동한다
3. Native 로그에 error 레벨로 기록된다
4. error 필드에 `{ name: 'Error', message: 'boom', stack: '...' }` 형태가 포함된다

### QA-4: 기존 Native logger level 분기 정상 동작 확인

1. 각 level별 로그를 호출한다:
    - `logger.debug('T', 'debug msg')`
    - `logger.info('T', 'info msg')`
    - `logger.warn('T', 'warn msg')`
    - `logger.error('T', 'error msg', { error: new Error('test') })`
2. Native `useLogHandler`가 각각 올바른 level 분기(`case 'debug'`, `case 'info'` 등)로 처리하는지 확인한다

### QA-5: Slack reportError가 불필요하게 호출되지 않는지 확인

1. `logger.error('API', 'something failed', { error })`를 호출한다
2. Slack 채널에 error report가 전송되지 않는다
3. `reportError(error)`를 별도로 호출해야만 Slack에 전송된다

### QA-6: circular reference data 전달 시 동작 확인

1. circular reference가 있는 객체를 생성한다
2. `logger.info('TEST', 'circular', circularObj)`를 호출한다
3. 앱이 crash 나지 않는다
4. Native 로그에 fallback 문자열 형태로 기록되거나 유실되는 것을 확인한다

---

## 8. 구현 계획

### Step 1: logger 디렉토리 생성

- 생성: `libs/app-messages/src/logger/`
- 생성: `libs/app-messages/src/logger/types.ts`
- 생성: `libs/app-messages/src/logger/utils/`
- 생성: `libs/app-messages/src/logger/adapters/`

### Step 2: Logger interface 정의

- 파일: `libs/app-messages/src/logger/types.ts`
- 정의: `LogLevel`, `LogErrorOptions`, `Logger`, `LogEntry`, `LogAdapter`
- `LogLevel`은 기존 `AppLogLevel`을 re-export
- **제한**: `SendLogPayload` 변경 금지

### Step 3: safeSerializable 구현

- 파일: `libs/app-messages/src/logger/utils/safeSerializable.ts`
- `undefined` / `null` → `undefined` 반환
- `Error` 객체 → `{ name, message, stack }` 변환
- 직렬화 가능한 값 → 그대로 반환
- circular reference 등 직렬화 불가 → `String(value)` fallback

### Step 4: Native bridge adapter 구현

- 파일: `libs/app-messages/src/logger/adapters/nativeBridgeAdapter.ts`
- 기존 `postMessage()` 재사용 (새로 구현하지 않음, 수정하지 않음)
- `type: 'SendLog'` 유지
- `SendLogPayload` 구조 유지
- `safeSerializable()` 적용하여 `data`, `error` 필드 안전하게 변환

### Step 5: Console fallback adapter 구현

- 파일: `libs/app-messages/src/logger/adapters/consoleFallbackAdapter.ts`
- 일반 브라우저 환경에서만 사용
- `debug` → `console.debug`, `info` → `console.log`, `warn` → `console.warn`, `error` → `console.error`
- `[tag]` prefix 포함

### Step 6: lazy logger 구현

- 파일: `libs/app-messages/src/logger/index.ts`
- 호출 시점마다 `getMobileAppInfo()` 확인
- WebView → Native bridge adapter
- 일반 브라우저 → Console fallback adapter
- **eager adapter 선택 금지** (모듈 로드 시 1회 결정 금지)
- `logger` 객체 + 타입 export

### Step 7: barrel export 추가

- 수정: `libs/app-messages/src/index.ts`
- 추가: `export * from './logger';`

### Step 8: 테스트 또는 수동 검증

- 테스트 인프라(Jest/Vitest)가 설정되어 있으면:
    - `libs/app-messages/src/logger/__tests__/safeSerializable.test.ts`
    - `libs/app-messages/src/logger/__tests__/nativeBridgeAdapter.test.ts`
    - `libs/app-messages/src/logger/__tests__/consoleFallbackAdapter.test.ts`
    - `libs/app-messages/src/logger/__tests__/logger.test.ts`
- 테스트 인프라가 없으면:
    - Step 7까지 구현 후 7장(실제검증) QA 시나리오로 수동 검증
    - 테스트 추가는 별도 TASK

### Step 9: 기존 console.log 교체는 별도 TASK로 분리

- **이번 작업에서는 logger 모듈 생성까지만** 한다
- 기존 `console.log` 전체 교체는 별도 TASK로 분리
- 이번 작업 scope: Step 1 ~ Step 8

---

## 9. 결정 사항 및 남은 불확실 점

### 확정된 결정

| 항목                    | 결정                                                             | 근거                                                         |
| ----------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| logger 모듈 위치        | `libs/app-messages/src/logger/`                                  | SendLogPayload, WebMessage, postMessage와 가장 가까운 책임   |
| adapter 선택 방식       | **lazy** (호출 시점마다 `getMobileAppInfo()` 확인)               | `CHATIC_APP_PLATFORM` 주입 시점이 모듈 로드보다 늦을 수 있음 |
| WebView fallback        | Native bridge adapter 사용, 실패 시 로그 유실 허용, crash만 방지 | console fallback은 일반 브라우저에서만                       |
| logger.error() 시그니처 | `error(tag, message, options?: LogErrorOptions)`                 | error 객체 + 디버깅 컨텍스트를 함께 전달                     |
| LogAdapter 인터페이스   | `log(entry: LogEntry): void` — 객체 기반                         | 위치 혼동 방지, 확장 용이                                    |
| Error 직렬화            | `safeSerializable()`이 `{ name, message, stack }` 으로 변환      | `JSON.stringify(Error)` → `{}` 문제 해결                     |
| circular reference 방어 | logger adapter에서 `safeSerializable()` 적용                     | postMessage 도달 전에 안전한 데이터 보장                     |
| error reporting         | `logger.error()`는 `reportError()`를 자동 호출하지 않음          | 완전 분리                                                    |
| postMessage 수정        | 수정하지 않음                                                    | 기존 contract 유지 원칙                                      |
| 기존 console.log 교체   | 이번 작업에서는 모듈 생성까지만. 전체 교체는 별도 TASK           | scope 제한                                                   |

### 남은 불확실 점

| 항목                       | 현재 상태                                                   | 비고                                                                                                                                                                             |
| -------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 테스트 프레임워크          | 프로젝트에 테스트 파일 없음                                 | Jest/Vitest 설정 존재 여부 확인 필요. 없으면 Step 8에서 수동 QA로 대체                                                                                                           |
| console override edge case | `getConsoleOverrideScript`가 WebView에서 console을 override | WebView에서는 항상 native adapter를 쓰므로 무한 루프 발생하지 않을 것으로 판단. 단, `getMobileAppInfo()`가 false를 반환하는 WebView edge case가 있다면 문제 가능 — **확인 필요** |

### Codex 구현 시 주의

- **`AppLogLevel` import 경로**: `../types`에서 import 가능 (확인 완료)
    - export 체인: `common.ts` → `model/index.ts` (`export * from './common'`) → `types/index.ts` (`export * from './model'`)
    - logger 내부에서는 `import type { AppLogLevel } from '../types';` 사용

- **`postMessage()` 수정 금지**
    - `postMessage()` 내부의 `JSON.stringify(message)` 위치 문제는 인지하되, 이번 작업에서는 수정하지 않는다
    - logger adapter의 `safeSerializable()`로 `data`와 `error`를 사전 방어하여 `postMessage`에 안전한 payload만 전달
    - `postMessage()` 자체 안정화는 별도 TASK로 분리

- **`safeSerializable()`의 역할 범위**
    - 완전한 sanitize 유틸이 **아니다**
    - 민감 정보(token, password, 개인정보) 제거는 이번 작업 범위가 아님
    - 호출부가 민감 정보를 logger에 넘기지 않아야 하는 책임은 기존과 동일

- lazy 방식이므로 adapter 인스턴스를 캐시하지 않는다 (매번 새로 생성해도 stateless이므로 성능 문제 없음)
- `safeSerializable()`은 `JSON.stringify`를 2번 호출하게 되는 trade-off가 있지만, 로그 전송의 안정성이 우선
- 테스트 인프라가 없으면 Step 8은 수동 QA 체크리스트 명시로 대체
- `LogEntry`는 `SendLogPayload`와 구조가 유사하지만, 별도 타입으로 유지 (logger 레이어의 추상화 유지)
