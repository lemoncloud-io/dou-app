import { act, fireEvent, render, screen, within } from '@testing-library/react';

import { SLIDE_FALLBACK_MS, SLIDE_MS } from '../overlay/slidePresence';
import { AlbumList } from './AlbumList';
import { GridScrubber } from './GridScrubber';
import { PhotoGridSheet, type PhotoGridSheetProps } from './PhotoGridSheet';
import { PhotoGridTile } from './PhotoGridTile';
import { PreviewImage } from './PreviewImage';
import { RecentPhotoStrip, type RecentPhotoStripProps } from './RecentPhotoStrip';
import { SelectedPhotoStrip } from './SelectedPhotoStrip';
import type { PhotoItem } from './types';
import { formatVideoDuration } from './VideoMark';
import { anchoredScrollTop, gridMetrics } from './photoGridLayout';

/** A row's pitch at 390px wide: three tiles of (390 − 2·4) / 3 and the 4px gap. */
const ROW = (390 - 8) / 3 + 4;

const photos = (count: number, prefix = 'p'): PhotoItem[] =>
    Array.from({ length: count }, (_, i) => ({ id: `${prefix}${i}`, src: `data:image/jpeg;base64,${prefix}${i}` }));

/** A loaded list as the grid takes it: a count, and the photo at each index. */
const grid = (list: PhotoItem[]) => ({ count: list.length, photoAt: (index: number) => list[index] });

/**
 * jsdom lays nothing out, so every box is 0×0 and a virtual grid would render no row. Give every
 * element a phone-sized box: 390 wide (three tiles of about 127px), 600 tall.
 */
