import * as React from 'react';

export interface IconPlaySolidProps extends Omit<React.SVGProps<SVGSVGElement>, 'width' | 'height'> {
    size?: number;
}

export const IconPlaySolid = ({ size = 24, className, ...props }: IconPlaySolidProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
        {...props}
    >
        <path
            d="M8 6.27C8 5.5 8.83 5.02 9.5 5.4L18.66 10.73C19.33 11.12 19.33 12.08 18.66 12.46L9.5 17.8C8.83 18.18 8 17.7 8 16.93V6.27Z"
            fill="currentColor"
        />
    </svg>
);
