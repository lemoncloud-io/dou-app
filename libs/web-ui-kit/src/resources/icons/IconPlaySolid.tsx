import * as React from 'react';

export interface IconPlaySolidProps extends Omit<React.SVGProps<SVGSVGElement>, 'width' | 'height'> {
    /** Rendered width/height in pixels (square). */
    size?: number;
}

/**
 * Solid play triangle — the mark a chat video tile carries at its centre, and the one that tells a
 * poster frame apart from a photo. Only the triangle: the disc behind it belongs to the tile, so the
 * same glyph also sits on a bare surface.
 *
 * The triangle is nudged right of the frame's centre on purpose: a triangle centred by its box looks
 * left-heavy, and the eye centres it by its mass instead.
 *
 * Fills with `currentColor` so the caller colours it.
 */
export const IconPlaySolid = ({ size = 24, className, ...props }: IconPlaySolidProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
        {...props}
    >
        <path
            d="M8 6.27C8 5.5 8.83 5.02 9.5 5.4L18.66 10.73C19.33 11.12 19.33 12.08 18.66 12.46L9.5 17.8C8.83 18.18 8 17.7 8 16.93V6.27Z"
            fill="currentColor"
        />
    </svg>
);