const VIEW_WIDTH = 390;
const VIEW_HEIGHT = 600;
let scrollHeight = 0;
beforeEach(() => {
    scrollHeight = 0;
    jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(VIEW_WIDTH);
    jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(VIEW_HEIGHT);
    jest.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => scrollHeight);
});
afterEach(() => jest.restoreAllMocks());

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

    describe('picking in place', () => {
        const strip = (overrides: Partial<RecentPhotoStripProps> = {}) => (
            <RecentPhotoStrip
                title="최근 사진"
                seeAllLabel="전체 보기"
                onSeeAll={jest.fn()}
                photos={photos(4)}
                photoLabel={p => `최근 ${p}`}
                onToggle={jest.fn()}
                {...overrides}
            />
        );

        it('toggles the tapped photo instead of handing it over', () => {
            const onToggle = jest.fn();
            const onSelect = jest.fn();
            render(strip({ onToggle, onSelect, picked: ['p1'] }));

            fireEvent.click(screen.getByRole('button', { name: '최근 1' }));
            fireEvent.click(screen.getByRole('button', { name: '최근 2' }));

            expect(onToggle.mock.calls).toEqual([['p0'], ['p1']]);
            expect(onSelect).not.toHaveBeenCalled();
        });

        it('numbers picked tiles in pick order and reports each tile’s state', () => {
            render(strip({ picked: ['p3', 'p0'] }));

            expect(screen.getByRole('button', { name: '최근 4' })).toHaveAttribute('aria-pressed', 'true');
            expect(screen.getByRole('button', { name: '최근 4' })).toHaveTextContent('1');
            expect(screen.getByRole('button', { name: '최근 1' })).toHaveTextContent('2');
            expect(screen.getByRole('button', { name: '최근 2' })).toHaveAttribute('aria-pressed', 'false');
            expect(screen.getByRole('button', { name: '최근 2' })).toHaveTextContent('');
        });

        it('locks unpicked tiles at the cap but never a picked one', () => {
            render(strip({ picked: ['p0', 'p1'], max: 2 }));

            expect(screen.getByRole('button', { name: '최근 3' })).toBeDisabled();
            expect(screen.getByRole('button', { name: '최근 1' })).toBeEnabled();
        });

        it('has no cap unless one is given', () => {
            render(strip({ picked: ['p0', 'p1', 'p2'] }));

            expect(screen.getByRole('button', { name: '최근 4' })).toBeEnabled();
        });

        // Without onToggle the row is the old shortcut into the grid, with no pick state to report.
        it('carries no pressed state when it only opens the grid', () => {
            render(strip({ onToggle: undefined, onSelect: jest.fn(), picked: ['p0'] }));

            expect(screen.getByRole('button', { name: '최근 1' })).not.toHaveAttribute('aria-pressed');
            expect(screen.getByRole('button', { name: '최근 1' })).toHaveTextContent('');
        });

        it('keeps a picked video’s play mark', () => {
            const clip: PhotoItem = { id: 'v1', src: 'data:image/jpeg;base64,v1', kind: 'video', durationMs: 5000 };
            const { container } = render(strip({ photos: [clip], picked: ['v1'] }));

            expect(container.querySelector('[data-video-mark]')).toBeInTheDocument();
        });
    });

    // The panel's tiles under the row must be where they will stay from the panel's first frame, before
    // the shell has said whether it can read the library at all.
    describe('while the library has not answered', () => {
        const strip = (overrides: Partial<RecentPhotoStripProps> = {}) => (
            <RecentPhotoStrip
                title="최근 사진"
                seeAllLabel="전체 보기"
                onSeeAll={jest.fn()}
                photos={[]}
                loading
                photoLabel={p => `최근 ${p}`}
                onToggle={jest.fn()}
                {...overrides}
            />
        );
        const placeholders = () => Array.from(document.querySelectorAll<HTMLElement>('[data-recent-placeholder]'));
        /** The row itself: inside the part that opens and closes, and the one that says it is busy. */
        const row = () => document.querySelector('[data-recent-strip]')?.firstElementChild?.firstElementChild;

        it('draws its title over skeleton tiles the size of the photos to come', () => {
            render(strip());

            expect(screen.getByText('최근 사진')).toBeInTheDocument();
            expect(placeholders()).toHaveLength(6);
            for (const tile of placeholders()) {
                expect(tile).toHaveClass('size-[90px]', 'rounded-[12px]', 'bg-muted', 'motion-safe:animate-pulse');
                expect(tile).toHaveAttribute('aria-hidden', 'true');
            }
            expect(row()).toHaveAttribute('aria-busy', 'true');
            // Nothing to pick yet.
            expect(screen.queryAllByRole('button', { name: /최근/ })).toHaveLength(0);
        });

        it('draws as many skeleton tiles as asked', () => {
            render(strip({ placeholderCount: 3 }));

            expect(placeholders()).toHaveLength(3);
        });

        // What "see all" would open may not exist: the shell may have no library to read.
        it('holds "see all" until the first photo is in', () => {
            const onSeeAll = jest.fn();
            const { rerender } = render(strip({ onSeeAll }));
            fireEvent.click(screen.getByRole('button', { name: '전체 보기' }));
            expect(screen.getByRole('button', { name: '전체 보기' })).toBeDisabled();
            expect(onSeeAll).not.toHaveBeenCalled();

            rerender(strip({ onSeeAll, photos: photos(1) }));
            fireEvent.click(screen.getByRole('button', { name: '전체 보기' }));
            expect(onSeeAll).toHaveBeenCalledTimes(1);
        });

        it('puts each photo in its own place’s tile as it arrives, leaving the tiles after it be', () => {
            const { rerender } = render(strip({ placeholderCount: 4 }));
            const [, second, third, fourth] = placeholders();

            rerender(strip({ placeholderCount: 4, photos: photos(1) }));

            expect(screen.getAllByRole('button', { name: /최근/ })).toHaveLength(1);
            // The same elements, not equal ones: every skeleton tile looks alike.
            const left = placeholders();
            expect(left).toHaveLength(3);
            [second, third, fourth].forEach((tile, i) => expect(left[i]).toBe(tile));
            // The first real tile stands where the first skeleton stood.
            const scroller = second.parentElement as HTMLElement;
            expect(scroller.firstElementChild).toBe(screen.getByRole('button', { name: '최근 1' }));
        });

        it('draws only photos once the library has answered', () => {
            const { rerender } = render(strip());

            rerender(strip({ loading: false, photos: photos(2) }));

            expect(placeholders()).toHaveLength(0);
            expect(screen.getAllByRole('button', { name: /최근/ })).toHaveLength(2);
            expect(row()).not.toHaveAttribute('aria-busy');
        });

        // Each photo fades in over the muted square its tile starts as, as PreviewImage does everywhere.
        it('fades each arriving photo in over its tile', () => {
            const { rerender } = render(strip());

            rerender(strip({ loading: false, photos: photos(1) }));

            const tile = screen.getByRole('button', { name: '최근 1' });
            expect(tile).toHaveClass('bg-muted');
            expect(tile.querySelector('img')).toHaveClass('opacity-0', 'transition-opacity');
            expect(within(tile).getByTestId('preview-skeleton')).toBeInTheDocument();
        });

        it('draws nothing when asked for no skeleton tiles and nothing has arrived', () => {
            const { container } = render(strip({ placeholderCount: 0 }));

            expect(container).toBeEmptyDOMElement();
        });
    });

    describe('opening and closing', () => {
        /** The row's natural height in these tests: the title row and a row of tiles. */
        const NATURAL = 144;
        const originalMatchMedia = window.matchMedia;
        const strip = () => document.querySelector('[data-recent-strip]') as HTMLElement | null;
        const content = () => strip()?.firstElementChild as HTMLElement;
        const placeholders = () => document.querySelectorAll('[data-recent-placeholder]');
        const recent = (overrides: Partial<RecentPhotoStripProps> = {}) => (
            <RecentPhotoStrip
                title="최근 사진"
                seeAllLabel="전체 보기"
                onSeeAll={jest.fn()}
                photos={[]}
                photoLabel={p => `최근 ${p}`}
                onToggle={jest.fn()}
                {...overrides}
            />
        );
        const recordLayoutReads = () => {
            const reads: (string | null)[] = [];
            jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
                reads.push(strip()?.getAttribute('data-shown') ?? null);
                return new DOMRect();
            });
            return reads;
        };

        beforeEach(() => {
            jest.useFakeTimers();
            jest.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(NATURAL);
        });
        afterEach(() => {
            jest.useRealTimers();
            window.matchMedia = originalMatchMedia;
        });

        it('is simply there, at its own height, when it first draws with something', () => {
            const reads = recordLayoutReads();
            render(recent({ loading: true }));

            expect(reads).toEqual([]);
            expect(strip()).toHaveAttribute('data-shown', 'true');
            expect(strip()).toHaveStyle({ height: `${NATURAL}px` });
        });

        it('keeps its place when its skeleton tiles give way to photos', () => {
            const reads = recordLayoutReads();
            const { rerender } = render(recent({ loading: true }));
            const before = strip();

            rerender(recent({ photos: photos(3) }));

            expect(strip()).toBe(before);
            expect(reads).toEqual([]);
            expect(strip()).toHaveAttribute('data-shown', 'true');
            expect(strip()).toHaveStyle({ height: `${NATURAL}px` });
        });

        // The shell turned out to have no library to read: the tiles under the row rise as it goes.
        it('folds away from its height when nothing comes, still showing its skeletons, then draws nothing', () => {
            const { rerender, container } = render(recent({ loading: true, placeholderCount: 4 }));

            rerender(recent({ loading: false }));

            expect(strip()).toHaveAttribute('data-shown', 'false');
            expect(strip()).toHaveStyle({ height: '0px' });
            expect(strip()).toHaveClass('overflow-hidden', 'transition-[height]', 'duration-300');
            expect(content()).toHaveClass('translate-y-2', 'opacity-0', 'transition-[transform,opacity]');
            expect(placeholders()).toHaveLength(4);
            expect(strip()).toHaveAttribute('inert');
            expect(strip()).toHaveAttribute('aria-hidden', 'true');

            // Only its own height ends the fold.
            transitionEnd(content(), 'transform');
            expect(strip()).toBeInTheDocument();
            transitionEnd(strip() as HTMLElement, 'height');
            expect(container).toBeEmptyDOMElement();
        });

        it('keeps showing the photos it had while it folds away', () => {
            const { rerender } = render(recent({ photos: photos(2) }));

            rerender(recent({ photos: [] }));

            expect(strip()?.querySelectorAll('img')).toHaveLength(2);
            expect(screen.queryByRole('button', { name: '최근 1' })).not.toBeInTheDocument();
        });

        it('folds away after the slide’s length when the end of the move is never reported', () => {
            const { rerender } = render(recent({ loading: true }));

            rerender(recent({ loading: false }));
            act(() => jest.advanceTimersByTime(SLIDE_MS));
            expect(strip()).toBeInTheDocument();

            act(() => jest.advanceTimersByTime(SLIDE_FALLBACK_MS - SLIDE_MS));
            expect(strip()).not.toBeInTheDocument();
        });

        it('opens from no height when photos come to a row that had none', () => {
            const reads = recordLayoutReads();
            const { rerender } = render(recent());
            expect(strip()).not.toBeInTheDocument();

            rerender(recent({ photos: photos(3) }));

            // Laid out closed first, so the height has somewhere to move from.
            expect(reads).toEqual(['false']);
            expect(strip()).toHaveAttribute('data-shown', 'true');
            expect(strip()).toHaveStyle({ height: `${NATURAL}px` });
            expect(content()).toHaveClass('translate-y-0', 'opacity-100');
            expect(strip()).not.toHaveAttribute('inert');
        });

        it('folds away at once for a reader who asked for less motion', () => {
            window.matchMedia = jest.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
            const { rerender, container } = render(recent({ loading: true }));
            expect(strip()).toHaveClass('transition-none');

            rerender(recent({ loading: false }));

            expect(container).toBeEmptyDOMElement();
        });

        // Space the host wants around the row opens and closes with it.
        it('puts the host’s class on the row, inside the part that opens and closes', () => {
            render(recent({ photos: photos(1), className: 'mb-2' }));

            expect(strip()).not.toHaveClass('mb-2');
            expect(content().firstElementChild).toHaveClass('mb-2');
        });
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

/** jsdom has no `TransitionEvent`; React reads `propertyName` off whatever event arrives. */
const transitionEnd = (element: Element, propertyName: string) => {
    const event = new Event('transitionend', { bubbles: true });
    Object.defineProperty(event, 'propertyName', { value: propertyName });
    act(() => {
        element.dispatchEvent(event);
    });
};

