import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import i18next from 'i18next';

import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import type * as SharedModule from '../../../shared';

const toast = vi.hoisted(() => vi.fn());
vi.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast }));
vi.mock('../../../shared', async () => ({
    ...(await vi.importActual<typeof SharedModule>('../../../shared')),
    useRemoveCloud: () => ({ removeInvitedCloud: vi.fn(), deleteOwnedCloud: vi.fn(), isDeleting: false }),
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

const renderRail = (activeCloudId = 'default') => {
    const onSelectCloud = vi.fn();
    render(
        <CloudRail clouds={clouds} activeCloudId={activeCloudId} hasUnread={false} onSelectCloud={onSelectCloud} />,
        {
            wrapper,
        }
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
});

describe('CloudRail rename', () => {
    const openMenu = (name: string) => fireEvent.contextMenu(screen.getByRole('button', { name }));
    const renameItem = () => screen.queryByRole('menuitem', { name: i18next.t('cloud.rename.action') });

    it('offers rename on the active owned cloud and opens the dialog seeded with its name', async () => {
        renderRail('open');
        openMenu('Studio');
        fireEvent.click(await screen.findByRole('menuitem', { name: i18next.t('cloud.rename.action') }));

        await screen.findByRole('dialog', { name: i18next.t('cloud.rename.title') });
        expect((screen.getByLabelText(i18next.t('cloud.rename.nameLabel')) as HTMLInputElement).value).toBe('Studio');
    });

    // cloud.update rides the active socket: another tile's id would be written into this cloud.
    it('does not offer rename on an owned cloud that is not active', async () => {
        renderRail('default');
        openMenu('Studio');
        await screen.findByRole('menuitem', { name: i18next.t('cloud.remove.action') });
        expect(renameItem()).toBeNull();
    });

    it('does not offer rename on a lapsed owned cloud, even the active one', async () => {
        renderRail('lapsed');
        openMenu(i18next.t('cloud.statusLabel', { name: 'Archive', status: i18next.t('cloud.status.expired') }));
        await screen.findByRole('menuitem', { name: i18next.t('cloud.remove.action') });
        expect(renameItem()).toBeNull();
    });

    it('does not offer rename on an invited cloud, even the active one', async () => {
        renderRail('guest');
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
