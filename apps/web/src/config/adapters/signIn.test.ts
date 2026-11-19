import type { HostOs, WebHostFacts } from '@chatic/runtime-web';

import { appBridge } from '../../app/bridge/appBridge';
import { webSignIn } from './signIn';

// The phone app's events, captured so a test can play an `OnOAuthLogin` answer back.
const mockEvents: Record<string, (message: unknown) => void> = {};
const mockOnEvent = jest.fn((type: string, handler: (message: unknown) => void) => {
    mockEvents[type] = handler;
    return () => delete mockEvents[type];
});
jest.mock('@chatic/bridges', () => ({
    ...jest.requireActual('@chatic/bridges'),
    webClient: { onEvent: (type: string, handler: (message: unknown) => void) => mockOnEvent(type, handler) },
}));
jest.mock('../../app/bridge/appBridge', () => ({ appBridge: { oauthLogin: jest.fn(), startOAuthLogin: jest.fn() } }));

// Neither side reads the facts; the implementations decide from the side and the phone platform alone.
const facts = {} as WebHostFacts;
const shell = (os: HostOs = 'android') => webSignIn.shell({ kind: 'shell', os }, facts);
const browser = () => webSignIn.browser({ kind: 'browser', os: null }, facts);

beforeEach(() => {
    jest.clearAllMocks();
});

describe('webSignIn — the phone app signs in', () => {
    it('keeps the side and platform it was built for', () => {
        expect(shell('ios')).toMatchObject({ kind: 'shell', os: 'ios' });
    });

    it("holds the device's own sign-in, approves pairings and may still ask for one", () => {
        expect(shell()).toMatchObject({ sessionScope: 'device', approvesPairing: true, requestsPairing: true });
    });

    it('offers Apple beside Google on iOS only', () => {
        expect(shell('ios').providerSignIn?.providers).toEqual(['google', 'apple']);
        expect(shell('android').providerSignIn?.providers).toEqual(['google']);
        expect(shell(null).providerSignIn?.providers).toEqual(['google']);
    });

    it('starts a sign-in as a fire-and-forget request, with no answer to wait on', () => {
        expect(shell().providerSignIn?.start('apple')).toBeUndefined();

        expect(appBridge.startOAuthLogin).toHaveBeenCalledWith('apple');
        expect(appBridge.oauthLogin).not.toHaveBeenCalled();
    });

    it('passes on every outcome the app reports for a sign-in, until unsubscribed', () => {
        const listener = jest.fn();
        const unsubscribe = shell().providerSignIn?.onResult(listener);
        const credential = { type: 'OnOAuthLogin', success: true, data: { result: { provider: 'google' } } };
        const cancel = { type: 'OnOAuthLogin', success: true, data: { result: null } };
        const failure = { type: 'OnOAuthLogin', success: false, error: { code: 'OAUTH_LOGIN_ERROR' } };

        expect(mockOnEvent).toHaveBeenCalledWith('OnOAuthLogin', expect.any(Function));
        mockEvents['OnOAuthLogin']?.(credential);
        mockEvents['OnOAuthLogin']?.(cancel);
        mockEvents['OnOAuthLogin']?.(failure);
        unsubscribe?.();

        expect(listener.mock.calls).toEqual([[credential], [cancel], [failure]]);
        expect(mockEvents['OnOAuthLogin']).toBeUndefined();
    });

    it("resolves with the credential the app's provider sign-in hands back", async () => {
        const result = { provider: 'google', idToken: 'tok' };
        jest.mocked(appBridge.oauthLogin).mockResolvedValue({ data: { result } } as never);

        await expect(shell().providerSignIn?.credential('google')).resolves.toBe(result);
        expect(appBridge.oauthLogin).toHaveBeenCalledWith('google');
    });

    it('resolves null when the person cancels at the provider', async () => {
        jest.mocked(appBridge.oauthLogin).mockResolvedValue({ data: { result: null } } as never);

        await expect(shell().providerSignIn?.credential('apple')).resolves.toBeNull();
    });

    it('rejects when the request fails', async () => {
        jest.mocked(appBridge.oauthLogin).mockRejectedValue(new Error('timeout'));

        await expect(shell().providerSignIn?.credential('google')).rejects.toThrow('timeout');
    });

    it('does not sign in through the OAuth relay', () => {
        expect(shell().relayOAuth).toBeNull();
    });
});

describe('webSignIn — the page signs in', () => {
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
        expect(appBridge.oauthLogin).not.toHaveBeenCalled();
        expect(mockOnEvent).not.toHaveBeenCalled();
    });
});
