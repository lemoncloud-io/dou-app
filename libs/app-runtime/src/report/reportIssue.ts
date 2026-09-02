import { WEB_ENV as ENV } from '@chatic/web-config';
import { WEB_PROJECT } from '@chatic/web-config';
import { getRepositories } from '../data/runtime';
import { getActiveSessionUser, getGlobalSessionContext } from '../session';
import { sanitizeReportUrl } from './reportUrl';
import { isNative, logger } from '@chatic/bridges';

import type { IssueReportWireBody } from '@chatic/http';
import type { AppType, IssueReportExtras } from './types';

/**
 * `stereo` 는 저장되는 리포트 레코드의 종류이고, admin 조회의 서버측 필터 기준(`MockListParam.type`)이다.
 *
 * 자동 에러 리포트가 폐지되면서(`reportError` 삭제) 이 엔드포인트를 쓰는 것은 사용자 제보 하나뿐이지만,
 * 값은 유지한다 — 저장소에는 폐지 이전에 쌓인 `stereo: 'log'` 에러 리포트와 배치 업로더가 지금도 올리는
 * 로그 엔트리가 함께 있고, admin은 이 값으로 제보를 그것들과 가른다.
 *
 * 와이어 형태(`stereo` 교차 타입 포함)는 `@chatic/http`의 `ReportHttpGateway` 소관이다 —
 * `IssueReportWireBody`가 그것이고, 이 파일은 그 body를 조립만 한다.
 */
const REPORT_STEREO_ISSUE = 'issue';

/**
 * 리포트를 보낸 앱. 타이틀 `[app] issue: ...`의 그 app이고, admin 목록의 App 필터
 * 기준이다.
 *
 * 별도 설정을 두지 않고 `WEB_PROJECT`(= `VITE_PROJECT`)에서 유도한다 — admin은
 * 이미 `CHATIC_ADMIN`으로 배포되고 있어서, 호출부가 자기 정체를 따로 선언하지
 * 않아도 갈린다.
 */
const resolveAppType = (): AppType => {
    if (isNative()) return 'mobile';
    return WEB_PROJECT.includes('admin') ? 'admin' : 'web';
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
        // Issue reporting is synchronous (not a hook), so it can't observe the profile cache.
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
            // 쿼리 값은 가려서 싣는다 — OAuth 콜백·검증 링크의 토큰이 실리는
            // 자리이고, 이 payload는 저장되며 첨부 없는 이슈 리포트는 Slack
            // 채널로도 나간다. 초대 `code`만 추적을 위해 예외. @see ./reportUrl
            url: sanitizeReportUrl(window.location.href),
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

        const body: IssueReportWireBody = {
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

        // repository → data source → gateway, like every other data call (ADR-0036). Resolved per
        // call, not captured at module load: this file must stay importable before the data runtime
        // is configured — same rule `session/auth` follows.
        await getRepositories().report.submitIssue(body);
    } catch (reportingError) {
        logger.error('ERROR_REPORT', 'Failed to report issue', { error: reportingError });
        throw reportingError;
    }
};
