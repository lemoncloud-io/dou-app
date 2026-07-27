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
import { isNative, logBuffer } from '@chatic/bridges';
import { reportError } from './common';

const execute = jest.fn().mockResolvedValue(undefined);
const setBody = jest.fn(() => ({ execute }));

/** Grab the SlackReportBody handed to the transport, with the payload JSON parsed. */
const lastReport = (): { title: string; silent: boolean; save: boolean; payload: any } => {
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
});
