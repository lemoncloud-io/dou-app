import type { subWebViewReportsFrameOrigin as Reports } from './subWebViewFrameOrigin';

let mockOS = 'android';
let mockModule: unknown;

jest.mock('react-native', () => ({
    get NativeModules() {
        return { SubWebViewFrames: mockModule };
    },
    get Platform() {
        return { OS: mockOS };
    },
}));

const load = () => {
    let reports!: typeof Reports;
    jest.isolateModules(() => {
        reports = require('./subWebViewFrameOrigin').subWebViewReportsFrameOrigin;
    });
    return reports;
};

describe('subWebViewReportsFrameOrigin', () => {
    beforeEach(() => {
        mockOS = 'android';
        mockModule = { reportsFrameOrigin: true };
    });

    it('is true on Android when the WebView reports each frame under its own origin', () => {
        expect(load()()).toBe(true);
    });

    it('is false on Android when the WebView reports the top-level page for every frame', () => {
        mockModule = { reportsFrameOrigin: false };
        expect(load()()).toBe(false);
    });

    it.each<[string, unknown]>([
        ['the module is missing (an app built before it)', undefined],
        ['the constant is missing', {}],
        ['the constant is not a boolean', { reportsFrameOrigin: 'true' }],
    ])('is false on Android when %s', (_, module) => {
        mockModule = module;
        expect(load()()).toBe(false);
    });

    it("is true on iOS, where each message carries its own frame's URL, without asking a module", () => {
        mockOS = 'ios';
        mockModule = undefined;
        expect(load()()).toBe(true);
    });

    it('is false on any other platform', () => {
        mockOS = 'web';
        expect(load()()).toBe(false);
    });
});
