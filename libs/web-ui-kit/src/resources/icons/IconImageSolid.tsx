import * as React from 'react';

export interface IconImageSolidProps extends Omit<React.SVGProps<SVGSVGElement>, 'width' | 'height'> {
    /** Rendered width/height in pixels (square). */
    size?: number;
}

/**
 * Solid picture-placeholder avatar — a filled disc with a sun-and-ridge photo
 * motif knocked out of it, so whatever surface sits behind shows through the
 * motif. Extracted from the Figma place-thumbnail placeholder (node 3073:10971)
 * rather than reusing the lucide outline `Image`, so the invite place card matches
 * the design exactly. Fills with `currentColor`.
 *
 * Unlike most icons here this glyph *includes* its own disc, so callers render it
 * alone rather than inside a coloured circle wrapper.
 *
 * The same shape already ships as the fixed-colour asset
 * `resources/assets/default-place-avatar.svg` (86px, `#102346` baked in) which
 * `CreatePlaceDialog` uses as an upload default. That one cannot take
 * `currentColor` and so cannot follow the theme; this component exists for
 * surfaces that need it themeable.
 */
export const IconImageSolid = ({ size = 40, className, ...props }: IconImageSolidProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
        {...props}
    >
        <path
            d="M29.3023 14.4186C29.3023 16.4736 27.6364 18.1395 25.5814 18.1395C23.5264 18.1395 21.8605 16.4736 21.8605 14.4186C21.8605 12.3636 23.5264 10.6977 25.5814 10.6977C27.6364 10.6977 29.3023 12.3636 29.3023 14.4186Z"
            fill="currentColor"
        />
        {/* Disc + ridge in one `evenodd` path: the second subpath is the knocked-out area. */}
        <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M20 0C8.95431 0 0 8.95431 0 20C0 31.0457 8.95431 40 20 40C31.0457 40 40 31.0457 40 20C40 8.95431 31.0457 0 20 0ZM18.4785 26.2546L10.4976 18.2737C8.9047 16.6807 6.3495 16.5956 4.65411 18.0791L2.79257 19.7438C2.92956 10.3575 10.5811 2.7907 20 2.7907C29.5044 2.7907 37.2093 10.4956 37.2093 20C37.2093 23.6365 36.0814 27.0095 34.1564 29.7883L30.7469 26.6957C28.8129 24.9551 25.9327 24.7818 23.8039 26.2779L23.2491 26.6678C21.7698 27.7075 19.7571 27.5331 18.4785 26.2546Z"
            fill="currentColor"
        />
    </svg>
);
