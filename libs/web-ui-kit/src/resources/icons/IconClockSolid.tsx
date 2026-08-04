import * as React from 'react';

export interface IconClockSolidProps extends Omit<React.SVGProps<SVGSVGElement>, 'width' | 'height'> {
    /** Rendered width/height in pixels (square). */
    size?: number;
}

/**
 * Duotone clock glyph — a filled disc at half opacity carrying solid hour/minute
 * hands. Extracted from the Figma "Bold Duotone / Time / Clock Circle" instance
 * (node 3073:10991) rather than reusing the lucide outline `Clock`, so the invite
 * link-validity card matches the design exactly. Fills with `currentColor`, so
 * callers set the color via `className`/`color`.
 *
 * The `viewBox` is the glyph's own 20×20 box; in Figma it sits inset 8.33% inside
 * a 24px frame, so rendering at `size={20}` next to 24px-frame siblings lines up.
 */
export const IconClockSolid = ({ size = 20, className, ...props }: IconClockSolidProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
        {...props}
    >
        <path
            opacity="0.5"
            d="M10 20C15.5228 20 20 15.5228 20 10C20 4.47715 15.5228 0 10 0C4.47715 0 0 4.47715 0 10C0 15.5228 4.47715 20 10 20Z"
            fill="currentColor"
        />
        {/* Hands: Figma places this 4×8 shape at (11.25, 7.25) of the 24px frame, i.e. (9.25, 5.25) once
            the frame's 2px inset is removed to give the 20×20 viewBox above. */}
        <g transform="translate(9.25 5.25)">
            <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M0.75 0C1.16421 0 1.5 0.335786 1.5 0.75V4.43934L3.78033 6.71967C4.07322 7.01256 4.07322 7.48744 3.78033 7.78033C3.48744 8.07322 3.01256 8.07322 2.71967 7.78033L0.21967 5.28033C0.079018 5.13968 0 4.94891 0 4.75V0.75C0 0.335786 0.335786 0 0.75 0Z"
                fill="currentColor"
            />
        </g>
    </svg>
);
