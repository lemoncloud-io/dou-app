import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const start = vi.hoisted(() => vi.fn());
const startLink = vi.hoisted(() => vi.fn());
const socialEnabled = vi.hoisted(() => ({ value: true }));
const phoneEnabled = vi.hoisted(() => ({ value: true }));
const navigate = vi.hoisted(() => vi.fn());
const verifySocialAccount = vi.hoisted(() => vi.fn());
const confirmSocialAccount = vi.hoisted(() => vi.fn());

vi.mock('../../auth', () => ({
    GoogleIcon: () => null,
    isSocialLoginEnabled: () => socialEnabled.value,
    isPhoneLoginEnabled: () => phoneEnabled.value,
    phoneSignupNoteKey: () => 'auth.social.phoneSignupNote',
    useSocialLogin: () => ({ start, startLink, isStarting: false }),
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
        expect(navigate).toHaveBeenCalledWith('/auth/phone');
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
});
