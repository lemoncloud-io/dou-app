import type { HostOs } from '@chatic/ports';

import type { ShellBridge } from './bridge';
import { mobileShellSignIn, PROVIDER_SIGN_IN_TIMEOUT_MS } from './signIn';

const events: Record<string, (message: unknown) => void> = {};
const bridge = {
    post: jest.fn(),
    request: jest.fn(),
    onEvent: jest.fn((type: string, handler: (message: unknown) => void) => {
        events[type] = handler;
        return () => delete events[type];
    }),
};

const shell = (os: HostOs = 'android') => mobileShellSignIn(bridge as unknown as ShellBridge)({ kind: 'shell', os });

beforeEach(() => {
    jest.clearAllMocks();
});

describe('mobileShellSignIn — the phone app signs in', () => {
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

        expect(bridge.post).toHaveBeenCalledWith({ type: 'OAuthLogin', data: { provider: 'apple' } });
        expect(bridge.request).not.toHaveBeenCalled();
    });

    it('passes on every outcome the app reports for a sign-in, until unsubscribed', () => {
        const listener = jest.fn();
        const unsubscribe = shell().providerSignIn?.onResult(listener);
        const credential = { type: 'OnOAuthLogin', success: true, data: { result: { provider: 'google' } } };
        const cancel = { type: 'OnOAuthLogin', success: true, data: { result: null } };
        const failure = { type: 'OnOAuthLogin', success: false, error: { code: 'OAUTH_LOGIN_ERROR' } };

        expect(bridge.onEvent).toHaveBeenCalledWith('OnOAuthLogin', expect.any(Function));
        events['OnOAuthLogin']?.(credential);
        events['OnOAuthLogin']?.(cancel);
        events['OnOAuthLogin']?.(failure);
        unsubscribe?.();

        expect(listener.mock.calls).toEqual([[credential], [cancel], [failure]]);
        expect(events['OnOAuthLogin']).toBeUndefined();
    });

    it("resolves with the credential the app's provider sign-in hands back", async () => {
        const result = { provider: 'google', idToken: 'tok' };
        bridge.request.mockResolvedValue({ data: { result } });

        await expect(shell().providerSignIn?.credential('google')).resolves.toBe(result);
        expect(bridge.request).toHaveBeenCalledWith(
            { type: 'OAuthLogin', data: { provider: 'google' } },
            { timeoutMs: 180_000 }
        );
        expect(PROVIDER_SIGN_IN_TIMEOUT_MS).toBe(180_000);
    });

    it('resolves null when the person cancels at the provider', async () => {
        bridge.request.mockResolvedValue({ data: { result: null } });

        await expect(shell().providerSignIn?.credential('apple')).resolves.toBeNull();
    });

    it('rejects when the request fails', async () => {
        bridge.request.mockRejectedValue(new Error('timeout'));

        await expect(shell().providerSignIn?.credential('google')).rejects.toThrow('timeout');
    });

    it('does not sign in through the OAuth relay', () => {
        expect(shell().relayOAuth).toBeNull();
    });
});
