import { useTranslation } from 'react-i18next';

interface ReadReceiptProps {
    /** Active members who have read this message (the sender counts). */
    readCount: number;
    /** Active members who have not read it yet. */
    unreadCount: number;
}

/**
 * The read receipt under a message: `Read 9 · Unread 1`.
 *
 * The read half always shows, in the accent ink that carries "this happened"; the unread
 * half only exists while somebody is behind, so a fully-read message settles to `Read 10`
 * rather than `Read 10 · Unread 0`. Both are one line of metadata, not a control — nothing
 * here is clickable, and the counts are the message's, so the line sits with it.
 *
 * Which messages get one, and what the numbers mean, is `useReadCounts`. This only draws.
 */
export const ReadReceipt = ({ readCount, unreadCount }: ReadReceiptProps) => {
    const { t } = useTranslation();

    return (
        <span className="mt-0.5 flex items-center gap-1 text-caption tabular-nums text-muted-foreground">
            <span className="font-semibold text-primary-ink">{t('chat.readReceipt.read', { n: readCount })}</span>
            {unreadCount > 0 && (
                <>
                    <span aria-hidden>·</span>
                    <span>{t('chat.readReceipt.unread', { n: unreadCount })}</span>
                </>
            )}
        </span>
    );
};
