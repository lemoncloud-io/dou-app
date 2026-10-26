import * as React from 'react';

import { cn } from '@chatic/lib/utils';

export interface AvatarFrameProps {
    /** Diameter in pixels — the outer edge, stroke included. */
    px: number;
    /**
     * Colour of the 1px stroke (a `border-*` class), or `null` for a frame with no stroke.
     * Defaults to `border-avatar-stroke`, the Figma "1-person Profile" stroke.
     */
    stroke?: string | null;
    /** Fill/text classes for the disc, plus any host classes (opacity, an outer `ring-*`). */
    className?: string;
    children?: React.ReactNode;
}

/**
 * The circle every avatar is drawn in. Figma draws an avatar's stroke as an *inside* stroke painted
 * over the content, so the photo or glyph keeps the full diameter and the stroke covers its
 * outermost pixel. A CSS `border` on the clipping box would instead shrink the content by 2px and
 * lay the stroke beside it, so the stroke here is a separate layer on top of the clipped content.
 *
 * The layers share one grid cell rather than being absolutely positioned, so the frame stays
 * unpositioned: a positioned avatar would paint over static siblings it overlaps, such as the
 * "+N" chip at the end of a thread's face stack. Grid items paint in tree order, which puts the
 * stroke, the last child, on top.
 *
 * An outer `ring-*` from the host (an overlapping stack punching a gap) still works: it is a
 * box-shadow on this element, which its own `overflow-hidden` does not clip.
 */
export const AvatarFrame = ({ px, stroke = 'border-avatar-stroke', className, children }: AvatarFrameProps) => (
    <span
        className={cn(
            'inline-grid shrink-0 place-items-center overflow-hidden rounded-full [&>*]:col-start-1 [&>*]:row-start-1',
            className
        )}
        style={{ width: px, height: px }}
    >
        {children}
        {stroke && (
            <span
                aria-hidden="true"
                data-avatar-stroke=""
                className={cn('pointer-events-none size-full rounded-full border', stroke)}
            />
        )}
    </span>
);
