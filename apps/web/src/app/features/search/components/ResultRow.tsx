import type { ReactNode } from 'react';

interface ResultRowProps {
    leading: ReactNode;
    title: ReactNode;
    subtitle?: ReactNode;
    context?: ReactNode;
    badge?: ReactNode;
    trailing?: ReactNode;
    onClick: () => void;
}

export const ResultRow = ({ leading, title, subtitle, context, badge, trailing, onClick }: ResultRowProps) => (
    <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/50"
    >
        <span className="flex shrink-0 items-center">{leading}</span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium text-foreground">{title}</span>
                {badge}
            </span>
            {subtitle && <span className="block truncate text-xs text-description">{subtitle}</span>}
            {context && <span className="block truncate text-[11px] leading-4 text-description/80">{context}</span>}
        </span>
        {trailing && <span className="flex shrink-0 flex-col items-end gap-1">{trailing}</span>}
    </button>
);

export const ResultRowSkeleton = () => (
    <div className="flex items-center gap-3 px-4 py-3" aria-hidden>
        <div className="size-[42px] animate-pulse rounded-full bg-muted" />
        <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="h-3 w-48 animate-pulse rounded bg-muted" />
        </div>
    </div>
);
