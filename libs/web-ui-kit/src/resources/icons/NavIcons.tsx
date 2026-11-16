import * as React from 'react';

export interface NavIconProps extends Omit<React.SVGProps<SVGSVGElement>, 'width' | 'height'> {
    /** Rendered width/height in pixels (square). */
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

// The bubble outline, shared by the line and solid chat glyphs so the two cannot drift apart.
const CHAT_BUBBLE =
    'M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 13.5997 2.37562 15.1116 3.04346 16.4525C3.22094 16.8088 3.28001 17.2161 3.17712 17.6006L2.58151 19.8267C2.32295 20.793 3.20701 21.677 4.17335 21.4185L6.39939 20.8229C6.78393 20.72 7.19121 20.7791 7.54753 20.9565C8.88836 21.6244 10.4003 22 12 22Z';

/** How far the line chat glyph is shrunk so its centred stroke sits inside the outline. */
const INSET_SCALE = 0.925;

/**
 * Chat tab, unselected — the round speech bubble outline from the bottom nav (Figma 5779:65552).
 *
 * The design draws the line as a 3px stroke masked by the bubble's own shape, which leaves a 1.5px
 * line entirely inside the outline; a plain 1.5px stroke would straddle the outline and make the
 * bubble look bigger than its filled twin. The mask is not reproduced: the app sets a `<base href>`,
 * and engines have resolved a `url(#…)` reference against it, which finds no mask on any page whose
 * path is not the base — the icon would vanish exactly where it shows. Instead the same path
 * is shrunk about its centre so that a centred stroke lands where the masked one did: the bubble is
 * all but a circle of radius 10, so pulling it in by half the stroke is a scale of 9.25 / 10, and
 * the stroke is widened by the same factor to come out at 1.5px. Rasterized at 10× against the
 * masked original, the two differ by about 3% of the line's ink, all of it at the tail's corner.
 */
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

/** Chat tab, selected — the same bubble filled (Figma 5779:65550). */
export const IconNavChatSolid = ({ size = 24, className, ...props }: NavIconProps) => (
    <svg {...svgProps(size)} className={className} {...props}>
        <path d={CHAT_BUBBLE} fill="currentColor" />
    </svg>
);

/** MY tab, unselected — head and shoulders in a 1.5px line (Figma 5779:65543). */
export const IconNavMy = ({ size = 24, className, ...props }: NavIconProps) => (
    <svg {...svgProps(size)} className={className} {...props}>
        <circle cx="12" cy="6" r="3.25" stroke="currentColor" strokeWidth={1.5} />
        <ellipse cx="12" cy="17" rx="7" ry="4" stroke="currentColor" strokeWidth={1.5} />
    </svg>
);

/** MY tab, selected — the same figure filled (Figma 5779:65542). */
export const IconNavMySolid = ({ size = 24, className, ...props }: NavIconProps) => (
    <svg {...svgProps(size)} className={className} {...props}>
        <circle cx="12" cy="6" r="4" fill="currentColor" />
        <ellipse cx="12" cy="17" rx="7" ry="4" fill="currentColor" />
    </svg>
);

// The bell body, shared by the line and solid notification glyphs (Figma 5779:65544 · 5779:65547).
const BELL_BODY =
    'M18.7491 9.00497V9.70957C18.7491 10.5552 18.9903 11.3818 19.4422 12.0854L20.5496 13.8095C21.5612 15.3843 20.789 17.5249 19.0296 18.0229C14.4273 19.3257 9.57274 19.3257 4.97036 18.0229C3.21105 17.5249 2.43882 15.3843 3.45036 13.8095L4.5578 12.0854C5.00972 11.3818 5.25087 10.5552 5.25087 9.70957V9.00497C5.25087 5.13623 8.27256 2 12 2C15.7274 2 18.7491 5.13623 18.7491 9.00497Z';

/**
 * How far the line bell is shrunk about the body's centre, for the same reason as the chat glyph:
 * the design's 1.5px line is a 3px stroke masked inside the shape. The body is about 18 wide and 17
 * tall, so pulling each half-extent in by 0.75px is a scale of roughly 0.915 on both axes.
 */
const BELL_INSET_SCALE = 0.915;
/** The centre of the bell body's bounding box (x 3–21, y 2–19.3). */
const BELL_CENTRE = { x: 12, y: 10.65 };

/** Notifications tab, unselected — the bell outline with its clapper (Figma 5779:65544). */
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

/** Notifications tab, selected — the bell and its clapper filled (Figma 5779:65547). */
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
