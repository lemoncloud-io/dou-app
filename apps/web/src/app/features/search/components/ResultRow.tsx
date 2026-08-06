import type { ReactNode } from 'react';

interface ResultRowProps {
    /** Avatar or icon. Circular avatars come from the caller (ImageAvatar / DefaultAvatar). */
    leading: ReactNode;
    title: ReactNode;
    subtitle?: ReactNode;
    /** Where the row lives, e.g. "클라우드 › 플레이스 › 채널". Rendered as its own muted line. */
    context?: ReactNode;
    badge?: ReactNode;
    trailing?: ReactNode;
    onClick: () => void;
}

/**
 * One clickable search result row, shared across the cloud/place/channel/message sections.
 *
 * Purely presentational on purpose: every value is passed in, because a search result usually
 * belongs to a NON-ACTIVE cloud and any hook that reads data (useLastChat, useChannelSync, …)
 * would query the active cloud's partition instead — coming back empty and registering sync
 * targets on the wrong cloud's socket. See docs/specs/search/web-search-page.md.
 */
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
