import * as React from 'react';

export interface IconPauseSolidProps extends Omit<React.SVGProps<SVGSVGElement>, 'width' | 'height'> {
    /** Rendered width/height in pixels (square). */
    size?: number;
}

/**
 * Solid pause mark — two rounded bars, the companion of `IconPlaySolid` on an audio player's button
 * (Figma "아이콘 · 일시정지", 6040:20719). Fills with `currentColor` so the caller colours it.
 */
export const IconPauseSolid = ({ size = 20, className, ...props }: IconPauseSolidProps) => (
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
        <rect x="5" y="4" width="4" height="12" rx="1" fill="currentColor" />
        <rect x="11" y="4" width="4" height="12" rx="1" fill="currentColor" />
    </svg>
);
