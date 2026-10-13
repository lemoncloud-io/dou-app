import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import i18next from 'i18next';

import type { DomainPlace } from '@chatic/data';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import type * as DndCore from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import type * as ChaticShared from '@chatic/shared';

import type * as SharedModule from '../../../shared';
import type * as ConfirmDialogModule from '../../channels/components/ConfirmDialog';
import type * as SendInviteStoreModule from '../../channels/stores/useSendInviteStore';

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSessionIdentity: () => ({ userId: 'me' }),
            useRuntimeProfile: () => ({ photo: undefined, isGuest: false }),
            useSessionLogout: () => vi.fn(),
        },
    },
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast }));
vi.mock('../../../shared', async () => ({
    ...(await vi.importActual<typeof SharedModule>('../../../shared')),
    useAccountName: () => 'Me',
    useAccountResetOnLogout: () => ({ resetAccount: vi.fn() }),
    useDisplayProfile: () => ({ name: 'Me', thumbnail: undefined }),
}));
vi.mock('../../auth', () => ({ useJoinDialogStore: () => vi.fn() }));
// The real confirmation, taken from its own file: the barrel beside it pulls in the channel screens.
// The real invite store likewise: the menu opens the sender through it.
vi.mock('../../channels', async () => ({
    ConfirmDialog: (await vi.importActual<typeof ConfirmDialogModule>('../../channels/components/ConfirmDialog'))
        .ConfirmDialog,
    useSendInviteStore: (
        await vi.importActual<typeof SendInviteStoreModule>('../../channels/stores/useSendInviteStore')
    ).useSendInviteStore,
}));
// The stored order rides the shared `ui.railOrder` hook; stub the config store out of the render.
const placeOrder = vi.hoisted(() => ({ byCloud: {} as Record<string, string[]>, set: vi.fn(), cloudId: '' }));
vi.mock('@chatic/shared', async () => ({
    ...(await vi.importActual<typeof ChaticShared>('@chatic/shared')),
    usePlaceOrder: (cloudId: string | null) => {
        placeOrder.cloudId = cloudId ?? '';
        return { storedIds: placeOrder.byCloud[cloudId ?? ''] ?? [], set: placeOrder.set };
    },
}));
// jsdom lays nothing out, so a pointer drag cannot be played. The list's own drag-end handler is
// what decides the new order, and it is taken from the context it was given to.
const dnd = vi.hoisted(() => ({ end: undefined as ((event: DragEndEvent) => void) | undefined }));
vi.mock('@dnd-kit/core', async () => {
    const actual = await vi.importActual<typeof DndCore>('@dnd-kit/core');
    return {
        ...actual,
        DndContext: (props: ComponentProps<typeof DndCore.DndContext>) => {
            dnd.end = props.onDragEnd;
            return <actual.DndContext {...props} />;
        },
    };
});
vi.mock('@chatic/bridges', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import '../../../../i18n';
import { PLACE_MAX } from '../utils';
import { useSendInviteStore } from '../../channels/stores/useSendInviteStore';
import { PlaceRail } from './PlaceRail';

const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
        <TooltipProvider>{children}</TooltipProvider>
    </MemoryRouter>
);

// Where the rail navigated last (MemoryRouter keeps history in memory, so
// window.location never moves — the probe reads it instead).
const navProbe = vi.hoisted(() => ({ path: '/' }));
const NavProbe = () => {
    navProbe.path = useLocation().pathname;
    return null;
};

const places = [{ id: 'place-1', name: 'Design', cid: 'mine' }] as DomainPlace[];

