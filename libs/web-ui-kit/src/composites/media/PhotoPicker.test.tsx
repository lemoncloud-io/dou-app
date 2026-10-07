import { act, fireEvent, render, screen, within } from '@testing-library/react';

import { AlbumList } from './AlbumList';
import { PhotoGridSheet, type PhotoGridSheetProps } from './PhotoGridSheet';
import { PhotoGridTile } from './PhotoGridTile';
import { PreviewImage } from './PreviewImage';
import { RecentPhotoStrip } from './RecentPhotoStrip';
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