describe('SelectedPhotoStrip', () => {
    it('removes by id and draws nothing once it has closed empty', () => {
        jest.useFakeTimers();
        const onRemove = jest.fn();
        const { rerender, container } = render(
            <SelectedPhotoStrip photos={photos(2)} onRemove={onRemove} removeLabel={p => `빼기 ${p}`} />
        );
        fireEvent.click(screen.getByRole('button', { name: '빼기 2' }));
        expect(onRemove).toHaveBeenCalledWith('p1');

        rerender(<SelectedPhotoStrip photos={[]} onRemove={onRemove} />);
        act(() => jest.advanceTimersByTime(SLIDE_FALLBACK_MS));
        expect(container).toBeEmptyDOMElement();
        jest.useRealTimers();
    });

    it('draws nothing when it starts with nothing picked', () => {
        const { container } = render(<SelectedPhotoStrip photos={[]} onRemove={jest.fn()} />);

        expect(container).toBeEmptyDOMElement();
    });

    it('opens a tapped thumbnail, with the remove chip still a button of its own', () => {
        const onSelect = jest.fn();
        const onRemove = jest.fn();
        render(
            <SelectedPhotoStrip
                photos={photos(2)}
                onRemove={onRemove}
                onSelect={onSelect}
                selectLabel={p => `Open ${p}`}
                removeLabel={p => `Remove ${p}`}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Open 2' }));
        expect(onSelect).toHaveBeenCalledWith('p1');
        expect(onRemove).not.toHaveBeenCalled();

        // Siblings, not nested: a button inside a button is invalid and swallows the inner one's taps.
        const remove = screen.getByRole('button', { name: 'Remove 2' });
        expect(screen.getByRole('button', { name: 'Open 2' })).not.toContainElement(remove);
        fireEvent.click(remove);
        expect(onRemove).toHaveBeenCalledWith('p1');
        expect(onSelect).toHaveBeenCalledTimes(1);
    });

    it('leaves the thumbnails untappable without a select handler', () => {
        render(<SelectedPhotoStrip photos={photos(2)} onRemove={jest.fn()} />);

        expect(screen.getAllByRole('button')).toHaveLength(2);
        expect(screen.queryByRole('button', { name: /Open photo/ })).not.toBeInTheDocument();
    });

    it('draws an edited photo with its edit and a mark that names it', () => {
        jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(64);
        jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(64);
        const [first, second] = photos(2);
        const edited: PhotoItem = {
            ...first,
            edited: {
                src: 'blob:rendition',
                width: 4000,
                height: 3000,
                edit: { rotation: 90, flipH: false, crop: { x: 0, y: 0, width: 1, height: 1 }, aspect: 'free' },
            },
        };
        render(
            <SelectedPhotoStrip
                photos={[edited, second]}
                onRemove={jest.fn()}
                onSelect={jest.fn()}
                editedLabel="Edited"
            />
        );

        const thumb = screen.getByRole('button', { name: 'Open photo 1' });
        expect(thumb.querySelector('[data-edited-photo] img')).toHaveAttribute('src', 'blob:rendition');
        expect(thumb).toHaveAccessibleDescription('Edited');
        expect(screen.getByRole('button', { name: 'Open photo 2' }).querySelector('img')).toHaveAttribute(
            'src',
            second.src
        );
        expect(screen.getAllByText('Edited')).toHaveLength(1);
    });

    it('draws the compact row a composer keeps, with smaller tiles and both buttons still working', () => {
        const onSelect = jest.fn();
        const onRemove = jest.fn();
        const { container, rerender } = render(
            <SelectedPhotoStrip photos={photos(2)} onRemove={onRemove} onSelect={onSelect} size="compact" />
        );

        const tiles = container.querySelectorAll('[data-picked-tile]');
        const surface = () => container.querySelector('[data-size]');
        expect(surface()).toHaveAttribute('data-size', 'compact');
        expect(tiles).toHaveLength(2);
        expect(tiles[0]).toHaveClass('size-12');
        // Hugging its tiles, rather than spanning its host as the grid's strip does.
        expect(surface()).toHaveClass('w-fit');
        expect(surface()).not.toHaveClass('w-full');
        fireEvent.click(screen.getByRole('button', { name: 'Open photo 2' }));
        fireEvent.click(screen.getByRole('button', { name: 'Remove photo 1' }));
        expect(onSelect).toHaveBeenCalledWith('p1');
        expect(onRemove).toHaveBeenCalledWith('p0');

        // The grid's size is what it always was.
        rerender(<SelectedPhotoStrip photos={photos(2)} onRemove={onRemove} />);
        expect(surface()).toHaveAttribute('data-size', 'regular');
        expect(surface()).toHaveClass('w-full', 'p-3');
        expect(container.querySelector('[data-picked-tile]')).toHaveClass('size-16');
    });

    it('reads as a named group when given a label, and as a plain row without one', () => {
        const { rerender } = render(
            <SelectedPhotoStrip photos={photos(1)} onRemove={jest.fn()} label="Photos to send" size="compact" />
        );
        expect(screen.getByRole('group', { name: 'Photos to send' })).toBeInTheDocument();

        rerender(<SelectedPhotoStrip photos={photos(1)} onRemove={jest.fn()} />);
        expect(screen.queryByRole('group')).not.toBeInTheDocument();
    });

    // A margin the host gives the row has to open and close with it, so it goes on the row's surface,
    // inside the box whose height moves.
    it('puts the host’s class on the row’s surface, inside the part that opens and closes', () => {
        const { container } = render(<SelectedPhotoStrip photos={photos(1)} onRemove={jest.fn()} className="mb-2" />);

        const strip = container.querySelector('[data-picked-strip]') as HTMLElement;
        expect(container.querySelector('[data-size]')).toHaveClass('mb-2');
        expect(strip).not.toHaveClass('mb-2');
        expect(strip).toContainElement(container.querySelector('[data-size]') as HTMLElement);
    });

    describe('motion', () => {
        /** The strip's natural height in these tests: the regular strip's 112px. */
        const NATURAL = 112;
        const originalMatchMedia = window.matchMedia;

        const strip = () => document.querySelector('[data-picked-strip]') as HTMLElement | null;
        const content = () => strip()?.firstElementChild as HTMLElement;
        const slots = () => Array.from(document.querySelectorAll<HTMLElement>('[data-picked-item]'));
        const slot = (id: string) =>
            slots().find(element => element.querySelector('img')?.getAttribute('src')?.endsWith(id)) as HTMLElement;
        const row = () => slots()[0].parentElement as HTMLElement;

        /** Records every layout read: what the strip and its tiles looked like when one was taken. */
        const recordLayoutReads = () => {
            const reads: { shown: string | null; phases: (string | null)[] }[] = [];
            jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
                reads.push({
                    shown: strip()?.getAttribute('data-shown') ?? null,
                    phases: slots().map(element => element.getAttribute('data-phase')),
                });
                return new DOMRect();
            });
            return reads;
        };

        const reduceMotion = () => {
            window.matchMedia = jest.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
        };

        beforeEach(() => {
            jest.useFakeTimers();
            jest.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(NATURAL);
        });
        afterEach(() => {
            jest.useRealTimers();
            window.matchMedia = originalMatchMedia;
        });

        describe('opening and closing', () => {
            it('opens from no height to its own when the first photo is picked, its content rising in', () => {
                const reads = recordLayoutReads();
                const { rerender } = render(<SelectedPhotoStrip photos={[]} onRemove={jest.fn()} />);
                expect(strip()).not.toBeInTheDocument();

                rerender(<SelectedPhotoStrip photos={photos(1)} onRemove={jest.fn()} />);

                // Laid out closed first, so the height has somewhere to move from.
                expect(reads.map(read => read.shown)).toEqual(['false']);
                expect(strip()).toHaveAttribute('data-shown', 'true');
                expect(strip()).toHaveStyle({ height: `${NATURAL}px` });
                expect(strip()).toHaveClass('overflow-hidden', 'transition-[height]', 'duration-300');
                expect(content()).toHaveClass('translate-y-0', 'opacity-100', 'transition-[transform,opacity]');
                expect(strip()).not.toHaveAttribute('inert');
            });

            // The grid opened on picks made in the attach panel: the strip is part of the sheet's rise.
            it('is simply there at its own height when it mounts with photos', () => {
                const reads = recordLayoutReads();
                render(<SelectedPhotoStrip photos={photos(2)} onRemove={jest.fn()} />);

                expect(reads).toEqual([]);
                expect(strip()).toHaveAttribute('data-shown', 'true');
                expect(strip()).toHaveStyle({ height: `${NATURAL}px` });
            });

            it('closes to no height when the last photo goes, still showing it, then draws nothing', () => {
                const onExited = jest.fn();
                const { rerender, container } = render(
                    <SelectedPhotoStrip photos={photos(1)} onRemove={jest.fn()} onExited={onExited} />
                );

                rerender(<SelectedPhotoStrip photos={[]} onRemove={jest.fn()} onExited={onExited} />);

                expect(strip()).toHaveAttribute('data-shown', 'false');
                expect(strip()).toHaveStyle({ height: '0px' });
                expect(content()).toHaveClass('translate-y-2', 'opacity-0');
                // The whole row closes; its last tile is drawn as it was rather than leaving on its own.
                expect(strip()?.querySelector('img')).toHaveAttribute('src', photos(1)[0].src);
                expect(slots().map(element => element.dataset.phase)).toEqual(['in']);
                // Untouchable and unread on the way out.
                expect(strip()).toHaveAttribute('inert');
                expect(screen.queryByRole('button', { name: 'Remove photo 1' })).not.toBeInTheDocument();

                // Only its own height ends the close, not the content's motion inside it.
                transitionEnd(content(), 'transform');
                expect(strip()).toBeInTheDocument();
                expect(onExited).not.toHaveBeenCalled();

                transitionEnd(strip() as HTMLElement, 'height');
                expect(container).toBeEmptyDOMElement();
                expect(onExited).toHaveBeenCalledTimes(1);
            });

            it('closes after the slide’s length when the end of the move is never reported', () => {
                const onExited = jest.fn();
                const { rerender } = render(
                    <SelectedPhotoStrip photos={photos(1)} onRemove={jest.fn()} onExited={onExited} />
                );

                rerender(<SelectedPhotoStrip photos={[]} onRemove={jest.fn()} onExited={onExited} />);
                act(() => jest.advanceTimersByTime(SLIDE_MS));
                expect(strip()).toBeInTheDocument();

                act(() => jest.advanceTimersByTime(SLIDE_FALLBACK_MS - SLIDE_MS));
                expect(strip()).not.toBeInTheDocument();
                expect(onExited).toHaveBeenCalledTimes(1);
            });

            it('opens again, with the new pick, when one is made while it closes', () => {
                const [first, second] = photos(2);
                const { rerender } = render(<SelectedPhotoStrip photos={[first]} onRemove={jest.fn()} />);
                rerender(<SelectedPhotoStrip photos={[]} onRemove={jest.fn()} />);

                rerender(<SelectedPhotoStrip photos={[second]} onRemove={jest.fn()} />);

                expect(strip()).toHaveAttribute('data-shown', 'true');
                expect(slots()).toHaveLength(1);
                expect(slots()[0].querySelector('img')).toHaveAttribute('src', second.src);
                act(() => jest.advanceTimersByTime(SLIDE_FALLBACK_MS));
                expect(strip()).toBeInTheDocument();
            });

            it('opens and closes at once for a reader who asked for less motion', () => {
                reduceMotion();
                const onExited = jest.fn();
                const { rerender } = render(
                    <SelectedPhotoStrip photos={[]} onRemove={jest.fn()} onExited={onExited} />
                );

                rerender(<SelectedPhotoStrip photos={photos(1)} onRemove={jest.fn()} onExited={onExited} />);
                expect(strip()).toHaveClass('transition-none');
                expect(strip()).toHaveStyle({ height: `${NATURAL}px` });

                rerender(<SelectedPhotoStrip photos={[]} onRemove={jest.fn()} onExited={onExited} />);
                expect(strip()).not.toBeInTheDocument();
                expect(onExited).toHaveBeenCalledTimes(1);
            });
        });

        describe('photos coming and going', () => {
            it('widens a new pick into the row from nothing while the others stay where they are', () => {
                const reads = recordLayoutReads();
                const { rerender } = render(<SelectedPhotoStrip photos={photos(2)} onRemove={jest.fn()} />);

                rerender(<SelectedPhotoStrip photos={photos(3)} onRemove={jest.fn()} />);

                // Laid out at no width first, so the widening is a transition.
                expect(reads.map(read => read.phases)).toEqual([['in', 'in', 'enter']]);
                expect(slots().map(element => element.dataset.phase)).toEqual(['in', 'in', 'in']);
                expect(slots().map(element => [element.style.width, element.style.marginLeft])).toEqual([
                    ['64px', '0px'],
                    ['64px', '14px'],
                    ['64px', '14px'],
                ]);
                expect(slots()[2]).toHaveClass('transition-[width,margin-left]', 'duration-300');
                expect(slots()[2].querySelector('[data-picked-tile]')).toHaveClass('scale-100', 'opacity-100');
            });

            it('narrows a removed photo to nothing where it stood while the next one slides over, then drops it', () => {
                const [first, second, third] = photos(3);
                const onRemove = jest.fn();
                const { rerender } = render(<SelectedPhotoStrip photos={[first, second, third]} onRemove={onRemove} />);

                rerender(<SelectedPhotoStrip photos={[first, third]} onRemove={onRemove} />);

                // Kept in its place, so the order on screen never shuffles.
                expect(slots().map(element => element.dataset.phase)).toEqual(['in', 'leave', 'in']);
                const leaving = slot(second.id);
                expect(leaving).toHaveStyle({ width: '0px', marginLeft: '0px' });
                expect(leaving.querySelector('[data-picked-tile]')).toHaveClass('scale-75', 'opacity-0');
                expect(leaving).toHaveAttribute('inert');
                expect(slot(third.id)).toHaveStyle({ width: '64px', marginLeft: '14px' });
                // Positions count only what stays.
                fireEvent.click(screen.getByRole('button', { name: 'Remove photo 2' }));
                expect(onRemove).toHaveBeenCalledWith(third.id);
                expect(screen.queryByRole('button', { name: 'Remove photo 3' })).not.toBeInTheDocument();

                transitionEnd(leaving.querySelector('[data-picked-tile]') as HTMLElement, 'transform');
                expect(slots()).toHaveLength(3);
                transitionEnd(leaving, 'width');
                expect(slots()).toHaveLength(2);
            });

            // The space before the first tile is nothing; the space after it has to close with it.
            it('closes the space after a removed first photo too', () => {
                const [first, second] = photos(2);
                const { rerender } = render(<SelectedPhotoStrip photos={[first, second]} onRemove={jest.fn()} />);

                rerender(<SelectedPhotoStrip photos={[second]} onRemove={jest.fn()} />);

                expect(slot(second.id)).toHaveStyle({ width: '64px', marginLeft: '0px' });
            });

            it('drops a removed photo after the slide’s length when the end is never reported', () => {
                const { rerender } = render(<SelectedPhotoStrip photos={photos(3)} onRemove={jest.fn()} />);

                rerender(<SelectedPhotoStrip photos={photos(2)} onRemove={jest.fn()} />);
                act(() => jest.advanceTimersByTime(SLIDE_MS));
                expect(slots()).toHaveLength(3);

                act(() => jest.advanceTimersByTime(SLIDE_FALLBACK_MS - SLIDE_MS));
                expect(slots()).toHaveLength(2);
            });

            it('brings a photo back where the host now puts it when it is picked again on its way out', () => {
                const [first, second, third] = photos(3);
                const { rerender } = render(
                    <SelectedPhotoStrip photos={[first, second, third]} onRemove={jest.fn()} />
                );
                rerender(<SelectedPhotoStrip photos={[first, third]} onRemove={jest.fn()} />);

                rerender(<SelectedPhotoStrip photos={[first, third, second]} onRemove={jest.fn()} />);

                expect(slots().map(element => element.querySelector('img')?.getAttribute('src'))).toEqual([
                    first.src,
                    third.src,
                    second.src,
                ]);
                expect(slots().map(element => element.dataset.phase)).toEqual(['in', 'in', 'in']);
            });

            it('drops a removed photo at once for a reader who asked for less motion', () => {
                reduceMotion();
                const { rerender } = render(<SelectedPhotoStrip photos={photos(3)} onRemove={jest.fn()} />);

                rerender(<SelectedPhotoStrip photos={photos(2)} onRemove={jest.fn()} />);

                expect(slots()).toHaveLength(2);
                expect(slots()[0]).toHaveClass('transition-none');
            });
        });

        describe('keeping a new pick in view', () => {
            /** Wide enough for two and a bit 64px tiles. */
            const VIEW = 200;
            beforeEach(() => {
                jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(VIEW);
            });

            // Four tiles and three gaps, then the 8px the remove chip hangs into, less what is on screen.
            const toFourth = 4 * 64 + 3 * 14 + 8 - VIEW;

            it('scrolls the row along with the new tile’s widening until the tile is in view', () => {
                const { rerender } = render(<SelectedPhotoStrip photos={photos(3)} onRemove={jest.fn()} />);
                expect(row().scrollLeft).toBe(0);

                rerender(<SelectedPhotoStrip photos={photos(4)} onRemove={jest.fn()} />);
                act(() => jest.advanceTimersByTime(SLIDE_MS / 2));
                // On the slide's curve: most of the way at half time, not there yet.
                expect(row().scrollLeft).toBeGreaterThan(toFourth * 0.8);
                expect(row().scrollLeft).toBeLessThan(toFourth);

                act(() => jest.advanceTimersByTime(SLIDE_MS));
                expect(row().scrollLeft).toBe(toFourth);
            });

            it('leaves the row where it is when the new tile fits in view', () => {
                const { rerender } = render(<SelectedPhotoStrip photos={photos(1)} onRemove={jest.fn()} />);

                rerender(<SelectedPhotoStrip photos={photos(2)} onRemove={jest.fn()} />);
                act(() => jest.advanceTimersByTime(SLIDE_MS * 2));

                expect(row().scrollLeft).toBe(0);
            });

            it('stops following once the person touches the row', () => {
                const { rerender } = render(<SelectedPhotoStrip photos={photos(3)} onRemove={jest.fn()} />);
                rerender(<SelectedPhotoStrip photos={photos(4)} onRemove={jest.fn()} />);
                act(() => jest.advanceTimersByTime(SLIDE_MS / 3));
                const reached = row().scrollLeft;

                fireEvent.pointerDown(row());
                act(() => jest.advanceTimersByTime(SLIDE_MS));

                expect(reached).toBeGreaterThan(0);
                expect(row().scrollLeft).toBe(reached);
            });

            it('jumps straight there for a reader who asked for less motion', () => {
                reduceMotion();
                const { rerender } = render(<SelectedPhotoStrip photos={photos(3)} onRemove={jest.fn()} />);

                rerender(<SelectedPhotoStrip photos={photos(4)} onRemove={jest.fn()} />);

                expect(row().scrollLeft).toBe(toFourth);
            });
        });
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
    const base = ({
        photos: list = photos(3),
        ...overrides
    }: Partial<PhotoGridSheetProps> & { photos?: PhotoItem[] } = {}): PhotoGridSheetProps => ({
        open: true,
        onOpenChange: jest.fn(),
        albumTitle: '최근 항목',
        albumsOpen: false,
        onToggleAlbums: jest.fn(),
        albums: [{ id: 'all', title: '최근 항목', count: 3 }],
        onSelectAlbum: jest.fn(),
        ...grid(list),
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

    describe('edit and grouping row', () => {
        const footer = () => screen.queryByTestId('photo-grid-footer');
        const checkbox = () => screen.queryByRole('checkbox', { name: 'One message' });
        const labels = { edit: 'Edit', grouped: 'One message', select: (p: number) => `Open ${p}` };

        it('opens the editor from the edit button with no id, and from a strip tap with that one', () => {
            const all = photos(3);
            const onEdit = jest.fn();
            render(<PhotoGridSheet {...base({ photos: all, picked: [all[2], all[0]], onEdit, labels })} />);

            fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
            fireEvent.click(screen.getByRole('button', { name: 'Open 2' }));

            expect(onEdit.mock.calls).toEqual([[], ['p0']]);
        });

        it('greys the edit button when nothing picked can be edited', () => {
            const all = photos(1);
            const onEdit = jest.fn();
            render(<PhotoGridSheet {...base({ photos: all, picked: all, onEdit, editDisabled: true, labels })} />);

            fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

            expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
            expect(onEdit).not.toHaveBeenCalled();
        });

        it('offers one message or several only from two picked items', () => {
            const all = photos(3);
            const onGroupedChange = jest.fn();
            const { rerender } = render(
                <PhotoGridSheet {...base({ photos: all, picked: [all[0]], grouped: true, onGroupedChange, labels })} />
            );
            expect(checkbox()).not.toBeInTheDocument();
            // Nothing else for the row to hold: the footer is the send button alone.
            expect(footer()).not.toBeInTheDocument();

            rerender(
                <PhotoGridSheet
                    {...base({ photos: all, picked: [all[0], all[1]], grouped: true, onGroupedChange, labels })}
                />
            );
            expect(checkbox()).toHaveAttribute('aria-checked', 'true');
            fireEvent.click(checkbox() as HTMLElement);
            expect(onGroupedChange).toHaveBeenCalledWith(false);

            rerender(
                <PhotoGridSheet
                    {...base({ photos: all, picked: [all[0], all[1]], grouped: false, onGroupedChange, labels })}
                />
            );
            fireEvent.click(checkbox() as HTMLElement);
            expect(onGroupedChange).toHaveBeenLastCalledWith(true);
        });

        it('draws neither control when the host offers neither', () => {
            const all = photos(2);
            render(<PhotoGridSheet {...base({ photos: all, picked: all, grouped: true, labels })} />);

            expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
            expect(checkbox()).not.toBeInTheDocument();
            expect(footer()).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: '보내기' })).toBeInTheDocument();
        });

        it('keeps the row out of the album list, as it does the send button', () => {
            const all = photos(2);
            render(
                <PhotoGridSheet
                    {...base({
                        photos: all,
                        picked: all,
                        albumsOpen: true,
                        onEdit: jest.fn(),
                        onGroupedChange: jest.fn(),
                        labels,
                    })}
                />
            );

            expect(footer()).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
        });

        it('holds the row and the send button in one panel', () => {
            const all = photos(2);
            const onSend = jest.fn();
            render(
                <PhotoGridSheet
                    {...base({
                        photos: all,
                        picked: all,
                        onSend,
                        onEdit: jest.fn(),
                        onGroupedChange: jest.fn(),
                        labels,
                    })}
                />
            );

            const panel = footer() as HTMLElement;
            expect(within(panel).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
            expect(within(panel).getByRole('checkbox', { name: 'One message' })).toBeInTheDocument();
            fireEvent.click(within(panel).getByRole('button', { name: '보내기' }));
            expect(onSend).toHaveBeenCalledTimes(1);
        });

        it('takes no tap on the row while the pick is being read', () => {
            const all = photos(2);
            const onEdit = jest.fn();
            const onGroupedChange = jest.fn();
            render(
                <PhotoGridSheet
                    {...base({ photos: all, picked: all, sending: true, onEdit, onGroupedChange, labels })}
                />
            );

            fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
            fireEvent.click(checkbox() as HTMLElement);

            expect(onEdit).not.toHaveBeenCalled();
            expect(onGroupedChange).not.toHaveBeenCalled();
        });

        it('lifts the snackbar by the whole panel, row included', () => {
            const all = photos(2);
            render(<PhotoGridSheet {...base({ photos: all, picked: all, onEdit: jest.fn(), labels })} />);

            // Every box measures 600 tall here; the button's own panel reads 0 from jsdom's rect.
            expect(document.documentElement.style.getPropertyValue('--toast-lift')).toBe(`${VIEW_HEIGHT}px`);
        });
    });

    describe('footer slide', () => {
        const slide = () => screen.queryByTestId('photo-grid-footer-slide');
        const spacer = () => screen.queryByTestId('photo-grid-footer-spacer');
        const lift = () => document.documentElement.style.getPropertyValue('--toast-lift');

        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());

        it('slides the send button up from below when the first item is picked', () => {
            const all = photos(2);
            // Which position the footer had been laid out at when it was moved: the slide's start.
            const laidOutAt: (string | null)[] = [];
            const rect = HTMLElement.prototype.getBoundingClientRect;
            jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
                if (this.dataset.testid === 'photo-grid-footer-slide') laidOutAt.push(this.dataset.shown ?? null);
                return rect.call(this);
            });
            const { rerender } = render(<PhotoGridSheet {...base({ photos: all })} />);
            expect(slide()).not.toBeInTheDocument();

            rerender(<PhotoGridSheet {...base({ photos: all, picked: [all[0]], sendLabel: '1장 보내기' })} />);

            expect(laidOutAt).toEqual(['false']);
            expect(slide()).toHaveAttribute('data-shown', 'true');
            expect(within(slide() as HTMLElement).getByRole('button', { name: '1장 보내기' })).toBeInTheDocument();
        });

        // Opened on a pick made elsewhere (the attach panel's row), the footer rises with the sheet.
        it('is simply there when the sheet opens with something already picked', () => {
            const all = photos(2);
            render(<PhotoGridSheet {...base({ photos: all, picked: [all[0]] })} />);

            expect(slide()).toHaveAttribute('data-shown', 'true');
        });

        it('slides it back down when the last pick is undone, still showing what it showed, untouchable', () => {
            const all = photos(2);
            const { rerender } = render(
                <PhotoGridSheet {...base({ photos: all, picked: [all[0]], sendLabel: '1장 보내기' })} />
            );

            rerender(<PhotoGridSheet {...base({ photos: all, picked: [], sendLabel: '0장 보내기' })} />);

            const leaving = slide() as HTMLElement;
            expect(leaving).toHaveAttribute('data-shown', 'false');
            expect(leaving).toHaveAttribute('inert');
            expect(within(leaving).getByRole('button', { name: '1장 보내기' })).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: '0장 보내기' })).not.toBeInTheDocument();

            act(() => jest.advanceTimersByTime(SLIDE_MS + 100));
            expect(slide()).not.toBeInTheDocument();
        });

        it('slides it down when the album list takes the grid’s place', () => {
            const all = photos(2);
            const { rerender } = render(<PhotoGridSheet {...base({ photos: all, picked: [all[0]] })} />);

            rerender(<PhotoGridSheet {...base({ photos: all, picked: [all[0]], albumsOpen: true })} />);

            expect(slide()).toHaveAttribute('data-shown', 'false');
        });

        // The footer lies over the grid rather than shortening it; the last row has to scroll clear.
        it('lets the grid scroll its last row clear of the footer while the footer is up', () => {
            const all = photos(2);
            const { rerender } = render(<PhotoGridSheet {...base({ photos: all })} />);
            expect(spacer()).not.toBeInTheDocument();

            rerender(<PhotoGridSheet {...base({ photos: all, picked: [all[0]] })} />);
            // Every box measures 600 tall here, the footer included.
            expect(spacer()).toHaveStyle({ height: `${VIEW_HEIGHT}px` });
            expect(screen.getByTestId('photo-grid-scroller')).toContainElement(spacer());

            rerender(<PhotoGridSheet {...base({ photos: all, picked: [] })} />);
            expect(spacer()).not.toBeInTheDocument();
        });

        it('keeps the snackbar lifted until the footer is gone', () => {
            const all = photos(2);
            const { rerender } = render(<PhotoGridSheet {...base({ photos: all, picked: [all[0]] })} />);
            expect(lift()).toBe(`${VIEW_HEIGHT}px`);

            rerender(<PhotoGridSheet {...base({ photos: all, picked: [] })} />);
            expect(lift()).toBe(`${VIEW_HEIGHT}px`);

            act(() => jest.advanceTimersByTime(SLIDE_MS + 100));
            expect(lift()).toBe('');
        });

        it('moves for someone who asked for less motion only by appearing and disappearing', () => {
            const all = photos(2);
            render(<PhotoGridSheet {...base({ photos: all, picked: [all[0]] })} />);

            expect(slide()).toHaveClass('motion-reduce:transition-none');
        });
    });

    // The strip closes rather than vanishing, which it can only do while the sheet still draws it.
    it('keeps the picked strip through the last un-pick so it can close', () => {
        jest.useFakeTimers();
        const all = photos(2);
        const { rerender } = render(<PhotoGridSheet {...base({ photos: all, picked: [all[0]] })} />);

        rerender(<PhotoGridSheet {...base({ photos: all, picked: [] })} />);

        expect(document.querySelector('[data-picked-strip]')).toHaveAttribute('data-shown', 'false');
        act(() => jest.advanceTimersByTime(SLIDE_FALLBACK_MS));
        expect(document.querySelector('[data-picked-strip]')).not.toBeInTheDocument();
        jest.useRealTimers();
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

    describe('virtual grid', () => {
        const scroller = () => screen.getByTestId('photo-grid-scroller');

        /** Scrolls the grid and lets its once-a-frame measure run. */
        const scrollTo = async (top: number) => {
            Object.defineProperty(scroller(), 'scrollTop', { value: top, configurable: true });
            fireEvent.scroll(scroller());
            await act(() => new Promise(resolve => requestAnimationFrame(() => resolve(undefined))));
        };

        it('renders only the rows on screen and a few either side, not the whole album', () => {
            const photoAt = jest.fn((index: number) => ({ id: `p${index}`, src: `data:p${index}` }));
            render(<PhotoGridSheet {...base({ count: 3000, photoAt, onCamera: jest.fn() })} />);

            // 600 / ~131 per row is five rows on screen, four more below: nine rows of three, camera included.
            expect(screen.getAllByRole('button', { name: /^사진 / })).toHaveLength(26);
            expect(Math.max(...photoAt.mock.calls.map(([index]) => index))).toBe(25);
            // The grid is as tall as the whole album, so the scroll bar and a jump both see the real length.
            expect(parseFloat(screen.getByTestId('photo-grid').style.height)).toBeCloseTo(1001 * ROW - 4, 3);
        });

        it('draws a photo that has not loaded as an empty, untappable tile', () => {
            render(
                <PhotoGridSheet {...base({ count: 4, photoAt: index => (index < 2 ? photos(2)[index] : undefined) })} />
            );

            expect(screen.getAllByRole('button', { name: /^사진 / })).toHaveLength(2);
            expect(screen.getAllByTestId('photo-grid-placeholder')).toHaveLength(2);
        });

        it('reports the photos on screen and the pixel size their tiles are drawn at', async () => {
            const onVisibleRangeChange = jest.fn();
            render(<PhotoGridSheet {...base({ count: 3000, photoAt: () => undefined, onVisibleRangeChange })} />);

            expect(onVisibleRangeChange).toHaveBeenLastCalledWith({ start: 0, end: 27, thumbSize: 128 });

            // Row 100 at the top: rows 96–108 rendered (four either side of the five on screen).
            await scrollTo(ROW * 100);
            expect(onVisibleRangeChange).toHaveBeenLastCalledWith({ start: 288, end: 327, thumbSize: 128 });
        });

        it('keeps the title and the picked strip out of the scrolling part, and the notice in it', () => {
            render(<PhotoGridSheet {...base({ picked: photos(1), notice: <p>일부 사진만 공유됨</p> })} />);

            expect(within(scroller()).queryByRole('button', { name: /최근 항목/ })).not.toBeInTheDocument();
            expect(within(scroller()).queryByRole('button', { name: 'Remove photo 1' })).not.toBeInTheDocument();
            expect(within(scroller()).getByText('일부 사진만 공유됨')).toBeInTheDocument();
        });

        it('shows the fast-scroll handle while a long grid scrolls, and not on a short one', async () => {
            scrollHeight = VIEW_HEIGHT * 2;
            const { unmount } = render(<PhotoGridSheet {...base({ count: 30, photoAt: () => undefined })} />);
            await scrollTo(100);
            expect(screen.queryByTestId('photo-grid-scrubber')).not.toBeInTheDocument();
            unmount();

            scrollHeight = VIEW_HEIGHT * 20;
            render(<PhotoGridSheet {...base({ count: 3000, photoAt: () => undefined })} />);
            await scrollTo(100);
            expect(screen.getByTestId('photo-grid-scrubber')).toBeInTheDocument();
        });

        it('scrolls to the matching place when the handle is dragged, without reaching the sheet', async () => {
            scrollHeight = VIEW_HEIGHT * 20;
            const onOpenChange = jest.fn();
            render(<PhotoGridSheet {...base({ count: 3000, photoAt: () => undefined, onOpenChange })} />);
            await scrollTo(0);
            const handle = screen.getByTestId('photo-grid-scrubber').firstElementChild as HTMLElement;
            let top = 0;
            Object.defineProperty(scroller(), 'scrollTop', {
                configurable: true,
                get: () => top,
                set: (value: number) => (top = value),
            });

            const pointer = (type: string, clientY: number) => {
                const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientY });
                Object.defineProperty(event, 'pointerId', { value: 7 });
                fireEvent(handle, event);
            };
            pointer('pointerdown', 0);
            // The track is 600 - 16 tall and the handle 48: dragging the handle its full travel is the end.
            pointer('pointermove', 600 - 16 - 48);
            pointer('pointerup', 600 - 16 - 48);

            expect(top).toBe(VIEW_HEIGHT * 20 - VIEW_HEIGHT);
            expect(onOpenChange).not.toHaveBeenCalled();
        });

        it('fills the screen with skeleton tiles while the first page is on its way', () => {
            const onVisibleRangeChange = jest.fn();
            render(
                <PhotoGridSheet
                    {...base({
                        count: 0,
                        photoAt: () => undefined,
                        loading: true,
                        onCamera: jest.fn(),
                        onVisibleRangeChange,
                    })}
                />
            );

            // 600 tall at ~131 a row is five rows of three, the camera tile first.
            expect(screen.getAllByTestId('photo-grid-placeholder')).toHaveLength(14);
            // They stand for no photo: the range asks for nothing.
            expect(onVisibleRangeChange).toHaveBeenLastCalledWith(expect.objectContaining({ start: 0, end: 0 }));
        });

        it('draws no skeleton for an album that answered empty', () => {
            render(<PhotoGridSheet {...base({ count: 0, photoAt: () => undefined, loading: false })} />);

            expect(screen.queryAllByTestId('photo-grid-placeholder')).toHaveLength(0);
        });

        it('pulses the tiles whose photo has not loaded', () => {
            render(<PhotoGridSheet {...base({ count: 2, photoAt: () => undefined })} />);

            for (const tile of screen.getAllByTestId('photo-grid-placeholder')) {
                expect(tile).toHaveClass('motion-safe:animate-pulse');
            }
        });

        describe('with the sheet', () => {
            beforeEach(() => {
                jest.useFakeTimers();
                // The sheet's drag needs a height to measure and pointer capture, which jsdom lacks.
                jest.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(VIEW_HEIGHT);
                HTMLElement.prototype.setPointerCapture = jest.fn();
                HTMLElement.prototype.hasPointerCapture = jest.fn(() => false);
            });
            afterEach(() => jest.useRealTimers());

            const pointer = (el: Element, type: string, clientY: number, at: number, id: number, isPrimary = true) => {
                const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientY });
                Object.defineProperty(event, 'pointerId', { value: id });
                Object.defineProperty(event, 'isPrimary', { value: isPrimary });
                Object.defineProperty(event, 'timeStamp', { value: at });
                fireEvent(el, event);
            };

            // Once the sheet captures a drag, the release goes to the sheet, not to the grid under it.
            it('still lets a swipe down from the grid’s top dismiss after an earlier press ended elsewhere', () => {
                const onOpenChange = jest.fn();
                render(<PhotoGridSheet {...base({ onOpenChange })} />);
                const panel = screen.getByRole('dialog');

                pointer(scroller(), 'pointerdown', 0, 0, 1);
                pointer(panel, 'pointerup', 0, 10, 1);

                pointer(scroller(), 'pointerdown', 0, 100, 2);
                pointer(scroller(), 'pointermove', 200, 300, 2);
                pointer(scroller(), 'pointermove', VIEW_HEIGHT, 500, 2);
                pointer(scroller(), 'pointerup', VIEW_HEIGHT, 500, 2);
                act(() => void jest.advanceTimersByTime(250));

                expect(onOpenChange).toHaveBeenCalledWith(false);
            });

            it('keeps a second finger from dragging the sheet', () => {
                const onOpenChange = jest.fn();
                render(<PhotoGridSheet {...base({ onOpenChange })} />);

                pointer(scroller(), 'pointerdown', 0, 0, 3, false);
                pointer(scroller(), 'pointermove', VIEW_HEIGHT, 200, 3, false);
                pointer(scroller(), 'pointerup', VIEW_HEIGHT, 200, 3, false);
                act(() => void jest.advanceTimersByTime(250));

                expect(onOpenChange).not.toHaveBeenCalled();
            });
        });

        describe('pinch', () => {
            const touches = (spread: number) => [
                { clientX: 195 - spread / 2, clientY: 300 },
                { clientX: 195 + spread / 2, clientY: 300 },
            ];
            const touch = (type: string, spread: number) => {
                const event = new Event(type, { bubbles: true, cancelable: true });
                Object.defineProperty(event, 'touches', { value: touches(spread) });
                scroller().dispatchEvent(event);
                return event;
            };

            it('steps the columns down on a spread and up on a pinch, one step per third', () => {
                const onColumnsChange = jest.fn();
                const { rerender } = render(<PhotoGridSheet {...base({ columns: 3, onColumnsChange })} />);

                touch('touchstart', 100);
                const move = touch('touchmove', 140);
                expect(onColumnsChange).toHaveBeenLastCalledWith(2);
                // The page must not zoom or scroll under the grid's own gesture.
                expect(move.defaultPrevented).toBe(true);

                rerender(<PhotoGridSheet {...base({ columns: 2, onColumnsChange })} />);
                touch('touchend', 0);
                touch('touchstart', 200);
                touch('touchmove', 200 / 1.3 / 1.3 - 1);
                expect(onColumnsChange).toHaveBeenLastCalledWith(4);
            });

            it('leaves the columns alone without a handler, and lets the browser have the gesture', () => {
                render(<PhotoGridSheet {...base({ columns: 3 })} />);

                touch('touchstart', 100);
                expect(touch('touchmove', 200).defaultPrevented).toBe(false);
            });

            it('keeps the photo under the fingers in place when the columns change', () => {
                const { rerender } = render(
                    <PhotoGridSheet
                        {...base({ count: 3000, photoAt: () => undefined, columns: 3, onColumnsChange: jest.fn() })}
                    />
                );
                let top = ROW * 10;
                Object.defineProperty(scroller(), 'scrollTop', {
                    configurable: true,
                    get: () => top,
                    set: (value: number) => (top = value),
                });

                touch('touchstart', 100);
                touch('touchmove', 140);
                rerender(
                    <PhotoGridSheet
                        {...base({ count: 3000, photoAt: () => undefined, columns: 2, onColumnsChange: jest.fn() })}
                    />
                );

                // The rule itself is `anchoredScrollTop`'s, tested apart; here, that the grid applies it.
                const expected = anchoredScrollTop({
                    scrollTop: ROW * 10,
                    anchorY: 300,
                    anchorX: 195,
                    offsetTop: 0,
                    before: gridMetrics({ width: 390, columns: 3, cells: 3000 }),
                    after: gridMetrics({ width: 390, columns: 2, cells: 3000 }),
                });
                expect(top).toBeCloseTo(expected, 3);
                expect(top).not.toBeCloseTo(ROW * 10, 0);
            });
        });
    });
});

