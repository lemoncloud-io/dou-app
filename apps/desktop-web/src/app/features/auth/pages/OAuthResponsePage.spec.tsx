import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let isError = false;
let native = true;
const completeFromHandoff = vi.fn();

// Inside the desktop shell the page exchanges the code itself, so no deeplink jump runs.
vi.mock('@chatic/bridges', () => ({ isNative: () => native }));
vi.mock('@chatic/config', () => ({ config: { get: () => 'chatic-dev' } }));
vi.mock('../hooks', () => ({
    useSocialLogin: () => ({ completeFromHandoff, isError }),
}));

import i18n from '../../../../i18n';
import { OAuthResponsePage } from './OAuthResponsePage';

const page = (search = 'code=abc&provider=google&nonce=n1') => (
    <MemoryRouter initialEntries={[`/oauth-response?${search}`]}>
        <OAuthResponsePage />
    </MemoryRouter>
);

const liveRegion = () => screen.getByRole('heading').closest('[aria-live="polite"]');

describe('OAuthResponsePage', () => {
    beforeEach(() => {
        isError = false;
        native = true;
        completeFromHandoff.mockReset();
    });

    it('announces the move from signing in to failed through a live region', () => {
        const { rerender } = render(page());

        expect(liveRegion()?.textContent).toContain(i18n.t('auth.social.signingIn'));

        isError = true;
        rerender(page());

        expect(liveRegion()?.textContent).toContain(i18n.t('auth.social.failedTitle'));
        expect(liveRegion()?.textContent).toContain(i18n.t('auth.social.failed'));
    });

    it('hands the code to the start-gated exchange when it lands inside the shell', () => {
        render(page());

        expect(completeFromHandoff).toHaveBeenCalledWith({ provider: 'google', code: 'abc', nonce: 'n1' });
    });

    it('shows the failure screen and exchanges nothing when it arrives without a nonce inside the shell', () => {
        render(page('code=abc&provider=google'));

        expect(completeFromHandoff).not.toHaveBeenCalled();
        expect(liveRegion()?.textContent).toContain(i18n.t('auth.social.failedTitle'));
    });

    describe('in a plain browser', () => {
        const replace = vi.fn();
        const originalLocation = window.location;

        beforeEach(() => {
            native = false;
            replace.mockReset();
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: { ...originalLocation, replace },
            });
        });

        afterEach(() => {
            Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
        });

        it('opens the app with the nonce it was given', () => {
            render(page());

            expect(replace).toHaveBeenCalledTimes(1);
            const link = new URL(replace.mock.calls[0][0]);
            expect(link.protocol).toBe('chatic-dev:');
            expect(Object.fromEntries(link.searchParams)).toEqual({ provider: 'google', code: 'abc', nonce: 'n1' });
            expect(completeFromHandoff).not.toHaveBeenCalled();
        });

        it('shows the failure screen and does not open the app when it arrives without a nonce', () => {
            render(page('code=abc&provider=google'));

            expect(replace).not.toHaveBeenCalled();
            expect(liveRegion()?.textContent).toContain(i18n.t('auth.social.failedTitle'));
        });
    });
});
