import { DOU_ENDPOINT, ENV } from '../session/core';
import { webTransport } from '../transport';
import { getActiveSessionUser, getGlobalSessionContext } from '../session';
import { classifyReport } from './reportCategory';
import { isNative, logBuffer, logger, serializeLogs } from '@chatic/bridges';

import type { SlackReportBody } from '@lemoncloud/chatic-backend-api';
import type { AppType, ErrorReportContext, ErrorReportPayload, IssueReportExtras } from './types';

const ERROR_REPORT_ENDPOINT = `${DOU_ENDPOINT}/hello/report`;

// Throttling: 동일 (카테고리+메시지)는 60초 내 1회만 리포트.
// message 단독 키였을 때는 "Network Error" 같은 동일 메시지가 서로 다른
// 카테고리(예: network vs unknown)여도 한 버킷으로 붕괴했다. category를 키에
// 넣어 카테고리가 다르면 각각 통과시킨다. (opaque "Script error."는 message도
// 카테고리도 같아 여전히 한 버킷이다 — 이건 근본 원인 스파이크의 몫.) @see ADR-0029
const THROTTLE_WINDOW_MS = 60_000;
const recentErrors = new Map<string, number>();

/** breadcrumb으로 붙일 최근 로그 개수 (링버퍼 tail). */
const RECENT_LOG_COUNT = 50;

export const reportError = async (error: Error, context?: ErrorReportContext): Promise<void> => {
    const category = classifyReport(error, context);
    const throttleKey = `${category}|${error.message}`;
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

        // breadcrumb: 링버퍼의 최근 로그 tail. peek()는 oldest-first라 tail을 취해
        // 가장 최근 항목을 얻는다 (issue-report의 buildReportContext와 동일 관용구).
        const recentLogs = logBuffer.peek().slice(-RECENT_LOG_COUNT);

        // location: window.onerror가 준 filename/lineno/colno. message가 opaque해도
        // 브라우저가 채워주므로 opaque script error의 유일한 위치 단서가 된다.
        const hasLocation =
            context?.filename !== undefined || context?.lineno !== undefined || context?.colno !== undefined;

        const payload: ErrorReportPayload = {
            category,
            message: error.message,
            stack: error.stack,
            componentStack: context?.componentStack,
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
            location: hasLocation
                ? { filename: context?.filename, lineno: context?.lineno, colno: context?.colno }
                : undefined,
            logs: recentLogs.length ? serializeLogs(recentLogs) : undefined,
            path: window.location.pathname,
        };

        const body: SlackReportBody = {
            // 카테고리를 타이틀에 실어 Slack·admin 목록에서 성격을 즉시 구분한다.
            title: `[${app}] ${category}`,
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
