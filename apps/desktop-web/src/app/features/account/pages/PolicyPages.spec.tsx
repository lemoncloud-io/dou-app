import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import '../../../../i18n';

import { PolicyListPage } from './PolicyListPage';
import { PrivacyPage } from './PrivacyPage';
import { TermsPage } from './TermsPage';

const navProbe = vi.hoisted(() => ({ path: '' }));
const NavProbe = () => {
    navProbe.path = useLocation().pathname;
    return null;
};

const renderAt = (path: string) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <NavProbe />
            <Routes>
                <Route path="/account/policies" element={<PolicyListPage />} />
                <Route path="/account/policies/terms" element={<TermsPage />} />
                <Route path="/account/policies/privacy" element={<PrivacyPage />} />
            </Routes>
        </MemoryRouter>
    );

describe('Policy pages', () => {
    beforeEach(() => {
        cleanup();
        navProbe.path = '';
    });

    it('lists terms and privacy into their pages', () => {
        renderAt('/account/policies');

        fireEvent.click(screen.getByText('Terms of service'));

        expect(navProbe.path).toBe('/account/policies/terms');
    });

    it('renders the terms sections', () => {
        renderAt('/account/policies/terms');

        expect(screen.getAllByRole('heading').length).toBeGreaterThan(2);
    });

    it('renders the privacy sections', () => {
        renderAt('/account/policies/privacy');

        expect(screen.getAllByRole('heading').length).toBeGreaterThan(2);
    });

    // Terms and privacy are read, copied and quoted: the body-wide
    // `user-select: none` must not cover the prose.
    it('leaves the terms prose selectable', () => {
        renderAt('/account/policies/terms');

        expect(document.querySelector('main .select-text')).not.toBeNull();
    });
});
