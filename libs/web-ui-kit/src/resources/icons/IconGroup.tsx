import * as React from 'react';

// Native aspect ratio of the Figma group glyph (26.0006 × 20.8011).
const RATIO = 20.8011 / 26.0006;

export interface IconGroupProps extends Omit<React.SVGProps<SVGSVGElement>, 'width' | 'height'> {
    /** Rendered width in pixels; height follows the glyph's native aspect ratio. */
    size?: number;
}

/**
 * Group avatar glyph — three overlapping people. Extracted from the Figma
 * "그룹방 Profile" asset (node 3158:26239) rather than reusing the generic lucide
 * `Users`, so the group default avatar matches the design exactly. Fills with
 * `currentColor`, so callers set the color via `className`/`color`.
 */
export const IconGroup = ({ size = 24, className, ...props }: IconGroupProps) => (
    <svg
        width={size}
        height={size * RATIO}
        viewBox="0 0 26.0006 20.8011"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
        {...props}
    >
        <path
            d="M17.5446 4.55029C17.5446 7.06334 15.5075 9.10058 12.9946 9.10058C10.4818 9.10058 8.44474 7.06334 8.44474 4.55029C8.44474 2.03723 10.4818 0 12.9946 0C15.5075 0 17.5446 2.03723 17.5446 4.55029Z"
            fill="currentColor"
        />
        <path
            d="M20.7982 16.2508C20.7982 18.7639 17.3061 20.8011 12.9983 20.8011C8.69061 20.8011 5.1985 18.7639 5.1985 16.2508C5.1985 13.7378 8.69061 11.7005 12.9983 11.7005C17.3061 11.7005 20.7982 13.7378 20.7982 16.2508Z"
            fill="currentColor"
        />
        <path
            d="M6.65853 1.30006C6.88922 1.30006 7.11444 1.3227 7.33192 1.36579C6.8021 2.30692 6.49987 3.39329 6.49987 4.55026C6.49987 5.67906 6.78756 6.74067 7.29363 7.66573C7.08804 7.70404 6.87571 7.72411 6.65853 7.72411C4.81983 7.72411 3.32926 6.28603 3.32926 4.51208C3.32926 2.73813 4.81983 1.30006 6.65853 1.30006Z"
            fill="currentColor"
        />
        <path
            d="M4.48145 19.483C3.74317 18.6004 3.24993 17.5173 3.24993 16.251C3.24993 15.0234 3.71347 13.968 4.41442 13.1006C1.93839 13.2926 0 14.647 0 16.2892C0 17.9468 1.97245 19.3112 4.48145 19.483Z"
            fill="currentColor"
        />
        <path
            d="M19.5008 4.55026C19.5008 5.67907 19.2131 6.74067 18.707 7.66573C18.9126 7.70404 19.1249 7.72411 19.3421 7.72411C21.1808 7.72411 22.6714 6.28603 22.6714 4.51208C22.6714 2.73813 21.1808 1.30006 19.3421 1.30006C19.1114 1.30006 18.8862 1.3227 18.6687 1.36579C19.1985 2.30692 19.5008 3.39329 19.5008 4.55026Z"
            fill="currentColor"
        />
        <path
            d="M21.5192 19.483C24.0282 19.3112 26.0006 17.9468 26.0006 16.2892C26.0006 14.647 24.0622 13.2926 21.5862 13.1006C22.2872 13.968 22.7507 15.0234 22.7507 16.251C22.7507 17.5173 22.2575 18.6004 21.5192 19.483Z"
            fill="currentColor"
        />
    </svg>
);
