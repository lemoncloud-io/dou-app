import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const start = vi.hoisted(() => vi.fn());
const startLink = vi.hoisted(() => vi.fn());
const socialEnabled = vi.hoisted(() => ({ value: true }));
const phoneEnabled = vi.hoisted(() => ({ value: true }));
const navigate = vi.hoisted(() => vi.fn());
const reopen = vi.hoisted(() => vi.fn());
const cancel = vi.hoisted(() => vi.fn());
const attempts = vi.hoisted(() => ({
    attempt: null as { intent: 'login' | 'link'; provider?: string; nonce?: string } | null,
    failed: false,
    linkFailure: null as 'occupied' | 'typeLinked' | 'failed' | null,
    busy: false,
    setLinkFailure: vi.fn(),
}));
const verifySocialAccount = vi.hoisted(() => vi.fn());
const confirmSocialAccount = vi.hoisted(() => vi.fn());

vi.mock('../../auth', () => ({
    AppleIcon: () => null,
    GoogleIcon: () => null,
    oauthProviderName: (provider: string) => (provider === 'apple' ? 'Apple' : 'Google'),
    PHONE_BUTTON_CLASS: '',
    isSocialLoginEnabled: () => socialEnabled.value,
    isPhoneLoginEnabled: () => phoneEnabled.value,
    phoneSignupNoteKey: () => 'auth.social.phoneSignupNote',
    useSocialLogin: () => ({ start, startLink, reopen, cancel, isStarting: false }),
    useAttemptExpired: () => false,
    useOAuthAttemptStore: <T,>(select: (s: typeof attempts) => T) => select(attempts),
    selectAttemptBusy: (s: typeof attempts) => s.busy,
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));

// The card never links by itself — it starts the browser round trip: these would be the calls if it did.
vi.mock('@chatic/app-runtime', () => ({
    runtime: { data: { useRuntimeRepositories: () => ({ auth: { verifySocialAccount, confirmSocialAccount } }) } },
}));

import i18n from '../../../../i18n';

import { AccountSignInCard } from './AccountSignInCard';

describe('AccountSignInCard', () => {
    beforeEach(() => {
        cleanup();
        vi.clearAllMocks();
        socialEnabled.value = true;
        phoneEnabled.value = true;
        attempts.attempt = null;
        attempts.failed = false;
        attempts.linkFailure = null;
        attempts.busy = false;
    });

    it('renders nothing while the link$ slot is unknown', () => {
        const { container } = render(<AccountSignInCard account={{ userRole: 'user' }} />);
        expect(container.innerHTML).toBe('');
    });

    it('offers a guest Google sign-in with the phone sign-up note', () => {
        render(<AccountSignInCard account={{ userRole: 'guest' }} />);

        expect(screen.getByText(i18n.t('auth.social.phoneSignupNote'))).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: i18n.t('auth.social.google') }));
        expect(start).toHaveBeenCalledWith('google');
    });

    it('offers a guest phone sign-in ahead of Google', () => {
        render(<AccountSignInCard account={{ userRole: 'guest' }} />);

        const names = screen.getAllByRole('button').map(b => b.textContent);
        expect(names[0]).toContain(i18n.t('auth.phone.start'));
        fireEvent.click(screen.getByRole('button', { name: i18n.t('auth.phone.start') }));
        expect(navigate).toHaveBeenCalledWith('/auth/phone', { state: { from: '/account' } });
    });

    it('offers a guest phone sign-in alone, without the Google note, when social login is off', () => {
        socialEnabled.value = false;
        render(<AccountSignInCard account={{ userRole: 'guest' }} />);

        expect(screen.getByRole('button', { name: i18n.t('auth.phone.start') })).toBeTruthy();
        expect(screen.queryByRole('button', { name: i18n.t('auth.social.google') })).toBeNull();
        expect(screen.queryByText(i18n.t('auth.social.phoneSignupNote'))).toBeNull();
    });

    it('offers a guest nothing when the build turns both sign-ins off', () => {
        socialEnabled.value = false;
        phoneEnabled.value = false;
        const { container } = render(<AccountSignInCard account={{ userRole: 'guest' }} />);
        expect(container.innerHTML).toBe('');
    });

    it('shows a signed-in account its provider and hint, with nothing to press', () => {
        render(
            <AccountSignInCard
                account={{ userRole: 'user', link$: { social: { provider: 'google', hint: 'a***@example.com' } } }}
            />
        );

        expect(screen.getByText('Google · a***@example.com')).toBeTruthy();
        expect(screen.queryByRole('button')).toBeNull();
        expect(verifySocialAccount).not.toHaveBeenCalled();
        expect(confirmSocialAccount).not.toHaveBeenCalled();
    });

    it('shows the phone ending when only a number is linked', () => {
        render(<AccountSignInCard account={{ userRole: 'user', link$: { phone: { hint: '1234' } } }} />);
        expect(screen.getByText(i18n.t('account.signIn.phoneHint', { last4: '1234' }))).toBeTruthy();
    });

    it('offers a number-only account a Google link', () => {
        render(<AccountSignInCard account={{ userRole: 'user', link$: { phone: { hint: '1234' } } }} />);

        fireEvent.click(screen.getByRole('button', { name: i18n.t('account.signIn.link.google') }));

        expect(startLink).toHaveBeenCalledWith('google');
        expect(start).not.toHaveBeenCalled();
        expect(verifySocialAccount).not.toHaveBeenCalled();
    });

    it('offers no Google link when the build turns Google off', () => {
        socialEnabled.value = false;
        render(<AccountSignInCard account={{ userRole: 'user', link$: { phone: { hint: '1234' } } }} />);

        expect(screen.queryByRole('button')).toBeNull();
    });

    it('lists the linked Google and the number together, with nothing to press', () => {
        render(
            <AccountSignInCard
                account={{
                    userRole: 'user',
                    link$: { phone: { hint: '1234' }, social: { provider: 'google', hint: 'a***@gmail.com' } },
                }}
            />
        );

        expect(screen.getByText('Google · a***@gmail.com')).toBeTruthy();
        expect(screen.getByText(i18n.t('account.signIn.phoneHint', { last4: '1234' }))).toBeTruthy();
        expect(screen.queryByRole('button')).toBeNull();
    });

    it('renders nothing without a relay user', () => {
        const { container } = render(<AccountSignInCard account={null} />);
        expect(container.innerHTML).toBe('');
    });

    it('names a social account with no provider by a generic label', () => {
        render(<AccountSignInCard account={{ userRole: 'user', link$: { social: { hint: 'a***' } } }} />);
        expect(screen.getByText(`${i18n.t('account.signIn.social')} · a***`)).toBeTruthy();
    });

    it('shows the email when only an email is linked', () => {
        render(<AccountSignInCard account={{ userRole: 'user', link$: { email: { hint: 'a***@example.com' } } }} />);
        expect(screen.getByText(`${i18n.t('account.signIn.email')} · a***@example.com`)).toBeTruthy();
    });

    it('points the guest button at the phone sign-up note', () => {
        render(<AccountSignInCard account={{ userRole: 'guest' }} />);
        const google = screen.getByRole('button', { name: i18n.t('auth.social.google') });
        const note = document.getElementById(google.getAttribute('aria-describedby') ?? '');
        expect(note?.textContent).toBe(i18n.t('auth.social.phoneSignupNote'));
    });

    it('says so when the slot is there and empty', () => {
        render(<AccountSignInCard account={{ userRole: 'user', link$: {} }} />);
        expect(screen.getByText(i18n.t('account.signIn.none'))).toBeTruthy();
    });

    it('holds the Google link while one is out in the browser, with a way to give up', () => {
        attempts.attempt = { intent: 'link', provider: 'google', nonce: 'n' };
        render(<AccountSignInCard account={{ userRole: 'user', link$: { phone: { hint: '1234' } } }} />);

        const link = screen.getByRole('button', { name: i18n.t('account.signIn.link.google') }) as HTMLButtonElement;
        expect(link.disabled).toBe(true);
        expect(screen.getByText(i18n.t('account.signIn.link.waiting', { provider: 'Google' }))).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: i18n.t('auth.social.reopen') }));
        fireEvent.click(screen.getByRole('button', { name: i18n.t('auth.social.cancel') }));
        expect(reopen).toHaveBeenCalled();
        expect(cancel).toHaveBeenCalled();
    });

    it('offers no way to give up while the code that came back is being linked', () => {
        attempts.attempt = { intent: 'link', nonce: 'n' };
        attempts.busy = true;
        render(<AccountSignInCard account={{ userRole: 'user', link$: { phone: { hint: '1234' } } }} />);

        const cancelButton = screen.getByRole('button', { name: i18n.t('auth.social.cancel') }) as HTMLButtonElement;
        expect(cancelButton.disabled).toBe(true);
    });

    it('holds the guest Google sign-in while it is out in the browser', () => {
        attempts.attempt = { intent: 'login', provider: 'google' };
        render(<AccountSignInCard account={{ userRole: 'guest' }} />);

        const google = screen.getByRole('button', { name: i18n.t('auth.social.google') }) as HTMLButtonElement;
        expect(google.disabled).toBe(true);
        expect(screen.getByText(i18n.t('auth.social.waitingInline', { provider: 'Google' }))).toBeTruthy();
    });

    it('keeps an occupied Google on the card with its next step, until dismissed', () => {
        attempts.linkFailure = 'occupied';
        render(<AccountSignInCard account={{ userRole: 'user', link$: { phone: { hint: '1234' } } }} />);

        const alert = screen.getByRole('alert');
        expect(alert.textContent).toContain(i18n.t('account.signIn.link.occupied'));
        expect(alert.textContent).toContain(i18n.t('account.signIn.link.occupiedNext'));
        fireEvent.click(screen.getByRole('button', { name: i18n.t('auth.social.dismiss') }));
        expect(attempts.setLinkFailure).toHaveBeenCalledWith(null);
    });

    it('says why a link failed without the occupied next step', () => {
        attempts.linkFailure = 'typeLinked';
        render(<AccountSignInCard account={{ userRole: 'user', link$: { phone: { hint: '1234' } } }} />);

        expect(screen.getByRole('alert').textContent).toBe(
            i18n.t('account.signIn.link.typeLinked') + i18n.t('auth.social.dismiss')
        );
    });

    describe('Apple guest sign-in', () => {
        it('offers a guest Apple sign-in after Google, under the same note', () => {
            render(<AccountSignInCard account={{ userRole: 'guest' }} />);

            const names = screen.getAllByRole('button').map(b => b.textContent);
            const google = names.findIndex(text => text?.includes(i18n.t('auth.social.google')));
            const apple = screen.getByRole('button', { name: i18n.t('auth.social.apple') });
            expect(names.findIndex(text => text?.includes(i18n.t('auth.social.apple')))).toBeGreaterThan(google);
            expect(document.getElementById(apple.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
                i18n.t('auth.social.phoneSignupNote')
            );
            fireEvent.click(apple);
            expect(start).toHaveBeenCalledWith('apple');
        });

        it('offers no Apple sign-in when social login is off', () => {
            socialEnabled.value = false;
            render(<AccountSignInCard account={{ userRole: 'guest' }} />);

            expect(screen.queryByRole('button', { name: i18n.t('auth.social.apple') })).toBeNull();
        });

        it('names Apple while the Apple sign-in is out in the browser', () => {
            attempts.attempt = { intent: 'login', provider: 'apple' };
            render(<AccountSignInCard account={{ userRole: 'guest' }} />);

            const apple = screen.getByRole('button', { name: i18n.t('auth.social.apple') }) as HTMLButtonElement;
            expect(apple.disabled).toBe(true);
            expect(screen.getByRole('status').textContent).toContain('Apple');
            expect(screen.getByRole('status').textContent).not.toContain('Google');
        });
    });

    describe('Link Apple', () => {
        const numberOnly = { userRole: 'user', link$: { phone: { hint: '1234' } } };

        it('offers a number-only account an Apple link after Google', () => {
            render(<AccountSignInCard account={numberOnly} />);

            const names = screen.getAllByRole('button').map(b => b.textContent);
            const google = names.findIndex(text => text?.includes(i18n.t('account.signIn.link.google')));
            const apple = names.findIndex(text => text?.includes(i18n.t('account.signIn.link.apple')));
            expect(google).toBeGreaterThanOrEqual(0);
            expect(apple).toBeGreaterThan(google);
            fireEvent.click(screen.getByRole('button', { name: i18n.t('account.signIn.link.apple') }));
            expect(startLink).toHaveBeenCalledWith('apple');
        });

        it('offers no Apple link once a social account is linked', () => {
            render(
                <AccountSignInCard
                    account={{ userRole: 'user', link$: { social: { provider: 'google', hint: 'a' } } }}
                />
            );

            expect(screen.queryByRole('button', { name: i18n.t('account.signIn.link.apple') })).toBeNull();
        });

        it('shows a linked Apple as Apple', () => {
            render(<AccountSignInCard account={{ userRole: 'user', link$: { social: { provider: 'apple' } } }} />);

            expect(screen.getByText('Apple')).toBeTruthy();
        });

        it('names Apple while the Apple link is out in the browser', () => {
            attempts.attempt = { intent: 'link', provider: 'apple', nonce: 'n' };
            render(<AccountSignInCard account={numberOnly} />);

            const apple = screen.getByRole('button', {
                name: i18n.t('account.signIn.link.apple'),
            }) as HTMLButtonElement;
            expect(apple.disabled).toBe(true);
            expect(screen.getByRole('status').textContent).toContain('Apple');
        });

        it('names neither provider in a link failure, which the store keeps without one', () => {
            attempts.linkFailure = 'occupied';
            render(<AccountSignInCard account={numberOnly} />);

            expect(screen.getByRole('alert').textContent).not.toMatch(/Google|Apple/);
        });
    });
});
