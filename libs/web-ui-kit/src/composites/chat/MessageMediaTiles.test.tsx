import { fireEvent, render, screen } from '@testing-library/react';

import { MessageMediaTiles, type MessageMediaTileItem } from './MessageMediaTiles';

const tiles = (count: number, state: MessageMediaTileItem['state'] = 'ready'): MessageMediaTileItem[] =>
    Array.from({ length: count }, (_, i) => ({
        key: `k${i}`,
        kind: 'image',
        preview: `https://example.com/${i}.jpg`,
        state,
    }));

describe('MessageMediaTiles', () => {
    it('draws nothing for an empty list', () => {
        const { container } = render(<MessageMediaTiles items={[]} />);
        expect(container).toBeEmptyDOMElement();
    });

    it.each([
        [1, 'grid-cols-1'],
        [2, 'grid-cols-2'],
        [3, 'grid-cols-3'],
        [4, 'grid-cols-2'],
    ])('lays %i tiles out as %s', (count, klass) => {
        const { container } = render(<MessageMediaTiles items={tiles(count)} />);
        expect(container.firstChild).toHaveClass(klass);
        expect(container.querySelectorAll('img')).toHaveLength(count);
    });

    it('shows four tiles and counts the rest on the last one', () => {
        render(<MessageMediaTiles items={tiles(7)} onOpen={jest.fn()} />);

        expect(screen.getAllByRole('button')).toHaveLength(4);
        expect(screen.getByText('+3')).toBeInTheDocument();
    });

    // One message never carries more than ten, so a longer list is a bug upstream, not ten more tiles.
    it('counts no more than ten in all', () => {
        render(<MessageMediaTiles items={tiles(14)} onOpen={jest.fn()} />);
        expect(screen.getByText('+6')).toBeInTheDocument();
    });

    it('opens the tapped tile by index', () => {
        const onOpen = jest.fn();
        render(<MessageMediaTiles items={tiles(3)} onOpen={onOpen} tileLabel={p => `사진 ${p}`} />);

        fireEvent.click(screen.getByRole('button', { name: '사진 2' }));
        expect(onOpen).toHaveBeenCalledWith(1);
    });

    it('is inert without onOpen', () => {
        render(<MessageMediaTiles items={tiles(2)} />);
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    // A broken upload keeps its place so the count still matches what the sender picked.
    it('keeps a broken upload as a placeholder instead of an image', () => {
        const items: MessageMediaTileItem[] = [
            { key: 'a', kind: 'image', preview: 'https://example.com/a.jpg', state: 'ready' },
            { key: 'b', kind: 'image', preview: 'https://example.com/b.jpg', state: 'broken' },
        ];
        const { container } = render(<MessageMediaTiles items={items} />);

        expect(container.querySelectorAll('img')).toHaveLength(1);
        expect(container.firstChild?.childNodes).toHaveLength(2);
    });

    // The host is still resolving the address — an empty tile, not the missing-image mark.
    it('draws a ready tile with no address yet as an empty tile', () => {
        const items: MessageMediaTileItem[] = [
            { key: 'a', kind: 'image', state: 'ready' },
            { key: 'b', kind: 'image', state: 'broken' },
        ];
        const { container } = render(<MessageMediaTiles items={items} />);

        const [loading, broken] = Array.from(container.firstChild?.childNodes ?? []) as HTMLElement[];
        expect(loading.querySelector('img, svg')).toBeNull();
        expect(broken.querySelector('svg')).toBeInTheDocument();
    });

    it('marks sending and failed tiles over their preview', () => {
        const { container, rerender } = render(<MessageMediaTiles items={tiles(1, 'sending')} />);
        expect(container.querySelector('.animate-spin')).toBeInTheDocument();

        rerender(<MessageMediaTiles items={tiles(1, 'failed')} />);
        expect(container.querySelector('.animate-spin')).not.toBeInTheDocument();
        expect(container.querySelector('img')).toBeInTheDocument();
    });

    // Signed addresses expire; the host fetches fresh ones, so the tile has to say which one failed.
    it('reports which image failed to load', () => {
        const onImageError = jest.fn();
        const { container } = render(<MessageMediaTiles items={tiles(3)} onImageError={onImageError} />);

        fireEvent.error(container.querySelectorAll('img')[1]);

        expect(onImageError).toHaveBeenCalledWith(1);
    });

    describe('video tiles', () => {
        // `null` for a video with no poster — an explicit `undefined` would take the default.
        const video = (
            state: MessageMediaTileItem['state'],
            preview: string | null = 'https://example.com/poster.jpg'
        ): MessageMediaTileItem => ({ key: 'v', kind: 'video', preview: preview ?? undefined, state });

        it('draws a video from its poster with a play mark over it', () => {
            const { container } = render(<MessageMediaTiles items={[video('ready')]} />);

            expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.com/poster.jpg');
            expect(container.querySelector('[data-play-mark]')).toBeInTheDocument();
            expect(container.querySelector('[data-video-panel]')).not.toBeInTheDocument();
        });

        // A browser-picked video has no poster at all; it still has to read as a video, not as a
        // photo still loading.
        it('draws a video with no poster as a grey panel, still with the play mark', () => {
            const { container } = render(<MessageMediaTiles items={[video('ready', null)]} />);

            expect(container.querySelector('img')).toBeNull();
            expect(container.querySelector('[data-video-panel]')).toBeInTheDocument();
            expect(container.querySelector('[data-play-mark]')).toBeInTheDocument();
        });

        // Playing belongs to the viewer; a <video> per tile would fetch every video scrolled past.
        it('never puts a video element in the feed', () => {
            const { container } = render(
                <MessageMediaTiles
                    items={[video('ready'), video('ready', null), video('sending', null)].map((item, i) => ({
                        ...item,
                        key: `v${i}`,
                    }))}
                    onOpen={jest.fn()}
                />
            );

            expect(container.querySelector('video')).toBeNull();
        });

        // The shell's video has no local preview until its poster is made — the grey panel, under
        // the same spinner a sending photo shows.
        it('draws a sending video with no poster as the grey panel under the spinner', () => {
            const { container } = render(<MessageMediaTiles items={[video('sending', null)]} />);

            expect(container.querySelector('[data-video-panel]')).toBeInTheDocument();
            expect(container.querySelector('.animate-spin')).toBeInTheDocument();
            expect(container.querySelector('[data-play-mark]')).not.toBeInTheDocument();
        });

        it('marks a failed video like a failed photo', () => {
            const { container } = render(<MessageMediaTiles items={[video('failed')]} />);

            expect(container.querySelector('img')).toBeInTheDocument();
            expect(container.querySelector('[data-play-mark]')).not.toBeInTheDocument();
            expect(container.querySelector('.bg-black\\/40 svg')).toBeInTheDocument();
        });

        // It cannot be played, so it must not promise to be.
        it('draws a broken video as the same placeholder as a broken photo', () => {
            const { container } = render(
                <MessageMediaTiles
                    items={[
                        { key: 'p', kind: 'image', state: 'broken' },
                        { key: 'v', kind: 'video', preview: 'https://example.com/poster.jpg', state: 'broken' },
                    ]}
                />
            );

            const [photo, clip] = Array.from(container.firstChild?.childNodes ?? []) as HTMLElement[];
            expect(clip.innerHTML).toBe(photo.innerHTML);
            expect(container.querySelector('img')).toBeNull();
        });

        it('lets the "+n" count take the centre from the play mark', () => {
            const items = Array.from({ length: 6 }, (_, i) => ({ ...video('ready'), key: `v${i}` }));
            const { container } = render(<MessageMediaTiles items={items} />);

            expect(screen.getByText('+2')).toBeInTheDocument();
            expect(container.querySelectorAll('[data-play-mark]')).toHaveLength(3);
        });

        it('opens a video by index and names it as a video', () => {
            const onOpen = jest.fn();
            render(
                <MessageMediaTiles
                    items={[
                        { key: 'p', kind: 'image', preview: 'https://example.com/p.jpg', state: 'ready' },
                        { ...video('ready'), key: 'v' },
                    ]}
                    onOpen={onOpen}
                />
            );

            fireEvent.click(screen.getByRole('button', { name: 'Video 2' }));
            expect(onOpen).toHaveBeenCalledWith(1);
            expect(screen.getByRole('button', { name: 'Photo 1' })).toBeInTheDocument();
        });

        it('hands the kind to a custom tile label', () => {
            const tileLabel = jest.fn((position: number, kind: string) => `${kind}-${position}`);
            render(<MessageMediaTiles items={[video('ready')]} onOpen={jest.fn()} tileLabel={tileLabel} />);

            expect(screen.getByRole('button', { name: 'video-1' })).toBeInTheDocument();
        });

        it('reports a poster that failed to load like any other preview', () => {
            const onImageError = jest.fn();
            const { container } = render(<MessageMediaTiles items={[video('ready')]} onImageError={onImageError} />);

            fireEvent.error(container.querySelector('img') as HTMLImageElement);
            expect(onImageError).toHaveBeenCalledWith(0);
        });
    });
});
