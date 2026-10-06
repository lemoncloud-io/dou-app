/**
 * The photo grid's geometry, apart from the DOM so it can be tested: where a cell sits, which cells a
 * scroll position shows, how a pinch maps to a column count, where the scroll goes when the columns
 * change, and where the fast-scroll handle sits.
 *
 * Cells are counted with the camera tile included: cell 0 is the camera when there is one, and photo
 * `i` is cell `i + 1`. Rows are laid out top to bottom, `columns` cells each, `gap` apart both ways.
 */

/** The column counts a pinch steps through. Three is the design's. */
export const MIN_COLUMNS = 2;
export const MAX_COLUMNS = 5;
export const DEFAULT_COLUMNS = 3;

/** The space between tiles, in CSS pixels (the design's 4px). */
export const GRID_GAP = 4;

/** Rows rendered above and below the viewport, so a fling does not outrun the tiles. */
export const OVERSCAN_ROWS = 4;

/**
 * How far a pinch has to spread (or close) for each column step. A ratio rather than a distance so a
 * small hand and a large one take the same effort; 1.3 is about a third of the starting spread.
 */
export const PINCH_STEP_RATIO = 1.3;

/** A preview is asked for at a multiple of this many pixels, so a few pixels of width do not refetch. */
const THUMB_SIZE_STEP = 16;

export const clampColumns = (columns: number): number =>
    Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, Math.round(Number.isFinite(columns) ? columns : DEFAULT_COLUMNS)));

export interface GridMetrics {
    columns: number;
    /** A tile's side, in CSS pixels. */
    tile: number;
    /** One row's pitch: a tile and the gap below it. */
    rowHeight: number;
    rows: number;
    /** The grid's full height, without a trailing gap. */
    height: number;
}

export const gridMetrics = ({
    width,
    columns,
    cells,
    gap = GRID_GAP,
}: {
    width: number;
    columns: number;
    cells: number;
    gap?: number;
}): GridMetrics => {
    const tile = Math.max(0, (width - gap * (columns - 1)) / columns);
    const rowHeight = tile + gap;
    const rows = Math.ceil(Math.max(0, cells) / columns);
    return { columns, tile, rowHeight, rows, height: rows > 0 ? rows * rowHeight - gap : 0 };
};

/** Where cell `index` is drawn, relative to the grid's top-left. */
export const cellPosition = (index: number, metrics: GridMetrics, gap = GRID_GAP): { top: number; left: number } => ({
    top: Math.floor(index / metrics.columns) * metrics.rowHeight,
    left: (index % metrics.columns) * (metrics.tile + gap),
});

/**
 * The cells to render for a viewport: `[start, end)`, whole rows, `overscan` rows either side.
 * `offsetTop` is how far down the scrolled content the grid starts (anything above it, like a notice).
 */
export const visibleCells = ({
    scrollTop,
    viewportHeight,
    offsetTop,
    metrics,
    cells,
    overscan = OVERSCAN_ROWS,
}: {
    scrollTop: number;
    viewportHeight: number;
    offsetTop: number;
    metrics: GridMetrics;
    cells: number;
    overscan?: number;
}): { start: number; end: number } => {
    if (cells <= 0 || metrics.rowHeight <= 0) return { start: 0, end: 0 };
    const top = scrollTop - offsetTop;
    const firstRow = Math.max(0, Math.floor(top / metrics.rowHeight) - overscan);
    const lastRow = Math.min(metrics.rows, Math.ceil((top + viewportHeight) / metrics.rowHeight) + overscan);
    return {
        start: Math.min(cells, firstRow * metrics.columns),
        end: Math.min(cells, Math.max(firstRow, lastRow) * metrics.columns),
    };
};

/** The pixel size to ask previews at: the tile's device pixels, rounded up to a step. */
export const thumbPixelSize = (tile: number, devicePixelRatio: number): number => {
    const pixels = tile * (Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1);
    return Math.max(THUMB_SIZE_STEP, Math.ceil(pixels / THUMB_SIZE_STEP) * THUMB_SIZE_STEP);
};

/**
 * The column count a pinch has reached: one step per `PINCH_STEP_RATIO` of spread, spreading fingers
 * apart making tiles larger (fewer columns), pinching in the reverse.
 */
export const pinchColumns = (startColumns: number, scale: number): number => {
    if (!Number.isFinite(scale) || scale <= 0) return clampColumns(startColumns);
    const steps = Math.trunc(Math.log(scale) / Math.log(PINCH_STEP_RATIO));
    return clampColumns(startColumns - steps);
};

/**
 * The scroll position that keeps the point under `anchorY` (a viewport y, from the scroller's top) on
 * the same cell after the columns change: the cell under it before is found, and the scroll is set so
 * that cell's row lands at the same height, at the same fraction of its row. Without it a column change
 * re-flows every cell and the photo under the fingers jumps away — to the top, at the extreme.
 */
export const anchoredScrollTop = ({
    scrollTop,
    anchorY,
    anchorX,
    offsetTop,
    before,
    after,
}: {
    scrollTop: number;
    anchorY: number;
    /** The x of the anchor within the grid, to pick the cell in its row. */
    anchorX: number;
    offsetTop: number;
    before: GridMetrics;
    after: GridMetrics;
}): number => {
    if (before.rowHeight <= 0 || after.rowHeight <= 0) return scrollTop;
    const contentY = scrollTop + anchorY - offsetTop;
    if (contentY < 0) return scrollTop;
    const row = Math.floor(contentY / before.rowHeight);
    const fraction = (contentY - row * before.rowHeight) / before.rowHeight;
    // Tiles are square, so the horizontal pitch is the row pitch.
    const column = Math.min(before.columns - 1, Math.max(0, Math.floor(anchorX / before.rowHeight)));
    const cell = row * before.columns + column;
    const newRow = Math.floor(cell / after.columns);
    const target = offsetTop + newRow * after.rowHeight + fraction * after.rowHeight - anchorY;
    return Math.max(0, target);
};

/** Where the fast-scroll handle's top sits for a scroll position, along a track of `track` pixels. */
export const scrubberOffset = ({
    scrollTop,
    scrollHeight,
    viewportHeight,
    track,
    handle,
}: {
    scrollTop: number;
    scrollHeight: number;
    viewportHeight: number;
    track: number;
    handle: number;
}): number => {
    const range = scrollHeight - viewportHeight;
    const travel = track - handle;
    if (range <= 0 || travel <= 0) return 0;
    return Math.min(travel, Math.max(0, (scrollTop / range) * travel));
};

/** The scroll position a handle dragged to `offset` along the track stands for — `scrubberOffset`'s inverse. */
export const scrollTopForScrubber = ({
    offset,
    scrollHeight,
    viewportHeight,
    track,
    handle,
}: {
    offset: number;
    scrollHeight: number;
    viewportHeight: number;
    track: number;
    handle: number;
}): number => {
    const range = scrollHeight - viewportHeight;
    const travel = track - handle;
    if (range <= 0 || travel <= 0) return 0;
    return Math.min(range, Math.max(0, (offset / travel) * range));
};

/**
 * Whether the content is long enough to earn a fast-scroll handle: three screens. Below that a flick
 * covers it, and a handle would only crowd the right-hand column of tiles.
 */
export const showsScrubber = (scrollHeight: number, viewportHeight: number): boolean =>
    viewportHeight > 0 && scrollHeight > viewportHeight * 3;
