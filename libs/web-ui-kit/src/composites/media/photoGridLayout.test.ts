import {
    anchoredScrollTop,
    cellPosition,
    clampColumns,
    gridMetrics,
    pinchColumns,
    scrollTopForScrubber,
    scrubberOffset,
    showsScrubber,
    thumbPixelSize,
    visibleCells,
} from './photoGridLayout';

// 404 wide keeps the numbers whole: three columns are 132-px tiles on a 136 pitch, two are 200 on 204.
const three = gridMetrics({ width: 404, columns: 3, cells: 100 });
const two = gridMetrics({ width: 404, columns: 2, cells: 100 });

describe('gridMetrics', () => {
    it('splits the width into square tiles with the gap between them', () => {
        expect(three).toEqual({ columns: 3, tile: 132, rowHeight: 136, rows: 34, height: 34 * 136 - 4 });
        expect(two).toEqual({ columns: 2, tile: 200, rowHeight: 204, rows: 50, height: 50 * 204 - 4 });
    });

    it('is empty with no cells', () => {
        expect(gridMetrics({ width: 404, columns: 3, cells: 0 })).toMatchObject({ rows: 0, height: 0 });
    });
});

describe('cellPosition', () => {
    it('places cells row by row', () => {
        expect(cellPosition(0, three)).toEqual({ top: 0, left: 0 });
        expect(cellPosition(4, three)).toEqual({ top: 136, left: 136 });
        expect(cellPosition(5, two)).toEqual({ top: 408, left: 204 });
    });
});

describe('visibleCells', () => {
    it('covers the rows on screen and the overscan either side, in whole rows', () => {
        // Rows 10–14 are on screen at 1360 with a 600 viewport; two rows of overscan: rows 8–16.
        expect(
            visibleCells({
                scrollTop: 1360,
                viewportHeight: 600,
                offsetTop: 0,
                metrics: three,
                cells: 100,
                overscan: 2,
            })
        ).toEqual({ start: 24, end: 51 });
    });

    it('counts from where the grid starts below a notice', () => {
        expect(
            visibleCells({ scrollTop: 0, viewportHeight: 136, offsetTop: 136, metrics: three, cells: 100, overscan: 0 })
        ).toEqual({ start: 0, end: 0 });
    });

    it('stops at the last cell', () => {
        expect(
            visibleCells({
                scrollTop: 4400,
                viewportHeight: 600,
                offsetTop: 0,
                metrics: three,
                cells: 100,
                overscan: 4,
            })
        ).toEqual({ start: 84, end: 100 }); // row 32 on screen, four above: row 28
    });

    it('renders nothing for an empty grid', () => {
        const empty = gridMetrics({ width: 404, columns: 3, cells: 0 });
        expect(visibleCells({ scrollTop: 0, viewportHeight: 600, offsetTop: 0, metrics: empty, cells: 0 })).toEqual({
            start: 0,
            end: 0,
        });
    });
});

describe('thumbPixelSize', () => {
    it('asks for the device pixels of a tile, rounded up to 16', () => {
        expect(thumbPixelSize(132, 3)).toBe(400);
        expect(thumbPixelSize(200, 3)).toBe(608);
        expect(thumbPixelSize(132, 1)).toBe(144);
    });

    it('treats an unknown pixel ratio as 1 and never asks for nothing', () => {
        expect(thumbPixelSize(132, Number.NaN)).toBe(144);
        expect(thumbPixelSize(0, 3)).toBe(16);
    });
});

describe('clampColumns / pinchColumns', () => {
    it('keeps the columns between two and five, and falls back to three', () => {
        expect(clampColumns(1)).toBe(2);
        expect(clampColumns(9)).toBe(5);
        expect(clampColumns(Number.NaN)).toBe(3);
    });

    it('takes one column away per 1.3 of spread and adds one per 1.3 of pinch', () => {
        expect(pinchColumns(3, 1.29)).toBe(3);
        expect(pinchColumns(3, 1.31)).toBe(2);
        expect(pinchColumns(3, 1 / 1.31)).toBe(4);
        expect(pinchColumns(3, 1 / (1.31 * 1.31))).toBe(5);
    });

    it('stops at the ends and ignores a nonsense scale', () => {
        expect(pinchColumns(2, 3)).toBe(2);
        expect(pinchColumns(5, 0.1)).toBe(5);
        expect(pinchColumns(4, 0)).toBe(4);
    });
});

describe('anchoredScrollTop', () => {
    it('keeps the cell under the fingers at the same height when the columns change', () => {
        // Scrolled to row 10 of three (1360); fingers 68 px down, in the middle column: cell 31, half
        // way down its row. Two columns put cell 31 in row 15 (3060); half a row down, minus the 68.
        expect(
            anchoredScrollTop({ scrollTop: 1360, anchorY: 68, anchorX: 200, offsetTop: 0, before: three, after: two })
        ).toBe(3060 + 102 - 68);
    });

    it('accounts for a notice above the grid', () => {
        expect(
            anchoredScrollTop({ scrollTop: 1460, anchorY: 68, anchorX: 200, offsetTop: 100, before: three, after: two })
        ).toBe(100 + 3060 + 102 - 68);
    });

    it('never scrolls above the top, and leaves a point above the grid alone', () => {
        expect(
            anchoredScrollTop({ scrollTop: 0, anchorY: 10, anchorX: 0, offsetTop: 0, before: two, after: three })
        ).toBe(0);
        expect(
            anchoredScrollTop({ scrollTop: 0, anchorY: 10, anchorX: 0, offsetTop: 100, before: three, after: two })
        ).toBe(0);
    });
});

describe('scrubber', () => {
    const track = { scrollHeight: 6000, viewportHeight: 600, track: 584, handle: 48 };

    it('places the handle at the scroll position’s share of the track, and back', () => {
        expect(scrubberOffset({ ...track, scrollTop: 0 })).toBe(0);
        expect(scrubberOffset({ ...track, scrollTop: 2700 })).toBe(268);
        expect(scrubberOffset({ ...track, scrollTop: 5400 })).toBe(536);
        expect(scrollTopForScrubber({ ...track, offset: 268 })).toBe(2700);
    });

    it('clamps a drag past either end', () => {
        expect(scrollTopForScrubber({ ...track, offset: -20 })).toBe(0);
        expect(scrollTopForScrubber({ ...track, offset: 900 })).toBe(5400);
    });

    it('shows only for content longer than three screens', () => {
        expect(showsScrubber(1800, 600)).toBe(false);
        expect(showsScrubber(1801, 600)).toBe(true);
        expect(showsScrubber(5000, 0)).toBe(false);
    });
});
