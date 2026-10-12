import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    isAuthenticated: false,
    user: null as { userRole?: string } | null,
    login: {} as Record<string, unknown>,
    onSignedIn: null as null | ((result: { isNew: boolean }) => void),
}));

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            getIdentityContext: () => ({ isAuthenticated: state.isAuthenticated }),
            getRelaySessionUser: () => state.user,
        },
    },
}));
vi.mock('../hooks/usePhoneLogin', () => ({
    PHONE_CODE_LENGTH: 6,
    usePhoneLogin: ({ onSignedIn }: { onSignedIn: (result: { isNew: boolean }) => void }) => {
        state.onSignedIn = onSignedIn;
        return state.login;
    },
}));
vi.mock('../components', () => ({
    AuthCard: ({ title, children }: { title: string; children: React.ReactNode }) => (
        <div>
            <h1>{title}</h1>
            {children}
        </div>
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
    busy: 'idle',
    isRetry: false,
    retrySwitch: vi.fn(),
});

const renderPage = () =>
    render(
        <MemoryRouter initialEntries={['/auth/phone']}>
            <Routes>
                <Route path="/auth/phone" element={<PhoneLoginPage />} />
                <Route path="/" element={<div data-testid="home" />} />
            </Routes>
        </MemoryRouter>
    );

describe('PhoneLoginPage', () => {
    const replace = vi.fn();

    beforeEach(() => {
        state.isAuthenticated = false;
        state.user = null;
        state.login = baseLogin();
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
        fireEvent.click(screen.getByRole('button', { name: i18n.t('auth.phone.continue') }));
        expect(replace).toHaveBeenCalledWith('/');
    });
});
