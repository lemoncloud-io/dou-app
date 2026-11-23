import * as React from 'react';

export interface IconSkip15Props extends Omit<React.SVGProps<SVGSVGElement>, 'width' | 'height'> {
    size?: number;
    direction: 'back' | 'forward';
}

export const IconSkip15 = ({ size = 24, direction, className, ...props }: IconSkip15Props) => (
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
        <g transform={direction === 'forward' ? 'translate(24 0) scale(-1 1)' : undefined}>
            <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <path
                d="M6.2 3.6v3.6h3.6"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </g>
        <text
            x="12"
            y="15.2"
            textAnchor="middle"
            fontSize="7.5"
            fontWeight="700"
            fill="currentColor"
            fontFamily="inherit"
        >
            15
        </text>
    </svg>
);
