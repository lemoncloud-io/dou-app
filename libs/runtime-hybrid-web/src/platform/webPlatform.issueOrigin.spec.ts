import { webPlatform } from './webPlatform';

let mockBridge: string | null = null;
jest.mock('@chatic/bridges', () => ({
    ...jest.requireActual('@chatic/bridges'),
    hostProfile: () => ({ bridge: mockBridge, globals: {} }),
}));

beforeEach(() => {
    mockBridge = null;
    window.history.replaceState({}, '', '/settings/feedback?x=1');
});

describe('webPlatform.issueOrigin', () => {
    it("reads the page's address when the report is filed", () => {
        window.history.replaceState({}, '', '/rooms/1');

        expect(webPlatform.issueOrigin.pageUrl()).toBe(`${window.location.origin}/rooms/1`);
    });

    it('says a shell bridge is there only when the host profile found one', () => {
        expect(webPlatform.issueOrigin.hasShellBridge()).toBe(false);

        mockBridge = 'react-native-webview';
        expect(webPlatform.issueOrigin.hasShellBridge()).toBe(true);
    });
});
