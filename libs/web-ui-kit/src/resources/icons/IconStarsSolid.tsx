import * as React from 'react';

export interface IconStarsSolidProps extends Omit<React.SVGProps<SVGSVGElement>, 'width' | 'height'> {
    /** Rendered width/height in pixels (square). */
    size?: number;
}

/**
 * Solid four-point star with two sparks — the FREE tier glyph. Exported from the Figma "Bold /
 * Astronomy / Stars Minimalistic" instance the subscription badge carries (node `2689:16094` inside
 * `4135:24750`), replacing the lucide `Sparkles` stand-in.
 *
 * Three separate shapes in the design (the big star, the small `Star 7` spark, and the plus-shaped
 * `Vector (Stroke)` spark), each placed by its own inset inside the 16×16 frame — so they are
 * translated here rather than merged, keeping the spacing the design has. Fills with `currentColor`.
 */
export const IconStarsSolid = ({ size = 16, className, ...props }: IconStarsSolidProps) => (
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
        {/* Main star — inset 20.83% top / 12.5% right / 8.33% bottom / 16.67% left. */}
        <g transform="translate(2.6667 3.3333)">
            <path
                d="M4.05346 1.93141C4.77123 0.643804 5.13011 0 5.66667 0C6.20322 0 6.56211 0.643804 7.27987 1.93141L7.46557 2.26453C7.66954 2.63043 7.77152 2.81338 7.93053 2.93409C8.08954 3.0548 8.28758 3.09961 8.68366 3.18923L9.04426 3.27082C10.4381 3.58618 11.135 3.74386 11.3008 4.27705C11.4666 4.81023 10.9915 5.36581 10.0413 6.47696L9.79545 6.76443C9.52542 7.08018 9.39042 7.23806 9.32968 7.43337C9.26894 7.62869 9.28935 7.83933 9.33018 8.26061L9.36734 8.64416C9.511 10.1267 9.58283 10.8679 9.14875 11.1975C8.71467 11.527 8.06215 11.2265 6.75712 10.6257L6.41949 10.4702C6.04864 10.2995 5.86322 10.2141 5.66667 10.2141C5.47012 10.2141 5.28469 10.2995 4.91384 10.4702L4.57622 10.6257C3.27118 11.2265 2.61867 11.527 2.18458 11.1975C1.7505 10.8679 1.82233 10.1267 1.96599 8.64416L2.00316 8.26061C2.04398 7.83933 2.06439 7.62869 2.00366 7.43337C1.94292 7.23806 1.80791 7.08018 1.53789 6.76443L1.29206 6.47696C0.341841 5.36581 -0.133266 4.81023 0.0325386 4.27705C0.198343 3.74386 0.895252 3.58618 2.28907 3.27082L2.64967 3.18923C3.04575 3.09961 3.24379 3.0548 3.4028 2.93409C3.56181 2.81338 3.6638 2.63043 3.86776 2.26453L4.05346 1.93141Z"
                fill="currentColor"
            />
        </g>
        {/* Upper-left spark ("Star 7") — inset 10.09% top/left. */}
        <g transform="translate(1.6144 1.6144)">
            <path
                d="M1.63108 0.0531201C1.65107 -0.0174013 1.77625 -0.017824 1.79672 0.0525607C1.89019 0.373969 2.06351 0.849046 2.32559 1.10937C2.58767 1.36968 3.06391 1.53979 3.38594 1.63108C3.45646 1.65107 3.45689 1.77625 3.3865 1.79672C3.06509 1.89019 2.59002 2.06351 2.3297 2.32559C2.06938 2.58767 1.89928 3.06391 1.80798 3.38594C1.78799 3.45646 1.66281 3.45689 1.64234 3.3865C1.54887 3.06509 1.37556 2.59002 1.11347 2.3297C0.85139 2.06938 0.375152 1.89928 0.05312 1.80798C-0.0174013 1.78799 -0.0178239 1.66281 0.0525608 1.64234C0.373969 1.54887 0.849046 1.37556 1.10937 1.11347C1.36968 0.85139 1.53979 0.375152 1.63108 0.0531201Z"
                fill="currentColor"
            />
        </g>
        {/* Upper-right spark (a rounded plus) — inset 13.54% top / 13.54% right. */}
        <g transform="translate(11.5 2.1667)">
            <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M1.16667 0C1.44281 0 1.66667 0.223858 1.66667 0.5V0.666667H1.83333C2.10948 0.666667 2.33333 0.890524 2.33333 1.16667C2.33333 1.44281 2.10948 1.66667 1.83333 1.66667H1.66667V1.83333C1.66667 2.10948 1.44281 2.33333 1.16667 2.33333C0.890524 2.33333 0.666667 2.10948 0.666667 1.83333V1.66667H0.5C0.223858 1.66667 0 1.44281 0 1.16667C0 0.890524 0.223858 0.666667 0.5 0.666667H0.666667V0.5C0.666667 0.223858 0.890524 0 1.16667 0Z"
                fill="currentColor"
            />
        </g>
    </svg>
);
