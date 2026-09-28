import { fireEvent, render, screen } from '@testing-library/react';

import { MessageImageTiles, type MessageImageTileItem } from './MessageImageTiles';

const tiles = (count: number, state: MessageImageTileItem['state'] = 'ready'): MessageImageTileItem[] =>
    Array.from({ length: count }, (_, i) => ({ key: `k${i}`, src: `https://example.com/${i}.jpg`, state }));

describe('MessageImageTiles', () => {
    it('draws nothing for an empty list', () => {
        const { container } = render(<MessageImageTiles items={[]} />);
        expect(container).toBeEmptyDOMElement();
    });

    it.each([
        [1, 'grid-cols-1'],
        [2, 'grid-cols-2'],
        [3, 'grid-cols-3'],
        [4, 'grid-cols-2'],
    ])('lays %i tiles out as %s', (count, klass) => {
        const { container } = render(<MessageImageTiles items={tiles(count)} />);
        expect(container.firstChild).toHaveClass(klass);
        expect(container.querySelectorAll('img')).toHaveLength(count);
    });

    it('shows four tiles and counts the rest on the last one', () => {
        render(<MessageImageTiles items={tiles(7)} onOpen={jest.fn()} />);

        expect(screen.getAllByRole('button')).toHaveLength(4);
        expect(screen.getByText('+3')).toBeInTheDocument();
    });

    // One message never carries more than ten, so a longer list is a bug upstream, not ten more tiles.
    it('counts no more than ten in all', () => {
        render(<MessageImageTiles items={tiles(14)} onOpen={jest.fn()} />);
        expect(screen.getByText('+6')).toBeInTheDocument();
    });

    it('opens the tapped tile by index', () => {
        const onOpen = jest.fn();
        render(<MessageImageTiles items={tiles(3)} onOpen={onOpen} tileLabel={p => `사진 ${p}`} />);

        fireEvent.click(screen.getByRole('button', { name: '사진 2' }));
        expect(onOpen).toHaveBeenCalledWith(1);
    });

    it('is inert without onOpen', () => {
        render(<MessageImageTiles items={tiles(2)} />);
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    // A broken upload keeps its place so the count still matches what the sender picked.
    it('keeps a broken upload as a placeholder instead of an image', () => {
        const items: MessageImageTileItem[] = [
            { key: 'a', src: 'https://example.com/a.jpg', state: 'ready' },
            { key: 'b', src: 'https://example.com/b.jpg', state: 'broken' },
        ];
        const { container } = render(<MessageImageTiles items={items} />);

        expect(container.querySelectorAll('img')).toHaveLength(1);
        expect(container.firstChild?.childNodes).toHaveLength(2);
    });

    it('marks sending and failed tiles over their preview', () => {
        const { container, rerender } = render(<MessageImageTiles items={tiles(1, 'sending')} />);
        expect(container.querySelector('.animate-spin')).toBeInTheDocument();

        rerender(<MessageImageTiles items={tiles(1, 'failed')} />);
        expect(container.querySelector('.animate-spin')).not.toBeInTheDocument();
        expect(container.querySelector('img')).toBeInTheDocument();
    });
});
