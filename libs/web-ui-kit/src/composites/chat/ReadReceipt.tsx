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
    className?: string;
}

/**
 * Per-message read receipt — the Figma group-chat indicator next to a message
 * time (node 3209:27289): `읽음 N · 안읽음 M`. The read count (point color) is
 * always shown; the unread segment (muted, with a bullet separator) appears only
 * while some members are still unread, so a fully-read message reads just
 * `읽음 N`. Purely presentational; counts and labels come in as props.
 */
export const ReadReceipt = ({ readCount, unreadCount, readLabel, unreadLabel, className }: ReadReceiptProps) => {
    const hasUnread = unreadCount > 0;

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
