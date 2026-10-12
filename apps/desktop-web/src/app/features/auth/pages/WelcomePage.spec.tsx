import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    guest: { submit: vi.fn(), isSubmitting: false, isError: false },
    social: { start: vi.fn(), isStarting: false, isError: false },
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../hooks/useGuestLogin', () => ({ useGuestLogin: () => state.guest }));
vi.mock('../hooks/useSocialLogin', () => ({ useSocialLogin: () => state.social }));
vi.mock('../utils', () => ({ isSocialLoginEnabled: () => true }));
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
});
