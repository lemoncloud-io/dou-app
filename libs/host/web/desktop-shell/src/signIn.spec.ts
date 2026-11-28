import type { DesktopShellBridge } from './bridge';
import { desktopBrowserSignIn, desktopShellSignIn } from './signIn';

const bridges = {
    onEvent: jest.fn(),
    unsubscribe: jest.fn(),
    handler: null as null | ((message: unknown) => void),
};

const shell = () => desktopShellSignIn(bridges as unknown as DesktopShellBridge)({ kind: 'shell', os: null });
const browser = () => desktopBrowserSignIn({ kind: 'browser', os: null });

beforeEach(() => {
    bridges.unsubscribe.mockReset();
    bridges.handler = null;
    bridges.onEvent.mockReset().mockImplementation((_type: string, handler: (message: unknown) => void) => {
        bridges.handler = handler;
        return bridges.unsubscribe;
    });
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('desktopShellSignIn — the desktop app signs in', () => {
    it("holds the device's own sign-in and approves pairings, but never asks for one", () => {
        expect(shell()).toMatchObject({
            kind: 'shell',
            sessionScope: 'device',
            approvesPairing: true,
            requestsPairing: false,
        });
    });

    it('has no provider sign-in of its own', () => {
        expect(shell().providerSignIn).toBeNull();
    });

    it("opens the relay's authorize page in a new window, which the app routes to the system browser", () => {
        const open = jest.spyOn(window, 'open').mockImplementation(() => null);

        shell().relayOAuth?.openAuthorize('https://relay.example/oauth/google/authorize');

        expect(open).toHaveBeenCalledWith('https://relay.example/oauth/google/authorize', '_blank');
    });

    it('completes a returned code where it lands', () => {
        expect(shell().relayOAuth?.returnedCode).toBe('complete');
    });

    it('passes on each deeplink the app forwards, and nothing for an event without one', () => {
        const listener = jest.fn();

        const unsubscribe = shell().relayOAuth?.handoffLinks?.subscribe(listener);

        expect(bridges.onEvent).toHaveBeenCalledWith('OnReceiveNotification', expect.any(Function));
        bridges.handler?.({ data: { notification: { data: { deeplink: 'chatic://oauth?code=c' } } } });
        bridges.handler?.({ data: { notification: { data: {} } } });
        bridges.handler?.({ data: { notification: { data: { deeplink: '' } } } });
        bridges.handler?.({ data: { notification: { data: { deeplink: 42 } } } });
        bridges.handler?.({ data: {} });
        bridges.handler?.(undefined);
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith('chatic://oauth?code=c');

        unsubscribe?.();
        expect(bridges.unsubscribe).toHaveBeenCalledTimes(1);
    });
});

describe('desktopBrowserSignIn — desktop-web in a browser tab signs in', () => {
    it("keeps a tab's sign-in and asks to pair, never approves", () => {
        expect(browser()).toMatchObject({
            kind: 'browser',
            sessionScope: 'tab',
            approvesPairing: false,
            requestsPairing: true,
            providerSignIn: null,
        });
    });

    it("navigates this tab to the relay's authorize page", () => {
        const open = jest.spyOn(window, 'open');
        const authorize = `${window.location.origin}${window.location.pathname}#relay-authorize`;

        browser().relayOAuth?.openAuthorize(authorize);

        expect(window.location.href).toBe(authorize);
        expect(open).not.toHaveBeenCalled();
    });

    it('hands a returned code back to the app, and receives no deeplinks itself', () => {
        expect(browser().relayOAuth).toMatchObject({ returnedCode: 'handoff', handoffLinks: null });
        expect(bridges.onEvent).not.toHaveBeenCalled();
    });
});
