import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import i18next from 'i18next';

import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import type * as SharedModule from '../../../shared';

const toast = vi.hoisted(() => vi.fn());
vi.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast }));
const deleteOwnedCloud = vi.hoisted(() => vi.fn());
vi.mock('../../../shared', async () => ({
    ...(await vi.importActual<typeof SharedModule>('../../../shared')),
    useRemoveCloud: () => ({ removeInvitedCloud: vi.fn(), deleteOwnedCloud, isDeleting: false }),
    useRenameCloud: () => ({ renameCloud: vi.fn(), isRenaming: false }),
}));

import '../../../../i18n';
import type { RailCloud } from '../../../shared';
import { CloudRail } from './CloudRail';

const wrapper = ({ children }: { children: ReactNode }) => <TooltipProvider>{children}</TooltipProvider>;

const clouds: RailCloud[] = [
    { id: 'default', name: 'Home', status: 'active', kind: 'home' },
    { id: 'open', name: 'Studio', status: 'active', kind: 'owned' },
    { id: 'lapsed', name: 'Archive', status: 'expired', kind: 'owned' },
    { id: 'guest', name: 'Friends', status: 'active', kind: 'invited' },
];

const renderRail = (props: Partial<ComponentProps<typeof CloudRail>> = {}) => {
    const onSelectCloud = vi.fn();
    render(
        <CloudRail
            clouds={clouds}
            activeCloudId="default"
            hasUnread={false}
            onSelectCloud={onSelectCloud}
            {...props}
        />,
        { wrapper }
    );
    return { onSelectCloud };
};

beforeEach(() => vi.clearAllMocks());

describe('CloudRail', () => {
    it('names the state of a cloud that cannot be opened, not only its name', () => {
        renderRail();
        const expired = i18next.t('cloud.statusLabel', { name: 'Archive', status: i18next.t('cloud.status.expired') });
        expect(screen.getByRole('button', { name: expired })).toBeTruthy();
        // An open cloud keeps its bare name.
        expect(screen.getByRole('button', { name: 'Studio' })).toBeTruthy();
    });

    it('draws a lapsed tile legibly instead of fading it', () => {
        renderRail();
        const tile = screen.getByRole('button', { name: /Archive/ });
        expect(tile.className).not.toMatch(/opacity-50/);
        expect(tile.className).toMatch(/border-dashed/);
    });

    // A lapsed cloud used to be switched into, refused, and offered a Try again that could not work.
    it('points a click on a lapsed cloud at the mobile app instead of switching', () => {
        const { onSelectCloud } = renderRail();
        fireEvent.click(screen.getByRole('button', { name: /Archive/ }));

        expect(onSelectCloud).not.toHaveBeenCalled();
        const [{ title, description, action }] = toast.mock.calls[0];
        expect(title).toBe(i18next.t('cloud.lapsed.title'));
        expect(action).toBeUndefined();
        render(<>{description}</>);
        expect(screen.getByText(i18next.t('mobileApp.planAndCloud'), { exact: false })).toBeTruthy();
        expect(screen.getByRole('link', { name: 'App Store' }).getAttribute('href')).toMatch(
            /^https:\/\/apps\.apple\.com/
        );
    });

    it('switches to an open cloud', () => {
        const { onSelectCloud } = renderRail();
        fireEvent.click(screen.getByRole('button', { name: 'Studio' }));
        expect(onSelectCloud).toHaveBeenCalledWith('open');
        expect(toast).not.toHaveBeenCalled();
    });

    it('says where to renew in the hint of a lapsed tile', () => {
        renderRail();
        const tile = screen.getByRole('button', { name: /Archive/ });
        // Focus handed back by a closing dialog comes from nowhere and opens no hint; Tab comes from
        // the element before.
        fireEvent.focus(tile, { relatedTarget: document.createElement('button') });
        expect(screen.getByRole('tooltip').textContent).toContain(i18next.t('mobileApp.planAndCloud'));
    });

    describe('deleting an owned cloud', () => {
        const openDialog = async () => {
            fireEvent.contextMenu(screen.getByRole('button', { name: 'Studio' }));
            fireEvent.click(await screen.findByRole('menuitem'));
            await screen.findByRole('alertdialog');
        };
        // The confirm click starts an async delete; act waits for it to settle.
        const confirmDelete = () =>
            act(async () => {
                fireEvent.click(screen.getByRole('button', { name: i18next.t('cloud.delete.confirm') }));
            });
        const openDelete = async () => {
            await openDialog();
            await confirmDelete();
        };

        // The catch used to return silently: the dialog stayed as it was and nothing said why.
        it('says why in the dialog when the delete is refused, and keeps it open for a retry', async () => {
            deleteOwnedCloud.mockRejectedValue(new Error('403 FORBIDDEN - not owner of cloud @releaseCloud(x)'));
            renderRail();
            await openDelete();

            expect((await screen.findByRole('alert')).textContent).toBe(i18next.t('cloud.deleteCause.denied'));
            expect(screen.getByRole('alertdialog')).toBeTruthy();
        });

        it('clears the reason when the dialog is cancelled and opened again', async () => {
            deleteOwnedCloud.mockRejectedValue(new Error('Network Error'));
            renderRail();
            await openDelete();
            await screen.findByRole('alert');

            fireEvent.click(screen.getByRole('button', { name: i18next.t('cloud.delete.cancel') }));
            await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
            // Before confirming again: a confirm clears the reason itself, so only the close can be seen here.
            await openDialog();
            expect(screen.queryByRole('alert')).toBeNull();
        });

        // A cloud that was already released cannot be deleted again: the list was out of date, not the user wrong.
        it('closes the dialog and says so when the cloud was already gone', async () => {
            deleteOwnedCloud.mockResolvedValue('already-gone');
            renderRail();
            await openDelete();

            await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
            expect(toast.mock.calls[0][0].description).toBe(i18next.t('cloud.delete.alreadyGone'));
        });
    });

    describe('when the cloud list cannot be loaded', () => {
        // An owned cloud used to vanish from the rail with no sign that the list had not loaded.
        it('says so and offers a retry, keeping the tiles it has', () => {
            const onRetryCatalog = vi.fn();
            renderRail({ isCatalogError: true, onRetryCatalog });

            expect(screen.getByRole('button', { name: 'Studio' })).toBeTruthy();
            fireEvent.click(screen.getByRole('button', { name: i18next.t('cloud.loadFailed.retry') }));
            expect(onRetryCatalog).toHaveBeenCalledTimes(1);
        });

        it('shows nothing extra while the list is fine', () => {
            renderRail({ onRetryCatalog: vi.fn() });
            expect(screen.queryByRole('button', { name: i18next.t('cloud.loadFailed.retry') })).toBeNull();
        });

        it('does not offer a second retry while one is running', () => {
            renderRail({ isCatalogError: true, isRetryingCatalog: true, onRetryCatalog: vi.fn() });
            const retry = screen.getByRole('button', { name: i18next.t('cloud.loadFailed.retry') });
            expect((retry as HTMLButtonElement).disabled).toBe(true);
        });
    });
});

