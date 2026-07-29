import * as React from 'react';

export interface IconChatAddProps extends Omit<React.SVGProps<SVGSVGElement>, 'width' | 'height'> {
    /** Rendered width/height in pixels (glyph is square). */
    size?: number;
}

/**
 * Add-channel glyph — chat bubble outline with a plus. Extracted from the Figma
 * "채널 추가" asset (node 3209:13811) rather than reusing the generic lucide `Plus`.
 * Fills with `currentColor`, so callers set the color via `className`/`color`.
 */
export const IconChatAdd = ({ size = 18, className, ...props }: IconChatAddProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 17.7083 17.7083"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
        {...props}
    >
        <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M17.7083 8.85417C17.7083 3.96414 13.7442 0 8.85417 0C3.96415 0 0 3.96414 0 8.85417C0 10.2694 0.332512 11.6088 0.924232 12.7968C1.01253 12.9741 1.03126 13.1551 0.990518 13.3074L0.499949 15.1409C0.164131 16.396 1.31237 17.5442 2.56746 17.2084L4.40093 16.7178C4.55321 16.6771 4.73423 16.6958 4.91151 16.7841C6.09951 17.3758 7.43889 17.7083 8.85417 17.7083C13.7442 17.7083 17.7083 13.7442 17.7083 8.85417ZM8.85417 1.23546C13.0619 1.23546 16.4729 4.64647 16.4729 8.85417C16.4729 13.0619 13.0619 16.4729 8.85417 16.4729C7.6343 16.4729 6.48307 16.1866 5.46233 15.6782C5.05265 15.4742 4.56276 15.3956 4.08159 15.5243L2.24813 16.0149C1.9114 16.105 1.60333 15.7969 1.69343 15.4602L2.184 13.6267C2.31274 13.1456 2.23417 12.6557 2.03011 12.246C1.5217 11.2253 1.23547 10.074 1.23547 8.85417C1.23547 4.64647 4.64647 1.23546 8.85417 1.23546Z"
            fill="currentColor"
        />
        <path
            d="M8.8492 6.15869V11.5498M6.15364 8.85425H11.5448"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);