const renderRail = (props: Partial<ComponentProps<typeof PlaceRail>> = {}) => {
    const onCreatePlace = vi.fn();
    const onEditPlace = vi.fn();
    const onDeletePlace = vi.fn().mockResolvedValue(undefined);
    render(
        <>
            <PlaceRail
                places={places}
                selectedPlaceId="place-1"
                unreadByPlace={{}}
                isDefaultMode={false}
                onSelectPlace={vi.fn()}
                canManagePlaces
                onCreatePlace={onCreatePlace}
                onEditPlace={onEditPlace}
                onDeletePlace={onDeletePlace}
                {...props}
            />
            <NavProbe />
        </>,
        { wrapper }
    );
    return { onCreatePlace, onEditPlace, onDeletePlace };
};

const createTile = () => screen.queryByRole('button', { name: i18next.t('place.create.open') });

beforeEach(() => {
    vi.clearAllMocks();
    placeOrder.byCloud = {};
    dnd.end = undefined;
});

describe('PlaceRail new place tile', () => {
    it('opens place creation from the tile after the places', () => {
        const { onCreatePlace } = renderRail();
        const tiles = screen.getAllByRole('button');
        const tile = createTile();

        expect(tile).toBeTruthy();
        expect(tiles.indexOf(tile as HTMLElement)).toBe(
            tiles.indexOf(screen.getByRole('button', { name: 'Design' })) + 1
        );
        fireEvent.click(tile as HTMLElement);
        expect(onCreatePlace).toHaveBeenCalledTimes(1);
    });

    it('is not drawn where the account cannot make a place', () => {
        renderRail({ canManagePlaces: false });
        expect(createTile()).toBeNull();
    });

    it('is not drawn on Home, which has no places to add to', () => {
        renderRail({ isDefaultMode: true });
        expect(createTile()).toBeNull();
    });

    it('is locked with the place tiles while a switch is in flight', () => {
        const { onCreatePlace } = renderRail({ isSwitching: true });
        const tile = createTile() as HTMLButtonElement;

        expect(tile.disabled).toBe(true);
        fireEvent.click(tile);
        expect(onCreatePlace).not.toHaveBeenCalled();
    });

    it('keeps the tile at the place cap and says why instead of opening the form', () => {
        const full = Array.from({ length: PLACE_MAX }, (_, i) => ({ id: `place-${i}`, name: `P${i}`, cid: 'mine' }));
        const { onCreatePlace } = renderRail({ places: full as DomainPlace[] });

        fireEvent.click(createTile() as HTMLElement);

        expect(onCreatePlace).not.toHaveBeenCalled();
        expect(toast.mock.calls[0][0].title).toBe(i18next.t('place.create.limit', { max: PLACE_MAX }));
    });
});

describe('PlaceRail place menu', () => {
    const openMenu = (name: string) => fireEvent.contextMenu(screen.getByRole('button', { name }));
    const editItem = () => screen.queryByRole('menuitem', { name: i18next.t('place.edit.action') });
    const deleteItem = () => screen.queryByRole('menuitem', { name: i18next.t('place.delete.action') });

    it('opens the edit form for the place whose tile was right-clicked', () => {
        const { onEditPlace } = renderRail();
        openMenu('Design');
        fireEvent.click(editItem() as HTMLElement);
        expect(onEditPlace).toHaveBeenCalledWith('place-1');
    });

    it('locks the menu with the tiles while a switch is in flight', () => {
        const { onEditPlace } = renderRail({ isSwitching: true });
        openMenu('Design');
        fireEvent.click(editItem() as HTMLElement);
        expect(onEditPlace).not.toHaveBeenCalled();
    });

    it('has no menu for an account that does not manage places', () => {
        renderRail({ canManagePlaces: false });
        openMenu('Design');
        expect(editItem()).toBeNull();
        expect(deleteItem()).toBeNull();
    });

    it("has no menu on the relay subscription row, which is nobody's place to edit", () => {
        renderRail({ places: [{ id: 'relay', name: 'Relay', cid: 'mine', stereo: 'place' }] as DomainPlace[] });
        openMenu('Relay');
        expect(editItem()).toBeNull();
        expect(deleteItem()).toBeNull();
    });

    it('has no menu on the Home tile', () => {
        renderRail({ isDefaultMode: true });
        openMenu(i18next.t('place.home'));
        expect(editItem()).toBeNull();
        expect(deleteItem()).toBeNull();
    });

    // Sending rides the relay slot: the entry shows on every managed place.
    it('opens the place invite sender for the right-clicked place', () => {
        renderRail();
        openMenu('Design');
        fireEvent.click(screen.getByRole('menuitem', { name: i18next.t('invite.send.open') }));

        expect(useSendInviteStore.getState().target).toEqual({ kind: 'place', id: 'place-1', name: 'Design' });
        act(() => useSendInviteStore.getState().close());
    });

    it('opens the place settings page for the right-clicked place', () => {
        navProbe.path = '/';
        renderRail();
        openMenu('Design');
        fireEvent.click(screen.getByRole('menuitem', { name: i18next.t('place.settings.open') }));

        expect(navProbe.path).toBe('/places/place-1/settings');
    });
});

