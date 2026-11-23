import * as React from 'react';

export interface NavIconProps extends Omit<React.SVGProps<SVGSVGElement>, 'width' | 'height'> {
    size?: number;
}

const svgProps = (size: number) =>
    ({
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg',
        'aria-hidden': true,
    }) as const;

const CHAT_BUBBLE =
    'M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 13.5997 2.37562 15.1116 3.04346 16.4525C3.22094 16.8088 3.28001 17.2161 3.17712 17.6006L2.58151 19.8267C2.32295 20.793 3.20701 21.677 4.17335 21.4185L6.39939 20.8229C6.78393 20.72 7.19121 20.7791 7.54753 20.9565C8.88836 21.6244 10.4003 22 12 22Z';

const INSET_SCALE = 0.925;

export const IconNavChat = ({ size = 24, className, ...props }: NavIconProps) => (
    <svg {...svgProps(size)} className={className} {...props}>
        <path
            d={CHAT_BUBBLE}
            transform={`translate(12 12) scale(${INSET_SCALE}) translate(-12 -12)`}
            stroke="currentColor"
            strokeWidth={1.5 / INSET_SCALE}
        />
    </svg>
);

export const IconNavChatSolid = ({ size = 24, className, ...props }: NavIconProps) => (
    <svg {...svgProps(size)} className={className} {...props}>
        <path d={CHAT_BUBBLE} fill="currentColor" />
    </svg>
);

export const IconNavMy = ({ size = 24, className, ...props }: NavIconProps) => (
    <svg {...svgProps(size)} className={className} {...props}>
        <circle cx="12" cy="6" r="3.25" stroke="currentColor" strokeWidth={1.5} />
        <ellipse cx="12" cy="17" rx="7" ry="4" stroke="currentColor" strokeWidth={1.5} />
    </svg>
);

export const IconNavMySolid = ({ size = 24, className, ...props }: NavIconProps) => (
    <svg {...svgProps(size)} className={className} {...props}>
        <circle cx="12" cy="6" r="4" fill="currentColor" />
        <ellipse cx="12" cy="17" rx="7" ry="4" fill="currentColor" />
    </svg>
);

const BELL_BODY =
    'M18.7491 9.00497V9.70957C18.7491 10.5552 18.9903 11.3818 19.4422 12.0854L20.5496 13.8095C21.5612 15.3843 20.789 17.5249 19.0296 18.0229C14.4273 19.3257 9.57274 19.3257 4.97036 18.0229C3.21105 17.5249 2.43882 15.3843 3.45036 13.8095L4.5578 12.0854C5.00972 11.3818 5.25087 10.5552 5.25087 9.70957V9.00497C5.25087 5.13623 8.27256 2 12 2C15.7274 2 18.7491 5.13623 18.7491 9.00497Z';

const BELL_INSET_SCALE = 0.915;
const BELL_CENTRE = { x: 12, y: 10.65 };

export const IconNavBell = ({ size = 24, className, ...props }: NavIconProps) => (
    <svg {...svgProps(size)} className={className} {...props}>
        <path
            d={BELL_BODY}
            transform={`translate(${BELL_CENTRE.x} ${BELL_CENTRE.y}) scale(${BELL_INSET_SCALE}) translate(${-BELL_CENTRE.x} ${-BELL_CENTRE.y})`}
            stroke="currentColor"
            strokeWidth={1.5 / BELL_INSET_SCALE}
        />
        <path
            d="M7.5 18C8.15503 19.7478 9.92246 21 12 21C14.0775 21 15.845 19.7478 16.5 18"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
        />
    </svg>
);

export const IconNavBellSolid = ({ size = 24, className, ...props }: NavIconProps) => (
    <svg {...svgProps(size)} className={className} {...props}>
        <path
            d="M8.35179 20.2418C9.19288 21.311 10.5142 22 12 22C13.4858 22 14.8071 21.311 15.6482 20.2418C13.2264 20.57 10.7736 20.57 8.35179 20.2418Z"
            fill="currentColor"
        />
        <path
            d="M18.7491 9V9.7041C18.7491 10.5491 18.9903 11.3752 19.4422 12.0782L20.5496 13.8012C21.5612 15.3749 20.789 17.5139 19.0296 18.0116C14.4273 19.3134 9.57274 19.3134 4.97036 18.0116C3.21105 17.5139 2.43882 15.3749 3.45036 13.8012L4.5578 12.0782C5.00972 11.3752 5.25087 10.5491 5.25087 9.7041V9C5.25087 5.13401 8.27256 2 12 2C15.7274 2 18.7491 5.13401 18.7491 9Z"
            fill="currentColor"
        />
    </svg>
);

