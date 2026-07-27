import { cn } from '@chatic/lib/utils';

export interface ReadReceiptProps {
    /** Members who have read this message (excludes nobody; the sender counts). */
    readCount: number;
    /** Members who have not read this message yet. */
    unreadCount: number;
    /** Localized "read" label (e.g. "읽음"). Host supplies the string. */
    readLabel: string;
    /** Localized "unread" label (e.g. "안읽음"). Host supplies the string. */
    unreadLabel: string;
    /**
     * Presentation mode. `count` (default) is the group indicator `읽음 N · 안읽음 M`.
     * `dm` is the 1:1 KakaoTalk-style badge: just the unread count (0 or 1) while the
     * peer has not read, and nothing once read — labels are unused in this mode.
     */
    mode?: 'count' | 'dm';
    className?: string;
}

/**
 * Per-message read receipt — the Figma group-chat indicator next to a message
 * time (node 3209:27289): `읽음 N · 안읽음 M`. The read count (point color) is
 * always shown; the unread segment (muted, with a bullet separator) appears only
 * while some members are still unread, so a fully-read message reads just
 * `읽음 N`. In `dm` mode it collapses to a single point-color unread count that
 * disappears once the peer reads. Purely presentational; counts and labels come
 * in as props.
 */
export const ReadReceipt = ({
    readCount,
    unreadCount,
    readLabel,
    unreadLabel,
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

    return (
        <span
            aria-label={
                hasUnread ? `${readLabel} ${readCount} ${unreadLabel} ${unreadCount}` : `${readLabel} ${readCount}`
            }
            className={cn('flex items-center gap-1 text-[12px] font-semibold leading-4 tracking-[-0.18px]', className)}
        >
            <span className="text-main-accent">
                {readLabel} {readCount}
            </span>
            {hasUnread && (
                <>
                    <span aria-hidden className="text-description">
                        ·
                    </span>
                    <span className="text-description">
                        {unreadLabel} {unreadCount}
                    </span>
                </>
            )}
        </span>
    );
};
