import * as React from 'react';

export interface IconAudioWaveProps extends Omit<React.SVGProps<SVGSVGElement>, 'width' | 'height'> {
    size?: number;
}

export const IconAudioWave = ({ size = 20, className, ...props }: IconAudioWaveProps) => (
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
        <rect x="3" y="7.5" width="2.4" height="5" rx="1.2" fill="currentColor" />
        <rect x="6.4" y="5" width="2.4" height="10" rx="1.2" fill="currentColor" />
        <rect x="9.8" y="3" width="2.4" height="14" rx="1.2" fill="currentColor" />
        <rect x="13.2" y="6" width="2.4" height="8" rx="1.2" fill="currentColor" />
        <rect x="16.6" y="8" width="2.4" height="4" rx="1.2" fill="currentColor" />
    </svg>
);
