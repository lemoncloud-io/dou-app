import { cn } from '@chatic/lib/utils';

export interface ReadReceiptProps {
    /** Members who have read this message (excludes nobody; the sender counts). */
    readCount: number;
    /** Members who have not read this message yet. */
    unreadCount: number;
    /** Localized "read" label (e.g. "Read"). Host supplies the string. */
    readLabel: string;
    /** Localized "unread" label (e.g. "Unread"). Host supplies the string. */
    unreadLabel: string;
    /** Localized label shown instead of the counts once every member has read (e.g. "Read by all"). */
    allReadLabel: string;
    /**
     * Presentation mode. `count` (default) is the group indicator `Read N • Unread M`.
     * `dm` is the 1:1 KakaoTalk-style badge: just the unread count (0 or 1) while the
     * peer has not read, and nothing once read — labels are unused in this mode.
     */
    mode?: 'count' | 'dm';
    className?: string;
}

/**
 * Per-message read receipt — the Figma group-chat indicator next to a message
 * time (node 3209:27289):
 * `Read N • Unread M` while some members are still unread, with the read count in
 * the point color and the unread segment muted. Once nobody is left it collapses to
 * the single all-read label in the point color, because "Read 10" alone made the
 * reader work out from the member count whether that was everyone. In `dm` mode it
 * is a single point-color unread count that disappears once the peer reads.
 * Purely presentational; counts and labels come in as props.
 */
export const ReadReceipt = ({
    readCount,
    unreadCount,
    readLabel,
    unreadLabel,
    allReadLabel,
    mode = 'count',
    className,
}: ReadReceiptProps) => {
    const hasUnread = unreadCount > 0;

    // DM mode: a lone point-color unread count (the "1" badge), hidden once read.
    if (mode === 'dm') {
        if (!hasUnread) return null;
        return (
            <span
                aria-label={`${unreadLabel} ${unreadCount}`}
                className={cn(
                    'flex items-center text-[12px] font-semibold leading-4 tracking-[-0.18px] text-main-accent',
                    className
                )}
            >
                {unreadCount}
            </span>
        );
    }

    const textClass = cn('flex items-center gap-1 text-[12px] font-semibold leading-4 tracking-[-0.18px]', className);

    if (!hasUnread) {
        return (
            <span aria-label={allReadLabel} className={cn(textClass, 'text-main-accent')}>
                {allReadLabel}
            </span>
        );
    }

    return (
        <span aria-label={`${readLabel} ${readCount} ${unreadLabel} ${unreadCount}`} className={textClass}>
            <span className="text-main-accent">
                {readLabel} {readCount}
            </span>
            <span aria-hidden className="text-description">
                •
            </span>
            <span className="text-description">
                {unreadLabel} {unreadCount}
            </span>
        </span>
    );
};
