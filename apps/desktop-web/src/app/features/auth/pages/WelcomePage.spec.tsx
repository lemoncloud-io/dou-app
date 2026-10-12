import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    guest: { submit: vi.fn(), isSubmitting: false, isError: false },
    social: { start: vi.fn(), isStarting: false, isError: false },
    phoneLogin: true,
    navigate: vi.fn(),
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => state.navigate }));
vi.mock('../hooks/useGuestLogin', () => ({ useGuestLogin: () => state.guest }));
vi.mock('../hooks/useSocialLogin', () => ({ useSocialLogin: () => state.social }));
vi.mock('../utils', () => ({
    isSocialLoginEnabled: () => true,
    isPhoneLoginEnabled: () => state.phoneLogin,
    phoneSignupNoteKey: () => (state.phoneLogin ? 'auth.social.phoneSignupNotePhone' : 'auth.social.phoneSignupNote'),
}));
vi.mock('../components', () => ({
    AuthCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    GoogleIcon: () => null,
}));

import i18n from '../../../../i18n';
import { WelcomePage } from './WelcomePage';

describe('WelcomePage', () => {
    beforeEach(() => {
        state.guest = { submit: vi.fn(), isSubmitting: false, isError: false };
        state.social = { start: vi.fn(), isStarting: false, isError: false };
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

        expect(state.navigate).toHaveBeenCalledWith('/auth/phone');
    });

    it('offers no phone sign-in when the build turns it off', () => {
        state.phoneLogin = false;
        render(<WelcomePage />);

        expect(screen.queryByText(i18n.t('auth.phone.start'))).toBeNull();
    });
});
