/**
 * What matters here is the boundary, not the payload: a user report is a data call, so it goes
 * through the `report` repository (ADR-0036) and builds no request of its own. The body it hands
 * over is asserted alongside, since the session facts inside it are this file's job.
 */
import { getRepositories } from '../data/runtime';
import { reportIssue } from './reportIssue';

jest.mock('../data/runtime', () => ({ getRepositories: jest.fn() }));
jest.mock('@chatic/web-config', () => ({ WEB_ENV: 'test', WEB_PROJECT: 'chatic_web' }));
jest.mock('@chatic/bridges', () => ({
    isNative: () => false,
    logger: { info: jest.fn(), error: jest.fn() },
}));
jest.mock('../session', () => ({
    getActiveSessionUser: () => ({ name: 'nick', userRole: 'user' }),
    getGlobalSessionContext: () => ({
        identity: { userId: 'u1', isAuthenticated: true },
        cloud: { cloudToken: { name: 'cloud-1' }, backend: 'https://relay.test', cloudId: 'c1', siteId: 's1' },
    }),
}));

const submitIssue = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    submitIssue.mockResolvedValue({ id: 'r1' });
    (getRepositories as jest.Mock).mockReturnValue({ report: { submitIssue } });
    window.history.replaceState({}, '', '/settings/feedback');
});

describe('reportIssue', () => {
    it('report repository로 부친다 — 자체 요청을 만들지 않는다', async () => {
        await reportIssue('제목', '본문');

        expect(submitIssue).toHaveBeenCalledTimes(1);
    });

    it('타이틀은 앱을 앞에 달고, stereo는 issue다 — admin이 로그와 가르는 기준', async () => {
        await reportIssue('제목', '본문');

        const body = submitIssue.mock.calls[0][0];
        expect(body.title).toBe('[web] issue: 제목');
        expect(body.stereo).toBe('issue');
        expect(body.save).toBe(true);
    });

    it('첨부가 없으면 Slack으로 나간다 (silent: false)', async () => {
        await reportIssue('제목', '본문');

        expect(submitIssue.mock.calls[0][0].silent).toBe(false);
    });

    // 첨부 한 장이 Slack 텍스트 상한을 넘긴다 — 알림을 잃고 사진을 남긴다. @see ADR-0049
    it('첨부가 있으면 저장만 한다 (silent: true)', async () => {
        await reportIssue('제목', '본문', { images: ['data:image/jpeg;base64,AAAA'] });

        expect(submitIssue.mock.calls[0][0].silent).toBe(true);
    });

    it('message에 세션 사실을 실어 보낸다 — uid·role·cloud·url', async () => {
        await reportIssue('제목', '본문');

        const payload = JSON.parse(submitIssue.mock.calls[0][0].message);
        expect(payload.user).toMatchObject({ uid: 'u1', name: 'nick', role: 'user', isAuthenticated: true });
        expect(payload.cloud).toMatchObject({ connected: true, cloudId: 'c1', placeId: 's1' });
        expect(payload.url).toContain('/settings/feedback');
    });

    it('전송 실패는 호출부로 던진다 — 화면이 실패를 알려야 한다', async () => {
        submitIssue.mockRejectedValue(new Error('boom'));

        await expect(reportIssue('제목', '본문')).rejects.toThrow('boom');
    });
});
