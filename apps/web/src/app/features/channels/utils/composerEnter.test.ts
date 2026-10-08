import { enterSendsMessage, isSendKey } from './composerEnter';

const DESKTOP_UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const IPAD_UA =
    'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 (DOU_IOS; DoU/0.28.0; iOS; Build:1)';
const ANDROID_UA =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';

const setDevice = (userAgent: string, finePointer: boolean | undefined) => {
    jest.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value:
            finePointer === undefined
                ? undefined
                : jest.fn((query: string) => ({
                      matches: query === '(hover: hover) and (pointer: fine)' && finePointer,
                  })),
    });
};

const enter = (overrides: Partial<Pick<KeyboardEvent, 'shiftKey' | 'isComposing'>> = {}) => ({
    key: 'Enter',
    shiftKey: false,
    isComposing: false,
    ...overrides,
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('enterSendsMessage', () => {
    it('sends on a desktop user agent', () => {
        setDevice(DESKTOP_UA, false);
        expect(enterSendsMessage()).toBe(true);
    });

    it('keeps Enter as a newline on a phone driven by touch', () => {
        setDevice(ANDROID_UA, false);
        expect(enterSendsMessage()).toBe(false);
    });

    it('sends when an iPad user agent is driven by a mouse or trackpad (the iOS app on a Mac)', () => {
        setDevice(IPAD_UA, true);
        expect(enterSendsMessage()).toBe(true);
    });

    it('keeps Enter as a newline on a mobile user agent when matchMedia is unavailable', () => {
        setDevice(IPAD_UA, undefined);
        expect(enterSendsMessage()).toBe(false);
    });
});

describe('isSendKey', () => {
    beforeEach(() => setDevice(DESKTOP_UA, true));

    it('sends on a plain Enter', () => {
        expect(isSendKey(enter())).toBe(true);
    });

    it('leaves Shift+Enter to break the line', () => {
        expect(isSendKey(enter({ shiftKey: true }))).toBe(false);
    });

    it('leaves the Enter that commits an IME composition alone', () => {
        expect(isSendKey(enter({ isComposing: true }))).toBe(false);
    });

    it('ignores keys other than Enter', () => {
        expect(isSendKey({ key: 'a', shiftKey: false, isComposing: false })).toBe(false);
    });

    it('does not send on a touch device', () => {
        setDevice(IPAD_UA, false);
        expect(isSendKey(enter())).toBe(false);
    });
});
