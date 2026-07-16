import { DOU_ENDPOINT, ENV } from '../session/core';
import { webTransport } from '../transport';
import { getActiveSessionUser, getGlobalSessionContext } from '../session';
import { isNative, logger } from '@chatic/bridges';

import type { SlackReportBody } from '@lemoncloud/chatic-backend-api';
import type { AppType, ErrorReportPayload, IssueReportExtras } from './types';

const ERROR_REPORT_ENDPOINT = `${DOU_ENDPOINT}/hello/report`;

// Throttling: 동일 에러 메시지는 60초 내 1회만 리포트
const THROTTLE_WINDOW_MS = 60_000;
const recentErrors = new Map<string, number>();

export const reportError = async (error: Error, errorInfo?: { componentStack?: string }): Promise<void> => {
    const throttleKey = error.message;
    const now = Date.now();
    const lastReported = recentErrors.get(throttleKey);
    if (lastReported && now - lastReported < THROTTLE_WINDOW_MS) {
        logger.warn('ERROR_REPORT', '[ErrorReport] Throttled (duplicate within 60s)', { throttleKey });
        return;
    }
    recentErrors.set(throttleKey, now);

    // 오래된 항목 정리 (메모리 누수 방지)
    if (recentErrors.size > 100) {
        for (const [key, ts] of recentErrors) {
            if (now - ts > THROTTLE_WINDOW_MS) recentErrors.delete(key);
        }
    }

    try {
        // 앱 타입 자동 감지
        const app: AppType = isNative() ? 'mobile' : 'web';

        const state = getGlobalSessionContext();
        // Error telemetry is synchronous (not a hook), so it can't observe the profile cache.
        // Read the role/name straight off the active session token payload; the app UI uses the
        // reactive useProfileFacts hook instead.
        const sessionUser = getActiveSessionUser() as { userRole?: string; name?: string } | null;
        const userRole = sessionUser?.userRole;

        const cloudState = state.cloud;
        const cloudToken = cloudState.cloudToken;
        const backend = cloudState.backend;
        const hasCloud = !!cloudToken && !!backend;

        // HTTP 에러 정보 추출
        const err = error as any;
        const httpStatus = err?.status || err?.response?.status || err?.statusCode;
        const httpInfo = httpStatus
            ? {
                  status: httpStatus,
                  statusText: err?.statusText || err?.response?.statusText,
                  code: err?.code,
                  responseData: err?.response?.data,
              }
            : err?.code
              ? { code: err.code }
              : undefined;

        // 디바이스 정보 (모바일 WebView 주입값)
        const w = window as any;

        const payload: ErrorReportPayload = {
            message: error.message,
            stack: error.stack,
            componentStack: errorInfo?.componentStack,
            app,
            env: ENV,
            url: window.location.href,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            user: {
                uid: state.identity.userId ?? undefined,
                name: sessionUser?.name,
                role: userRole,
                isAuthenticated: state.identity.isAuthenticated,
                isGuest: userRole === 'guest',
                isCloudUser: state.cloud.isActive,
            },
            cloud: {
                connected: hasCloud,
                cloudId: hasCloud ? (cloudState.cloudId ?? undefined) : undefined,
                name: hasCloud ? (cloudToken?.name ?? undefined) : undefined,
                backend: hasCloud ? (backend ?? undefined) : undefined,
                placeId: cloudState.siteId ?? undefined,
            },
            http: httpInfo,
            device: isNative()
                ? {
                      platform: w.CHATIC_APP_PLATFORM,
                      appVersion: w.CHATIC_APP_CURRENT_VERSION,
                      deviceModel: w.CHATIC_APP_DEVICE_MODEL,
                  }
                : undefined,
            network: {
                online: navigator.onLine,
            },
        };

        const body: SlackReportBody = {
            title: `[${app}] error`,
            message: JSON.stringify(payload, null, 2),
            silent: ENV !== 'prod',
            save: true,
        };

        await webTransport
            .buildSignedRequest({
                method: 'POST',
                baseURL: ERROR_REPORT_ENDPOINT,
            })
            .setBody(body)
            .execute();
    } catch (reportingError) {
        logger.error('ERROR_REPORT', 'Failed to report error', { error: reportingError });
    }
};

/**
 * 사용자가 직접 이슈를 보고하는 함수
 * reportError와 달리 스로틀링 없음 (사용자 의도적 액션)
 *
 * `extras`는 사용자 대면 이슈 리포트 위젯이 붙이는 선택 컨텍스트(최근 로그,
 * 디바이스/버전 스냅샷 등)다. 없으면 기존 2-인자 호출과 동일하게 동작한다.
 */
export const reportIssue = async (title: string, message: string, extras?: IssueReportExtras): Promise<void> => {
    try {
        const app: AppType = isNative() ? 'mobile' : 'web';

        const state = getGlobalSessionContext();
        // Error telemetry is synchronous (not a hook), so it can't observe the profile cache.
        // Read the role/name straight off the active session token payload; the app UI uses the
        // reactive useProfileFacts hook instead.
        const sessionUser = getActiveSessionUser() as { userRole?: string; name?: string } | null;
        const userRole = sessionUser?.userRole;

        const cloudState = state.cloud;
        const cloudToken = cloudState.cloudToken;
        const backend = cloudState.backend;
        const hasCloud = !!cloudToken && !!backend;

        const payload = {
            title,
            message,
            app,
            env: ENV,
            url: window.location.href,
            timestamp: new Date().toISOString(),
            user: {
                uid: state.identity.userId ?? undefined,
                name: sessionUser?.name,
                role: userRole,
                isAuthenticated: state.identity.isAuthenticated,
            },
            cloud: {
                connected: hasCloud,
                cloudId: hasCloud ? (cloudState.cloudId ?? undefined) : undefined,
                name: hasCloud ? (cloudToken?.name ?? undefined) : undefined,
                placeId: cloudState.siteId ?? undefined,
            },
            // User-facing widget context (recent logs, device/version snapshot, ...).
            // Spread only when provided so the base payload shape is unchanged for
            // legacy 2-arg callers.
            ...(extras ?? {}),
        };

        const body: SlackReportBody = {
            title: `[${app}] issue: ${title}`,
            message: JSON.stringify(payload, null, 2),
            silent: false,
            save: true,
        };

        await webTransport
            .buildSignedRequest({
                method: 'POST',
                baseURL: ERROR_REPORT_ENDPOINT,
            })
            .setBody(body)
            .execute();
    } catch (reportingError) {
        logger.error('ERROR_REPORT', 'Failed to report issue', { error: reportingError });
        throw reportingError;
    }
};