describe('PlaceRail place delete', () => {
    const askToDelete = () => {
        fireEvent.contextMenu(screen.getByRole('button', { name: 'Design' }));
        fireEvent.click(screen.getByRole('menuitem', { name: i18next.t('place.delete.action') }));
    };
    const confirmation = () => screen.queryByRole('alertdialog');
    const confirmButton = () =>
        screen.getByRole('button', { name: i18next.t('place.delete.confirm') }) as HTMLButtonElement;
    /** A promise the test settles by hand, to hold the rail mid-delete. */
    const deferred = () => {
        let resolve!: () => void;
        let reject!: (reason: unknown) => void;
        const promise = new Promise<void>((res, rej) => {
            resolve = res;
            reject = rej;
        });
        return { promise, resolve, reject };
    };

    it('asks first, naming the place, and deletes nothing until confirmed', () => {
        const { onDeletePlace } = renderRail();
        askToDelete();

        expect(confirmation()?.textContent).toContain(i18next.t('place.delete.title', { name: 'Design' }));
        expect(onDeletePlace).not.toHaveBeenCalled();
    });

    it('deletes the place once confirmed, then says so', async () => {
        const { onDeletePlace } = renderRail();
        askToDelete();
        fireEvent.click(confirmButton());

        await waitFor(() => expect(confirmation()).toBeNull());
        expect(onDeletePlace).toHaveBeenCalledWith('place-1');
        expect(toast).toHaveBeenCalledWith({ title: i18next.t('toast.placeDeleted') });
    });

    it('deletes nothing when the confirmation is dismissed', () => {
        const { onDeletePlace } = renderRail();
        askToDelete();
        fireEvent.click(screen.getByRole('button', { name: i18next.t('common.cancel') }));

        expect(confirmation()).toBeNull();
        expect(onDeletePlace).not.toHaveBeenCalled();
    });

    it('sends one delete when the confirmation is clicked twice, and locks it meanwhile', async () => {
        const deleting = deferred();
        const onDeletePlace = vi.fn(() => deleting.promise);
        renderRail({ onDeletePlace });
        askToDelete();
        const button = confirmButton();
        fireEvent.click(button);
        fireEvent.click(button);

        // Still up and locked: the confirm button's own close is refused while the delete runs.
        expect(confirmation()).not.toBeNull();
        expect(confirmButton().disabled).toBe(true);
        expect(onDeletePlace).toHaveBeenCalledTimes(1);
        await act(async () => deleting.resolve());
        await waitFor(() => expect(confirmation()).toBeNull());
    });

    it('says a refusal is a refusal, and does not claim the place was deleted', async () => {
        const onDeletePlace = vi.fn().mockRejectedValue(new Error('403 NOT ALLOWED - action[delete] is invalid'));
        renderRail({ onDeletePlace });
        askToDelete();
        fireEvent.click(confirmButton());

        await waitFor(() => expect(confirmation()).toBeNull());
        expect(toast).toHaveBeenCalledTimes(1);
        expect(toast).toHaveBeenCalledWith({
            variant: 'destructive',
            title: i18next.t('place.delete.failed.denied'),
        });
    });

    it('withdraws the question when its place leaves the rail, as a cloud change makes it', () => {
        const props = {
            selectedPlaceId: 'place-1',
            unreadByPlace: {},
            isDefaultMode: false,
            onSelectPlace: vi.fn(),
            canManagePlaces: true,
            onDeletePlace: vi.fn().mockResolvedValue(undefined),
        };
        const { rerender } = render(<PlaceRail places={places} {...props} />, { wrapper });
        askToDelete();
        expect(confirmation()).not.toBeNull();

        rerender(<PlaceRail places={[{ id: 'other', name: 'Other', cid: 'theirs' }] as DomainPlace[]} {...props} />);

        expect(confirmation()).toBeNull();
        expect(props.onDeletePlace).not.toHaveBeenCalled();
    });

    it('locks the delete item with the tiles while a switch is in flight', () => {
        renderRail({ isSwitching: true });
        askToDelete();
        expect(confirmation()).toBeNull();
    });
});

