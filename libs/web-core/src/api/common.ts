import { DOU_ENDPOINT, ENV } from '../session/core';
import { webTransport } from '../transport';
import { getGlobalSessionContext } from '../session';
import { isNative, logger } from '@chatic/bridges';

import type { SlackReportBody } from '@lemoncloud/chatic-backend-api';
import type { AppType, ErrorReportPayload } from './types';

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
        // Read identity facts off the derived session fields, not activeProfile directly:
        // activeProfile is state storage; its display data is consumed via user.observeItem(uid).
        const userRole = state.identity.userRole ?? undefined;

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
                name: state.identity.userName,
                role: userRole,
                isAuthenticated: state.identity.isAuthenticated,
                isGuest: state.identity.isGuest,
                isCloudUser: state.identity.cloudProfile !== null,
                isInvited: state.identity.isInvited,
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
 */
export const reportIssue = async (title: string, message: string): Promise<void> => {
    try {
        const app: AppType = isNative() ? 'mobile' : 'web';

        const state = getGlobalSessionContext();
        // Read identity facts off the derived session fields, not activeProfile directly:
        // activeProfile is state storage; its display data is consumed via user.observeItem(uid).
        const userRole = state.identity.userRole ?? undefined;

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
                name: state.identity.userName,
                role: userRole,
                isAuthenticated: state.identity.isAuthenticated,
            },
            cloud: {
                connected: hasCloud,
                cloudId: hasCloud ? (cloudState.cloudId ?? undefined) : undefined,
                name: hasCloud ? (cloudToken?.name ?? undefined) : undefined,
                placeId: cloudState.siteId ?? undefined,
            },
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
