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
        isInvited: boolean;
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
