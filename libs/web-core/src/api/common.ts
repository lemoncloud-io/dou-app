import { DOU_ENDPOINT, ENV } from '../session/core';
import { WEB_PROJECT, webTransport } from '../transport';
import { getActiveSessionUser, getGlobalSessionContext } from '../session';
import { collectCauses } from './errorCause';
import { classifyReport } from './reportCategory';
import { collectBreadcrumbs, isNative, logBuffer, logger, serializeLogs } from '@chatic/bridges';

import type { SlackReportBody, SlackReportResult } from '@lemoncloud/chatic-backend-api';
import type { AppType, ErrorReportContext, ErrorReportPayload, IssueReportExtras } from './types';

const ERROR_REPORT_ENDPOINT = `${DOU_ENDPOINT}/hello/report`;

/**
 * `stereo` 는 저장되는 리포트 레코드의 종류이고, admin 조회의 서버측 필터 기준(`MockListParam.type`)이다.
 * reportError/reportIssue 가 같은 엔드포인트를 쓰므로 (`/hello/report`), 서버가 둘을 구분할 유일한
 * 단서가 이 값이다. 이게 없으면 admin 은 저장된 제목(`[app] issue: ...`)을 파싱해 클라이언트에서만
 * 가를 수 있어, 종류별 페이지네이션·집계가 불가능하다.
 *
 * 배포된 백엔드는 `SlackReportBody.stereo` 를 받지만 설치된 SDK 타입에는 아직 없어서 로컬에서
 * 교차 타입으로 확장한다. SDK 가 갱신되면 `ReportBody` 를 지우고 SDK 타입을 그대로 쓴다.
 */
const REPORT_STEREO_ERROR = 'log';
const REPORT_STEREO_ISSUE = 'issue';

type ReportBody = SlackReportBody & { stereo?: string };

/** breadcrumb으로 붙일 최근 로그 개수 (링버퍼 tail). */
const RECENT_LOG_COUNT = 50;

/**
 * 리포트를 보낸 앱. 타이틀 `[app] <category>`의 그 app이고, admin 목록의 App 필터
 * 기준이다.
 *
 * 별도 설정을 두지 않고 `WEB_PROJECT`(= `VITE_PROJECT`)에서 유도한다 — admin은
 * 이미 `CHATIC_ADMIN`으로 배포되고 있어서, 호출부가 자기 정체를 따로 선언하지
 * 않아도 갈린다. 이 구분이 없으면 admin 에러가 `[web]`으로 저장돼 프런트 리포트
 * 사이에 섞이고, 어느 앱에서 난 건지 본문을 열어봐야 알 수 있다.
 */
const resolveAppType = (): AppType => {
    if (isNative()) return 'mobile';
    return WEB_PROJECT.includes('admin') ? 'admin' : 'web';
};

/**
 * 호스트 앱의 번들러가 주입하는 웹 릴리스 버전. web-core는 여러 앱이 공유하고
 * 모두가 이 define을 갖지는 않으므로 `typeof` 가드를 둔다 — libs/shared,
 * libs/device-utils와 같은 관용구다.
 */
declare const __APP_VERSION__: string;
const WEB_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : undefined;

