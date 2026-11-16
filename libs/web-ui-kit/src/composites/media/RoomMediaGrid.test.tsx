import { act, fireEvent, render, screen } from '@testing-library/react';

import { ROOM_MEDIA_LONG_PRESS_MS, RoomMediaGrid, type RoomMediaGridItem } from './RoomMediaGrid';

const items: RoomMediaGridItem[] = [
    { key: 'a', src: 'https://example.com/a.jpg', kind: 'image' },
    { key: 'b', src: 'https://example.com/b.jpg', kind: 'video', durationSeconds: 75 },
    { key: 'c', kind: 'image' },
];

// jsdom has no PointerEvent, so `fireEvent.pointerDown` drops the coordinates; a MouseEvent of the
// pointer type keeps them and React still routes it to the pointer handlers.
const pointer = (type: string, target: Element, clientX: number, clientY: number) =>
    fireEvent(target, new MouseEvent(type, { bubbles: true, clientX, clientY }));

describe('RoomMediaGrid', () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    it('renders a named tile per item with lazy thumbnails', () => {
        const { container } = render(<RoomMediaGrid items={items} onOpen={jest.fn()} />);

        expect(screen.getAllByRole('listitem')).toHaveLength(3);
        expect(screen.getByRole('button', { name: 'Photo 1' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Video 2' })).toBeInTheDocument();
        const images = container.querySelectorAll('img');
        // The third item has no thumbnail and stays a bare tile.
        expect(images).toHaveLength(2);
        images.forEach(img => expect(img).toHaveAttribute('loading', 'lazy'));
    });

    it('marks a video with its length', () => {
        const { container } = render(<RoomMediaGrid items={items} onOpen={jest.fn()} />);

        expect(container.querySelectorAll('[data-video-mark]')).toHaveLength(1);
        expect(screen.getByText('1:15')).toBeInTheDocument();
    });

    it('opens a tile outside selection mode', () => {
        const onOpen = jest.fn();
        render(<RoomMediaGrid items={items} onOpen={onOpen} />);

        fireEvent.click(screen.getByRole('button', { name: 'Video 2' }));
        expect(onOpen).toHaveBeenCalledWith('b');
        expect(screen.getByRole('button', { name: 'Video 2' })).not.toHaveAttribute('aria-pressed');
    });

    it('toggles instead of opening in selection mode, and reports what is picked', () => {
        const onOpen = jest.fn();
        const onToggle = jest.fn();
        render(<RoomMediaGrid items={items} onOpen={onOpen} selection={{ selectedKeys: new Set(['a']), onToggle }} />);

        expect(screen.getByRole('button', { name: 'Photo 1' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'Video 2' })).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(screen.getByRole('button', { name: 'Photo 3' }));
        expect(onToggle).toHaveBeenCalledWith('c');
        expect(onOpen).not.toHaveBeenCalled();
    });

    it('uses the host tile labels', () => {
        render(<RoomMediaGrid items={items} onOpen={jest.fn()} tileLabel={(index, kind) => `${kind} #${index}`} />);

        expect(screen.getByRole('button', { name: 'video #1' })).toBeInTheDocument();
    });

    it('fires onLongPress for the held tile and swallows the click that ends it', () => {
        jest.useFakeTimers();
        const onOpen = jest.fn();
        const onLongPress = jest.fn();
        const onToggle = jest.fn();
        const { rerender } = render(<RoomMediaGrid items={items} onOpen={onOpen} onLongPress={onLongPress} />);
        const tile = screen.getByRole('button', { name: 'Video 2' });

        pointer('pointerdown', tile, 5, 5);
        act(() => jest.advanceTimersByTime(ROOM_MEDIA_LONG_PRESS_MS));
        expect(onLongPress).toHaveBeenCalledWith('b');

        // The host enters selection mode with the tile picked; the release must not unpick it.
        rerender(
            <RoomMediaGrid
                items={items}
                onOpen={onOpen}
                onLongPress={onLongPress}
                selection={{ selectedKeys: new Set(['b']), onToggle }}
            />
        );
        fireEvent.pointerUp(tile);
        fireEvent.click(tile);
        expect(onToggle).not.toHaveBeenCalled();
        expect(onOpen).not.toHaveBeenCalled();
    });

    it('drops the long press when the finger scrolls away', () => {
        jest.useFakeTimers();
        const onLongPress = jest.fn();
        render(<RoomMediaGrid items={items} onOpen={jest.fn()} onLongPress={onLongPress} />);
        const tile = screen.getByRole('button', { name: 'Photo 1' });

        pointer('pointerdown', tile, 5, 5);
        pointer('pointermove', tile, 5, 25);
        act(() => jest.advanceTimersByTime(ROOM_MEDIA_LONG_PRESS_MS));
        expect(onLongPress).not.toHaveBeenCalled();
    });

    it('does not arm a long press in selection mode', () => {
        jest.useFakeTimers();
        const onLongPress = jest.fn();
        render(
            <RoomMediaGrid
                items={items}
                onOpen={jest.fn()}
                onLongPress={onLongPress}
                selection={{ selectedKeys: new Set(), onToggle: jest.fn() }}
            />
        );

        pointer('pointerdown', screen.getByRole('button', { name: 'Photo 1' }), 5, 5);
        act(() => jest.advanceTimersByTime(ROOM_MEDIA_LONG_PRESS_MS));
        expect(onLongPress).not.toHaveBeenCalled();
    });
});
