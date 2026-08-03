import * as React from 'react';

export interface IconUserProps extends Omit<React.SVGProps<SVGSVGElement>, 'width' | 'height'> {
    /** Rendered width/height in pixels (square). */
    size?: number;
}

/**
 * The single-person glyph — a filled head + shoulders silhouette, extracted from the Figma
 * `1명 Profile` avatar (node 3185:13127). This is THE user glyph for avatars: the room avatar has
 * exactly two images, this and {@link IconGroup}, so there is no outline variant to choose between
 * (the lucide outline lives on as `IconUserOutline` for grey placeholder slots, which are a
 * different job).
 *
 * The `viewBox` (0 0 42 42) matches the avatar circle, so the glyph sits circle-relative when
 * rendered at the avatar's full size. Fills with `currentColor`, so callers set the color via
 * `className`/`color`.
 */
export const IconUser = ({ size = 24, className, ...props }: IconUserProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 42 42"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
        {...props}
    >
        <path
            d="M27.3 16.8C27.3 20.2794 24.4794 23.1 21 23.1C17.5206 23.1 14.7 20.2794 14.7 16.8C14.7 13.3206 17.5206 10.5 21 10.5C24.4794 10.5 27.3 13.3206 27.3 16.8Z"
            fill="currentColor"
        />
        <path
            d="M21 38.85C24.7465 38.85 28.2234 37.6958 31.0945 35.7235C32.3626 34.8524 32.9046 33.1931 32.1673 31.8428C30.6389 29.0435 27.4895 27.3 20.9999 27.3C14.5103 27.3 11.3609 29.0435 9.8325 31.8426C9.0952 33.1929 9.63711 34.8523 10.9052 35.7234C13.7764 37.6957 17.2534 38.85 21 38.85Z"
            fill="currentColor"
        />
    </svg>
);
