import * as React from 'react';

export interface IconBoltSolidProps extends Omit<React.SVGProps<SVGSVGElement>, 'width' | 'height'> {
    /** Rendered width/height in pixels (square). */
    size?: number;
}

/**
 * Solid lightning bolt — the PRO tier glyph. Exported from the Figma "Bold / Essentional, UI /
 * Bolt" instance the subscription badge carries (node `2676:25776` inside `2870:20411`), replacing
 * the lucide `Zap` stand-in: the design's bolt is a filled shape with a different silhouette, which
 * is what made the badge read as "almost right".
 *
 * The `viewBox` is the icon's own 16×16 frame; the glyph sits inset 8.33% vertically / 16.67%
 * horizontally inside it, so the path is translated instead of rescaled. Fills with `currentColor`.
 */
export const IconBoltSolid = ({ size = 16, className, ...props }: IconBoltSolidProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
        {...props}
    >
        <g transform="translate(2.6667 1.3333)">
            <path
                d="M1.11302 5.27624L3.15444 2.51422C4.47402 0.72885 5.13381 -0.163834 5.74938 0.0248089C6.36495 0.213452 6.36495 1.30833 6.36495 3.49808V3.70455C6.36495 4.49434 6.36495 4.88924 6.61731 5.13694L6.63067 5.14977C6.88847 5.39224 7.29948 5.39224 8.12149 5.39224C9.60074 5.39224 10.3404 5.39224 10.5903 5.84087C10.5945 5.8483 10.5985 5.85579 10.6024 5.86333C10.8384 6.31891 10.4101 6.89831 9.55363 8.05712L7.5122 10.8191C6.1926 12.6045 5.5328 13.4972 4.91723 13.3085C4.30165 13.1199 4.30167 12.025 4.3017 9.83521L4.3017 9.62883C4.30171 8.83903 4.30172 8.44412 4.04936 8.19642L4.03601 8.18359C3.7782 7.94111 3.36719 7.94111 2.54517 7.94111C1.06592 7.94111 0.326298 7.94111 0.0763311 7.49249C0.0721924 7.48506 0.068169 7.47757 0.0642621 7.47003C-0.171706 7.01446 0.256535 6.43505 1.11302 5.27624Z"
                fill="currentColor"
            />
        </g>
    </svg>
);
