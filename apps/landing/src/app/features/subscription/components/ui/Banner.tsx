import { type JSX, type ReactNode } from 'react';

import { cn } from '../../utils';

export type BannerTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONES: Record<BannerTone, string> = {
    success: 'bg-status-success-bg text-status-success',
    warning: 'bg-status-warning-bg text-status-warning',
    danger: 'bg-status-danger-bg text-status-danger',
    info: 'bg-[#eef3fb] text-navy',
    neutral: 'bg-muted text-desc-alt',
};

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
        className={cn(
            'flex items-start justify-between gap-4 rounded-[14px] p-4 text-sm md:px-[18px] md:py-3.5',
            TONES[tone],
            className
        )}
    >
        <div className="flex flex-col gap-1">
            {title && <p className="font-bold">{title}</p>}
            {children && (
                <div className={cn('text-[13px] font-medium', tone !== 'info' && 'text-desc-alt')}>{children}</div>
            )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
    </div>
);
