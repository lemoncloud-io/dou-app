/**
 * This page's binding of runtime-client's `submitIssueReport`: the two things only the page knows —
 * whether it runs inside an app shell, and where it is — read when the report is filed. What the
 * report carries is runtime-client's to test.
 */
import { reportIssue } from './reportIssue';

const mockSubmitIssueReport = jest.fn(async () => undefined);
jest.mock('@chatic/runtime-client/diagnostics/reportIssue', () => ({
    submitIssueReport: (...args: unknown[]) => mockSubmitIssueReport(...(args as [])),
}));
let mockBridge: string | null = null;
jest.mock('@chatic/bridges', () => ({
    ...jest.requireActual('@chatic/bridges'),
    hostProfile: () => ({ bridge: mockBridge }),
}));

type Origin = { hasShellBridge: () => boolean; pageUrl: () => string };
const originOf = (call: number): Origin => (mockSubmitIssueReport.mock.calls[call] as unknown[])[0] as Origin;

beforeEach(() => {
    jest.clearAllMocks();
    mockBridge = null;
    window.history.replaceState({}, '', '/settings/feedback?x=1');
});

describe('reportIssue', () => {
    it('hands the title, message and extras on unchanged', async () => {
        const extras = { online: true };

        await reportIssue('title', 'body', extras);

        expect(mockSubmitIssueReport).toHaveBeenCalledWith(expect.anything(), 'title', 'body', extras);
    });

    it("reads the page's address when the report is filed", async () => {
        await reportIssue('title', 'body', {});
        const origin = originOf(0);

        window.history.replaceState({}, '', '/rooms/1');

        expect(origin.pageUrl()).toBe(`${window.location.origin}/rooms/1`);
    });

    it('says a shell bridge is there only when the host profile found one', async () => {
        await reportIssue('title', 'body', {});
        expect(originOf(0).hasShellBridge()).toBe(false);

        mockBridge = 'react-native-webview';
        expect(originOf(0).hasShellBridge()).toBe(true);
    });
});
