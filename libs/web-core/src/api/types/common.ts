// ============================================================================
// Error Report Types & API
// @see clipbiz-backend-api@0.26.103
// ============================================================================

import type { ReportedCause } from '../errorCause';
import type { HttpContext } from '../httpContext';

export type AppType = 'web' | 'admin' | 'mobile';

/**
 * 에러 리포트 카테고리 — HTTP status 중심의 `classifyError`와 별개로, "에러가
 * 어디서/어떤 형태로 발생했는가"(출처·종류)를 트리아지 1차 축으로 삼는다.
 * 타이틀(`[app] <category>`)과 payload 양쪽에 실린다. @see ADR-0029
 */
export type ErrorCategory =
    | 'script-error' // opaque cross-origin window.onerror (event.error === null)
    | 'unhandled-rejection' // unhandledrejection 경로 (http/network로 분류 안 될 때)
    | 'react-render' // ErrorBoundary (componentStack 존재)
    | 'network' // ERR_NETWORK / offline / timeout
    | 'auth' // 403 / 토큰 문제
    | 'http-4xx' // 4xx (403 제외)
    | 'http-5xx' // 5xx
    // ADR-0047 감지 확장 카테고리
    | 'resource-error' // capture-phase 리소스(img/script/link) 로드 실패
    | 'csp-violation' // securitypolicyviolation 이벤트
    | 'page-crash' // 직전 세션이 pagehide 없이 종료 (센티널 사후 감지)
    | 'webview-crash' // 네이티브가 감지한 WebView 프로세스 크래시 (대리 전송)
    | 'native-error' // RN 전역 핸들러가 잡은 네이티브 JS 예외 (대리 전송)
    | 'native-crash' // Crashlytics 재실행 감지 (대리 전송, 스택은 Crashlytics에만)
    | 'unknown';

/**
 * `reportError`가 분류·진단에 쓰는 선택 컨텍스트. 전역 핸들러(apps/web)가
 * 원시 이벤트에서 뽑아 넘긴다. 분류 판단은 전역 핸들러가 아니라 web-core가
 * 소유하므로, 여기에는 판단 근거가 되는 원시 값만 담는다.
 *
 * 기존 2-인자 호출(`{ componentStack }`)과 하위 호환된다.
 */
export interface ErrorReportContext {
    /** React ErrorBoundary가 준 컴포넌트 스택. */
    componentStack?: string;
    /** 에러가 들어온 경로. */
    source?:
        | 'window.onerror'
        | 'unhandledrejection'
        | 'error-boundary'
        | 'query'
        | 'mutation'
        | 'manual'
        // ADR-0047 감지 확장 경로
        | 'resource-error'
        | 'csp-violation'
        | 'page-crash-sentinel'
        | 'pending-report';
    /** window.onerror에서 `event.error`가 null이었는지 (opaque script error 판별). */
    errorWasNull?: boolean;
    /** ErrorEvent.filename — message가 opaque해도 브라우저가 채워주는 위치 정보. */
    filename?: string;
    /** ErrorEvent.lineno. */
    lineno?: number;
    /** ErrorEvent.colno. */
    colno?: number;
    /**
     * 분류를 우회하는 명시적 카테고리 (ADR-0047). 감지 시점에 이미 종류가
     * 확정된 리포트(page-crash, 네이티브 대리 전송 등)가 쓴다 — 에러의
     * 성질로 재분류하면 오히려 왜곡되는 케이스.
     */
    categoryOverride?: ErrorCategory;
    /**
     * 실제 발생(감지) 시각 — 부재 시 전송 시각. 지연 전송되는 리포트
     * (page-crash, 네이티브 대리 전송)는 이 값을 payload timestamp로 쓴다.
     */
    occurredAt?: number;
}

/**
 * 에러 상세 정보 (message에 JSON string으로 전달)
 */
export interface ErrorReportPayload {
    // 분류
    category: ErrorCategory;
    // 에러 정보
    message: string;
    stack?: string;
    /**
     * stack이 원본이 아니라 리포터가 합성한 것임을 표시 (ADR-0047 P1).
     * opaque script error는 합성 stack을 아예 싣지 않으므로, 이 플래그가 있으면
     * "stack 없음 = 브라우저가 마스킹한 에러"라는 뜻이다.
     */
    stackSynthetic?: boolean;
    /**
     * `error.cause` 체인 (바깥→안). 감싼 에러의 `stack`은 감싼 자리를 가리키므로,
     * 실제로 무엇이 깨졌는지는 여기에만 남는다 — React가 렌더 실패를 이렇게 감싸는
     * 것이 대표 사례다. 깊이·문자수 상한은 `collectCauses`가 건다.
     */
    causes?: ReportedCause[];
    componentStack?: string;
    // 환경
    app: AppType;
    env: string;
    /**
     * 이 리포트를 만든 웹 번들의 릴리스 버전. 어느 릴리스에서 터졌는지가 트리아지의
     * 1차 질문이고, 나중에 소스맵을 비공개 보관하게 되면 맵을 찾는 키가 된다
     * (ADR-0047 범위 밖 P3의 선행 조건). 번들 해시 자체는 stack·location.filename의
     * URL에 이미 들어 있다.
     */
    webVersion?: string;
    url: string;
    timestamp: string;
    userAgent?: string;
    // 유저
    user: {
        uid?: string;
        name?: string;
        role?: string;
        isAuthenticated: boolean;
        isGuest: boolean;
        isCloudUser: boolean;
    };
    // 클라우드
    cloud: {
        connected: boolean;
        cloudId?: string;
        name?: string;
        backend?: string;
        placeId?: string;
    };
    /**
     * 실패한 요청의 전모 — 어디로 보내서(`url`/`method`), 무엇을 보냈고
     * (`params`/`requestBody`), 무엇이 돌아왔는지(`status`/`responseData`).
     * 본문류는 `describeHttp`가 redact + truncate 한 값이다.
     */
    http?: HttpContext;
    // 디바이스 (모바일 전용)
    device?: {
        platform?: string;
        appVersion?: string;
        deviceModel?: string;
    };
    // 네트워크
    network: {
        online: boolean;
    };
    // 에러 발생 위치 (opaque script error도 브라우저가 채워주는 filename/line/col)
    location?: {
        filename?: string;
        lineno?: number;
        colno?: number;
    };
    // 리포트 시점 라우트 (window.location.pathname)
    path?: string;
}

/**
 * Optional context a user-facing issue report can attach on top of the base
 * `reportIssue` payload (user/cloud/env/url). Kept loosely typed so web-core
 * stays decoupled from the app's log/device modules — the caller (apps/web
 * issue-report feature) composes and passes a concrete shape.
 */
export interface IssueReportExtras {
    /** Device snapshot (platform, model, stage, ...). */
    device?: Record<string, unknown>;
    /** Version snapshot (appVersion, webVersion, ...). */
    version?: Record<string, unknown>;
    /** navigator.onLine at report time. */
    online?: boolean;
    /** Viewport size at report time. */
    viewport?: { width: number; height: number };
    /** Current route path at report time. */
    path?: string;
    /**
     * Recently visited route paths, oldest first. The report screen is reached from a menu, so
     * `path` alone says nothing about where the user hit the problem — the entry before the last
     * one does.
     */
    routeTrail?: string[];
    /**
     * User-attached screenshots as base64 JPEG data URLs.
     *
     * Rides in the payload like the rest, but their size changes how the report is
     * sent: the payload is also the Slack message text, and one image blows past its
     * ~40k character limit, so `reportIssue` sends a report carrying images with
     * `silent: true` — stored, not announced. @see ADR-0049
     */
    images?: string[];
}
