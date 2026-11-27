import { webPlatform } from './webPlatform';

beforeEach(() => {
    window.history.replaceState({}, '', '/settings/feedback?x=1');
});

afterEach(() => {
    delete (window as unknown as Record<string, unknown>).ReactNativeWebView;
});

describe('webPlatform.issueOrigin', () => {
    it("reads the page's address when the report is filed", () => {
        window.history.replaceState({}, '', '/rooms/1');

        expect(webPlatform.issueOrigin.pageUrl()).toBe(`${window.location.origin}/rooms/1`);
    });

    it('never says a shell bridge is there: a browser-only page does not look for one', () => {
        (window as unknown as Record<string, unknown>).ReactNativeWebView = { postMessage: jest.fn() };

        expect(webPlatform.issueOrigin.hasShellBridge()).toBe(false);
    });
});

describe('webPlatform.device', () => {
    it("reads the page's own user agent and no shell platform", () => {
        (window as unknown as Record<string, unknown>).CHATIC_APP_PLATFORM = 'ios';

        expect(webPlatform.device()).toEqual({ appPlatform: undefined, userAgent: navigator.userAgent });
        delete (window as unknown as Record<string, unknown>).CHATIC_APP_PLATFORM;
    });
});
