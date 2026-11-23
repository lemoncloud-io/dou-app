import * as React from 'react';

export interface IconUsersGroupProps extends Omit<React.SVGProps<SVGSVGElement>, 'width' | 'height'> {
    size?: number;
}

const HEAD_CENTER =
    'M5.25 2.625C5.25 4.07475 4.07475 5.25 2.625 5.25C1.17525 5.25 0 4.07475 0 2.625C0 1.17525 1.17525 0 2.625 0C4.07475 0 5.25 1.17525 5.25 2.625Z';
const HEAD_SIDE =
    'M3.75 1.875C3.75 2.91053 2.91053 3.75 1.875 3.75C0.839466 3.75 0 2.91053 0 1.875C0 0.839466 0.839466 0 1.875 0C2.91053 0 3.75 0.839466 3.75 1.875Z';
const BODY_CENTER =
    'M9 2.625C9 4.07475 6.98528 5.25 4.5 5.25C2.01472 5.25 0 4.07475 0 2.625C0 1.17525 2.01472 0 4.5 0C6.98528 0 9 1.17525 9 2.625Z';
const BODY_SIDE =
    'M6 1.875C6 2.91053 4.65685 3.75 3 3.75C1.34315 3.75 0 2.91053 0 1.875C0 0.839466 1.34315 0 3 0C4.65685 0 6 0.839466 6 1.875Z';

const SIDE_OPACITY = '0.4';

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
        <g transform="translate(6.375 3)">
            <path d={HEAD_CENTER} fill="currentColor" />
        </g>
        <g transform="translate(4.5 9.75)">
            <path d={BODY_CENTER} fill="currentColor" />
        </g>
    </svg>
);
