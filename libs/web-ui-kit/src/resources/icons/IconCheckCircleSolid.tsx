import * as React from 'react';

export interface IconCheckCircleSolidProps extends Omit<React.SVGProps<SVGSVGElement>, 'width' | 'height'> {
    size?: number;
}

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
