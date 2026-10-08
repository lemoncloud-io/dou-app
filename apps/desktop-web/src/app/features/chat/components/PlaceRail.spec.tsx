import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import i18next from 'i18next';

import type { DomainPlace } from '@chatic/data';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import type * as SharedModule from '../../../shared';
import type * as ConfirmDialogModule from '../../channels/components/ConfirmDialog';

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
vi.mock('../../channels', async () => ({
    ConfirmDialog: (await vi.importActual<typeof ConfirmDialogModule>('../../channels/components/ConfirmDialog'))
        .ConfirmDialog,
}));
vi.mock('@chatic/bridges', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import '../../../../i18n';
import { PLACE_MAX } from '../utils';
import { PlaceRail } from './PlaceRail';

const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
        <TooltipProvider>{children}</TooltipProvider>
    </MemoryRouter>
);

const places = [{ id: 'place-1', name: 'Design', cid: 'mine' }] as DomainPlace[];

const renderRail = (props: Partial<ComponentProps<typeof PlaceRail>> = {}) => {
    const onCreatePlace = vi.fn();
    const onEditPlace = vi.fn();
    const onDeletePlace = vi.fn().mockResolvedValue(undefined);
    render(
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
        />,
        { wrapper }
    );
    return { onCreatePlace, onEditPlace, onDeletePlace };
};

const createTile = () => screen.queryByRole('button', { name: i18next.t('place.create.open') });

beforeEach(() => vi.clearAllMocks());

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
