import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    isAuthenticated: false,
    user: null as { userRole?: string } | null,
    login: {} as Record<string, unknown>,
    onSignedIn: null as null | ((result: { isNew: boolean }) => void),
    signOutGuest: vi.fn(),
}));

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            getIdentityContext: () => ({ isAuthenticated: state.isAuthenticated }),
            getRelaySessionUser: () => state.user,
        },
    },
}));
vi.mock('../hooks/useSignOutGuest', () => ({ useSignOutGuest: () => state.signOutGuest }));
vi.mock('../hooks/usePhoneLogin', () => ({
    PHONE_CODE_LENGTH: 6,
    usePhoneLogin: ({ onSignedIn }: { onSignedIn: (result: { isNew: boolean }) => void }) => {
        state.onSignedIn = onSignedIn;
        return state.login;
    },
}));
vi.mock('../components', () => ({
    AuthCard: ({ title, children, onBack }: { title: string; children: React.ReactNode; onBack?: () => void }) => (
        <div>
            {onBack && (
                <button type="button" onClick={onBack}>
                    back
                </button>
            )}
            <h1>{title}</h1>
            {children}
        </div>
    ),
    // The naming step has its own spec; here it only has to hand back.
    NewAccountName: ({ onDone }: { onDone: () => void }) => (
        <button type="button" onClick={onDone}>
            name step
        </button>
    ),
}));

import i18n from '../../../../i18n';
import { PhoneLoginPage } from './PhoneLoginPage';

const baseLogin = () => ({
    phone: '',
    changePhone: vi.fn(),
    country: 'KR',
    changeCountry: vi.fn(),
    phoneError: null,
    canRequestCode: true,
    requestCode: vi.fn(),
    codeSent: false,
    otp: '',
    changeOtp: vi.fn(),
    codeError: null,
    countdown: null,
    resend: vi.fn(),
    canResend: false,
    resendIn: 0,
    busy: 'idle',
    isRetry: false,
    retrySwitch: vi.fn(),
});

const renderPage = (entry?: Record<string, unknown>) =>
    render(
        <MemoryRouter initialEntries={[{ pathname: '/auth/phone', state: entry }]}>
            <Routes>
                <Route path="/auth/phone" element={<PhoneLoginPage />} />
                <Route path="/" element={<div data-testid="home" />} />
                <Route path="/account" element={<div data-testid="account" />} />
                <Route path="/auth/welcome" element={<div data-testid="welcome" />} />
            </Routes>
        </MemoryRouter>
    );

describe('PhoneLoginPage', () => {
    const replace = vi.fn();

    beforeEach(() => {
        state.isAuthenticated = false;
        state.user = null;
        state.login = baseLogin();
        state.signOutGuest.mockReset().mockResolvedValue(undefined);
        replace.mockReset();
        vi.stubGlobal('location', { ...window.location, replace });
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('asks for a code from the number form', () => {
        renderPage();

        fireEvent.click(screen.getByRole('button', { name: i18n.t('auth.phone.sendCode') }));

        expect(state.login.requestCode).toHaveBeenCalled();
    });

    // A bad number with Enter used to do nothing visible: submit was gated on
    // canRequestCode, so validation never ran and no message ever showed.
    it('runs validation on submit even when sending is not allowed', () => {
        state.login = { ...baseLogin(), canRequestCode: false, requestCode: vi.fn() };
        renderPage();

        fireEvent.submit(document.querySelector('form') as HTMLFormElement);

        expect(state.login.requestCode).toHaveBeenCalledTimes(1);
    });

    it('stays open for a guest session', () => {
        state.isAuthenticated = true;
        state.user = { userRole: 'guest' };
        renderPage();

        expect(screen.getByText(i18n.t('auth.phone.title'))).toBeTruthy();
    });

    it('turns away an account that is already signed in', () => {
        state.isAuthenticated = true;
        state.user = { userRole: 'user' };
        renderPage();

        expect(screen.getByTestId('home')).toBeTruthy();
    });

    it('shows the code field, its error, and resend once a code is out', () => {
        state.login = { ...baseLogin(), codeSent: true, canResend: true, codeError: 'wrongCode' };
        renderPage();

        expect(screen.getByLabelText(i18n.t('auth.phone.code'))).toBeTruthy();
        expect(screen.getByRole('alert').textContent).toBe(i18n.t('auth.phone.error.wrongCode'));
        fireEvent.click(screen.getByRole('button', { name: i18n.t('auth.phone.resend') }));
        expect(state.login.resend).toHaveBeenCalled();
    });

    it('offers to finish a sign-in whose session switch failed', () => {
        state.login = { ...baseLogin(), codeSent: true, isRetry: true, codeError: 'sessionSwitchFailed' };
        renderPage();

        fireEvent.click(screen.getByRole('button', { name: i18n.t('auth.phone.retry') }));

        expect(state.login.retrySwitch).toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: i18n.t('auth.phone.resend') })).toBeNull();
    });

    it('opens the app straight away for an existing account', () => {
        renderPage();

        act(() => state.onSignedIn?.({ isNew: false }));

        expect(replace).toHaveBeenCalledWith('/');
    });

    it('says a new account was made before opening the app', () => {
        renderPage();

        act(() => state.onSignedIn?.({ isNew: true }));

        expect(replace).not.toHaveBeenCalled();
        expect(screen.getByText(i18n.t('auth.phone.newAccountTitle'))).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'name step' }));
        expect(replace).toHaveBeenCalledWith('/');
    });

    it('goes back to where it was opened from', () => {
        state.isAuthenticated = true;
        state.user = { userRole: 'guest' };
        renderPage({ from: '/account' });

        fireEvent.click(screen.getByRole('button', { name: 'back' }));

        expect(screen.getByTestId('account')).toBeTruthy();
        expect(state.signOutGuest).not.toHaveBeenCalled();
    });

    it('signs out the guest that sending the first code registered, on the way back', () => {
        renderPage({ from: '/auth/welcome' });
        state.isAuthenticated = true;

        fireEvent.click(screen.getByRole('button', { name: 'back' }));

        expect(state.signOutGuest).toHaveBeenCalled();
    });

    it('signs out a guest a Google start registered before leaving for this page', () => {
        state.isAuthenticated = true;
        state.user = { userRole: 'guest' };
        renderPage({ from: '/auth/welcome', signOutOnBack: true });

        fireEvent.click(screen.getByRole('button', { name: 'back' }));

        expect(state.signOutGuest).toHaveBeenCalled();
    });

    it('does not sign out an account the sign-in on this page already made', () => {
        renderPage({ from: '/auth/welcome' });
        state.isAuthenticated = true;
        state.user = { userRole: 'user' };

        fireEvent.click(screen.getByRole('button', { name: 'back' }));

        expect(state.signOutGuest).not.toHaveBeenCalled();
    });

    it('counts down to the next resend', () => {
        state.login = { ...baseLogin(), codeSent: true, resendIn: 42 };
        renderPage();

        expect(screen.getByRole('button', { name: i18n.t('auth.phone.resendIn', { time: '0:42' }) })).toBeTruthy();
    });

    it('goes back to Welcome when it was opened with no entry, signed out', () => {
        renderPage();

        fireEvent.click(screen.getByRole('button', { name: 'back' }));

        expect(screen.getByTestId('welcome')).toBeTruthy();
    });

    it('lands at home when signing the guest out fails', async () => {
        state.signOutGuest.mockRejectedValue(new Error('logout failed'));
        renderPage({ from: '/auth/welcome' });
        state.isAuthenticated = true;

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'back' }));
        });

        expect(screen.getByTestId('home')).toBeTruthy();
    });
});