// A cloud that cannot be opened as it is cannot be deleted from here either: the only entry in its menu
// was a server-wide delete of a cloud the user could not even enter, one mispress from losing it.
describe('CloudRail menu on a cloud that cannot be opened', () => {
    const removeItem = () => screen.queryByRole('menuitem', { name: i18next.t('cloud.remove.action') });

    it.each(['error', 'reserved', 'init', 'suspended', 'expired'])(
        'offers no menu on an owned cloud that is %s',
        status => {
            renderRail({ clouds: [{ id: 'x', name: 'Archive', status, kind: 'owned' }], activeCloudId: 'default' });
            fireEvent.contextMenu(screen.getByRole('button', { name: /Archive/ }));

            expect(screen.queryByRole('menu')).toBeNull();
            expect(removeItem()).toBeNull();
        }
    );

    it.each([['active'], [undefined]])('still offers delete on an owned cloud with status %s', async status => {
        renderRail({ clouds: [{ id: 'x', name: 'Studio', status, kind: 'owned' }], activeCloudId: 'default' });
        fireEvent.contextMenu(screen.getByRole('button', { name: 'Studio' }));

        expect(await screen.findByRole('menuitem', { name: i18next.t('cloud.remove.action') })).toBeTruthy();
    });

    // Forgetting an invited cloud is local to this device, so it stays available whatever state the cloud is in.
    it('still offers the local removal of an invited cloud that is expired', async () => {
        renderRail({ clouds: [{ id: 'g', name: 'Friends', status: 'expired', kind: 'invited' }] });
        fireEvent.contextMenu(screen.getByRole('button', { name: /Friends/ }));

        expect(await screen.findByRole('menuitem', { name: i18next.t('cloud.remove.action') })).toBeTruthy();
    });
});

describe('CloudRail rename', () => {
    const openMenu = (name: string) => fireEvent.contextMenu(screen.getByRole('button', { name }));
    const renameItem = () => screen.queryByRole('menuitem', { name: i18next.t('cloud.rename.action') });

    it('offers rename on the active owned cloud and opens the dialog seeded with its name', async () => {
        renderRail({ activeCloudId: 'open' });
        openMenu('Studio');
        fireEvent.click(await screen.findByRole('menuitem', { name: i18next.t('cloud.rename.action') }));

        await screen.findByRole('dialog', { name: i18next.t('cloud.rename.title') });
        expect((screen.getByLabelText(i18next.t('cloud.rename.nameLabel')) as HTMLInputElement).value).toBe('Studio');
    });

    // cloud.update rides the active socket: another tile's id would be written into this cloud.
    it('does not offer rename on an owned cloud that is not active', async () => {
        renderRail({ activeCloudId: 'default' });
        openMenu('Studio');
        await screen.findByRole('menuitem', { name: i18next.t('cloud.remove.action') });
        expect(renameItem()).toBeNull();
    });

    it('does not offer rename on a lapsed owned cloud, even the active one', () => {
        renderRail({ activeCloudId: 'lapsed' });
        openMenu(i18next.t('cloud.statusLabel', { name: 'Archive', status: i18next.t('cloud.status.expired') }));
        // Nothing is left in a lapsed cloud's menu, so it does not open (see the removal tests below).
        expect(screen.queryByRole('menu')).toBeNull();
        expect(renameItem()).toBeNull();
    });

    it('does not offer rename on an invited cloud, even the active one', async () => {
        renderRail({ activeCloudId: 'guest' });
        openMenu('Friends');
        await screen.findByRole('menuitem', { name: i18next.t('cloud.remove.action') });
        expect(renameItem()).toBeNull();
    });

    it('does not offer rename on Home', () => {
        renderRail();
        openMenu('Home');
        // Home has no menu at all: it can be neither renamed nor removed.
        expect(screen.queryByRole('menuitem')).toBeNull();
    });
});
