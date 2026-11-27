import { browserImages } from './media/browserImages';
import {
    browserAppShell,
    browserDiagnostics,
    browserFiles,
    browserLinks,
    browserMedia,
    browserPush,
    browserSignIn,
} from './ports';

const setClipboard = (writeText: jest.Mock | undefined) =>
    Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: writeText ? { writeText } : undefined,
    });

afterEach(() => jest.restoreAllMocks());

describe('browserAppShell — a browser tab', () => {
    it('is the person’s tab, with no frame members at all', () => {
        expect(browserAppShell({ kind: 'browser', os: null })).toEqual({
            kind: 'browser',
            os: null,
            ownsWindow: false,
            reportsKeyboardHeight: false,
            haptics: null,
            preferences: null,
            backGesture: null,
            iconBadge: null,
            dockBadge: null,
            appIcon: null,
            storeUpdate: null,
            selfUpdate: null,
            systemSettings: null,
        });
    });
});

describe('browserDiagnostics — the page carries them', () => {
    it('names the browser as the entry point and has none of the app’s members', () => {
        expect(browserDiagnostics({ kind: 'browser' })).toEqual({
            kind: 'browser',
            entry: 'browser',
            debugMode: null,
            bootMetrics: null,
            pendingReports: null,
        });
    });

    it('never reaches the bridge', () => {
        expect(browserDiagnostics).toHaveLength(1);
    });
});

describe('browserFiles — the page moves the files', () => {
    it("sends with the page's own PUT and has no transfer module", () => {
        const put = jest.fn();
        const port = browserFiles(put)({ kind: 'browser' });

        expect(port.kind).toBe('browser');
        expect(port.put).toBe(put);
        expect(port.transfers).toBeNull();
        expect(put).not.toHaveBeenCalled();
    });
});

describe('browserLinks — the page takes its own links', () => {
    const browser = () => browserLinks({ kind: 'browser' });

    it('opens a URL in a new tab with no opener and no referrer', () => {
        const open = jest.spyOn(window, 'open').mockImplementation(() => null);

        browser().openUrl('https://example.com/a');

        expect(open).toHaveBeenCalledWith('https://example.com/a', '_blank', 'noopener,noreferrer');
    });

    it('copies with the Clipboard API', async () => {
        const writeText = jest.fn().mockResolvedValue(undefined);
        setClipboard(writeText);

        await expect(browser().copyText('hello')).resolves.toBe(true);
        expect(writeText).toHaveBeenCalledWith('hello');
    });

    it('rejects where there is no Clipboard API, or the write is refused', async () => {
        setClipboard(undefined);
        await expect(browser().copyText('hello')).rejects.toThrow('Clipboard API is not available.');

        setClipboard(jest.fn().mockRejectedValue(new Error('NotAllowedError')));
        await expect(browser().copyText('hello')).rejects.toThrow('NotAllowedError');
    });

    it("has none of an app's members", () => {
        expect(browser()).toMatchObject({
            kind: 'browser',
            shareSheet: null,
            shareIntake: null,
            contacts: null,
            sms: null,
            linkPreview: null,
            subWebView: null,
        });
    });
});

describe('browserMedia — a browser picks with its own input', () => {
    it('has none of the app’s pieces, and asks the app nothing', () => {
        expect(browserMedia({ kind: 'browser' })).toEqual({
            kind: 'browser',
            picker: null,
            photoLibrary: null,
            videoConverter: null,
            cameraPermission: null,
            images: browserImages,
        });
        expect(browserMedia).toHaveLength(1);
    });

    it('prepares images in the page', () => {
        expect(browserMedia({ kind: 'browser' }).images).toBe(browserImages);
    });
});

describe('browserPush — a browser', () => {
    it('receives nothing, holds no token and raises no banner', () => {
        expect(browserPush({ kind: 'browser' })).toEqual({
            kind: 'browser',
            notifications: null,
            deviceToken: null,
            tokenRenewal: null,
            localBanner: null,
        });
    });
});

describe('browserSignIn — the page signs in', () => {
    const browser = () => browserSignIn({ kind: 'browser', os: null });

    it("keeps a tab's sign-in, never approves, and asks to pair", () => {
        expect(browser()).toMatchObject({
            kind: 'browser',
            os: null,
            sessionScope: 'tab',
            approvesPairing: false,
            requestsPairing: true,
        });
    });

    it('has no social sign-in of its own, and no relay sign-in', () => {
        expect(browser()).toMatchObject({ providerSignIn: null, relayOAuth: null });
        expect(browserSignIn).toHaveLength(1);
    });
});
