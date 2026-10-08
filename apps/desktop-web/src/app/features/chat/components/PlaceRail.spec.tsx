import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import i18next from 'i18next';

import type { DomainPlace } from '@chatic/data';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import type * as SharedModule from '../../../shared';

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
vi.mock('../../channels', () => ({ ConfirmDialog: () => null }));

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
            {...props}
        />,
        { wrapper }
    );
    return { onCreatePlace, onEditPlace };
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
    });

    it("has no menu on the relay subscription row, which is nobody's place to edit", () => {
        renderRail({ places: [{ id: 'relay', name: 'Relay', cid: 'mine', stereo: 'place' }] as DomainPlace[] });
        openMenu('Relay');
        expect(editItem()).toBeNull();
    });

    it('has no menu on the Home tile', () => {
        renderRail({ isDefaultMode: true });
        openMenu(i18next.t('place.home'));
        expect(editItem()).toBeNull();
    });
});
