import * as React from 'react';

export interface IconPauseSolidProps extends Omit<React.SVGProps<SVGSVGElement>, 'width' | 'height'> {
    size?: number;
}

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
