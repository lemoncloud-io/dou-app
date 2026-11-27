import * as React from 'react';

export interface NotifyGlyphProps extends Omit<React.SVGProps<SVGSVGElement>, 'width' | 'height'> {
    size?: number;
}

const THREAD_INSET_SCALE = 0.913;

export const IconThreadChip = ({ size = 12, className, ...props }: NotifyGlyphProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 12 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className={className}
        {...props}
    >
        <path
            d="M6 11C8.76142 11 11 8.76142 11 6C11 3.23858 8.76142 1 6 1C3.23858 1 1 3.23858 1 6C1 6.79984 1.18781 7.55582 1.52173 8.22624C1.61047 8.4044 1.64001 8.60803 1.58856 8.80031L1.29076 9.91333C1.16148 10.3965 1.60351 10.8385 2.08667 10.7092L3.19969 10.4114C3.39197 10.36 3.5956 10.3895 3.77376 10.4783C4.44418 10.8122 5.20016 11 6 11Z"
            transform={`translate(6 6) scale(${THREAD_INSET_SCALE}) translate(-6 -6)`}
            stroke="currentColor"
            strokeWidth={0.8667 / THREAD_INSET_SCALE}
        />
        <path d="M4 5.25H8" stroke="currentColor" strokeWidth={0.8667} strokeLinecap="round" />
        <path d="M4 7H6.75" stroke="currentColor" strokeWidth={0.8667} strokeLinecap="round" />
    </svg>
);

export const IconCheckSmall = ({ size = 12, className, ...props }: NotifyGlyphProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 12 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className={className}
        {...props}
    >
        <path
            d="M1 5L4.5 8.5L11 2"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

export const IconJumpArrow = ({ size = 12, className, ...props }: NotifyGlyphProps) => (
    <svg
        width={size}
        height={(size * 14) / 12}
        viewBox="0 0 12 14"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className={className}
        {...props}
    >
        <path
            d="M6 1V13M11 6L6 1L1 6"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);
