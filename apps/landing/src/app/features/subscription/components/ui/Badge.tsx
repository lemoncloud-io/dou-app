import { type HTMLAttributes, type JSX } from 'react';

import { cn } from '../../utils';

export type BadgeTone = 'navy' | 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const TONES: Record<BadgeTone, string> = {
    navy: 'bg-navy text-white',
    neutral: 'bg-muted text-desc-alt',
    success: 'bg-status-success-bg text-status-success',
    warning: 'bg-status-warning-bg text-status-warning',
    danger: 'bg-status-danger-bg text-status-danger',
    info: 'bg-status-info-bg text-status-info',
};

export const Badge = ({
    tone = 'neutral',
    className,
    ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }): JSX.Element => (
    <span
        className={cn(
            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
            TONES[tone],
            className
        )}
        {...props}
    />
);
