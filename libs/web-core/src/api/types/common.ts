// ============================================================================
// Error Report Types & API
// @see clipbiz-backend-api@0.26.103
// ============================================================================

export type AppType = 'web' | 'admin' | 'mobile';

/**
 * 에러 상세 정보 (message에 JSON string으로 전달)
 */
export interface ErrorReportPayload {
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
}
