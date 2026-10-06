import { fireEvent, render, screen } from '@testing-library/react';

import { AlbumList } from './AlbumList';
import { PhotoGridSheet, type PhotoGridSheetProps } from './PhotoGridSheet';
import { PhotoGridTile } from './PhotoGridTile';
import { RecentPhotoStrip } from './RecentPhotoStrip';
import { SelectedPhotoStrip } from './SelectedPhotoStrip';
import type { PhotoItem } from './types';
import { formatVideoDuration } from './VideoMark';

const photos = (count: number, prefix = 'p'): PhotoItem[] =>
    Array.from({ length: count }, (_, i) => ({ id: `${prefix}${i}`, src: `data:image/jpeg;base64,${prefix}${i}` }));

describe('RecentPhotoStrip', () => {
    it('hands the tapped photo to the host and opens the grid from the link', () => {
        const onSelect = jest.fn();
        const onSeeAll = jest.fn();
        render(
            <RecentPhotoStrip
                title="최근 사진"
                seeAllLabel="전체 보기"
                onSeeAll={onSeeAll}
                photos={photos(4)}
                onSelect={onSelect}
                photoLabel={p => `최근 ${p}`}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: '최근 3' }));
        fireEvent.click(screen.getByRole('button', { name: '전체 보기' }));
        expect(onSelect).toHaveBeenCalledWith('p2');
        expect(onSeeAll).toHaveBeenCalledTimes(1);
    });

    it('draws nothing when the library answered empty', () => {
        const { container } = render(
            <RecentPhotoStrip title="t" seeAllLabel="s" onSeeAll={jest.fn()} photos={[]} onSelect={jest.fn()} />
        );
        expect(container).toBeEmptyDOMElement();
    });
});

describe('PhotoGridTile', () => {
    it('shows the pick order only when picked', () => {
        const { rerender } = render(<PhotoGridTile src="x" onToggle={jest.fn()} label="사진" />);
        expect(screen.getByRole('button', { name: '사진' })).toHaveAttribute('aria-pressed', 'false');
        expect(screen.queryByText('1')).not.toBeInTheDocument();

        rerender(<PhotoGridTile src="x" order={3} onToggle={jest.fn()} label="사진" />);
        expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByText('3')).toBeInTheDocument();
    });

    // At the cap only unpicked tiles lock: a picked one must stay tappable so it can be un-picked.
    it('locks an unpicked tile when disabled but never a picked one', () => {
        const onToggle = jest.fn();
        const { rerender } = render(<PhotoGridTile src="x" onToggle={onToggle} label="a" disabled />);
        expect(screen.getByRole('button')).toBeDisabled();

        rerender(<PhotoGridTile src="x" order={1} onToggle={onToggle} label="a" disabled />);
        fireEvent.click(screen.getByRole('button'));
        expect(onToggle).toHaveBeenCalledTimes(1);
    });
});

describe('SelectedPhotoStrip', () => {
    it('removes by id and draws nothing when empty', () => {
        const onRemove = jest.fn();
        const { rerender, container } = render(
            <SelectedPhotoStrip photos={photos(2)} onRemove={onRemove} removeLabel={p => `빼기 ${p}`} />
        );
        fireEvent.click(screen.getByRole('button', { name: '빼기 2' }));
        expect(onRemove).toHaveBeenCalledWith('p1');

        rerender(<SelectedPhotoStrip photos={[]} onRemove={onRemove} />);
        expect(container).toBeEmptyDOMElement();
    });
});

describe('AlbumList', () => {
    it('lists albums with a formatted count and selects by id', () => {
        const onSelect = jest.fn();
        render(
            <AlbumList
                albums={[
                    { id: 'all', title: '최근 항목', count: 1234 },
                    { id: 'fav', title: '즐겨찾기', count: 5, coverSrc: 'x' },
                ]}
                onSelect={onSelect}
                formatCount={n => n.toLocaleString('en-US')}
            />
        );

        expect(screen.getByText('1,234')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /즐겨찾기/ }));
        expect(onSelect).toHaveBeenCalledWith('fav');
    });
});

