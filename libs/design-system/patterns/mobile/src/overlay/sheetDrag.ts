export const DISMISS_DISTANCE_RATIO = 0.25;

export const DISMISS_VELOCITY_PX_PER_MS = 0.5;

export const DRAG_SLOP_PX = 8;

export const isPastDragSlop = (dy: number): boolean => dy > DRAG_SLOP_PX;

export const canStartDrag = (scrollTop: number): boolean => scrollTop <= 0;

export const clampDragOffset = (dy: number): number => (dy > 0 ? dy : 0);

export interface DragRelease {
    offset: number;
    elapsedMs: number;
    travelPx: number;
    panelHeight: number;
}

export const shouldDismissOnRelease = ({ offset, elapsedMs, travelPx, panelHeight }: DragRelease): boolean => {
    if (offset <= 0) return false;

    if (panelHeight > 0 && offset >= panelHeight * DISMISS_DISTANCE_RATIO) return true;

    const velocity = elapsedMs > 0 ? travelPx / elapsedMs : 0;
    return velocity >= DISMISS_VELOCITY_PX_PER_MS;
};