export const reportError = async (error: Error, context?: ErrorReportContext): Promise<void> => {
    const category = classifyReport(error, context);
    const now = Date.now();
    // Occurrence time: deferred reports (page-crash, native relays) carry their
    // detection time; live reports use the call time.
    const errorAt = context?.occurredAt ?? now;

    // Synchronous local-buffer snapshot at error time — the fallback baseline
    // when the async LogSource pull fails or times out (ADR-0047).
    const localSnapshot = logBuffer.peek();

    try {
        const app: AppType = resolveAppType();

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

        // HTTP 에러 정보 추출. 실패한 요청의 URL·메서드(axios config)는 "어떤
        // API가 죽었는지"를 어드민에서 즉시 식별하게 하는 핵심 단서다 (ADR-0047).
        const err = error as any;
        const httpStatus = err?.status || err?.response?.status || err?.statusCode;
        const requestUrl: string | undefined = err?.config?.url ?? err?.request?.responseURL ?? undefined;
        const requestMethod: string | undefined =
            typeof err?.config?.method === 'string' ? err.config.method.toUpperCase() : undefined;
        const requestInfo = requestUrl ? { url: requestUrl, method: requestMethod } : {};
        const httpInfo = httpStatus
            ? {
                  status: httpStatus,
                  statusText: err?.statusText || err?.response?.statusText,
                  code: err?.code,
                  responseData: err?.response?.data,
                  ...requestInfo,
              }
            : err?.code || requestUrl
              ? { code: err?.code, ...requestInfo }
              : undefined;

        // 디바이스 정보 (모바일 WebView 주입값)
        const w = window as any;

        // breadcrumb (ADR-0047): logsOverride(직전 세션/감지 시점 스냅샷)가 있으면
        // 그대로, 없으면 활성 LogSource(하이브리드=네이티브 통합 버퍼, 웹 단독=
        // 로컬 버퍼)에서 pull하고 errorAt 이후 로그를 걸러낸다. 실패 시 에러
        // 시점의 동기 스냅샷으로 폴백.
        const recentLogs = context?.logsOverride
            ? context.logsOverride.slice(-RECENT_LOG_COUNT)
            : await collectBreadcrumbs(RECENT_LOG_COUNT, localSnapshot, errorAt);

        // location: window.onerror가 준 filename/lineno/colno. message가 opaque해도
        // 브라우저가 채워주므로 opaque script error의 유일한 위치 단서가 된다.
        const hasLocation =
            context?.filename !== undefined || context?.lineno !== undefined || context?.colno !== undefined;

        // P1 리포터 정직화 (ADR-0047): errorWasNull이면 error는 전역 핸들러가
        // 합성한 것이라 stack이 핸들러 자신을 가리키는 가짜다 — 싣지 않고
        // stackSynthetic으로 그 사실만 남긴다.
        const isSyntheticStack = context?.errorWasNull === true;

        // 감싼 에러의 원점. `error.stack`은 감싼 자리를 가리키므로 이게 없으면
        // "무엇이 깨졌나"가 리포트에서 통째로 빠진다.
        const causes = collectCauses(error);

        // 메시지 상단 컨텍스트 (ADR-0047): 어드민 목록에서 본문을 열지 않고도
        // 성격을 식별하게 한다 — script-error는 위치, 요청 실패는 메서드+URL.
        // 실패한 요청은 메서드+URL을 message에 싣는다 — admin이 message로 그룹을
        // 묶으므로(groupReportLogs), 서로 다른 엔드포인트가 "Network Error" 한
        // 버킷으로 붕괴하던 것이 갈린다.
        //
        // 반면 script-error의 위치(filename:lineno:colno)는 여기 넣지 않는다.
        // 좌표가 발생마다·배포마다 달라 같은 버그가 매번 새 그룹으로 잡히고,
        // admin의 메시지 기반 그룹핑(`groupReportLogs`)이 잘게 쪼개져 집계가
        // 가장 필요한 카테고리의 추이가 끊긴다. 위치는 `payload.location`에
        // 그대로 있고 admin 상세가 표시한다.
        const messageSuffix = requestUrl ? ` → ${requestMethod ?? 'REQUEST'} ${requestUrl}` : '';

        const payload: ErrorReportPayload = {
            category,
            message: `${error.message}${messageSuffix}`,
            stack: isSyntheticStack ? undefined : error.stack,
            stackSynthetic: isSyntheticStack || undefined,
            // 합성 stack이어도 cause는 싣는다 — 합성된 건 바깥 껍데기뿐이고,
            // 원본이 매달려 있다면 그게 유일한 실마리다.
            causes: causes.length ? causes : undefined,
            componentStack: context?.componentStack,
            app,
            env: ENV,
            webVersion: WEB_VERSION,
            url: window.location.href,
            timestamp: new Date(errorAt).toISOString(),
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

        const body: ReportBody = {
            // 카테고리를 타이틀에 실어 admin 목록에서 성격을 즉시 구분한다.
            title: `[${app}] ${category}`,
            message: JSON.stringify(payload, null, 2),
            // Slack에는 올리지 않는다 — 스로틀을 뗀 뒤로는 에러 스톰이 나면 그
            // 횟수만큼 알림이 그대로 쌓이기 때문. `save: true`라 admin-v2 리포트
            // 목록에는 그대로 쌓이고, 잃는 것은 Slack 알림뿐이다.
            silent: true,
            save: true,
            stereo: REPORT_STEREO_ERROR,
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
 *
 * `extras`는 사용자 대면 이슈 리포트 화면이 붙이는 선택 컨텍스트(최근 로그,
 * 디바이스/버전 스냅샷 등)다. 없으면 기존 2-인자 호출과 동일하게 동작한다.
 *
 * **첨부(`extras.images`)가 있으면 `silent: true`로 보낸다.** payload는 `body.message`에
 * JSON 문자열로 실려 그대로 Slack 메시지 텍스트가 되는데, base64 이미지 한 장이면 Slack
 * 텍스트 상한(약 40k자)을 훌쩍 넘는다. `SlackReportBody.meta`로 분리해 보내봤으나 백엔드가
 * 클라이언트 `meta`를 저장하지 않는 것이 실측으로 확인돼(2026-08-11), 저장되는 자리는
 * `message` 하나뿐이다. 그래서 첨부가 있는 제보만 Slack 전송을 끄고 저장만 한다 —
 * 알림을 잃는 대신 사진이 남는다. @see ADR-0049
 */
export const reportIssue = async (title: string, message: string, extras?: IssueReportExtras): Promise<void> => {
    try {
        const app: AppType = resolveAppType();
        const extrasWithImages = extras ?? {};
        const hasImages = !!extrasWithImages.images?.length;

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
            // User-facing screen context (recent logs, device/version snapshot, attachments, ...).
            // Spread only when provided so the base payload shape is unchanged for
            // legacy 2-arg callers.
            ...extrasWithImages,
        };

        const serialized = JSON.stringify(payload, null, 2);

        const body: ReportBody = {
            title: `[${app}] issue: ${title}`,
            message: serialized,
            // Attachments make the payload far larger than Slack will take as message text, and
            // `message` is the only field the backend persists, so a report carrying photos is
            // saved without notifying. Reports without photos keep their Slack ping.
            silent: hasImages,
            save: true,
            stereo: REPORT_STEREO_ISSUE,
        };

        if (hasImages) {
            // The remaining unknown is the store's per-item size ceiling (ADR-0049). Log what we
            // actually sent so a failure has a number next to it instead of a guess.
            logger.info('ISSUE_REPORT', '[reportIssue] sending attachments', {
                images: extrasWithImages.images?.length,
                payloadKb: Math.round(serialized.length / 1024),
                silent: true,
            });
        }

        await webTransport
            .buildSignedRequest({
                method: 'POST',
                baseURL: ERROR_REPORT_ENDPOINT,
            })
            .setBody(body)
            .execute<SlackReportResult>();
    } catch (reportingError) {
        logger.error('ERROR_REPORT', 'Failed to report issue', { error: reportingError });
        throw reportingError;
    }
};
