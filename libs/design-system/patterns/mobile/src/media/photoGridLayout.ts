export const MIN_COLUMNS = 2;
export const MAX_COLUMNS = 5;
export const DEFAULT_COLUMNS = 3;

export const GRID_GAP = 4;

export const OVERSCAN_ROWS = 4;

export const PINCH_STEP_RATIO = 1.3;

const THUMB_SIZE_STEP = 16;

export const clampColumns = (columns: number): number =>
    Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, Math.round(Number.isFinite(columns) ? columns : DEFAULT_COLUMNS)));

export interface GridMetrics {
    columns: number;
    tile: number;
    rowHeight: number;
    rows: number;
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

export const cellPosition = (index: number, metrics: GridMetrics, gap = GRID_GAP): { top: number; left: number } => ({
    top: Math.floor(index / metrics.columns) * metrics.rowHeight,
    left: (index % metrics.columns) * (metrics.tile + gap),
});

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

export const thumbPixelSize = (tile: number, devicePixelRatio: number): number => {
    const pixels = tile * (Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1);
    return Math.max(THUMB_SIZE_STEP, Math.ceil(pixels / THUMB_SIZE_STEP) * THUMB_SIZE_STEP);
};

export const pinchColumns = (startColumns: number, scale: number): number => {
    if (!Number.isFinite(scale) || scale <= 0) return clampColumns(startColumns);
    const steps = Math.trunc(Math.log(scale) / Math.log(PINCH_STEP_RATIO));
    return clampColumns(startColumns - steps);
};

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
    const column = Math.min(before.columns - 1, Math.max(0, Math.floor(anchorX / before.rowHeight)));
    const cell = row * before.columns + column;
    const newRow = Math.floor(cell / after.columns);
    const target = offsetTop + newRow * after.rowHeight + fraction * after.rowHeight - anchorY;
    return Math.max(0, target);
};

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

export const showsScrubber = (scrollHeight: number, viewportHeight: number): boolean =>
    viewportHeight > 0 && scrollHeight > viewportHeight * 3;
