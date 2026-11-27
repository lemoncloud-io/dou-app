import { submitIssueReport } from './reportIssue';
import type { IssueReportOrigin } from './types';

const getRepositories = jest.fn();
jest.mock('../data/dataCommands', () => ({ runtimeData: () => ({ repositories: () => getRepositories() }) }));
let mockProject = 'chatic_web';
jest.mock('@chatic/config', () => ({
    config: { get: jest.fn((key: string) => ({ 'env.stage': 'test', 'env.project': mockProject })[key]) },
}));
jest.mock('@chatic/logger', () => ({
    ...jest.requireActual('@chatic/logger'),
    logger: { info: jest.fn(), error: jest.fn() },
}));
jest.mock('../session/sessionReads', () => ({
    getActiveSessionUser: () => ({ name: 'nick', userRole: 'user' }),
    getGlobalSessionContext: () => ({
        identity: { userId: 'u1', isAuthenticated: true },
        cloud: { isActive: true, backend: 'https://relay.test', cloudId: 'c1', siteId: 's1' },
    }),
}));

const submitIssue = jest.fn();

let hasShellBridge = false;
const origin: IssueReportOrigin = {
    hasShellBridge: () => hasShellBridge,
    pageUrl: () => 'https://app.test/settings/feedback?token=secret&code=inv-1#top',
};
const reportIssue = (title: string, message: string, extras: Parameters<typeof submitIssueReport>[3]) =>
    submitIssueReport(origin, title, message, extras);

beforeEach(() => {
    jest.clearAllMocks();
    submitIssue.mockResolvedValue({ id: 'r1' });
    getRepositories.mockReturnValue({ report: { submitIssue } });
    hasShellBridge = false;
    mockProject = 'chatic_web';
});

describe('reportIssue', () => {
    it('report repository로 부친다 — 자체 요청을 만들지 않는다', async () => {
        await reportIssue('제목', '본문', {});

        expect(submitIssue).toHaveBeenCalledTimes(1);
    });

    it('타이틀은 앱을 앞에 달고, stereo는 issue다 — admin이 로그와 가르는 기준', async () => {
        await reportIssue('제목', '본문', {});

        const body = submitIssue.mock.calls[0][0];
        expect(body.title).toBe('[web] issue: 제목');
        expect(body.stereo).toBe('issue');
        expect(body.save).toBe(true);
    });

    it('첨부가 없으면 Slack으로 나간다 (silent: false)', async () => {
        await reportIssue('제목', '본문', {});

        expect(submitIssue.mock.calls[0][0].silent).toBe(false);
    });

    it('첨부가 있으면 저장만 한다 (silent: true)', async () => {
        await reportIssue('제목', '본문', { images: ['data:image/jpeg;base64,AAAA'] });

        expect(submitIssue.mock.calls[0][0].silent).toBe(true);
    });

    it('message에 세션 사실을 실어 보낸다 — uid·role·cloud·url', async () => {
        await reportIssue('제목', '본문', {});

        const payload = JSON.parse(submitIssue.mock.calls[0][0].message);
        expect(payload.user).toMatchObject({ uid: 'u1', name: 'nick', role: 'user', isAuthenticated: true });
        expect(payload.cloud).toMatchObject({ connected: true, cloudId: 'c1', name: 'nick', placeId: 's1' });
        expect(payload.url).toContain('/settings/feedback');
    });

    it("carries the page's address with its query values redacted, the invite code kept, and no fragment", async () => {
        await reportIssue('제목', '본문', {});

        const payload = JSON.parse(submitIssue.mock.calls[0][0].message);
        expect(payload.url).toBe('https://app.test/settings/feedback?token=[REDACTED]&code=inv-1');
    });

    it('reports as mobile from a page with a shell bridge, and as admin from the admin console', async () => {
        hasShellBridge = true;
        await reportIssue('제목', '본문', {});
        expect(submitIssue.mock.calls[0][0].title).toBe('[mobile] issue: 제목');

        hasShellBridge = false;
        mockProject = 'chatic_admin';
        await reportIssue('제목', '본문', {});
        expect(submitIssue.mock.calls[1][0].title).toBe('[admin] issue: 제목');
    });

    it('reports a failure to read the page like a failed send', async () => {
        const broken: IssueReportOrigin = {
            hasShellBridge: () => {
                throw new Error('no profile');
            },
            pageUrl: () => '',
        };

        await expect(submitIssueReport(broken, '제목', '본문', {})).rejects.toThrow('no profile');
        expect(submitIssue).not.toHaveBeenCalled();
    });

    it('전송 실패는 호출부로 던진다 — 화면이 실패를 알려야 한다', async () => {
        submitIssue.mockRejectedValue(new Error('boom'));

        await expect(reportIssue('제목', '본문', {})).rejects.toThrow('boom');
    });
});
