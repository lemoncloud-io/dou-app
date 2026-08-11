// ============================================================================
// Error Report Types & API
// @see clipbiz-backend-api@0.26.103
// ============================================================================

import type { SerializedLog } from '@chatic/bridges';

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
    source?: 'window.onerror' | 'unhandledrejection' | 'error-boundary' | 'query' | 'mutation' | 'manual';
    /** window.onerror에서 `event.error`가 null이었는지 (opaque script error 판별). */
    errorWasNull?: boolean;
    /** ErrorEvent.filename — message가 opaque해도 브라우저가 채워주는 위치 정보. */
    filename?: string;
    /** ErrorEvent.lineno. */
    lineno?: number;
    /** ErrorEvent.colno. */
    colno?: number;
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
    componentStack?: string;
    // 환경
    app: AppType;
    env: string;
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
    // HTTP 에러 정보
    http?: {
        status?: number;
        statusText?: string;
        code?: string;
        responseData?: unknown;
    };
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
    // breadcrumb: 직전 로그 tail (링버퍼) — "무슨 일 직후 터졌나"
    logs?: SerializedLog[];
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
    /** Recent log entries (already serialized/truncated by the caller). */
    logs?: unknown[];
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
