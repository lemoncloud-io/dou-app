import { useTranslation } from 'react-i18next';

interface ReadReceiptProps {
    /** Active members who have read this message (the sender counts). */
    readCount: number;
    /** Active members who have not read it yet. */
    unreadCount: number;
}

/**
 * The read receipt under a message: `Seen by 9 • Unseen by 1`, or `Seen by all` once nobody is
 * behind.
 *
 * The read half shows while somebody is behind, weighted but not in the accent: in lime it became
 * the accent's most frequent use, on a passive metric. Once everybody has read, the two counts give
 * way to the one phrase in the same weight — `Seen by 10` alone left the reader to compare it with
 * the room size to know whether that was everyone. Both are one line of metadata, not a control —
 * nothing here is clickable, and the counts are the message's, so the line sits with it.
 *
 * Which messages get one, and what the numbers mean, is `useReadCounts`; that only my latest
 * block shows one outright, and earlier ones on hover or focus, is `MessageList`. This only draws.
 */
export const ReadReceipt = ({ readCount, unreadCount }: ReadReceiptProps) => {
    const { t } = useTranslation();

    return (
        <span className="mt-0.5 flex items-center gap-1 text-caption tabular-nums text-muted-foreground">
            {unreadCount > 0 ? (
                <>
                    <span className="font-semibold text-label">{t('chat.readReceipt.read', { n: readCount })}</span>
                    <span aria-hidden>•</span>
                    <span>{t('chat.readReceipt.unread', { n: unreadCount })}</span>
                </>
            ) : (
                <span className="font-semibold text-label">{t('chat.readReceipt.allRead')}</span>
            )}
        </span>
    );
};
