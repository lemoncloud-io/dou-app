import { cn } from '@chatic/lib/utils';

export interface ReadReceiptProps {
    /** Members who have not read this message yet (excludes the sender). */
    unreadCount: number;
    /** Localized "unread" label for a11y (e.g. "안읽음"). Host supplies the string. */
    unreadLabel: string;
    className?: string;
}

/**
 * Per-message read receipt — the Figma unread indicator next to a message time
 * (node 3188:24178): the number of members who have not read the message yet,
 * shown in the point color. Once everyone has read it (`unreadCount <= 0`) the
 * indicator disappears. Purely presentational; counts and labels come in as props.
 */
export const ReadReceipt = ({ unreadCount, unreadLabel, className }: ReadReceiptProps) => {
    if (unreadCount <= 0) return null;

    return (
        <span
            aria-label={`${unreadLabel} ${unreadCount}`}
            className={cn('text-[12px] font-semibold leading-4 tracking-[-0.18px] text-main-accent', className)}
        >
            {unreadCount}
        </span>
    );
};
