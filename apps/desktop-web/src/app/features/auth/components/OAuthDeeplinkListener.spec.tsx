import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({
    handler: null as null | ((deeplink: string) => void),
    isAuthenticated: false,
    createCredentialsByProvider: vi.fn(),
    loginGuest: vi.fn(),
    toast: vi.fn(),
    navigate: vi.fn(),
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => session.navigate }));

vi.mock('../hooks/useSignOutGuest', () => ({ useSignOutGuest: () => vi.fn() }));
vi.mock('@chatic/bridges', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock('@chatic/runtime', async () => {
    const { browserSignIn, fakeRuntimeModule } = await import('@chatic/runtime/testing');
    return fakeRuntimeModule({
        data: { useRuntimeRepositories: () => ({ auth: {} }) },
        session: {
            getIdentityContext: () => ({ isAuthenticated: session.isAuthenticated }),
            getRelaySessionUser: () => null,
            createCredentialsByProvider: session.createCredentialsByProvider,
            useDynamicDeviceId: () => ({ deviceId: 'device-1' }),
            useLoginRelayGuestByDevice: () => ({ mutateAsync: session.loginGuest }),
        },
        settings: {
            get: (key: string) => (key === 'net.socialOauth.endpoint' ? 'https://relay.example' : undefined),
        },
        signIn: {
            ...browserSignIn(),
            relayOAuth: {
                openAuthorize: url => {
                    window.open(url, '_blank');
                },
                returnedCode: 'complete',
                handoffLinks: {
                    subscribe: listener => {
                        session.handler = listener;
                        return () => {
                            session.handler = null;
                        };
                    },
                },
            },
        },
    });
});
vi.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: session.toast }));

import { WebStore } from '@chatic/storage';

import { configureAppStores } from '../../../storage';

import i18n from '../../../../i18n';
import { useSocialLogin } from '../hooks';
import { OAUTH_LOGIN_START_TTL_MS, saveOAuthLoginStart, takeOAuthLoginStart } from '../utils';
import { OAuthDeeplinkListener } from './OAuthDeeplinkListener';

const NOW = new Date('2026-10-06T00:00:00Z').getTime();

const deliver = async (deeplink: string) => {
    await act(async () => {
        session.handler?.(deeplink);
    });
};

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
        configureAppStores({ device: WebStore.local(), tab: WebStore.session(), plain: WebStore.local() });
        localStorage.clear();
        session.isAuthenticated = false;
        session.createCredentialsByProvider.mockReset().mockResolvedValue(undefined);
        session.loginGuest.mockReset().mockResolvedValue(undefined);
        session.toast.mockReset();
        session.navigate.mockReset();
        vi.spyOn(window, 'open').mockReturnValue(null);
        render(<OAuthDeeplinkListener />);
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    const started = (over: Partial<{ provider: string; startedAt: number; nonce: string }> = {}) =>
        saveOAuthLoginStart({ provider: 'google', intent: 'login', startedAt: NOW, nonce: 'n1', ...over });

    it('does not exchange a deeplink when no login was started, and says so', async () => {
        await deliver('chatic://oauth?provider=google&code=attacker');

        expect(session.createCredentialsByProvider).not.toHaveBeenCalled();
        expect(session.toast).toHaveBeenCalledWith(
            expect.objectContaining({ description: i18n.t('auth.social.notStarted') })
        );
    });

    it('takes a link back to the account hub, where its outcome is shown', async () => {
        saveOAuthLoginStart({ provider: 'google', intent: 'link', account: 'u-1', startedAt: NOW, nonce: 'n1' });

        await deliver('chatic://oauth?provider=google&code=abc&nonce=n1');

        expect(session.createCredentialsByProvider).not.toHaveBeenCalled();
        expect(session.navigate).toHaveBeenCalledWith('/account');
    });

    it('stays where it is after a login', async () => {
        started();

        await deliver('chatic://oauth?provider=google&code=abc&nonce=n1');

        expect(session.navigate).not.toHaveBeenCalled();
    });

    it('exchanges a deeplink for a login that was started', async () => {
        started();

        await deliver('chatic://oauth?provider=google&code=abc&nonce=n1');

        expect(session.createCredentialsByProvider).toHaveBeenCalledWith('google', 'abc', { linkCurrentSession: true });
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
            expect.objectContaining({ variant: 'destructive', title: i18n.t('auth.social.failed') })
        );

        started({ nonce: 'n2' });
        await deliver('chatic://oauth?provider=google&code=good&nonce=n2');

        expect(session.createCredentialsByProvider).toHaveBeenLastCalledWith('google', 'good', {
            linkCurrentSession: true,
        });
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
        expect(session.createCredentialsByProvider).toHaveBeenCalledWith('google', 'first', {
            linkCurrentSession: true,
        });
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

        expect(session.createCredentialsByProvider).toHaveBeenCalledWith('google', 'abc', { linkCurrentSession: true });
    });

    it('ignores deeplinks that are not OAuth ones without touching the start', async () => {
        started();

        await deliver('chatic-open://room/1');
        await deliver('chatic://oauth.evil?provider=google&code=abc');

        expect(session.createCredentialsByProvider).not.toHaveBeenCalled();
        expect(session.toast).not.toHaveBeenCalled();
        expect(takeOAuthLoginStart()).not.toBeNull();
    });

    it('still swaps the session of a signed-in guest who started the login', async () => {
        session.isAuthenticated = true;
        const replace = vi.fn();
        vi.stubGlobal('location', { ...window.location, origin: 'https://desktop.example', replace });
        const { getByText } = render(<Starter />);
        await act(async () => getByText('start').click());
        const { nonce } = JSON.parse(localStorage.getItem('chatic-oauth-login-start') ?? '{}');

        await deliver(`chatic://oauth?provider=google&code=abc&nonce=${nonce}`);

        expect(session.createCredentialsByProvider).toHaveBeenCalledWith('google', 'abc', { linkCurrentSession: true });
        expect(replace).toHaveBeenCalledWith('/');
        vi.unstubAllGlobals();
    });
});