export const IconNavMiniApp = ({ size = 24, className, ...props }: NavIconProps) => (
    <svg {...svgProps(size)} className={className} {...props}>
        <path
            d="M6.5 10.5C4.29086 10.5 2.5 8.70914 2.5 6.5C2.5 4.29086 4.29086 2.5 6.5 2.5C8.70914 2.5 10.5 4.29086 10.5 6.5C10.5 8.70914 8.70914 10.5 6.5 10.5Z"
            stroke="currentColor"
            strokeWidth={1.5}
        />
        <path
            d="M17.5 21.5C15.2909 21.5 13.5 19.7091 13.5 17.5C13.5 15.2909 15.2909 13.5 17.5 13.5C19.7091 13.5 21.5 15.2909 21.5 17.5C21.5 19.7091 19.7091 21.5 17.5 21.5Z"
            stroke="currentColor"
            strokeWidth={1.5}
        />
        <path
            d="M6.5 21.5C8.38562 21.5 9.32843 21.5 9.91421 20.9142C10.5 20.3284 10.5 19.3856 10.5 17.5C10.5 15.6144 10.5 14.6716 9.91421 14.0858C9.32843 13.5 8.38562 13.5 6.5 13.5C4.61438 13.5 3.67157 13.5 3.08579 14.0858C2.5 14.6716 2.5 15.6144 2.5 17.5C2.5 19.3856 2.5 20.3284 3.08579 20.9142C3.67157 21.5 4.61438 21.5 6.5 21.5ZM17.5 10.5C19.3856 10.5 20.3284 10.5 20.9142 9.91421C21.5 9.32843 21.5 8.38562 21.5 6.5C21.5 4.61438 21.5 3.67157 20.9142 3.08579C20.3284 2.5 19.3856 2.5 17.5 2.5C15.6144 2.5 14.6716 2.5 14.0858 3.08579C13.5 3.67157 13.5 4.61438 13.5 6.5C13.5 8.38562 13.5 9.32843 14.0858 9.91421C14.6716 10.5 15.6144 10.5 17.5 10.5Z"
            stroke="currentColor"
            strokeWidth={1.5}
        />
    </svg>
);

export const IconNavMiniAppSolid = ({ size = 24, className, ...props }: NavIconProps) => (
    <svg {...svgProps(size)} className={className} {...props}>
        <path
            d="M2 6.63415C2 4.07478 4.07478 2 6.63415 2C9.19351 2 11.2683 4.07478 11.2683 6.63415C11.2683 9.19351 9.19351 11.2683 6.63415 11.2683C4.07478 11.2683 2 9.19351 2 6.63415Z"
            fill="currentColor"
        />
        <path
            d="M12.7317 17.3659C12.7317 14.8065 14.8065 12.7317 17.3659 12.7317C19.9252 12.7317 22 14.8065 22 17.3659C22 19.9252 19.9252 22 17.3659 22C14.8065 22 12.7317 19.9252 12.7317 17.3659Z"
            fill="currentColor"
        />
        <path
            d="M2 17.5C2 15.3787 2 14.318 2.65901 13.659C3.31802 13 4.37868 13 6.5 13C8.62132 13 9.68198 13 10.341 13.659C11 14.318 11 15.3787 11 17.5C11 19.6213 11 20.682 10.341 21.341C9.68198 22 8.62132 22 6.5 22C4.37868 22 3.31802 22 2.65901 21.341C2 20.682 2 19.6213 2 17.5Z"
            fill="currentColor"
        />
        <path
            d="M13 6.5C13 4.37868 13 3.31802 13.659 2.65901C14.318 2 15.3787 2 17.5 2C19.6213 2 20.682 2 21.341 2.65901C22 3.31802 22 4.37868 22 6.5C22 8.62132 22 9.68198 21.341 10.341C20.682 11 19.6213 11 17.5 11C15.3787 11 14.318 11 13.659 10.341C13 9.68198 13 8.62132 13 6.5Z"
            fill="currentColor"
        />
    </svg>
);
