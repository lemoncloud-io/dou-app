import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let isError = false;
const completeFromHandoff = vi.fn();

// Inside the desktop shell the page exchanges the code itself, so no deeplink jump runs.
vi.mock('@chatic/bridges', () => ({ isNative: () => true }));
vi.mock('../hooks', () => ({
    useSocialLogin: () => ({ completeFromHandoff, isError }),
}));

import i18n from '../../../../i18n';
import { OAuthResponsePage } from './OAuthResponsePage';

const page = () => (
    <MemoryRouter initialEntries={['/oauth-response?code=abc&provider=google']}>
        <OAuthResponsePage />
    </MemoryRouter>
);

const liveRegion = () => screen.getByRole('heading').closest('[aria-live="polite"]');

describe('OAuthResponsePage', () => {
    beforeEach(() => {
        isError = false;
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

        expect(completeFromHandoff).toHaveBeenCalledWith({ provider: 'google', code: 'abc' });
    });
});
