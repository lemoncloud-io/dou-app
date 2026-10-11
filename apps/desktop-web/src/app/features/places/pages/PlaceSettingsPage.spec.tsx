import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import type { DomainPlace } from '@chatic/data';

const places: DomainPlace[] = [
    {
        id: 'p1',
        name: 'Studio',
        desc: 'Design critiques',
        thumbnail: '',
        ownerId: 'u9',
        createdAt: 1_700_000_000_000,
        cid: 'c1',
        isOwner: true,
    } as DomainPlace,
    { id: 'p2', name: 'Lab', cid: 'c1' } as DomainPlace,
];

const sessionSel = vi.hoisted(() => ({ siteId: 'p1' }));

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => ({
                place: {
                    observeList: (_q: unknown, cb: (r: { list: DomainPlace[] }) => void) => {
                        cb({ list: places });
                        return () => undefined;
                    },
                },
            }),
        },
        session: {
            useGlobalSession: () => ({ activeServer: { kind: 'cloud', cloudId: 'c1' }, identity: { userId: 'me' } }),
            useSessionIdentity: () => ({ userId: 'me' }),
            useSessionSelection: () => ({ selectedSiteId: sessionSel.siteId }),
        },
    },
}));

// Author names resolve off-device; the owner row is about layout, not lookup.
vi.mock('../../../shared/hooks/useAuthorNames', () => ({
    useAuthorNames: () => new Map([['u9', 'June']]),
}));

import '../../../../i18n';

import { useEditPlaceProfileDialogStore } from '../../profile/stores/useEditPlaceProfileDialogStore';
import { useEditPlaceDialogStore } from '../../chat/stores/useEditPlaceDialogStore';
import { PlaceSettingsPage } from './PlaceSettingsPage';

const navProbe = vi.hoisted(() => ({ path: '' }));

// MemoryRouter keeps history in memory, so navigation is read here instead of window.location.
const NavProbe = () => {
    navProbe.path = useLocation().pathname;
    return null;
};

const renderAt = (placeId: string) =>
    render(
        <MemoryRouter initialEntries={[`/places/${placeId}/settings`]}>
            <NavProbe />
            <Routes>
                <Route path="/places/:placeId/settings" element={<PlaceSettingsPage />} />
                <Route path="*" element={<div data-testid="away" />} />
            </Routes>
        </MemoryRouter>
    );

describe('PlaceSettingsPage', () => {
    beforeEach(() => {
        cleanup();
        vi.clearAllMocks();
        sessionSel.siteId = 'p1';
        useEditPlaceProfileDialogStore.getState().close();
    });

    it('shows the place info with its owner', () => {
        renderAt('p1');

        expect(screen.getByRole('heading', { name: 'Studio' })).toBeTruthy();
        expect(screen.getByText('Design critiques')).toBeTruthy();
        expect(screen.getByText(/June/)).toBeTruthy();
    });

    it('says so when the place is not on this device', () => {
        renderAt('ghost');

        expect(screen.getByText('No such place on this device.')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    });

    it('offers my place profile only for the active place', () => {
        renderAt('p1');

        expect(screen.getByText('My profile in this place')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        expect(useEditPlaceProfileDialogStore.getState().isOpen).toBe(true);
        act(() => useEditPlaceProfileDialogStore.getState().close());
    });

    it('hides my place profile on a place the dialog cannot edit', () => {
        sessionSel.siteId = 'p2';
        renderAt('p1');

        // The dialog edits the ACTIVE place — offering it here would edit the wrong one.
        expect(screen.queryByText('My profile in this place')).toBeNull();
    });

    it('offers the place edit to its owner and opens it', () => {
        renderAt('p1');

        fireEvent.click(screen.getByRole('button', { name: 'Edit this place' }));

        expect(useEditPlaceDialogStore.getState().placeId).toBe('p1');
        act(() => useEditPlaceDialogStore.getState().close());
    });

    it('hides the place edit from non-owners', () => {
        renderAt('p2');

        expect(screen.queryByText('Edit this place')).toBeNull();
    });

    it('opens the channel manager from its entry', () => {
        navProbe.path = '';
        renderAt('p1');

        fireEvent.click(screen.getByRole('button', { name: 'Manage channels' }));

        expect(navProbe.path).toBe('/places/p1/channels');
    });
});
