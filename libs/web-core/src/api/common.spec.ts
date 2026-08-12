// reportError의 "조립부"(카테고리 → 타이틀 `[app] category`, location, breadcrumb)를
// 검증한다. classifyReport/serializeLogs/parseReportLog는 각자 spec이 있으나,
// 이들을 엮어 최종 SlackReportBody를 만드는 부분은 여기서 본다.
// 특히 타이틀 포맷은 admin 파서가 의존하는 계약이라 회귀를 잡아야 한다. @see ADR-0029
jest.mock('../session/core', () => ({ DOU_ENDPOINT: 'https://api.test', ENV: 'test' }));

// `WEB_PROJECT` drives the `[app]` bracket, so it is mutable here — the admin
// case is a real branch, not a constant.
jest.mock('../transport', () => ({ webTransport: { buildSignedRequest: jest.fn() }, WEB_PROJECT: 'chatic' }));

jest.mock('../session', () => ({
    getActiveSessionUser: jest.fn(),
    getGlobalSessionContext: jest.fn(),
}));

jest.mock('@chatic/bridges', () => ({
    isNative: jest.fn(() => false),
    logBuffer: { peek: jest.fn(() => []) },
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    serializeLogs: jest.fn((entries: unknown[]) => entries),
    // Mirrors the local-source behavior (tail of the error-time snapshot) so
    // breadcrumb assertions keep exercising the assembled flow (ADR-0047).
    collectBreadcrumbs: jest.fn(async (count: number, fallback: unknown[]) => fallback.slice(-count)),
}));

import { getActiveSessionUser, getGlobalSessionContext } from '../session';
import * as transport from '../transport';
import { webTransport } from '../transport';
import { isNative, logBuffer, logger } from '@chatic/bridges';
import { reportError, reportIssue } from './common';

const execute = jest.fn().mockResolvedValue(undefined);
const setBody = jest.fn(() => ({ execute }));

/** Grab the SlackReportBody handed to the transport, with the payload JSON parsed. */
const lastReport = (): { title: string; silent: boolean; save: boolean; stereo: string; payload: any } => {
    const body = setBody.mock.calls.at(-1)?.[0];
    return { ...body, payload: JSON.parse(body.message) };
};

/** Mocked module property, so it is assignable — mirrors how `isNative` is reset below. */
const setWebProject = (value: string) => {
    (transport as unknown as { WEB_PROJECT: string }).WEB_PROJECT = value;
};

beforeEach(() => {
    jest.clearAllMocks();
    (webTransport.buildSignedRequest as jest.Mock).mockReturnValue({ setBody });
    (isNative as jest.Mock).mockReturnValue(false);
    setWebProject('chatic');
    (logBuffer.peek as jest.Mock).mockReturnValue([]);
    (getActiveSessionUser as jest.Mock).mockReturnValue({ userRole: 'user', name: 'Tester' });
    (getGlobalSessionContext as jest.Mock).mockReturnValue({
        identity: { userId: '1000', isAuthenticated: true },
        cloud: { cloudToken: null, backend: null, isActive: false, cloudId: null, siteId: null },
    });
});

