import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({
    handler: null as null | ((message: unknown) => void),
    isAuthenticated: false,
    createCredentialsByProvider: vi.fn(),
    loginGuest: vi.fn(),
    toast: vi.fn(),
}));

vi.mock('@chatic/bridges', () => ({
    isNative: () => true,
    logger: { error: vi.fn(), warn: vi.fn() },
    webClient: {
        onEvent: (_name: string, handler: (message: unknown) => void) => {
            session.handler = handler;
            return () => {
                session.handler = null;
            };
        },
    },
}));
vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        boot: { startWebTransportInit: vi.fn().mockResolvedValue(undefined) },
        session: {
            getIdentityContext: () => ({ isAuthenticated: session.isAuthenticated }),
            createCredentialsByProvider: session.createCredentialsByProvider,
            useDynamicDeviceId: () => ({ deviceId: 'device-1' }),
            useLoginRelayGuestByDevice: () => ({ mutateAsync: session.loginGuest }),
        },
    },
}));
vi.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: session.toast }));
vi.mock('@chatic/config', () => ({
    config: { get: (key: string) => (key === 'net.socialOauth.endpoint' ? 'https://relay.example' : undefined) },
}));

import { setStorageAdapter } from '@chatic/shared';

import i18n from '../../../../i18n';
import { useSocialLogin } from '../hooks';
import { OAUTH_LOGIN_START_TTL_MS, saveOAuthLoginStart, takeOAuthLoginStart } from '../utils';
import { OAuthDeeplinkListener } from './OAuthDeeplinkListener';

const NOW = new Date('2026-10-06T00:00:00Z').getTime();

const deliver = async (deeplink: string) => {
    await act(async () => {
        session.handler?.({ data: { notification: { data: { deeplink } } } });
    });
};

// Starts a login the way the Welcome and Profile buttons do.
const Starter = () => {
    const { start } = useSocialLogin();
    return (
        <button type="button" onClick={() => start('google')}>
            start
        </button>
    );
};

