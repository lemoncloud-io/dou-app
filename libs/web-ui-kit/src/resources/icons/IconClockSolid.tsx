import * as React from 'react';

export interface IconClockSolidProps extends Omit<React.SVGProps<SVGSVGElement>, 'width' | 'height'> {
    size?: number;
}

export const IconClockSolid = ({ size = 20, className, ...props }: IconClockSolidProps) => (
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
        <path
            opacity="0.5"
            d="M10 20C15.5228 20 20 15.5228 20 10C20 4.47715 15.5228 0 10 0C4.47715 0 0 4.47715 0 10C0 15.5228 4.47715 20 10 20Z"
            fill="currentColor"
        />
        <g transform="translate(9.25 5.25)">
            <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M0.75 0C1.16421 0 1.5 0.335786 1.5 0.75V4.43934L3.78033 6.71967C4.07322 7.01256 4.07322 7.48744 3.78033 7.78033C3.48744 8.07322 3.01256 8.07322 2.71967 7.78033L0.21967 5.28033C0.079018 5.13968 0 4.94891 0 4.75V0.75C0 0.335786 0.335786 0 0.75 0Z"
                fill="currentColor"
            />
        </g>
    </svg>
);
