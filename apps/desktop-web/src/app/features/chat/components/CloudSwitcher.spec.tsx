import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import i18next from 'i18next';

import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import type * as ChaticShared from '@chatic/shared';

import type * as SharedModule from '../../../shared';

const toast = vi.hoisted(() => vi.fn());
vi.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast }));
const deleteOwnedCloud = vi.hoisted(() => vi.fn());
vi.mock('../../../shared', async () => ({
    ...(await vi.importActual<typeof SharedModule>('../../../shared')),
    useRemoveCloud: () => ({ removeInvitedCloud: vi.fn(), deleteOwnedCloud, isDeleting: false }),
    useRenameCloud: () => ({ renameCloud: vi.fn(), isRenaming: false }),
}));

// The stored order rides the shared `ui.railOrder` hook; stub the config store out of the render.
const cloudOrder = vi.hoisted(() => ({ ids: [] as string[] }));
vi.mock('@chatic/shared', async () => ({
    ...(await vi.importActual<typeof ChaticShared>('@chatic/shared')),
    useCloudOrder: () => ({ storedIds: cloudOrder.ids, set: vi.fn() }),
}));

import '../../../../i18n';
import type { RailCloud } from '../../../shared';
import { CloudSwitcher } from './CloudSwitcher';

const wrapper = ({ children }: { children: ReactNode }) => <TooltipProvider>{children}</TooltipProvider>;

const clouds: RailCloud[] = [
    { id: 'default', name: 'Home', status: 'active', kind: 'home' },
    { id: 'open', name: 'Studio', status: 'active', kind: 'owned' },
    { id: 'lapsed', name: 'Archive', status: 'expired', kind: 'owned' },
    { id: 'guest', name: 'Friends', status: 'active', kind: 'invited' },
];

