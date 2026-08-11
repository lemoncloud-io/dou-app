// reportError의 "조립부"(카테고리 → 타이틀 `[app] category`, location, breadcrumb,
// 스로틀 키)를 검증한다. classifyReport/serializeLogs/parseReportLog는 각자
// spec이 있으나, 이들을 엮어 최종 SlackReportBody를 만드는 부분은 여기서 본다.
// 특히 타이틀 포맷은 admin 파서가 의존하는 계약이라 회귀를 잡아야 한다. @see ADR-0029
jest.mock('../session/core', () => ({ DOU_ENDPOINT: 'https://api.test', ENV: 'test' }));

jest.mock('../transport', () => ({ webTransport: { buildSignedRequest: jest.fn() } }));

jest.mock('../session', () => ({
    getActiveSessionUser: jest.fn(),
    getGlobalSessionContext: jest.fn(),
}));

jest.mock('@chatic/bridges', () => ({
    isNative: jest.fn(() => false),
    logBuffer: { peek: jest.fn(() => []) },
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    serializeLogs: jest.fn((entries: unknown[]) => entries),
}));

import { getActiveSessionUser, getGlobalSessionContext } from '../session';
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

beforeEach(() => {
    jest.clearAllMocks();
    (webTransport.buildSignedRequest as jest.Mock).mockReturnValue({ setBody });
    (isNative as jest.Mock).mockReturnValue(false);
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

    it('동일 (카테고리+메시지)는 60초 내 1회만 전송한다', async () => {
        const err = new Error('q1 throttled duplicate');
        await reportError(err);
        await reportError(err);
        expect(execute).toHaveBeenCalledTimes(1);
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