describe('PhotoGridSheet', () => {
    const base = (overrides: Partial<PhotoGridSheetProps> = {}): PhotoGridSheetProps => ({
        open: true,
        onOpenChange: jest.fn(),
        albumTitle: '최근 항목',
        albumsOpen: false,
        onToggleAlbums: jest.fn(),
        albums: [{ id: 'all', title: '최근 항목', count: 3 }],
        onSelectAlbum: jest.fn(),
        photos: photos(3),
        picked: [],
        onToggle: jest.fn(),
        max: 10,
        sendLabel: '보내기',
        onSend: jest.fn(),
        labels: { photo: p => `사진 ${p}`, camera: '카메라', close: '닫기' },
        ...overrides,
    });

    it('numbers picked tiles in pick order, not grid order', () => {
        const all = photos(3);
        render(<PhotoGridSheet {...base({ photos: all, picked: [all[2], all[0]] })} />);

        expect(screen.getByRole('button', { name: '사진 3' })).toHaveTextContent('1');
        expect(screen.getByRole('button', { name: '사진 1' })).toHaveTextContent('2');
        expect(screen.getByRole('button', { name: '사진 2' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('shows the send button only once something is picked', () => {
        const all = photos(2);
        const onSend = jest.fn();
        const { rerender } = render(<PhotoGridSheet {...base({ photos: all })} />);
        expect(screen.queryByRole('button', { name: '1장 보내기' })).not.toBeInTheDocument();

        rerender(<PhotoGridSheet {...base({ photos: all, picked: [all[0]], sendLabel: '1장 보내기', onSend })} />);
        fireEvent.click(screen.getByRole('button', { name: '1장 보내기' }));
        expect(onSend).toHaveBeenCalledTimes(1);
    });

    it('locks unpicked tiles at the cap', () => {
        const all = photos(3);
        render(<PhotoGridSheet {...base({ photos: all, picked: [all[0], all[1]], max: 2 })} />);

        expect(screen.getByRole('button', { name: '사진 3' })).toBeDisabled();
        expect(screen.getByRole('button', { name: '사진 1' })).toBeEnabled();
    });

    it('swaps the grid for the album list and keeps the send button out of it', () => {
        const all = photos(2);
        render(
            <PhotoGridSheet {...base({ photos: all, picked: [all[0]], albumsOpen: true, sendLabel: '1장 보내기' })} />
        );

        expect(screen.queryByRole('button', { name: '사진 1' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: '1장 보내기' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /최근 항목 3/ })).toBeInTheDocument();
    });

    it('draws the sheet with the upward shadow', () => {
        render(<PhotoGridSheet {...base()} />);

        expect(screen.getByRole('dialog')).toHaveClass('shadow-[0_-2px_6px_rgba(0,0,0,0.12)]');
    });

    it('leads the grid with the camera tile when a camera handler is given', () => {
        const onCamera = jest.fn();
        render(<PhotoGridSheet {...base({ onCamera })} />);

        fireEvent.click(screen.getByRole('button', { name: '카메라' }));
        expect(onCamera).toHaveBeenCalledTimes(1);
    });

    it('un-picks from the strip through the same toggle', () => {
        const all = photos(2);
        const onToggle = jest.fn();
        render(
            <PhotoGridSheet
                {...base({ photos: all, picked: [all[1]], onToggle, labels: { remove: p => `빼기 ${p}` } })}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: '빼기 1' }));
        expect(onToggle).toHaveBeenCalledWith(all[1]);
    });

    describe('paging', () => {
        let callback: IntersectionObserverCallback | undefined;
        const disconnect = jest.fn();
        beforeEach(() => {
            callback = undefined;
            (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = jest.fn(
                (cb: IntersectionObserverCallback) => {
                    callback = cb;
                    return { observe: jest.fn(), disconnect, unobserve: jest.fn(), takeRecords: jest.fn() };
                }
            );
        });
        afterEach(() => {
            delete (globalThis as unknown as { IntersectionObserver?: unknown }).IntersectionObserver;
        });

        it('asks for more when the end of the grid comes into view', () => {
            const onLoadMore = jest.fn();
            render(<PhotoGridSheet {...base({ hasMore: true, onLoadMore })} />);

            callback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
            expect(onLoadMore).toHaveBeenCalledTimes(1);
        });

        it('does not watch when there is nothing more', () => {
            render(<PhotoGridSheet {...base({ hasMore: false, onLoadMore: jest.fn() })} />);

            expect(screen.queryByTestId('photo-grid-sentinel')).not.toBeInTheDocument();
            expect(callback).toBeUndefined();
        });
    });
});

describe('video items', () => {
    const clip: PhotoItem = { id: 'v1', src: 'data:image/jpeg;base64,v1', kind: 'video', durationMs: 42_500 };

    it('marks a video tile with a play mark and its length', () => {
        const { container } = render(
            <PhotoGridTile src="x" kind="video" durationMs={42_500} onToggle={jest.fn()} label="v" />
        );

        expect(container.querySelector('[data-video-mark]')).toHaveTextContent('0:42');
    });

    it('draws no video mark on a photo tile', () => {
        const { container } = render(<PhotoGridTile src="x" onToggle={jest.fn()} label="p" />);

        expect(container.querySelector('[data-video-mark]')).toBeNull();
    });

    it('names a video in the recent strip with the video label', () => {
        render(
            <RecentPhotoStrip
                title="t"
                seeAllLabel="s"
                onSeeAll={jest.fn()}
                photos={[...photos(1), clip]}
                onSelect={jest.fn()}
                photoLabel={p => `photo ${p}`}
                videoLabel={p => `video ${p}`}
            />
        );

        expect(screen.getByRole('button', { name: 'photo 1' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'video 2' })).toHaveTextContent('0:42');
    });

    it('keeps the play mark, without the length, on a picked video', () => {
        const { container } = render(<SelectedPhotoStrip photos={[clip]} onRemove={jest.fn()} />);

        const mark = container.querySelector('[data-video-mark]');
        expect(mark).toBeInTheDocument();
        expect(mark).not.toHaveTextContent('0:42');
    });

    it('labels a video tile in the grid with the video label and keeps photo labels for photos', () => {
        render(
            <PhotoGridSheet
                open
                onOpenChange={jest.fn()}
                albumTitle="All"
                albumsOpen={false}
                onToggleAlbums={jest.fn()}
                albums={[]}
                onSelectAlbum={jest.fn()}
                photos={[...photos(1), clip]}
                picked={[]}
                onToggle={jest.fn()}
                max={10}
                sendLabel="Send"
                onSend={jest.fn()}
                labels={{ photo: p => `photo ${p}`, video: p => `video ${p}` }}
            />
        );

        expect(screen.getByRole('button', { name: 'photo 1' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'video 2' })).toBeInTheDocument();
    });
});

describe('formatVideoDuration', () => {
    it.each([
        [0, '0:00'],
        [999, '0:00'],
        [59_900, '0:59'],
        [60_000, '1:00'],
        [605_000, '10:05'],
        [3_600_000, '1:00:00'],
        [3_725_000, '1:02:05'],
        [-5, '0:00'],
        [Number.NaN, '0:00'],
    ])('formats %p ms as %p', (ms, text) => {
        expect(formatVideoDuration(ms)).toBe(text);
    });
});

describe('PhotoGridSheet — while the pick is read', () => {
    it('greys the send button out with the host label and takes no tap', () => {
        const onSend = jest.fn();
        render(
            <PhotoGridSheet
                open
                onOpenChange={jest.fn()}
                albumTitle="All"
                albumsOpen={false}
                onToggleAlbums={jest.fn()}
                albums={[]}
                onSelectAlbum={jest.fn()}
                photos={photos(1)}
                picked={photos(1)}
                onToggle={jest.fn()}
                max={10}
                sendLabel="Preparing"
                sending
                onSend={onSend}
            />
        );

        const button = screen.getByRole('button', { name: 'Preparing' });
        expect(button).toBeDisabled();
        fireEvent.click(button);
        expect(onSend).not.toHaveBeenCalled();
    });
});
