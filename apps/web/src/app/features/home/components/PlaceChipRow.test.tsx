import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { PlaceChipRow } from './PlaceChipRow';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: { count?: number }) => (options ? `${key}:${options.count}` : key),
    }),
}));
jest.mock('@chatic/app-runtime', () => ({ runtime: { sync: { usePlaceSync: () => undefined } } }));
const mockHaptic = jest.fn();
jest.mock('../../../bridge/haptics', () => ({ haptics: { play: (kind: string) => mockHaptic(kind) } }));

const place = (over: Record<string, unknown>) => ({ id: 'p1', name: 'Sunny Place', stereo: 'site', ...over }) as any;

describe('PlaceChipRow', () => {
    it('draws one chip per place, the current one pressed, with its unread count', () => {
        render(
            <PlaceChipRow
                places={[place({ id: 'p1', name: 'Family' }), place({ id: 'p2', name: 'Work' })]}
                selectedPlaceId="p1"
                unreadByPlace={{ p1: 2, p2: 0 }}
                isLoading={false}
                onSelectPlace={jest.fn()}
            />
        );

        expect(screen.getByRole('button', { name: 'Family, bottomNav.unread:2' })).toHaveAttribute(
            'aria-pressed',
            'true'
        );
        expect(screen.getByRole('button', { name: 'Work' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('leaves out relay subscription rows', () => {
        render(
            <PlaceChipRow
                places={[place({ id: 'p1', name: 'Family' }), place({ id: 'r', name: 'Relay', stereo: 'place' })]}
                selectedPlaceId="p1"
                isLoading={false}
                onSelectPlace={jest.fn()}
            />
        );

        expect(screen.queryByRole('button', { name: 'Relay' })).not.toBeInTheDocument();
    });

    it('switches on a tap, and not while a switch is under way', () => {
        const onSelectPlace = jest.fn();
        const places = [place({ id: 'p1', name: 'Family' }), place({ id: 'p2', name: 'Work' })];
        const { rerender } = render(
            <PlaceChipRow places={places} selectedPlaceId="p1" isLoading={false} onSelectPlace={onSelectPlace} />
        );
        fireEvent.click(screen.getByRole('button', { name: 'Work' }));
        expect(onSelectPlace).toHaveBeenCalledWith('p2');

        rerender(
            <PlaceChipRow
                places={places}
                selectedPlaceId="p2"
                isLoading={false}
                isSwitching
                onSelectPlace={onSelectPlace}
            />
        );
        fireEvent.click(screen.getByRole('button', { name: 'Family' }));
        expect(onSelectPlace).toHaveBeenCalledTimes(1);
    });

    it('offers the add button only to an owner who can add, and not while loading', () => {
        const onCreatePlace = jest.fn();
        const { rerender } = render(
            <PlaceChipRow
                places={[]}
                selectedPlaceId={null}
                isLoading
                onSelectPlace={jest.fn()}
                canAddPlace
                onCreatePlace={onCreatePlace}
            />
        );
        expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'placeList.loading');
        expect(screen.queryByRole('button', { name: 'placeList.addPlace' })).not.toBeInTheDocument();

        rerender(
            <PlaceChipRow
                places={[]}
                selectedPlaceId={null}
                isLoading={false}
                onSelectPlace={jest.fn()}
                canAddPlace
                onCreatePlace={onCreatePlace}
            />
        );
        fireEvent.click(screen.getByRole('button', { name: 'placeList.addPlace' }));
        expect(onCreatePlace).toHaveBeenCalledTimes(1);

        rerender(
            <PlaceChipRow
                places={[]}
                selectedPlaceId={null}
                isLoading={false}
                onSelectPlace={jest.fn()}
                onCreatePlace={onCreatePlace}
            />
        );
        expect(screen.queryByRole('button', { name: 'placeList.addPlace' })).not.toBeInTheDocument();
    });

    it('ticks when the fill moves to another place, not on a tap of the current one', () => {
        mockHaptic.mockClear();
        const places = [place({ id: 'p1', name: 'Family' }), place({ id: 'p2', name: 'Work' })];
        render(<PlaceChipRow places={places} selectedPlaceId="p1" isLoading={false} onSelectPlace={jest.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Family' }));
        expect(mockHaptic).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Work' }));
        expect(mockHaptic).toHaveBeenCalledWith('selection');
    });
});