describe('PlaceRail order', () => {
    const three = [
        { id: 'p1', name: 'Design', cid: 'mine' },
        { id: 'p2', name: 'Sales', cid: 'mine' },
        { id: 'p3', name: 'Ops', cid: 'mine' },
    ] as DomainPlace[];
    const placeNames = () =>
        screen
            .getAllByRole('button')
            .map(button => button.getAttribute('aria-label'))
            .filter(name => ['Design', 'Sales', 'Ops', i18next.t('place.create.open')].includes(name ?? ''));
    const drop = (active: string, over: string | null) =>
        act(() => dnd.end?.({ active: { id: active }, over: over ? { id: over } : null } as DragEndEvent));

    it('draws the places in the order stored for their cloud, with the new place tile last', () => {
        placeOrder.byCloud = { mine: ['p3', 'p1'], other: ['p2', 'p1', 'p3'] };
        renderRail({ places: three, selectedPlaceId: 'p1' });
        expect(placeOrder.cloudId).toBe('mine');
        expect(placeNames()).toEqual(['Ops', 'Design', 'Sales', i18next.t('place.create.open')]);
    });

    it('stores the new order when a tile is dropped on another', () => {
        renderRail({ places: three, selectedPlaceId: 'p1' });
        drop('p3', 'p1');
        expect(placeOrder.set).toHaveBeenCalledWith(['p3', 'p1', 'p2']);
    });

    it('never offers the new place tile as a place to drop on', () => {
        renderRail({ places: three, selectedPlaceId: 'p1' });
        drop('p3', 'create-place');
        expect(placeOrder.set).not.toHaveBeenCalled();
    });

    it('has nothing to drag on Home, which has one fixed tile', () => {
        renderRail({ isDefaultMode: true, places: [] });
        expect(dnd.end).toBeUndefined();
    });

    it('swallows the click that ends a drag, and only that one', () => {
        vi.useFakeTimers();
        try {
            const onSelectPlace = vi.fn();
            renderRail({ places: three, selectedPlaceId: 'p1', onSelectPlace });
            drop('p3', 'p1');
            fireEvent.click(screen.getByRole('button', { name: 'Sales' }));
            expect(onSelectPlace).not.toHaveBeenCalled();

            act(() => vi.runAllTimers());
            fireEvent.click(screen.getByRole('button', { name: 'Sales' }));
            expect(onSelectPlace).toHaveBeenCalledWith('p2');
        } finally {
            vi.useRealTimers();
        }
    });

    it('drops the grab cursor from the tiles while a switch is in flight', () => {
        renderRail({ places: three, selectedPlaceId: 'p1', isSwitching: true });
        const row = screen.getByRole('button', { name: 'Sales' }).closest('div[class*="cursor-"]');
        expect(row?.className).toMatch(/cursor-default/);
    });
});
