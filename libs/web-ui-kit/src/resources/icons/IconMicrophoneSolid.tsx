import * as React from 'react';

export interface IconMicrophoneSolidProps extends Omit<React.SVGProps<SVGSVGElement>, 'width' | 'height'> {
    /** Rendered width/height in pixels (square). */
    size?: number;
}

/**
 * Solid microphone glyph — the "voice" action in the chat attach panel, drawn to sit beside the
 * photos, camera and files glyphs: a filled capsule over its stand, in the same 32×32 frame.
 *
 * Fills with `currentColor` so the tile colours it.
 */
export const IconMicrophoneSolid = ({ size = 32, className, ...props }: IconMicrophoneSolidProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
        {...props}
    >
        <rect x="10" y="2.6667" width="12" height="18.6667" rx="6" fill="currentColor" />
        <path
            d="M6.6667 14.6667C7.4031 14.6667 8 15.2636 8 16C8 20.4183 11.5817 24 16 24C20.4183 24 24 20.4183 24 16C24 15.2636 24.597 14.6667 25.3333 14.6667C26.0697 14.6667 26.6667 15.2636 26.6667 16C26.6667 21.4419 22.5913 25.9332 17.3333 26.5849V28C17.3333 28.7364 16.7364 29.3333 16 29.3333C15.2636 29.3333 14.6667 28.7364 14.6667 28V26.5849C9.40872 25.9332 5.3333 21.4419 5.3333 16C5.3333 15.2636 5.9303 14.6667 6.6667 14.6667Z"
            fill="currentColor"
        />
    </svg>
);
