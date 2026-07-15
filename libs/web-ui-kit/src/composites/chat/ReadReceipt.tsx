import { cn } from '@chatic/lib/utils';

export interface ReadReceiptProps {
    /**
     * `binary` (1:1) shows just 읽음/안읽음; `count` (group) shows the read count
     * and, while anyone is still unread, `· 안읽음 N`.
     */
    variant?: 'binary' | 'count';
    /** Members who have read up to this message (includes the sender). */
    readCount: number;
    /** Members who have not read it yet. */
    unreadCount: number;
    /** Localized "read" label (e.g. "읽음"). Host supplies the string. */
    readLabel: string;
    /** Localized "unread" label (e.g. "안읽음"). Host supplies the string. */
    unreadLabel: string;
    className?: string;
}

/**
 * Per-message read receipt — the Figma read-state text next to a message time.
 * Two modes keyed by chat size (the host decides): a 1:1 chat reads as a bare
 * 읽음/안읽음, a group chat as `읽음 N · 안읽음 M` (the trailing clause drops once
 * everyone has read). Purely presentational; the counts and labels come in as props.
 */
export const ReadReceipt = ({
    variant = 'count',
    readCount,
    unreadCount,
    readLabel,
    unreadLabel,
    className,
}: ReadReceiptProps) => {
    const base = 'text-[12px] font-medium leading-5 tracking-[-0.18px] text-foreground';

    if (variant === 'binary') {
        return <span className={cn(base, className)}>{unreadCount <= 0 ? readLabel : unreadLabel}</span>;
    }

    return (
        <span className={cn('flex items-center gap-px', className)}>
            <span className={base}>{`${readLabel} ${readCount}`}</span>
            {unreadCount > 0 && (
                <>
                    <span className="text-[12px] leading-5 text-input-border">•</span>
                    <span className={base}>{`${unreadLabel} ${unreadCount}`}</span>
                </>
            )}
        </span>
    );
};
