import * as React from 'react';

export interface IconFileSolidProps extends Omit<React.SVGProps<SVGSVGElement>, 'width' | 'height'> {
    /** Rendered width/height in pixels (square). */
    size?: number;
}

/**
 * Solid file glyph — the "files" action in the chat attach menu. Exported from the Figma
 * "Bold / Files / File" instance the attach menu carries (node `3758:30488` inside `3749:27536`):
 * a filled sheet with the folded corner drawn as its own shape.
 *
 * The `viewBox` is the icon's own 32×32 frame. Fills with `currentColor` so the tile colours it.
 */
export const IconFileSolid = ({ size = 32, className, ...props }: IconFileSolidProps) => (
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
            d="M18.6667 29.3333H13.3333C8.30502 29.3333 5.79086 29.3333 4.22876 27.7712C2.66667 26.2091 2.66667 23.695 2.66667 18.6667V13.3333C2.66667 8.30502 2.66667 5.79086 4.22876 4.22876C5.79086 2.66667 8.31826 2.66667 13.3731 2.66667C14.1811 2.66667 14.8285 2.66667 15.3733 2.68888C15.3554 2.79546 15.346 2.90417 15.3456 3.01409L15.3333 6.79329C15.3332 8.2561 15.3331 9.54885 15.4732 10.5909C15.6251 11.7204 15.9737 12.8497 16.8954 13.7714C17.8171 14.6931 18.9464 15.0417 20.0759 15.1936C21.118 15.3337 22.4107 15.3336 23.8735 15.3335L24 15.3335H29.2765C29.3333 16.0458 29.3333 16.9201 29.3333 18.0839V18.6667C29.3333 23.695 29.3333 26.2091 27.7712 27.7712C26.2091 29.3333 23.695 29.3333 18.6667 29.3333Z"
            fill="currentColor"
        />
        <path
            d="M25.8023 10.1555L20.5239 5.405C19.0201 4.05157 18.2682 3.37486 17.3456 3.02083L17.3333 6.66681C17.3333 9.80951 17.3333 11.3809 18.3096 12.3572C19.286 13.3335 20.8573 13.3335 24 13.3335H28.7735C28.29 12.3945 27.4245 11.6155 25.8023 10.1555Z"
            fill="currentColor"
        />
    </svg>
);
