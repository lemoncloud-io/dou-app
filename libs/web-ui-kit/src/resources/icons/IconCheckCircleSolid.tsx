import * as React from 'react';

export interface IconCheckCircleSolidProps extends Omit<React.SVGProps<SVGSVGElement>, 'width' | 'height'> {
    /** Rendered width/height in pixels (glyph is square). */
    size?: number;
}

/**
 * Filled check disc — the "currently connected" mark on the cloud-switcher rows (Figma 3477-23611).
 * The disc takes `currentColor` (callers pass `text-primary`, which resolves to the lime #b0ea10)
 * and the tick is always white, matching the design in both light and dark themes.
 *
 * Replaces the disc-plus-lucide-`Check` combination that DouHomeItem and CloudItem each hand-rolled.
 */
export const IconCheckCircleSolid = ({ size = 28, className, ...props }: IconCheckCircleSolidProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 28 28"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
        {...props}
    >
        <circle cx="14" cy="14" r="14" fill="currentColor" />
        <path
            d="M8.5 14.5L12.3 18L19.5 10.5"
            className="stroke-white"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);
