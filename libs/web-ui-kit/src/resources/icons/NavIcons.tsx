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
