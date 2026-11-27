import { submitIssueReport } from './diagnostics/reportIssue';

import { providePlatform, resetPlatformForTests } from './platform';
import { reportIssue } from './report/reportIssue';
import { pairingClientOf } from './session/pageDevice';

jest.mock('./diagnostics/reportIssue', () => ({
    ...jest.requireActual('./diagnostics/reportIssue'),
    submitIssueReport: jest.fn(async () => undefined),
}));

const issueOrigin = { hasShellBridge: () => false, pageUrl: () => 'https://example.test/rooms/1' };

afterEach(() => {
    resetPlatformForTests();
    jest.clearAllMocks();
});

describe('the platform an adapter hands in', () => {
    it('gives reportIssue its origin and hands the title, message and extras on unchanged', async () => {
        providePlatform({ issueOrigin, device: () => ({}) });
        const extras = { online: true };

        await reportIssue('title', 'body', extras);

        expect(submitIssueReport).toHaveBeenCalledWith(issueOrigin, 'title', 'body', extras);
    });

    it('refuses a report before any platform was handed in', async () => {
        await expect(reportIssue('title', 'body', {})).rejects.toThrow('startRuntime from @chatic/runtime-web');
        expect(submitIssueReport).not.toHaveBeenCalled();
    });

    it("names this device from the platform's device", () => {
        providePlatform({ issueOrigin, device: () => ({ appPlatform: 'android' }) });

        expect(pairingClientOf()).toEqual({ name: 'Android', platform: 'android' });
    });
});
