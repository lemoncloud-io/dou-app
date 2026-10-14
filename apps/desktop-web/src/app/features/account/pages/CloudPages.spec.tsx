import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import type { DomainCloud } from '@chatic/data';

const catalog = vi.hoisted(() => ({
    clouds: [] as DomainCloud[],
    isCloudsError: false,
    isFetchingClouds: false,
    isPendingClouds: false,
    refetchClouds: vi.fn(),
}));
vi.mock('../../../shared/hooks/useCloudCatalog', () => ({
    useCloudSessionCatalog: () => catalog,
}));

const renameCloud = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../../../shared/hooks/useRenameCloud', () => ({
    useRenameCloud: () => ({ renameCloud, isRenaming: false }),
}));

const deleteOwnedCloud = vi.hoisted(() => vi.fn(async () => 'deleted' as const));
vi.mock('../../../shared/hooks/useRemoveCloud', () => ({
    useRemoveCloud: () => ({ deleteOwnedCloud, isDeleting: false }),
}));

const resetAccount = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../../../shared/hooks/useAccountResetOnLogout', () => ({
    useAccountResetOnLogout: () => ({ resetAccount }),
}));

const logout = vi.hoisted(() => vi.fn());
vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSessionSelection: () => ({ selectedCloudId: 'c1' }),
            useSessionLogout: () => logout,
        },
    },
}));

const toast = vi.hoisted(() => vi.fn());
vi.mock('@chatic/ui-kit/components/ui/use-toast', async importOriginal => ({
    ...(await importOriginal<object>()),
    toast,
}));

import '../../../../i18n';

import { CloudListPage } from './CloudListPage';
import { CloudHubPage } from './CloudHubPage';

const navProbe = vi.hoisted(() => ({ path: '' }));
const NavProbe = () => {
    navProbe.path = useLocation().pathname;
    return null;
};

const clouds = [{ id: 'c1', name: 'Home cloud' } as DomainCloud, { id: 'c2', name: 'Studio cloud' } as DomainCloud];

const renderAt = (path: string) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <NavProbe />
            <Routes>
                <Route path="/account/clouds" element={<CloudListPage />} />
                <Route path="/account/clouds/:cloudId" element={<CloudHubPage />} />
            </Routes>
        </MemoryRouter>
    );

describe('CloudListPage', () => {
    beforeEach(() => {
        cleanup();
        vi.clearAllMocks();
        catalog.clouds = [...clouds];
        catalog.isCloudsError = false;
        navProbe.path = '';
    });

    it('lists owned clouds into their hubs', () => {
        renderAt('/account/clouds');

        fireEvent.click(screen.getByText('Studio cloud'));

        expect(navProbe.path).toBe('/account/clouds/c2');
    });

    it('says when the account owns no cloud yet', () => {
        catalog.clouds = [];
        renderAt('/account/clouds');

        expect(screen.getByText('No clouds yet.')).toBeTruthy();
    });

    // Empty, loading and error states used to hug the top of the body.
    it('centres its states instead of hugging the top', () => {
        renderAt('/account/clouds');

        expect(screen.getByRole('main').className).toContain('flex-col');
    });

    it('retries a failed catalog read', () => {
        catalog.isCloudsError = true;
        renderAt('/account/clouds');

        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

        expect(catalog.refetchClouds).toHaveBeenCalledTimes(1);
    });
});

describe('CloudHubPage', () => {
    beforeEach(() => {
        cleanup();
        vi.clearAllMocks();
        catalog.clouds = [...clouds];
        catalog.isPendingClouds = false;
        navProbe.path = '';
    });

    it('leaves a cloud the account does not own', () => {
        renderAt('/account/clouds/ghost');

        expect(navProbe.path).toBe('/account/clouds');
    });

    // The loading branch used to drop the header: a bare spinner names nowhere.
    it('keeps its header while the catalog loads', () => {
        catalog.clouds = [];
        catalog.isPendingClouds = true;
        renderAt('/account/clouds/c2');

        expect(screen.getByRole('heading', { name: 'c2' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'My clouds' })).toBeTruthy();
        expect(screen.getByRole('status')).toBeTruthy();
    });

    it('renames through the shared rename hook', async () => {
        renderAt('/account/clouds/c2');

        fireEvent.change(screen.getByLabelText('Cloud name'), { target: { value: 'Studio cloud II' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        await act(async () => {
            await Promise.resolve();
        });
        expect(renameCloud).toHaveBeenCalledWith('c2', 'Studio cloud II');
    });

    it('deletes with a confirm and reports an already-gone cloud as gone', async () => {
        deleteOwnedCloud.mockResolvedValueOnce('already-gone');
        renderAt('/account/clouds/c2');

        fireEvent.click(screen.getByRole('button', { name: 'Delete this cloud' }));
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

        await act(async () => {
            await Promise.resolve();
        });
        expect(deleteOwnedCloud).toHaveBeenCalledWith('c2');
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Already deleted.' }));
    });

    it('logs out when the deleted cloud is the active one', async () => {
        renderAt('/account/clouds/c1');

        fireEvent.click(screen.getByRole('button', { name: 'Delete this cloud' }));
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

        await act(async () => {
            await Promise.resolve();
        });
        expect(resetAccount).toHaveBeenCalledTimes(1);
        expect(logout).toHaveBeenCalledTimes(1);
    });

    it('opens the cloud places from its entry', () => {
        renderAt('/account/clouds/c2');

        fireEvent.click(screen.getByRole('button', { name: /Places in this cloud/ }));

        expect(navProbe.path).toBe('/account/clouds/c2/places');
    });
});
