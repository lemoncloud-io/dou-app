import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import type { DomainPlace } from '@chatic/data';

const places = [
    { id: 'p1', name: 'Studio' },
    { id: 'p2', name: 'Lab' },
] as DomainPlace[];

vi.mock('../../../shared/hooks/usePlaces', () => ({
    usePlaces: () => ({ places, placeIds: ['p1', 'p2'], isLoading: false }),
}));

const switchCloud = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../../../shared/hooks/useCloudSwitchFlow', () => ({
    useCloudSwitchFlow: () => ({ switchCloud, isSwitching: false }),
}));

const selectedCloud = vi.hoisted(() => ({ id: 'c9' }));
vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSessionSelection: () => ({ selectedCloudId: selectedCloud.id }),
        },
    },
}));

const catalog = vi.hoisted(() => ({ clouds: [{ id: 'c9', name: 'Acme' }] }));
vi.mock('../../../shared/hooks/useCloudCatalog', () => ({
    useCloudSessionCatalog: () => catalog,
}));

import '../../../../i18n';

import { CloudPlacesPage } from './CloudPlacesPage';

const navProbe = vi.hoisted(() => ({ path: '' }));
const NavProbe = () => {
    navProbe.path = useLocation().pathname;
    return null;
};

const renderAt = () =>
    render(
        <MemoryRouter initialEntries={['/account/clouds/c9/places']}>
            <NavProbe />
            <Routes>
                <Route path="/account/clouds/:cloudId/places" element={<CloudPlacesPage />} />
            </Routes>
        </MemoryRouter>
    );

describe('CloudPlacesPage', () => {
    beforeEach(() => {
        cleanup();
        vi.clearAllMocks();
        selectedCloud.id = 'c9';
        navProbe.path = '';
    });

    it('lists the active cloud places into their settings', () => {
        renderAt();

        fireEvent.click(screen.getByText('Studio'));

        expect(navProbe.path).toBe('/places/p1/settings');
    });

    it('asks for an explicit switch on any other cloud instead of switching by itself', () => {
        selectedCloud.id = 'c1';
        renderAt();

        // No silent session yank: the reader's cloud stays theirs until they say so.
        expect(screen.queryByText('Studio')).toBeNull();
        expect(screen.getByText('Switch to this cloud to see its places.')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Switch cloud' }));

        expect(switchCloud).toHaveBeenCalledWith('c9');
    });

    it('names its back button after the cloud hub', () => {
        renderAt();

        expect(screen.getByRole('button', { name: 'Acme' })).toBeTruthy();
    });
});
