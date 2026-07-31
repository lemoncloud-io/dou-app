import * as React from 'react';

export interface IconUsersGroupProps extends Omit<React.SVGProps<SVGSVGElement>, 'width' | 'height'> {
    /** Rendered width/height in pixels (square). */
    size?: number;
}

/** One person = head circle + body ellipse. Figma keeps these as six separate shapes. */
const HEAD_CENTER =
    'M5.25 2.625C5.25 4.07475 4.07475 5.25 2.625 5.25C1.17525 5.25 0 4.07475 0 2.625C0 1.17525 1.17525 0 2.625 0C4.07475 0 5.25 1.17525 5.25 2.625Z';
const HEAD_SIDE =
    'M3.75 1.875C3.75 2.91053 2.91053 3.75 1.875 3.75C0.839466 3.75 0 2.91053 0 1.875C0 0.839466 0.839466 0 1.875 0C2.91053 0 3.75 0.839466 3.75 1.875Z';
const BODY_CENTER =
    'M9 2.625C9 4.07475 6.98528 5.25 4.5 5.25C2.01472 5.25 0 4.07475 0 2.625C0 1.17525 2.01472 0 4.5 0C6.98528 0 9 1.17525 9 2.625Z';
const BODY_SIDE =
    'M6 1.875C6 2.91053 4.65685 3.75 3 3.75C1.34315 3.75 0 2.91053 0 1.875C0 0.839466 1.34315 0 3 0C4.65685 0 6 0.839466 6 1.875Z';

/** Flanking pair opacity — what makes the glyph read as duotone rather than three equal people. */
const SIDE_OPACITY = '0.4';

/**
 * Duotone group glyph — one solid person flanked by two at 40% opacity. Extracted
 * from the Figma "Bold Duotone / Users / Users Group Two Rounded" instance (node
 * 3158:26141) rather than reusing the lucide outline `Users`, so the invite
 * "room friends" chip matches the design exactly. Fills with `currentColor`.
 *
 * Distinct from {@link IconGroup}, which is the three-equal-people group *avatar*
 * glyph (26×20.8) used as a channel placeholder. This one is a small inline label
 * icon.
 *
 * Figma composes the six shapes with inset percentages; they are re-expressed here
 * as translations inside a single 18×18 viewBox. The flanking shapes are laterally
 * symmetric, so Figma's `-scale-x-100` mirroring needs no transform of its own.
 */
export const IconUsersGroup = ({ size = 18, className, ...props }: IconUsersGroupProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 18 18"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
        {...props}
    >
        <g transform="translate(3.375 3.75)">
            <path opacity={SIDE_OPACITY} d={HEAD_SIDE} fill="currentColor" />
        </g>
        <g transform="translate(10.875 3.75)">
            <path opacity={SIDE_OPACITY} d={HEAD_SIDE} fill="currentColor" />
        </g>
        <g transform="translate(1.5 10.5)">
            <path opacity={SIDE_OPACITY} d={BODY_SIDE} fill="currentColor" />
        </g>
        <g transform="translate(10.5 10.5)">
            <path opacity={SIDE_OPACITY} d={BODY_SIDE} fill="currentColor" />
        </g>
        {/* Centre person last so it sits above the flanking pair, as in Figma. */}
        <g transform="translate(6.375 3)">
            <path d={HEAD_CENTER} fill="currentColor" />
        </g>
        <g transform="translate(4.5 9.75)">
            <path d={BODY_CENTER} fill="currentColor" />
        </g>
    </svg>
);