const renderSwitcher = (props: Partial<ComponentProps<typeof CloudSwitcher>> = {}) => {
    const onSelectCloud = vi.fn();
    render(
        <CloudSwitcher
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

// Enter on the trigger, not a click: Radix opens a dropdown from pointerdown, and jsdom has no
// PointerEvent — the MessageList spec documents the same path.
const trigger = () => screen.getByRole('button', { name: /^Switch cloud|^클라우드 전환/ });
const openMenu = async () => {
    fireEvent.keyDown(trigger(), { key: 'Enter' });
    await screen.findByRole('menu');
};
const cloudRow = (name: string | RegExp) => screen.getByRole('menuitem', { name });
const archive = () => i18next.t('cloud.statusLabel', { name: 'Archive', status: i18next.t('cloud.status.expired') });
// Removal sits in a submenu: ArrowRight on its trigger opens it, as a keyboard user would.
const openRemoveMenu = async () => {
    fireEvent.keyDown(screen.getByRole('menuitem', { name: i18next.t('cloud.remove.action') }), { key: 'ArrowRight' });
    return (await screen.findAllByRole('menu')).at(-1) as HTMLElement;
};

beforeEach(() => {
    vi.clearAllMocks();
    cloudOrder.ids = [];
});

describe('CloudSwitcher trigger', () => {
    it('names the active cloud', () => {
        renderSwitcher({ activeCloudId: 'open' });
        expect(trigger().getAttribute('aria-label')).toBe(i18next.t('cloud.switcher.open', { name: 'Studio' }));
    });

    it('says when a cloud has something unread, the active one or another', () => {
        renderSwitcher({ badgedClouds: { guest: true } });
        expect(trigger().getAttribute('aria-label')).toBe(i18next.t('cloud.switcher.unread', { name: 'Home' }));
    });

    it('is locked while a switch is in flight', () => {
        renderSwitcher({ isSwitching: true });
        expect((trigger() as HTMLButtonElement).disabled).toBe(true);
    });
});

describe('CloudSwitcher menu', () => {
    it('names the state of a cloud that cannot be opened, not only its name', async () => {
        renderSwitcher();
        await openMenu();
        expect(cloudRow(archive())).toBeTruthy();
        // An open cloud keeps its bare name.
        expect(cloudRow(/^Studio$/)).toBeTruthy();
    });

    it('draws a lapsed cloud legibly instead of fading it', async () => {
        renderSwitcher();
        await openMenu();
        const row = cloudRow(archive());
        // Selectable rather than disabled: a disabled item is drawn at half opacity.
        expect(row.hasAttribute('data-disabled')).toBe(false);
        expect(row.querySelector('[class*="border-dashed"]')).not.toBeNull();
    });

    // A lapsed cloud used to be switched into, refused, and offered a Try again that could not work.
    it('points a lapsed cloud at the mobile app instead of switching', async () => {
        const { onSelectCloud } = renderSwitcher();
        await openMenu();
        fireEvent.click(cloudRow(archive()));

        expect(onSelectCloud).not.toHaveBeenCalled();
        const [{ title, description, action }] = toast.mock.calls[0];
        expect(title).toBe(i18next.t('cloud.lapsed.title'));
        expect(action).toBeUndefined();
        render(<>{description}</>);
        expect(screen.getByRole('link', { name: 'App Store' }).getAttribute('href')).toMatch(
            /^https:\/\/apps\.apple\.com/
        );
    });

    it('says where to renew on the row of a lapsed cloud', async () => {
        renderSwitcher();
        await openMenu();
        expect(cloudRow(archive()).textContent).toContain(i18next.t('mobileApp.planAndCloud'));
    });

    it('switches to an open cloud', async () => {
        const { onSelectCloud } = renderSwitcher();
        await openMenu();
        fireEvent.click(cloudRow(/^Studio$/));
        expect(onSelectCloud).toHaveBeenCalledWith('open');
        expect(toast).not.toHaveBeenCalled();
    });

    it('marks the active cloud', async () => {
        renderSwitcher({ activeCloudId: 'open' });
        await openMenu();
        expect(cloudRow(/^Studio$/).getAttribute('aria-current')).toBe('true');
    });

    it('lists the clouds in the stored order, with Home first whatever was stored', async () => {
        cloudOrder.ids = ['guest', 'default', 'open'];
        renderSwitcher();
        await openMenu();
        const rows = screen.getAllByRole('menuitem').map(item => item.getAttribute('aria-label'));
        expect(rows.slice(0, 4)).toEqual(['Home', 'Friends', 'Studio', archive()]);
    });

    // The number is part of the cloud's name on screen; it must not follow the stored order around.
    it('keeps the number of an untitled cloud whatever the order', async () => {
        cloudOrder.ids = ['u2', 'u1'];
        renderSwitcher({
            clouds: [
                clouds[0],
                { id: 'u1', status: 'active', kind: 'owned' },
                { id: 'u2', status: 'active', kind: 'owned' },
            ],
        });
        await openMenu();
        const rows = screen.getAllByRole('menuitem').map(item => item.getAttribute('aria-label'));
        expect(rows.slice(0, 3)).toEqual([
            'Home',
            i18next.t('cloud.untitledNumbered', { number: 2 }),
            i18next.t('cloud.untitledNumbered', { number: 1 }),
        ]);
    });
});

describe('CloudSwitcher deleting an owned cloud', () => {
    const openDialog = async () => {
        await openMenu();
        const removeMenu = await openRemoveMenu();
        fireEvent.click(
            Array.from(removeMenu.querySelectorAll('[role="menuitem"]')).find(
                item => item.textContent === 'Studio'
            ) as HTMLElement
        );
        await screen.findByRole('alertdialog');
    };
    // The confirm click starts an async delete; act waits for it to settle.
    const confirmDelete = () =>
        act(async () => {
            fireEvent.click(screen.getByRole('button', { name: i18next.t('cloud.delete.confirm') }));
        });

    it('says why in the dialog when the delete is refused, and keeps it open for a retry', async () => {
        deleteOwnedCloud.mockRejectedValue(new Error('403 FORBIDDEN - not owner of cloud @releaseCloud(x)'));
        renderSwitcher();
        await openDialog();
        await confirmDelete();

        expect((await screen.findByRole('alert')).textContent).toBe(i18next.t('cloud.deleteCause.denied'));
        expect(screen.getByRole('alertdialog')).toBeTruthy();
    });

    it('closes the dialog and says so when the cloud was already gone', async () => {
        deleteOwnedCloud.mockResolvedValue('already-gone');
        renderSwitcher();
        await openDialog();
        await confirmDelete();

        await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
        expect(toast.mock.calls[0][0].description).toBe(i18next.t('cloud.delete.alreadyGone'));
    });

    it('falls back to Home when the active cloud is removed', async () => {
        deleteOwnedCloud.mockResolvedValue(undefined);
        const { onSelectCloud } = renderSwitcher({ activeCloudId: 'open' });
        await openDialog();
        await confirmDelete();

        await waitFor(() => expect(onSelectCloud).toHaveBeenCalledWith('default'));
    });
});

// A cloud that cannot be opened as it is cannot be deleted from here either: the delete was a
// server-wide release of a cloud the user could not even enter, one mispress from losing it.
describe('CloudSwitcher removal list', () => {
    const removable = async () => {
        await openMenu();
        const removeMenu = await openRemoveMenu();
        return Array.from(removeMenu.querySelectorAll('[role="menuitem"]')).map(item => item.textContent);
    };

    it('offers owned clouds that can be opened and invited clouds in any state, never Home', async () => {
        renderSwitcher({
            clouds: [...clouds, { id: 'g2', name: 'Old friends', status: 'expired', kind: 'invited' }],
        });
        expect(await removable()).toEqual(['Studio', 'Friends', 'Old friends']);
    });

    it('offers no removal at all when nothing can be removed', async () => {
        renderSwitcher({ clouds: [clouds[0], clouds[2]] });
        await openMenu();
        expect(screen.queryByRole('menuitem', { name: i18next.t('cloud.remove.action') })).toBeNull();
    });
});

describe('CloudSwitcher rename', () => {
    const renameItem = () => screen.queryByRole('menuitem', { name: i18next.t('cloud.rename.action') });

    it('offers rename on the active owned cloud and opens the dialog seeded with its name', async () => {
        renderSwitcher({ activeCloudId: 'open' });
        await openMenu();
        fireEvent.click(renameItem() as HTMLElement);

        await screen.findByRole('dialog', { name: i18next.t('cloud.rename.title') });
        expect((screen.getByLabelText(i18next.t('cloud.rename.nameLabel')) as HTMLInputElement).value).toBe('Studio');
    });

    // cloud.update rides the active socket, so only the active cloud can be renamed.
    it.each([
        ['an owned cloud that is not active', 'default'],
        ['a lapsed owned cloud', 'lapsed'],
        ['an invited cloud', 'guest'],
    ])('does not offer rename while the active cloud is %s', async (_, activeCloudId) => {
        renderSwitcher({ activeCloudId });
        await openMenu();
        expect(renameItem()).toBeNull();
    });
});

describe('CloudSwitcher when the cloud list cannot be loaded', () => {
    const retryItem = () => screen.queryByRole('menuitem', { name: i18next.t('cloud.loadFailed.retry') });

    it('says so and offers a retry, keeping the clouds it has', async () => {
        const onRetryCatalog = vi.fn();
        renderSwitcher({ isCatalogError: true, onRetryCatalog });
        await openMenu();

        expect(cloudRow(/^Studio$/)).toBeTruthy();
        fireEvent.click(retryItem() as HTMLElement);
        expect(onRetryCatalog).toHaveBeenCalledTimes(1);
    });

    it('shows nothing extra while the list is fine', async () => {
        renderSwitcher({ onRetryCatalog: vi.fn() });
        await openMenu();
        expect(retryItem()).toBeNull();
    });

    it('does not offer a second retry while one is running', async () => {
        renderSwitcher({ isCatalogError: true, isRetryingCatalog: true, onRetryCatalog: vi.fn() });
        await openMenu();
        expect(retryItem()?.getAttribute('aria-disabled')).toBe('true');
    });
});
