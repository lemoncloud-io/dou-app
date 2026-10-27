import { type JSX, type ReactNode } from 'react';

import { cn } from '../../utils';

export type BannerTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONES: Record<BannerTone, string> = {
    success: 'bg-status-success-bg text-status-success',
    warning: 'bg-status-warning-bg text-status-warning',
    danger: 'bg-status-danger-bg text-status-danger',
    info: 'bg-status-info-bg text-status-info',
    neutral: 'bg-muted text-desc-alt',
};

/**
 * A full-width notice line. Danger and warning are announced as alerts; the others are status, read
 * when the reader gets to them.
 */
export const Banner = ({
    tone = 'info',
    title,
    children,
    action,
    className,
}: {
    tone?: BannerTone;
    title?: ReactNode;
    children?: ReactNode;
    action?: ReactNode;
    className?: string;
}): JSX.Element => (
    <div
        role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
        className={cn('flex items-start justify-between gap-4 rounded-xl px-4 py-3 text-sm', TONES[tone], className)}
    >
        <div className="flex flex-col gap-0.5">
            {title && <p className="font-semibold">{title}</p>}
            {children && <div className="text-desc-alt">{children}</div>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
    </div>
);