describe('reportError — 리포트 조립', () => {
    it('타이틀을 `[app] category`로 만들고 payload.category를 채운다', async () => {
        await reportError(new Error('q1 mystery boom'));
        const report = lastReport();
        expect(report.title).toBe('[web] unknown'); // status/ctx 없음 → unknown
        expect(report.payload.category).toBe('unknown');
    });

    it('네이티브면 app이 mobile이라 타이틀도 [mobile]', async () => {
        (isNative as jest.Mock).mockReturnValue(true);
        await reportError(Object.assign(new Error('q1 server down'), { status: 500 }));
        expect(lastReport().title).toBe('[mobile] http-5xx');
    });

    // admin이 web과 갈리지 않으면 어드민 자신의 에러가 프런트 리포트 사이에 섞여
    // 본문을 열기 전엔 출처를 알 수 없다. 구분은 VITE_PROJECT에서 유도한다.
    it('VITE_PROJECT가 admin이면 타이틀이 [admin]', async () => {
        setWebProject('chatic_admin');

        await reportError(new Error('q1 admin side failure'));

        expect(lastReport().title).toBe('[admin] unknown');
    });

    it('네이티브 판정이 프로젝트보다 우선한다 (admin 빌드를 WebView로 열 일은 없지만 순서를 고정)', async () => {
        setWebProject('chatic_admin');
        (isNative as jest.Mock).mockReturnValue(true);

        await reportError(new Error('q1 native wins'));

        expect(lastReport().title).toBe('[mobile] unknown');
    });

    it('window.onerror opaque 스크립트 에러는 script-error + location 캡처', async () => {
        await reportError(new Error('Script error.'), {
            source: 'window.onerror',
            errorWasNull: true,
            filename: 'https://x/app.js',
            lineno: 2,
            colno: 42,
        });
        const { title, payload } = lastReport();
        expect(title).toBe('[web] script-error');
        expect(payload.category).toBe('script-error');
        expect(payload.location).toEqual({ filename: 'https://x/app.js', lineno: 2, colno: 42 });
    });

    it('위치 정보가 없으면 location을 생략한다', async () => {
        await reportError(new Error('q1 no location'));
        expect(lastReport().payload.location).toBeUndefined();
    });

    it('opaque script error는 합성 stack을 싣지 않고 stackSynthetic으로 표시한다 (P1)', async () => {
        await reportError(new Error('Script error. p1'), {
            source: 'window.onerror',
            errorWasNull: true,
            filename: 'https://x/app.js',
            lineno: 2,
            colno: 42,
        });
        const { payload } = lastReport();
        expect(payload.stack).toBeUndefined();
        expect(payload.stackSynthetic).toBe(true);
    });

    // 위치를 message에 붙이면 좌표가 발생마다·배포마다 달라 admin의 message 기준
    // 그룹핑(groupReportLogs)이 파편화된다 — 집계가 가장 필요한 카테고리에서.
    // location 필드로만 싣고 message는 그룹 가능한 상태로 둔다.
    it('script error의 위치는 message가 아니라 location에만 싣는다', async () => {
        await reportError(new Error('Script error. q1 location-only'), {
            source: 'window.onerror',
            errorWasNull: true,
            filename: 'https://x/app.js',
            lineno: 2,
            colno: 42,
        });
        const { payload } = lastReport();
        expect(payload.message).toBe('Script error. q1 location-only');
        expect(payload.location).toEqual({ filename: 'https://x/app.js', lineno: 2, colno: 42 });
    });

    // 감싼 에러의 stack은 감싼 자리를 가리킨다. React가 렌더 실패를 이렇게 감싸므로
    // (`Minified React error #520` + cause), cause가 빠지면 진짜 원인이 사라진다.
    it('cause 체인을 payload.causes에 싣는다', async () => {
        const root = new Error('q1 JSON.parse blew up');
        await reportError(new Error('q1 wrapper', { cause: root }));

        const { payload } = lastReport();
        expect(payload.causes).toHaveLength(1);
        expect(payload.causes[0].message).toBe('q1 JSON.parse blew up');
        expect(typeof payload.causes[0].stack).toBe('string');
    });

    it('cause가 없으면 causes 필드를 아예 생략한다', async () => {
        await reportError(new Error('q1 no cause'));
        expect(lastReport().payload.causes).toBeUndefined();
    });

    // 합성된 것은 바깥 껍데기뿐이라, 원본이 매달려 있으면 그게 유일한 실마리다.
    it('합성 stack(opaque script error)이어도 cause는 싣는다', async () => {
        const root = new Error('q1 real root');
        await reportError(new Error('Script error. q1 with cause', { cause: root }), {
            source: 'window.onerror',
            errorWasNull: true,
        });

        const { payload } = lastReport();
        expect(payload.stack).toBeUndefined();
        expect(payload.causes[0].message).toBe('q1 real root');
    });

    it('원본 에러(stack 진짜)는 stack을 유지하고 stackSynthetic을 남기지 않는다', async () => {
        await reportError(new Error('q1 real stack'));
        const { payload } = lastReport();
        expect(typeof payload.stack).toBe('string');
        expect(payload.stackSynthetic).toBeUndefined();
    });

    it('요청 실패는 메서드+URL을 http와 message 상단에 노출한다 (ADR-0047)', async () => {
        const netErr = Object.assign(new Error('Network Error q1'), {
            code: 'ERR_NETWORK',
            config: { url: '/hello/chats', method: 'post' },
        });
        await reportError(netErr, { source: 'query' });
        const { payload } = lastReport();
        expect(payload.http).toMatchObject({ code: 'ERR_NETWORK', url: '/hello/chats', method: 'POST' });
        expect(payload.message).toBe('Network Error q1 → POST /hello/chats');
    });

    it('categoryOverride 리포트는 감지 시각(occurredAt)과 logsOverride를 그대로 싣는다 (ADR-0047)', async () => {
        await reportError(new Error('previous session died'), {
            source: 'page-crash-sentinel',
            categoryOverride: 'page-crash',
            occurredAt: 1_700_000_000_000,
            logsOverride: [{ level: 'info', tag: 'T', message: 'last breath', timestamp: 9 }],
        });
        const { title, payload } = lastReport();
        expect(title).toBe('[web] page-crash');
        expect(payload.timestamp).toBe(new Date(1_700_000_000_000).toISOString());
        expect(payload.logs).toHaveLength(1);
        expect(payload.logs[0].message).toBe('last breath');
    });

    it('링버퍼가 비어있지 않으면 breadcrumb(logs)과 path를 붙인다', async () => {
        (logBuffer.peek as jest.Mock).mockReturnValue([
            { level: 'info', tag: 'T', message: 'before crash', timestamp: 1 },
        ]);
        await reportError(new Error('q1 with breadcrumb'));
        const { payload } = lastReport();
        expect(payload.logs).toHaveLength(1);
        expect(payload.logs[0].message).toBe('before crash');
        expect(typeof payload.path).toBe('string'); // jsdom → '/'
    });

    it('링버퍼가 비어있으면 logs를 생략한다', async () => {
        await reportError(new Error('q1 empty buffer'));
        expect(lastReport().payload.logs).toBeUndefined();
    });

    // 스로틀 제거됨: 반복 발생 빈도 자체가 신호라 매번 그대로 admin에 쌓인다.
    // 에러 스톰이 나도 그 부담이 Slack 알림으로 튀지 않는 건 아래 silent 계약이 막는다.
    it('동일 (카테고리+메시지)도 매번 전송한다', async () => {
        const err = new Error('q1 repeated error');
        await reportError(err);
        await reportError(err);
        expect(execute).toHaveBeenCalledTimes(2);
    });

    // 스로틀을 뗀 뒤로는 에러 스톰이 그 횟수만큼 Slack 알림으로 튄다 — 그래서
    // 에러 리포트는 항상 silent(admin에는 저장, Slack에는 미전송)로 보낸다.
    // 사용자가 직접 제출하는 reportIssue와 갈리는 지점.
    it('항상 silent로 보내 Slack에는 안 올리고 admin에는 저장한다', async () => {
        await reportError(new Error('q1 no slack'));
        const report = lastReport();
        expect(report.silent).toBe(true);
        expect(report.save).toBe(true);
    });

    // 에러/이슈가 같은 엔드포인트를 쓰므로 stereo가 서버측 구분의 유일한 단서다.
    // 이 값이 admin 조회의 `?type=` 필터 기준이라 회귀하면 종류별 조회가 깨진다.
    it('에러 리포트는 stereo를 log로 보낸다', async () => {
        await reportError(new Error('q1 stereo error'));
        expect(lastReport().stereo).toBe('log');
    });
});

