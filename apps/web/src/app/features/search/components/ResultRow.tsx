import type { ReactNode } from 'react';

interface ResultRowProps {
    icon: ReactNode;
    title: ReactNode;
    subtitle?: ReactNode;
    badge?: ReactNode;
    onClick: () => void;
}

/** One clickable search result row, shared across the cloud/place/channel/message sections. */
export const ResultRow = ({ icon, title, subtitle, badge, onClick }: ResultRowProps) => (
    <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/50"
    >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground">
            {icon}
        </span>
        <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
                <span className="block truncate text-sm font-medium text-foreground">{title}</span>
                {badge}
            </span>
            {subtitle && <span className="block truncate text-xs text-description">{subtitle}</span>}
        </span>
    </button>
);