describe('GridScrubber', () => {
    // The photo grid's footer lies over the scroller's bottom; a handle dragged under it is lost.
    it('runs its track above what covers the scroller’s bottom, and still reaches the end', () => {
        scrollHeight = VIEW_HEIGHT * 20;
        const scroller = document.createElement('div');
        let top = 0;
        Object.defineProperty(scroller, 'scrollTop', {
            configurable: true,
            get: () => top,
            set: (value: number) => (top = value),
        });
        render(
            <div>
                <GridScrubber scroller={scroller} contentHeight={scrollHeight} insetBottom={100} />
            </div>
        );
        act(() => {
            scroller.dispatchEvent(new Event('scroll'));
        });

        const track = screen.getByTestId('photo-grid-scrubber');
        expect(track).toHaveStyle({ bottom: '108px' });

        const handle = track.firstElementChild as HTMLElement;
        const pointer = (type: string, clientY: number) => {
            const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientY });
            Object.defineProperty(event, 'pointerId', { value: 3 });
            fireEvent(handle, event);
        };
        // The track is 600 - 100 - 16 tall and the handle 48: its full travel is the end of the content.
        pointer('pointerdown', 0);
        pointer('pointermove', 600 - 100 - 16 - 48);
        pointer('pointerup', 600 - 100 - 16 - 48);

        expect(top).toBe(VIEW_HEIGHT * 20 - VIEW_HEIGHT);
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
                {...grid([...photos(1), clip])}
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
                {...grid(photos(1))}
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

describe('PreviewImage', () => {
    const skeleton = (container: HTMLElement) => container.querySelector('[data-testid="preview-skeleton"]');

    it('pulses a skeleton until the image has decoded, then fades it out as the image fades in', () => {
        const { container } = render(<PreviewImage src="data:image/jpeg;base64,AA" />);
        const img = container.querySelector('img') as HTMLImageElement;

        expect(skeleton(container)).toHaveClass('motion-safe:animate-pulse');
        expect(skeleton(container)).toHaveAttribute('data-loaded', 'false');
        expect(img).toHaveClass('opacity-0');

        fireEvent.load(img);

        expect(skeleton(container)).toHaveClass('opacity-0');
        expect(skeleton(container)).not.toHaveClass('motion-safe:animate-pulse');
        expect(img).toHaveClass('opacity-100');
    });

    // A pinch to fewer columns hands the same tile a sharper copy: it must not blink back to a skeleton.
    it('keeps showing the image when the tile is handed a sharper copy of the same photo', () => {
        const { container, rerender } = render(<PreviewImage src="data:small" />);
        fireEvent.load(container.querySelector('img') as HTMLImageElement);

        rerender(<PreviewImage src="data:large" />);

        expect(skeleton(container)).toHaveAttribute('data-loaded', 'true');
        expect(container.querySelector('img')).toHaveClass('opacity-100');
    });

    it('stops pulsing when the preview fails to decode', () => {
        const { container } = render(<PreviewImage src="data:broken" />);

        fireEvent.error(container.querySelector('img') as HTMLImageElement);

        expect(skeleton(container)).not.toHaveClass('motion-safe:animate-pulse');
    });

    // A tile scrolled back into view over a preview the browser already holds decoded.
    it('shows an image the browser already holds at once, without the skeleton or the fade', () => {
        jest.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
        jest.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(368);

        const { container } = render(<PreviewImage src="data:cached" />);

        expect(skeleton(container)).toHaveAttribute('data-loaded', 'true');
        expect(container.querySelector('img')).toHaveClass('opacity-100');
        expect(container.querySelector('img')).not.toHaveClass('duration-300');
    });

    it('draws nothing, and no skeleton, for an item that has no preview', () => {
        const { container } = render(<PreviewImage src="" />);

        expect(container).toBeEmptyDOMElement();
    });

    it('turns the fades off for someone who asked for less motion', () => {
        const { container } = render(<PreviewImage src="data:a" />);

        expect(skeleton(container)).toHaveClass('motion-reduce:transition-none');
        expect(container.querySelector('img')).toHaveClass('motion-reduce:transition-none');
    });
});
