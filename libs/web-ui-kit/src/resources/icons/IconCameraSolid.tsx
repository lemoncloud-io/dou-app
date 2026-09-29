import * as React from 'react';

export interface IconCameraSolidProps extends Omit<React.SVGProps<SVGSVGElement>, 'width' | 'height'> {
    /** Rendered width/height in pixels (square). */
    size?: number;
}

/**
 * Solid camera glyph — the "camera" action in the chat attach menu. Exported from the Figma
 * "Bold / Video, Audio, Sound / Camera" instance the attach menu carries (node `3749:28919` inside
 * `3749:27536`): a filled body with the lens cut out, plus a small flash pill top-right.
 *
 * The `viewBox` is the icon's own 32×32 frame. Fills with `currentColor` so the tile colours it.
 */
export const IconCameraSolid = ({ size = 32, className, ...props }: IconCameraSolidProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
        {...props}
    >
        <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M13.037 28H18.963C23.1243 28 25.205 28 26.6997 27.0195C27.3467 26.595 27.9023 26.0495 28.3346 25.4142C29.3333 23.9467 29.3333 21.9039 29.3333 17.8182C29.3333 13.7325 29.3333 11.6896 28.3346 10.2221C27.9023 9.58685 27.3467 9.04139 26.6997 8.6169C25.7393 7.98685 24.5369 7.76164 22.696 7.68114C21.8175 7.68114 21.0612 7.02757 20.8889 6.18182C20.6305 4.91318 19.4959 4 18.1782 4H13.8218C12.5041 4 11.3695 4.91318 11.1111 6.18182C10.9388 7.02757 10.1825 7.68114 9.30399 7.68114C7.46311 7.76164 6.26074 7.98685 5.30032 8.6169C4.65327 9.04139 4.09771 9.58685 3.66537 10.2221C2.66667 11.6896 2.66667 13.7325 2.66667 17.8182C2.66667 21.9039 2.66667 23.9467 3.66537 25.4142C4.09771 26.0495 4.65327 26.595 5.30032 27.0195C6.79498 28 8.87567 28 13.037 28ZM16 12.3636C12.9318 12.3636 10.4444 14.8057 10.4444 17.8182C10.4444 20.8306 12.9318 23.2727 16 23.2727C19.0682 23.2727 21.5556 20.8306 21.5556 17.8182C21.5556 14.8057 19.0682 12.3636 16 12.3636ZM16 14.5455C14.1591 14.5455 12.6667 16.0107 12.6667 17.8182C12.6667 19.6257 14.1591 21.0909 16 21.0909C17.8409 21.0909 19.3333 19.6257 19.3333 17.8182C19.3333 16.0107 17.8409 14.5455 16 14.5455ZM22.2963 13.4545C22.2963 12.8521 22.7938 12.3636 23.4074 12.3636H24.8889C25.5025 12.3636 26 12.8521 26 13.4545C26 14.057 25.5025 14.5455 24.8889 14.5455H23.4074C22.7938 14.5455 22.2963 14.057 22.2963 13.4545Z"
            fill="currentColor"
        />
    </svg>
);
