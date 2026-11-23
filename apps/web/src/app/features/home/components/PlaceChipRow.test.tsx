import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { chipRevealDelta, PlaceChipRow } from './PlaceChipRow';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: { count?: number }) => (options ? `${key}:${options.count}` : key),
    }),
}));
jest.mock('@chatic/runtime', () =>
    require('@chatic/runtime/testing').fakeRuntimeModule({ sync: { usePlaceSync: () => undefined } })
);
const mockHaptic = jest.fn();
jest.mock('../../../bridge/haptics', () => ({ haptics: { play: (kind: string) => mockHaptic(kind) } }));

const endTransition = (target: Element, propertyName: string) => {
    const event = new Event('transitionend', { bubbles: true });
    Object.assign(event, { propertyName });
    fireEvent(target, event);
};

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

    it('scrolls the row so the current chip unfolds in view, jumping first and gliding after', () => {
        const places = [place({ id: 'p1', name: 'Family' }), place({ id: 'p2', name: 'Work' })];
        const { rerender } = render(
            <PlaceChipRow places={places} selectedPlaceId="p2" isLoading={false} onSelectPlace={jest.fn()} />
        );
        const row = screen.getByRole('group');
        const scrollBy = jest.fn();
        row.scrollBy = scrollBy as unknown as typeof row.scrollBy;
        row.getBoundingClientRect = () => ({ left: 0, right: 375 }) as DOMRect;
        const work = screen.getByRole('button', { name: 'Work' });
        work.getBoundingClientRect = () => ({ left: 340, right: 420 }) as DOMRect;

        endTransition(screen.getAllByTestId('place-chip-name')[1], 'grid-template-columns');
        expect(scrollBy).toHaveBeenLastCalledWith({ left: 61, behavior: 'smooth' });

        scrollBy.mockClear();
        endTransition(screen.getAllByTestId('place-chip-name')[0], 'grid-template-columns');
        endTransition(screen.getAllByTestId('place-chip-name')[1], 'opacity');
        expect(scrollBy).not.toHaveBeenCalled();

        screen.getByRole('button', { name: 'Family' }).getBoundingClientRect = () =>
            ({ left: 16, right: 80 }) as DOMRect;
        rerender(<PlaceChipRow places={places} selectedPlaceId="p1" isLoading={false} onSelectPlace={jest.fn()} />);
        expect(scrollBy).not.toHaveBeenCalled();
    });
});

describe('chipRevealDelta', () => {
    const row = { left: 0, right: 375 };

    it('leaves a chip already inside the padded row alone', () => {
        expect(chipRevealDelta(row, { left: 16, right: 359 }, 16)).toBe(0);
    });

    it('scrolls forward past the right edge and back past the left one', () => {
        expect(chipRevealDelta(row, { left: 300, right: 400 }, 16)).toBe(41);
        expect(chipRevealDelta(row, { left: -50, right: 30 }, 16)).toBe(-66);
    });

    it('aligns the start of a chip wider than the row', () => {
        expect(chipRevealDelta(row, { left: 100, right: 600 }, 16)).toBe(84);
    });
});
