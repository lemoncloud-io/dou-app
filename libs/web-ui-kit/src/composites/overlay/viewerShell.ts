import type * as React from 'react';

export const VIEWER_MOTION = [
    'duration-300 data-[state=open]:duration-300 data-[state=closed]:duration-300',
    '[animation-timing-function:cubic-bezier(0.32,0.72,0,1)] [transition-timing-function:cubic-bezier(0.32,0.72,0,1)]',
    'motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none motion-reduce:transition-none',
].join(' ');

export const isOwnEvent = (event: React.SyntheticEvent) => event.currentTarget.contains(event.target as Node);

export const DRAG_SLOP_PX = 8;
export const SWIPE_MIN_PX = 48;
export const FLICK_MAX_MS = 300;
export const FLICK_MIN_PX = 24;
export const EDGE_RESISTANCE = 0.3;

export const pagerDragOffset = (dx: number, hasPrevious: boolean, hasNext: boolean): number => {
    const pastEdge = (dx > 0 && !hasPrevious) || (dx < 0 && !hasNext);
    return pastEdge ? dx * EDGE_RESISTANCE : dx;
};

export const pagerReleaseStep = (dx: number, elapsedMs: number, width: number): -1 | 0 | 1 => {
    const far = Math.abs(dx) >= Math.max(SWIPE_MIN_PX, width * 0.2);
    const flick = elapsedMs <= FLICK_MAX_MS && Math.abs(dx) >= FLICK_MIN_PX;
    if (!far && !flick) return 0;
    return dx < 0 ? 1 : -1;
};