describe('reportIssue — 사용자 이슈 리포트', () => {
    const IMAGE = 'data:image/jpeg;base64,AAAA';

    it('이슈 리포트는 stereo를 issue로 보내 에러와 갈라 저장한다', async () => {
        await reportIssue('제목', '본문');
        const report = lastReport();
        expect(report.stereo).toBe('issue');
        expect(report.title).toBe('[web] issue: 제목');
    });

    it('extras는 payload에 펼쳐 담는다', async () => {
        await reportIssue('제목', '본문', { path: '/mypage/feedback', routeTrail: ['/', '/mypage'] });
        const report = lastReport();
        expect(report.payload.path).toBe('/mypage/feedback');
        expect(report.payload.routeTrail).toEqual(['/', '/mypage']);
    });

    // 백엔드가 클라이언트 body.meta를 저장하지 않는 것이 실측으로 확인돼(2026-08-11),
    // 저장되는 자리는 message(=payload) 하나뿐이다. 그래서 첨부도 payload에 싣는다.
    it('images를 payload에 담아 보낸다 — 저장되는 자리가 여기뿐이다', async () => {
        await reportIssue('제목', '본문', { path: '/mypage/feedback', images: [IMAGE] });
        const report = lastReport();

        expect(report.payload.images).toEqual([IMAGE]);
        expect(report.payload.path).toBe('/mypage/feedback');
    });

    // payload는 그대로 Slack 메시지 텍스트가 되는데 base64 한 장이면 Slack 상한(~40k자)을
    // 넘는다. 첨부가 있는 제보만 전송을 끄고 저장만 한다 — 알림을 잃는 대신 사진이 남는다.
    it('첨부가 있으면 silent로 보내 Slack 전송을 끈다', async () => {
        await reportIssue('제목', '본문', { images: [IMAGE] });
        expect(lastReport().silent).toBe(true);
    });

    it('첨부가 없으면 종전대로 Slack 알림을 보낸다', async () => {
        await reportIssue('제목', '본문', { path: '/mypage/feedback' });
        expect(lastReport().silent).toBe(false);

        await reportIssue('제목', '본문', { images: [] });
        expect(lastReport().silent).toBe(false);
    });

    it('저장은 첨부 유무와 무관하게 항상 켜둔다', async () => {
        await reportIssue('제목', '본문', { images: [IMAGE] });
        expect(lastReport().save).toBe(true);
    });

    // 남은 미지수는 저장소의 항목 크기 상한이라, 실패했을 때 추측 대신 숫자가 남게 한다.
    it('첨부가 있으면 장수와 payload 크기를 로그로 남긴다', async () => {
        await reportIssue('제목', '본문', { images: [IMAGE, IMAGE] });

        expect(logger.info).toHaveBeenCalledWith(
            'ISSUE_REPORT',
            '[reportIssue] sending attachments',
            expect.objectContaining({ images: 2, silent: true })
        );
    });

    it('첨부가 없으면 그 로그를 남기지 않는다', async () => {
        await reportIssue('제목', '본문');
        expect(logger.info).not.toHaveBeenCalled();
    });

    it('meta 필드는 더 이상 쓰지 않는다 — 백엔드가 버린다', async () => {
        await reportIssue('제목', '본문', { images: [IMAGE] });
        expect(setBody.mock.calls.at(-1)?.[0]).not.toHaveProperty('meta');
    });
});
