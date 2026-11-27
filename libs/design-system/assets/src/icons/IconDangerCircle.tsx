import * as React from 'react';

export interface IconDangerCircleProps extends Omit<React.SVGProps<SVGSVGElement>, 'width' | 'height'> {
    size?: number;
}

export const IconDangerCircle = ({ size = 28, className, ...props }: IconDangerCircleProps) => (
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
        <path
            transform="translate(2.3333 2.3333)"
            d="M23.3333 11.6667C23.3333 5.22334 18.11 0 11.6667 0C5.22334 0 0 5.22334 0 11.6667C0 18.11 5.22334 23.3333 11.6667 23.3333C18.11 23.3333 23.3333 18.11 23.3333 11.6667Z"
            className="fill-input-border"
        />
        <g transform="translate(12.8352 7.2912)">
            <path
                d="M1.16667 0C1.64992 0 2.04167 0.391751 2.04167 0.875V7.875C2.04167 8.35825 1.64992 8.75 1.16667 8.75C0.683418 8.75 0.291667 8.35825 0.291667 7.875V0.875C0.291667 0.391751 0.683418 0 1.16667 0Z"
                className="fill-foreground"
            />
            <path
                d="M1.16667 12.5417C1.811 12.5417 2.33333 12.0193 2.33333 11.375C2.33333 10.7307 1.811 10.2083 1.16667 10.2083C0.522334 10.2083 0 10.7307 0 11.375C0 12.0193 0.522334 12.5417 1.16667 12.5417Z"
                className="fill-foreground"
            />
        </g>
    </svg>
);
