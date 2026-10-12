import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    guest: { submit: vi.fn(), isSubmitting: false, isError: false },
    social: {
        start: vi.fn(),
        reopen: vi.fn(),
        cancel: vi.fn(),
        isStarting: false,
        isError: false,
    } as Record<string, unknown>,
    phoneLogin: true,
    navigate: vi.fn(),
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => state.navigate }));
vi.mock('../hooks/useGuestLogin', () => ({ useGuestLogin: () => state.guest }));
vi.mock('../hooks/useSocialLogin', () => ({ useSocialLogin: () => state.social }));
vi.mock('../utils', () => ({
    OAUTH_LOGIN_START_TTL_MS: 10 * 60 * 1000,
    isSocialLoginEnabled: () => true,
    isPhoneLoginEnabled: () => state.phoneLogin,
    phoneSignupNoteKey: () => (state.phoneLogin ? 'auth.social.phoneSignupNotePhone' : 'auth.social.phoneSignupNote'),
}));
vi.mock('../components', () => ({
    AuthCard: ({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) => (
        <div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
            {children}
        </div>
    ),
    GoogleIcon: () => null,
}));

import i18n from '../../../../i18n';
import { useOAuthAttemptStore } from '../stores/useOAuthAttemptStore';
import { WelcomePage } from './WelcomePage';

describe('WelcomePage', () => {
    beforeEach(() => {
        state.guest = { submit: vi.fn(), isSubmitting: false, isError: false };
        state.social = { start: vi.fn(), reopen: vi.fn(), cancel: vi.fn(), isStarting: false, isError: false };
        useOAuthAttemptStore.setState({ attempt: null, failed: false, linkFailure: null });
        state.phoneLogin = true;
        state.navigate = vi.fn();
    });

    afterEach(cleanup);

    it('shows the registration failure when starting social login could not register the device', () => {
        state.social.isError = true;

        render(<WelcomePage />);

        expect(screen.getByRole('alert').textContent).toBe(i18n.t('welcome.registerFailed'));
    });

    it('shows no alert when nothing failed', () => {
        render(<WelcomePage />);

        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('disables every way forward while the device is being registered for social login', () => {
        state.social.isStarting = true;

        render(<WelcomePage />);

        for (const button of screen.getAllByRole('button')) expect((button as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByText(i18n.t('welcome.starting'))).toBeTruthy();
    });

    it('starts the Google flow from the Google button', () => {
        render(<WelcomePage />);

        screen.getByText(i18n.t('auth.social.google')).click();

        expect(state.social.start).toHaveBeenCalledWith('google');
    });

    it('tells people who signed up with a phone number before they tap Google', () => {
        state.phoneLogin = false;
        render(<WelcomePage />);

        const google = screen.getByText(i18n.t('auth.social.google')).closest('button');
        const note = document.getElementById(google?.getAttribute('aria-describedby') ?? '');
        expect(note?.textContent).toBe(i18n.t('auth.social.phoneSignupNote'));
    });

    it('points people who signed up with a phone number at phone sign-in when it is on', () => {
        render(<WelcomePage />);

        const google = screen.getByText(i18n.t('auth.social.google')).closest('button');
        const note = document.getElementById(google?.getAttribute('aria-describedby') ?? '');
        expect(note?.textContent).toBe(i18n.t('auth.social.phoneSignupNotePhone'));
    });

    it('opens phone sign-in from its button', () => {
        render(<WelcomePage />);

        screen.getByText(i18n.t('auth.phone.start')).click();

        expect(state.navigate).toHaveBeenCalledWith('/auth/phone', { state: { from: '/auth/welcome' } });
    });

    it('puts phone sign-in before Google, so a phone sign-up reaches for it first', () => {
        render(<WelcomePage />);

        const buttons = screen.getAllByRole('button').map(b => b.textContent);
        const phone = buttons.findIndex(text => text?.includes(i18n.t('auth.phone.start')));
        const google = buttons.findIndex(text => text?.includes(i18n.t('auth.social.google')));
        expect(phone).toBeGreaterThanOrEqual(0);
        expect(phone).toBeLessThan(google);
    });

    it('offers no phone sign-in when the build turns it off', () => {
        state.phoneLogin = false;
        render(<WelcomePage />);

        expect(screen.queryByText(i18n.t('auth.phone.start'))).toBeNull();
    });

    describe('while the Google sign-in is out in the browser', () => {
        const waiting = (startedAt = Date.now()) =>
            useOAuthAttemptStore.setState({
                attempt: { provider: 'google', intent: 'login', signedOutAtStart: true, startedAt, nonce: 'n' },
                failed: false,
            });

        afterEach(() => vi.useRealTimers());

        it('says to finish in the browser and offers to open it again', () => {
            waiting();
            render(<WelcomePage />);

            expect(screen.getByText(i18n.t('auth.social.waitingTitle'))).toBeTruthy();
            screen.getByText(i18n.t('auth.social.reopen')).click();
            expect(state.social.reopen).toHaveBeenCalled();
        });

        it('cancels the attempt', () => {
            waiting();
            render(<WelcomePage />);

            screen.getByText(i18n.t('auth.social.cancel')).click();

            expect(state.social.cancel).toHaveBeenCalledWith();
        });

        it('moves to phone sign-in keeping the device session, and tells it where back goes', () => {
            waiting();
            render(<WelcomePage />);

            screen.getByText(i18n.t('auth.phone.start')).click();

            expect(state.navigate).toHaveBeenCalledWith('/auth/phone', {
                state: { from: '/auth/welcome', signOutOnBack: true },
            });
            expect(state.social.cancel).toHaveBeenCalledWith({ keepSession: true });
        });

        it('offers a retry once the hand-off failed', () => {
            waiting();
            useOAuthAttemptStore.setState({ failed: true });
            render(<WelcomePage />);

            expect(screen.getByText(i18n.t('auth.social.waitingFailed'))).toBeTruthy();
            screen.getByText(i18n.t('auth.social.retry')).click();
            expect(state.social.start).toHaveBeenCalledWith('google');
        });

        it('says the sign-in expired when the start runs out', () => {
            vi.useFakeTimers();
            waiting();
            render(<WelcomePage />);

            act(() => void vi.advanceTimersByTime(10 * 60 * 1000));

            expect(screen.getByText(i18n.t('auth.social.waitingExpired'))).toBeTruthy();
            expect(screen.getByText(i18n.t('auth.social.retry'))).toBeTruthy();
        });
    });
});