describe('OAuthDeeplinkListener', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(NOW);
        // The shell's persistent backing, as main.tsx wires it.
        setStorageAdapter(localStorage);
        localStorage.clear();
        session.isAuthenticated = false;
        session.createCredentialsByProvider.mockReset().mockResolvedValue(undefined);
        session.loginGuest.mockReset().mockResolvedValue(undefined);
        session.toast.mockReset();
        vi.spyOn(window, 'open').mockReturnValue(null);
        render(<OAuthDeeplinkListener />);
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    const started = (over: Partial<{ provider: string; startedAt: number; nonce: string }> = {}) =>
        saveOAuthLoginStart({ provider: 'google', startedAt: NOW, nonce: 'n1', ...over });

    it('does not exchange a deeplink when no login was started, and says so', async () => {
        await deliver('chatic://oauth?provider=google&code=attacker');

        expect(session.createCredentialsByProvider).not.toHaveBeenCalled();
        expect(session.toast).toHaveBeenCalledWith(
            expect.objectContaining({ description: i18n.t('auth.social.notStarted') })
        );
    });

    it('exchanges a deeplink for a login that was started', async () => {
        started();

        await deliver('chatic://oauth?provider=google&code=abc&nonce=n1');

        expect(session.createCredentialsByProvider).toHaveBeenCalledWith('google', 'abc');
        expect(session.toast).not.toHaveBeenCalled();
    });

    it('does not exchange once the start has expired, and says it expired', async () => {
        started({ startedAt: NOW - OAUTH_LOGIN_START_TTL_MS });

        await deliver('chatic://oauth?provider=google&code=abc&nonce=n1');

        expect(session.createCredentialsByProvider).not.toHaveBeenCalled();
        expect(session.toast).toHaveBeenCalledWith(
            expect.objectContaining({ description: i18n.t('auth.social.expired') })
        );
    });

    it('tells the person when the exchange fails, once, and a login started again still completes', async () => {
        started();
        session.createCredentialsByProvider.mockRejectedValueOnce(new Error('relay rejected'));

        await deliver('chatic://oauth?provider=google&code=bad&nonce=n1');

        expect(session.toast).toHaveBeenCalledTimes(1);
        expect(session.toast).toHaveBeenCalledWith(
            expect.objectContaining({ variant: 'destructive', description: i18n.t('auth.social.failed') })
        );

        started();
        await deliver('chatic://oauth?provider=google&code=good&nonce=n1');

        expect(session.createCredentialsByProvider).toHaveBeenLastCalledWith('google', 'good');
        expect(session.toast).toHaveBeenCalledTimes(1);
    });

    it('does not exchange a deeplink for a different provider than the one started', async () => {
        started({ provider: 'kakao' });

        await deliver('chatic://oauth?provider=google&code=abc&nonce=n1');

        expect(session.createCredentialsByProvider).not.toHaveBeenCalled();
    });

    it('does not exchange a second deeplink after one used the start', async () => {
        started();

        await deliver('chatic://oauth?provider=google&code=first&nonce=n1');
        await deliver('chatic://oauth?provider=google&code=second&nonce=n1');

        expect(session.createCredentialsByProvider).toHaveBeenCalledTimes(1);
        expect(session.createCredentialsByProvider).toHaveBeenCalledWith('google', 'first');
    });

    it('consumes the start even when the deeplink is refused', async () => {
        started({ provider: 'kakao' });

        await deliver('chatic://oauth?provider=google&code=abc&nonce=n1');

        expect(takeOAuthLoginStart()).toBeNull();
    });

    it('does not exchange a deeplink whose nonce differs from the start', async () => {
        started();

        await deliver('chatic://oauth?provider=google&code=abc&nonce=other');

        expect(session.createCredentialsByProvider).not.toHaveBeenCalled();
    });

    it('does not exchange a deeplink that carries no nonce, and says so', async () => {
        started();

        await deliver('chatic://oauth?provider=google&code=abc');

        expect(session.createCredentialsByProvider).not.toHaveBeenCalled();
        expect(session.toast).toHaveBeenCalledTimes(1);
        expect(session.toast).toHaveBeenCalledWith(
            expect.objectContaining({ description: i18n.t('auth.social.notStarted') })
        );
        expect(takeOAuthLoginStart()).toBeNull();
    });

    it('exchanges a deeplink whose nonce matches the start', async () => {
        started();

        await deliver('chatic://oauth?provider=google&code=abc&nonce=n1');

        expect(session.createCredentialsByProvider).toHaveBeenCalledWith('google', 'abc');
    });

    it('ignores deeplinks that are not OAuth ones without touching the start', async () => {
        started();

        await deliver('chatic-open://room/1');
        await deliver('chatic://oauth.evil?provider=google&code=abc');

        expect(session.createCredentialsByProvider).not.toHaveBeenCalled();
        expect(session.toast).not.toHaveBeenCalled();
        expect(takeOAuthLoginStart()).not.toBeNull();
    });

    // A Guest Session linking to Google from Profile starts the login itself, so it has a record.
    it('still swaps the session of a signed-in guest who started the login', async () => {
        session.isAuthenticated = true;
        const replace = vi.fn();
        vi.stubGlobal('location', { ...window.location, origin: 'https://desktop.example', replace });
        const { getByText } = render(<Starter />);
        await act(async () => getByText('start').click());
        const { nonce } = JSON.parse(localStorage.getItem('chatic-oauth-login-start') ?? '{}');

        await deliver(`chatic://oauth?provider=google&code=abc&nonce=${nonce}`);

        expect(session.createCredentialsByProvider).toHaveBeenCalledWith('google', 'abc');
        expect(replace).toHaveBeenCalledWith('/');
        vi.unstubAllGlobals();
    });
});
